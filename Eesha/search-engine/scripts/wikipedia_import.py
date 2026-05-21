#!/usr/bin/env python3
"""
Eesha Search — Wikipedia Abstracts Bulk Import Script
=====================================================
Downloads and imports Wikipedia abstracts into the OpenSearch index.
Wikipedia provides free abstract dumps at:
  https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-abstract.xml.gz
(~800MB compressed, ~6.7M articles)

Features:
  - Streaming XML parser (xml.etree.ElementTree.iterparse / lxml fallback)
  - Bulk indexing to OpenSearch (batches of 500)
  - Resumable via state file tracking progress
  - Rate-limited download with streaming gzip decompression
  - Memory-efficient for HF Spaces (2GB RAM, 512MB OpenSearch heap)
  - Full index mapping with edge_ngram autocomplete
  - Progress reporting every 10,000 articles

Usage:
  python3 wikipedia_import.py                        # Full import
  python3 wikipedia_import.py --limit 1000           # Test with 1000 articles
  python3 wikipedia_import.py --once                 # Run once and exit
  python3 wikipedia_import.py --url http://host:9200 # Custom OpenSearch URL
"""

import argparse
import gzip
import hashlib
import io
import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime

# ─── Try to use lxml for faster XML parsing ──────────────────────────────
try:
    from lxml import etree as lxml_etree
    HAS_LXML = True
except ImportError:
    HAS_LXML = False

import xml.etree.ElementTree as etree

# ─── Constants ────────────────────────────────────────────────────────────

WIKI_DUMP_URL = (
    "https://dumps.wikimedia.org/enwiki/latest/"
    "enwiki-latest-abstract.xml.gz"
)
DEFAULT_OPENSEARCH_URL = "http://localhost:9200"
OPENSEARCH_INDEX = "nutch"
BULK_BATCH_SIZE = 500
PROGRESS_INTERVAL = 10000
DOWNLOAD_CHUNK_SIZE = 1024 * 64  # 64KB chunks for download
USER_AGENT = "EeshaSearch/1.0 (Eesha Browser Search; +https://eesha.search)"
STATE_FILENAME = "wikipedia_import_state.json"
MAX_RETRIES = 3
RETRY_BACKOFF = 2  # seconds, doubles each retry

# ─── Index Mapping ────────────────────────────────────────────────────────

INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "title": {
                "type": "text",
                "analyzer": "english"
            },
            "url": {
                "type": "keyword"
            },
            "content": {
                "type": "text",
                "analyzer": "english"
            },
            "description": {
                "type": "text",
                "analyzer": "english"
            },
            "host": {
                "type": "keyword"
            },
            "inlink_count": {
                "type": "integer"
            },
            "crawlDate": {
                "type": "date",
                "format": "strict_date_optional_time||epoch_millis"
            },
            "title_suggest": {
                "type": "text",
                "analyzer": "edge_ngram_analyzer",
                "search_analyzer": "standard"
            }
        }
    },
    "settings": {
        "analysis": {
            "analyzer": {
                "edge_ngram_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "edge_ngram_filter"]
                }
            },
            "filter": {
                "edge_ngram_filter": {
                    "type": "edge_ngram",
                    "min_gram": 2,
                    "max_gram": 20
                }
            }
        }
    }
}


# ─── State Management (for resume support) ────────────────────────────────

def load_state(state_path):
    """Load import state from file for resuming."""
    if os.path.exists(state_path):
        try:
            with open(state_path, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"[WARN] Could not load state file: {e}")
    return {
        "total_imported": 0,
        "total_errors": 0,
        "last_url": None,
        "started_at": datetime.utcnow().isoformat() + "Z",
        "last_updated": None,
    }


def save_state(state_path, state):
    """Save current import state to file."""
    state["last_updated"] = datetime.utcnow().isoformat() + "Z"
    tmp_path = state_path + ".tmp"
    try:
        with open(tmp_path, "w") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp_path, state_path)
    except IOError as e:
        print(f"[WARN] Could not save state file: {e}")


# ─── OpenSearch Helpers ───────────────────────────────────────────────────

def opensearch_request(url, method="GET", data=None, timeout=30, retries=MAX_RETRIES):
    """Make a request to OpenSearch with retry logic."""
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data else None

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # Read error body for debugging
            error_body = ""
            try:
                error_body = e.read().decode("utf-8", errors="replace")[:500]
            except Exception:
                pass

            if e.code == 409:
                # Conflict — index already exists, not a real error
                return {"acknowledged": True}
            if e.code >= 500 and attempt < retries:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                print(f"  [RETRY] OpenSearch {e.code}, attempt {attempt}/{retries}, "
                      f"waiting {wait}s... ({error_body[:100]})")
                time.sleep(wait)
                continue
            raise RuntimeError(
                f"OpenSearch HTTP {e.code}: {error_body[:200]}"
            ) from e
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if attempt < retries:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                print(f"  [RETRY] Connection error: {e}, attempt {attempt}/{retries}, "
                      f"waiting {wait}s...")
                time.sleep(wait)
                continue
            raise RuntimeError(f"OpenSearch connection failed after {retries} attempts: {e}") from e

    return None


def create_or_update_index(opensearch_url):
    """Create the OpenSearch index with proper mapping if it doesn't exist."""
    index_url = f"{opensearch_url}/{OPENSEARCH_INDEX}"

    # Check if index already exists
    try:
        req = urllib.request.Request(index_url, method="HEAD")
        urllib.request.urlopen(req, timeout=10)
        print(f"[OK] Index '{OPENSEARCH_INDEX}' already exists — updating mapping")
        # Update mapping for any missing fields
        mapping_url = f"{opensearch_url}/{OPENSEARCH_INDEX}/_mapping"
        try:
            opensearch_request(mapping_url, method="PUT", data=INDEX_MAPPING["mappings"])
            print(f"[OK] Updated mapping for index '{OPENSEARCH_INDEX}'")
        except Exception as e:
            print(f"[WARN] Could not update mapping (non-critical): {e}")
        return
    except urllib.error.HTTPError:
        pass  # Index doesn't exist, create it

    # Create the index with full settings and mapping
    try:
        result = opensearch_request(index_url, method="PUT", data=INDEX_MAPPING)
        if result and result.get("acknowledged"):
            print(f"[OK] Created index '{OPENSEARCH_INDEX}' with autocomplete mapping")
        else:
            print(f"[WARN] Index creation response: {result}")
    except Exception as e:
        print(f"[WARN] Could not create index: {e}")


def bulk_index(opensearch_url, batch, retries=MAX_RETRIES):
    """Send a batch of documents to OpenSearch via the bulk API.

    Args:
        opensearch_url: Base OpenSearch URL
        batch: List of (doc_id, document_dict) tuples
        retries: Number of retry attempts

    Returns:
        Tuple of (success_count, error_count)
    """
    if not batch:
        return 0, 0

    # Build the NDJSON bulk body
    lines = []
    for doc_id, doc in batch:
        action_line = json.dumps({"index": {"_index": OPENSEARCH_INDEX, "_id": doc_id}})
        doc_line = json.dumps(doc)
        lines.append(action_line)
        lines.append(doc_line)

    bulk_body = "\n".join(lines) + "\n"
    bulk_url = f"{opensearch_url}/_bulk"

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                bulk_url,
                data=bulk_body.encode("utf-8"),
                headers={"Content-Type": "application/x-ndjson"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            success = 0
            errors = 0
            if result.get("errors"):
                # Some items failed — count them
                for item in result.get("items", []):
                    index_info = item.get("index", {})
                    status = index_info.get("status", 0)
                    if 200 <= status < 300:
                        success += 1
                    else:
                        errors += 1
                        error_detail = index_info.get("error", {})
                        if errors <= 3:  # Only print first few errors
                            print(f"  [BULK ERROR] doc {index_info.get('_id','?')}: "
                                  f"{error_detail.get('type','?')} — "
                                  f"{error_detail.get('reason','?')[:100]}")
            else:
                success = len(batch)
                errors = 0

            return success, errors

        except urllib.error.HTTPError as e:
            error_body = ""
            try:
                error_body = e.read().decode("utf-8", errors="replace")[:300]
            except Exception:
                pass
            if attempt < retries:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                print(f"  [RETRY] Bulk request HTTP {e.code}, attempt {attempt}/{retries}, "
                      f"waiting {wait}s... ({error_body[:80]})")
                time.sleep(wait)
                continue
            print(f"  [ERROR] Bulk request failed after {retries} retries: "
                  f"HTTP {e.code}: {error_body[:200]}")
            return 0, len(batch)

        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if attempt < retries:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                print(f"  [RETRY] Bulk connection error: {e}, attempt {attempt}/{retries}, "
                      f"waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"  [ERROR] Bulk request failed after {retries} retries: {e}")
            return 0, len(batch)

    return 0, len(batch)


# ─── Streaming Download + Decompress ──────────────────────────────────────

def stream_wikipedia_dump(dump_url, state):
    """Download and decompress the Wikipedia dump in a streaming fashion.

    Returns a file-like object that yields decompressed XML bytes.
    Uses io.BufferedReader + gzip.open for memory-efficient streaming.
    """
    print(f"[DOWNLOAD] Starting streaming download of:")
    print(f"  {dump_url}")

    headers = {"User-Agent": USER_AGENT}
    req = urllib.request.Request(dump_url, headers=headers)
    resp = urllib.request.urlopen(req, timeout=300)

    # Get total size for progress (if available)
    total_size = resp.headers.get("Content-Length")
    if total_size:
        total_size = int(total_size)
        print(f"  Total size: {total_size / (1024*1024):.1f} MB")
    else:
        print(f"  Total size: unknown (streaming)")

    # Wrap in BufferedReader for efficient reads, then gzip decompress
    # BufferedReader ensures we read in large chunks even if gzip asks for small ones
    raw_reader = io.BufferedReader(resp, buffer_size=DOWNLOAD_CHUNK_SIZE)
    decompressed = gzip.open(raw_reader, mode="rb")

    return decompressed, total_size


# ─── XML Parsing ──────────────────────────────────────────────────────────

def _clean_wikipedia_title(raw_title):
    """Strip the 'Wikipedia: ' prefix from article titles."""
    if raw_title.startswith("Wikipedia: "):
        return raw_title[len("Wikipedia: "):]
    return raw_title


def _make_doc_id(url):
    """Generate a deterministic document ID from URL for deduplication."""
    return hashlib.md5(url.encode()).hexdigest()[:16]


def parse_articles_stdlib(stream, limit=0, skip_until_url=None):
    """Parse Wikipedia abstract XML using stdlib iterparse.

    Yields (doc_id, document_dict) tuples.
    Memory-efficient: clears elements after processing.

    Args:
        stream: File-like object with XML data
        limit: Max articles to yield (0 = unlimited)
        skip_until_url: Skip articles until we see this URL (for resume)
    """
    count = 0
    skipping = skip_until_url is not None

    # iterparse returns (event, element) tuples
    context = etree.iterparse(stream, events=("end",), recover=True)

    current_doc = {}

    for event, elem in context:
        tag = elem.tag
        text = (elem.text or "").strip()

        if tag == "title":
            current_doc["title"] = _clean_wikipedia_title(text)
        elif tag == "url":
            current_doc["url"] = text
        elif tag == "abstract":
            current_doc["abstract"] = text
        elif tag == "doc":
            # End of a <doc> element — emit the article
            if "url" in current_doc and "title" in current_doc:
                url = current_doc["url"]
                title = current_doc["title"]
                abstract = current_doc.get("abstract", "")

                if skipping:
                    if url == skip_until_url:
                        skipping = False
                        # Skip this one too — it was already processed
                    current_doc = {}
                    elem.clear()
                    continue

                doc_id = _make_doc_id(url)
                document = {
                    "title": title,
                    "url": url,
                    "content": abstract,
                    "description": abstract,
                    "host": "en.wikipedia.org",
                    "inlink_count": 0,
                    "crawlDate": datetime.utcnow().isoformat() + "Z",
                    "title_suggest": title,
                }

                yield doc_id, document
                count += 1

                if limit > 0 and count >= limit:
                    elem.clear()
                    return

            current_doc = {}

        # Free memory — important for huge XML files
        elem.clear()


def parse_articles_lxml(stream, limit=0, skip_until_url=None):
    """Parse Wikipedia abstract XML using lxml for faster performance.

    Same interface as parse_articles_stdlib but uses lxml.etree.iterparse.
    """
    count = 0
    skipping = skip_until_url is not None

    context = lxml_etree.iterparse(stream, events=("end",), tag="doc", recover=True)

    for event, elem in context:
        title_elem = elem.find("title")
        url_elem = elem.find("url")
        abstract_elem = elem.find("abstract")

        if url_elem is not None and title_elem is not None:
            url = (url_elem.text or "").strip()
            title = _clean_wikipedia_title((title_elem.text or "").strip())
            abstract = (abstract_elem.text or "").strip() if abstract_elem is not None else ""

            if skipping:
                if url == skip_until_url:
                    skipping = False
                elem.clear()
                while elem.getprevious() is not None:
                    del elem.getparent()[0]
                continue

            doc_id = _make_doc_id(url)
            document = {
                "title": title,
                "url": url,
                "content": abstract,
                "description": abstract,
                "host": "en.wikipedia.org",
                "inlink_count": 0,
                "crawlDate": datetime.utcnow().isoformat() + "Z",
                "title_suggest": title,
            }

            yield doc_id, document
            count += 1

            if limit > 0 and count >= limit:
                elem.clear()
                return

        # Free memory
        elem.clear()
        while elem.getprevious() is not None:
            del elem.getparent()[0]


def parse_articles(stream, limit=0, skip_until_url=None):
    """Parse articles using the best available XML parser."""
    if HAS_LXML:
        print("[XML] Using lxml.etree.iterparse (fast)")
        return parse_articles_lxml(stream, limit, skip_until_url)
    else:
        print("[XML] Using xml.etree.ElementTree.iterparse (stdlib)")
        return parse_articles_stdlib(stream, limit, skip_until_url)


# ─── Progress Reporting ───────────────────────────────────────────────────

def format_duration(seconds):
    """Format seconds into a human-readable duration."""
    if seconds < 60:
        return f"{seconds:.0f}s"
    elif seconds < 3600:
        mins = seconds / 60
        return f"{mins:.1f}min"
    else:
        hours = seconds / 3600
        return f"{hours:.1f}h"


def print_progress(count, total_imported, total_errors, start_time, last_time):
    """Print a progress line with rate and ETA."""
    now = time.time()
    elapsed = now - start_time
    batch_time = now - last_time

    # Articles per second (overall)
    rate = total_imported / elapsed if elapsed > 0 else 0

    # Recent rate (based on this progress interval)
    recent_count = PROGRESS_INTERVAL
    recent_rate = recent_count / batch_time if batch_time > 0 else 0

    # Estimate total articles (~6.7M for full Wikipedia)
    estimated_total = 6_700_000
    if total_imported > 0:
        remaining = estimated_total - total_imported
        eta_seconds = remaining / rate if rate > 0 else 0
        eta_str = format_duration(eta_seconds)
    else:
        eta_str = "calculating..."

    print(
        f"  [{count:>10,}] "
        f"{total_imported:>10,} imported | "
        f"{total_errors:>6,} errors | "
        f"{rate:>8,.1f} art/s (avg) | "
        f"{recent_rate:>8,.1f} art/s (recent) | "
        f"ETA: {eta_str}"
    )


# ─── Main Import Logic ────────────────────────────────────────────────────

def run_import(opensearch_url, dump_url, limit, once, state_dir, batch_size=BULK_BATCH_SIZE):
    """Main import function."""
    state_path = os.path.join(state_dir, STATE_FILENAME)
    state = load_state(state_path)

    total_imported = state["total_imported"]
    total_errors = state["total_errors"]
    skip_until_url = state.get("last_url")  # Resume: skip until we see this URL

    if total_imported > 0:
        print(f"[RESUME] Continuing from {total_imported:,} previously imported articles")
        print(f"  Last URL: {skip_until_url}")

    # Step 1: Create or update the OpenSearch index
    print(f"\n[1/3] Setting up OpenSearch index...")
    create_or_update_index(opensearch_url)

    # Step 2: Download and stream the Wikipedia dump
    print(f"\n[2/3] Starting Wikipedia abstract import...")
    start_time = time.time()
    last_progress_time = start_time
    article_count = 0
    batch = []
    batch_count_since_save = 0

    try:
        decompressed_stream, total_size = stream_wikipedia_dump(dump_url, state)

        for doc_id, document in parse_articles(
            decompressed_stream,
            limit=limit,
            skip_until_url=skip_until_url if total_imported > 0 else None,
        ):
            batch.append((doc_id, document))
            article_count += 1

            # Flush batch when it reaches batch_size
            if len(batch) >= batch_size:
                success, errors = bulk_index(opensearch_url, batch)
                total_imported += success
                total_errors += errors
                batch = []
                batch_count_since_save += 1

                # Save state periodically (every batch)
                state["total_imported"] = total_imported
                state["total_errors"] = total_errors
                state["last_url"] = document["url"]
                save_state(state_path, state)

                # Progress reporting
                if article_count % PROGRESS_INTERVAL < batch_size:
                    print_progress(
                        article_count, total_imported, total_errors,
                        start_time, last_progress_time
                    )
                    last_progress_time = time.time()

    except KeyboardInterrupt:
        print(f"\n\n[INTERRUPTED] Saving state and flushing remaining batch...")
    except Exception as e:
        print(f"\n[ERROR] Import failed: {e}")
        # Still try to flush the current batch
    finally:
        # Flush any remaining documents in the batch
        if batch:
            print(f"\n[FLUSH] Indexing remaining {len(batch)} articles...")
            success, errors = bulk_index(opensearch_url, batch)
            total_imported += success
            total_errors += errors
            batch = []

        # Save final state
        state["total_imported"] = total_imported
        state["total_errors"] = total_errors
        save_state(state_path, state)

    # Step 3: Print final stats
    elapsed = time.time() - start_time
    rate = total_imported / elapsed if elapsed > 0 else 0

    print(f"\n{'='*70}")
    print(f"  Eesha Search — Wikipedia Import Complete")
    print(f"{'='*70}")
    print(f"  Total imported : {total_imported:>12,}")
    print(f"  Total errors   : {total_errors:>12,}")
    print(f"  Time taken     : {format_duration(elapsed):>12}")
    print(f"  Average rate   : {rate:>12,.1f} articles/sec")
    print(f"  State file     : {state_path}")
    print(f"{'='*70}")

    # Update index count in OpenSearch for the health endpoint
    try:
        count_url = f"{opensearch_url}/{OPENSEARCH_INDEX}/_count"
        result = opensearch_request(count_url, method="GET")
        doc_count = result.get("count", 0)
        print(f"  Index '{OPENSEARCH_INDEX}' now contains {doc_count:,} documents")
    except Exception:
        pass

    return total_imported, total_errors


# ─── CLI ──────────────────────────────────────────────────────────────────

def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Eesha Search — Wikipedia Abstracts Bulk Import",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                                # Full import (~6.7M articles)
  %(prog)s --limit 10000                  # Test with 10K articles
  %(prog)s --url http://host:9200         # Custom OpenSearch URL
  %(prog)s --once                         # Run once and exit (default behavior)
        """,
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("OPENSEARCH_URL", DEFAULT_OPENSEARCH_URL),
        help=f"OpenSearch URL (default: {DEFAULT_OPENSEARCH_URL}, "
             f"env: OPENSEARCH_URL)",
    )
    parser.add_argument(
        "--dump-url",
        default=WIKI_DUMP_URL,
        help=f"Wikipedia abstract dump URL (default: latest English Wikipedia)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit number of articles to import (0 = unlimited, for testing)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        default=True,
        help="Run once and exit (this is the default behavior)",
    )
    parser.add_argument(
        "--continuous",
        action="store_true",
        default=False,
        help="Run in continuous mode (re-import periodically, generally not "
             "needed for Wikipedia)",
    )
    parser.add_argument(
        "--state-dir",
        default=os.environ.get("STATE_DIR", os.path.dirname(os.path.abspath(__file__))),
        help="Directory for state file (default: script directory, env: STATE_DIR)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=BULK_BATCH_SIZE,
        help=f"Bulk indexing batch size (default: {BULK_BATCH_SIZE})",
    )

    args = parser.parse_args()
    return args


def main():
    """Main entry point."""
    args = parse_args()

    print("╔══════════════════════════════════════════════════════╗")
    print("║   Eesha Search — Wikipedia Abstracts Import          ║")
    print("║   100% Independent — Building Our Own Index          ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()
    print(f"  OpenSearch URL : {args.url}")
    print(f"  Dump URL       : {args.dump_url}")
    print(f"  Batch size     : {args.batch_size}")
    print(f"  Article limit  : {'unlimited' if args.limit == 0 else f'{args.limit:,}'}")
    print(f"  State dir      : {args.state_dir}")
    print(f"  XML parser     : {'lxml (fast)' if HAS_LXML else 'stdlib (xml.etree)'}")
    print()

    # Ensure state directory exists
    os.makedirs(args.state_dir, exist_ok=True)

    if args.continuous:
        # Continuous mode — re-import periodically
        interval = int(os.environ.get("WIKI_IMPORT_INTERVAL", "86400"))  # 24 hours
        print(f"[MODE] Continuous — re-import every {interval}s ({interval//3600}h)")
        print(f"[NOTE] Continuous mode downloads the full dump each time.")
        print(f"       For Wikipedia, --once is usually sufficient.\n")

        while True:
            try:
                run_import(
                    opensearch_url=args.url,
                    dump_url=args.dump_url,
                    limit=args.limit,
                    once=True,
                    state_dir=args.state_dir,
                    batch_size=args.batch_size,
                )
            except Exception as e:
                print(f"[ERROR] Import cycle failed: {e}")

            print(f"\n[NEXT] Sleeping {interval}s until next import...")
            time.sleep(interval)
    else:
        # Single run (default)
        total_imported, total_errors = run_import(
            opensearch_url=args.url,
            dump_url=args.dump_url,
            limit=args.limit,
            once=True,
            state_dir=args.state_dir,
            batch_size=args.batch_size,
        )

        if total_errors > 0:
            print(f"\n[WARN] {total_errors:,} errors during import. "
                  f"Re-run to retry failed documents.")
            sys.exit(1)


if __name__ == "__main__":
    main()
