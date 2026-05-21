#!/usr/bin/env python3
"""
Eesha Search — Wikipedia Abstracts Bulk Import Script (Memory-Safe)
===================================================================
Downloads and imports Wikipedia abstracts into the ZincSearch index.

OPTIMIZED for 512MB RAM environments (Render free tier):
  - Memory check before import (skips if < 150MB free)
  - Smaller default limit (10000 articles ≈ 30MB index)
  - Streaming XML parser with aggressive element cleanup
  - Smaller batch sizes (100 instead of 500)
  - Graceful failure on OOM

Powered by ZincSearch — single Go binary (~20MB, ~256MB RAM).

Usage:
  python3 wikipedia_import.py                        # Import 10K articles
  python3 wikipedia_import.py --limit 50000          # Import 50K articles
  python3 wikipedia_import.py --once                 # Run once and exit
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
import base64
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
DEFAULT_ZINC_URL = "http://localhost:4080"
OPENSEARCH_INDEX = "nutch"
ZINC_API_URL_PREFIX = "/api/index"
BULK_BATCH_SIZE = 100  # Smaller batches for low-memory environments
PROGRESS_INTERVAL = 5000
DOWNLOAD_CHUNK_SIZE = 1024 * 32  # 32KB chunks (smaller for low memory)
USER_AGENT = "EeshaSearch/1.0 (Eesha Browser Search; +https://eesha.search)"
STATE_FILENAME = "wikipedia_import_state.json"
MAX_RETRIES = 3
RETRY_BACKOFF = 2
# Minimum free memory in MB to proceed with import
MIN_FREE_MEMORY_MB = 150

# ─── ZincSearch Auth ──────────────────────────────────────────────────────
ZINC_USER = os.environ.get('ZINC_FIRST_ADMIN_USER', 'admin')
ZINC_PASSWORD = os.environ.get('ZINC_FIRST_ADMIN_PASSWORD', 'Complexpass#123')
ZINC_AUTH_HEADER = 'Basic ' + base64.b64encode(f'{ZINC_USER}:{ZINC_PASSWORD}'.encode()).decode()
EESHA_API_KEY = os.environ.get('EESHA_API_KEY', '')

# ─── Index Mapping ────────────────────────────────────────────────────────

INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "title": {"type": "text", "analyzer": "standard"},
            "url": {"type": "keyword"},
            "content": {"type": "text", "analyzer": "standard"},
            "description": {"type": "text", "analyzer": "standard"},
            "host": {"type": "keyword"},
            "inlink_count": {"type": "numeric"},
            "crawlDate": {"type": "date"},
            "title_suggest": {"type": "text", "analyzer": "standard"}
        }
    }
}


# ─── Memory Check ─────────────────────────────────────────────────────────

def check_available_memory():
    """Check available system memory in MB. Returns None if unknown."""
    try:
        with open('/proc/meminfo', 'r') as f:
            for line in f:
                if line.startswith('MemAvailable:'):
                    return int(line.split()[1]) / 1024  # KB to MB
                elif line.startswith('MemFree:'):
                    return int(line.split()[1]) / 1024
    except Exception:
        pass
    return None


# ─── State Management ─────────────────────────────────────────────────────

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


# ─── ZincSearch Helpers ───────────────────────────────────────────────────

def zinc_request(url, method="GET", data=None, timeout=30, retries=MAX_RETRIES):
    """Make an authenticated request to ZincSearch with retry logic."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": ZINC_AUTH_HEADER
    }
    if EESHA_API_KEY:
        headers['X-Eesha-API-Key'] = EESHA_API_KEY
    body = json.dumps(data).encode("utf-8") if data else None

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = ""
            try:
                error_body = e.read().decode("utf-8", errors="replace")[:500]
            except Exception:
                pass

            if e.code == 409:
                return {"acknowledged": True}
            if e.code in (404, 500) and method == "GET":
                # Index doesn't exist yet
                return None
            if e.code >= 500 and attempt < retries:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                print(f"  [RETRY] ZincSearch {e.code}, attempt {attempt}/{retries}, "
                      f"waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"  [ERROR] ZincSearch HTTP {e.code}: {error_body[:200]}")
            return None
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if attempt < retries:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                print(f"  [RETRY] Connection error: {e}, attempt {attempt}/{retries}, "
                      f"waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"  [ERROR] ZincSearch connection failed after {retries} attempts: {e}")
            return None

    return None


def create_or_update_index(zinc_url):
    """Create the ZincSearch index with proper mapping if it doesn't exist."""
    api_url = zinc_url.rstrip('/') + ZINC_API_URL_PREFIX
    index_url = f"{api_url}/{OPENSEARCH_INDEX}"

    try:
        result = zinc_request(index_url, method="GET")
        if result is not None:
            print(f"[OK] Index '{OPENSEARCH_INDEX}' already exists")
            return
    except Exception:
        pass

    try:
        result = zinc_request(index_url, method="PUT", data=INDEX_MAPPING)
        if result and result.get("acknowledged"):
            print(f"[OK] Created index '{OPENSEARCH_INDEX}' with mapping")
        else:
            print(f"[WARN] Index creation response: {result}")
    except Exception as e:
        print(f"[WARN] Could not create index: {e}")


def bulk_index(zinc_url, batch, retries=MAX_RETRIES):
    """Send a batch of documents to ZincSearch via the bulk API."""
    if not batch:
        return 0, 0

    es_url = zinc_url.rstrip('/') + '/es'

    lines = []
    for doc_id, doc in batch:
        action_line = json.dumps({"index": {"_index": OPENSEARCH_INDEX, "_id": doc_id}})
        doc_line = json.dumps(doc, ensure_ascii=False)
        lines.append(action_line)
        lines.append(doc_line)

    bulk_body = "\n".join(lines) + "\n"
    bulk_url = f"{es_url}/_bulk"

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                bulk_url,
                data=bulk_body.encode("utf-8"),
                headers={
                    "Content-Type": "application/x-ndjson",
                    "Authorization": ZINC_AUTH_HEADER
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            success = 0
            errors = 0
            if result.get("errors"):
                for item in result.get("items", []):
                    index_info = item.get("index", {})
                    status = index_info.get("status", 0)
                    if 200 <= status < 300:
                        success += 1
                    else:
                        errors += 1
            else:
                success = len(batch)
                errors = 0

            return success, errors

        except urllib.error.HTTPError as e:
            if attempt < retries:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                print(f"  [RETRY] Bulk HTTP {e.code}, attempt {attempt}/{retries}, "
                      f"waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"  [ERROR] Bulk request failed after {retries} retries: HTTP {e.code}")
            return 0, len(batch)

        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if attempt < retries:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                print(f"  [RETRY] Bulk connection error: {e}, attempt {attempt}/{retries}")
                time.sleep(wait)
                continue
            print(f"  [ERROR] Bulk request failed after {retries} retries: {e}")
            return 0, len(batch)

    return 0, len(batch)


# ─── Streaming Download + Decompress ──────────────────────────────────────

def stream_wikipedia_dump(dump_url, state):
    """Download and decompress the Wikipedia dump in a streaming fashion."""
    print(f"[DOWNLOAD] Starting streaming download of:")
    print(f"  {dump_url}")

    headers = {"User-Agent": USER_AGENT}
    req = urllib.request.Request(dump_url, headers=headers)
    resp = urllib.request.urlopen(req, timeout=300)

    total_size = resp.headers.get("Content-Length")
    if total_size:
        total_size = int(total_size)
        print(f"  Total size: {total_size / (1024*1024):.1f} MB")
    else:
        print(f"  Total size: unknown (streaming)")

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
    Memory-efficient: clears elements after processing.
    """
    count = 0
    skipping = skip_until_url is not None

    # iterparse with recover=True is not supported in stdlib
    context = etree.iterparse(stream, events=("end",))

    current_doc = {}

    for event, elem in context:
        tag = elem.tag
        # Strip namespace if present
        if '}' in tag:
            tag = tag.split('}', 1)[1]

        text = (elem.text or "").strip()

        if tag == "title":
            current_doc["title"] = _clean_wikipedia_title(text)
        elif tag == "url":
            current_doc["url"] = text
        elif tag == "abstract":
            current_doc["abstract"] = text
        elif tag == "doc":
            if "url" in current_doc and "title" in current_doc:
                url = current_doc["url"]
                title = current_doc["title"]
                abstract = current_doc.get("abstract", "")

                if skipping:
                    if url == skip_until_url:
                        skipping = False
                    current_doc = {}
                    elem.clear()
                    continue

                # Truncate long abstracts to save memory
                if len(abstract) > 2000:
                    abstract = abstract[:2000]

                doc_id = _make_doc_id(url)
                document = {
                    "title": title[:500],
                    "url": url,
                    "content": abstract,
                    "description": abstract[:500],
                    "host": "en.wikipedia.org",
                    "inlink_count": 0,
                    "crawlDate": datetime.utcnow().isoformat() + "Z",
                    "title_suggest": title[:500],
                }

                yield doc_id, document
                count += 1

                if limit > 0 and count >= limit:
                    elem.clear()
                    return

            current_doc = {}

        # Free memory — critical for huge XML files
        elem.clear()


def parse_articles_lxml(stream, limit=0, skip_until_url=None):
    """Parse Wikipedia abstract XML using lxml for faster performance."""
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

            if len(abstract) > 2000:
                abstract = abstract[:2000]

            doc_id = _make_doc_id(url)
            document = {
                "title": title[:500],
                "url": url,
                "content": abstract,
                "description": abstract[:500],
                "host": "en.wikipedia.org",
                "inlink_count": 0,
                "crawlDate": datetime.utcnow().isoformat() + "Z",
                "title_suggest": title[:500],
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
        return f"{seconds / 60:.1f}min"
    else:
        return f"{seconds / 3600:.1f}h"


def print_progress(count, total_imported, total_errors, start_time, last_time):
    """Print a progress line with rate and ETA."""
    now = time.time()
    elapsed = now - start_time
    batch_time = now - last_time

    rate = total_imported / elapsed if elapsed > 0 else 0
    recent_count = PROGRESS_INTERVAL
    recent_rate = recent_count / batch_time if batch_time > 0 else 0

    print(
        f"  [{count:>10,}] "
        f"{total_imported:>10,} imported | "
        f"{total_errors:>6,} errors | "
        f"{rate:>8,.1f} art/s (avg) | "
        f"{recent_rate:>8,.1f} art/s (recent)"
    )


# ─── Main Import Logic ────────────────────────────────────────────────────

def run_import(zinc_url, dump_url, limit, once, state_dir, batch_size=BULK_BATCH_SIZE):
    """Main import function."""
    state_path = os.path.join(state_dir, STATE_FILENAME)
    state = load_state(state_path)

    total_imported = state["total_imported"]
    total_errors = state["total_errors"]
    skip_until_url = state.get("last_url")

    if total_imported > 0:
        print(f"[RESUME] Continuing from {total_imported:,} previously imported articles")
        print(f"  Last URL: {skip_until_url}")

    # ── Memory check ──────────────────────────────────────────────────────
    free_mb = check_available_memory()
    if free_mb is not None:
        print(f"[MEMORY] Available: {free_mb:.0f} MB (min required: {MIN_FREE_MEMORY_MB} MB)")
        if free_mb < MIN_FREE_MEMORY_MB:
            print(f"[SKIP] Not enough memory for Wikipedia import. "
                  f"Need {MIN_FREE_MEMORY_MB}MB, have {free_mb:.0f}MB.")
            print(f"[INFO] Will rely on crawler + RSS for search data instead.")
            return 0, 0
    else:
        print("[MEMORY] Could not determine available memory, proceeding with caution")

    # Step 1: Create or update the ZincSearch index
    print(f"\n[1/3] Setting up ZincSearch index...")
    create_or_update_index(zinc_url)

    # Step 2: Download and stream the Wikipedia dump
    print(f"\n[2/3] Starting Wikipedia abstract import (limit: {limit or 'unlimited'})...")
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
                success, errors = bulk_index(zinc_url, batch)
                total_imported += success
                total_errors += errors
                batch = []
                batch_count_since_save += 1

                # Save state periodically
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

                # Check memory during import — abort if running low
                free_mb = check_available_memory()
                if free_mb is not None and free_mb < 80:
                    print(f"[WARN] Memory running low ({free_mb:.0f}MB free), stopping import")
                    break

    except MemoryError:
        print(f"\n[WARN] Out of memory during Wikipedia import! "
              f"Imported {total_imported:,} articles before OOM.")
        print(f"[INFO] The index still has the data already imported. "
              f"Crawler + RSS will add more over time.")
    except KeyboardInterrupt:
        print(f"\n\n[INTERRUPTED] Saving state and flushing remaining batch...")
    except Exception as e:
        print(f"\n[ERROR] Import failed: {e}")
        print(f"[INFO] {total_imported:,} articles were imported before the error.")
    finally:
        # Flush any remaining documents in the batch
        if batch:
            print(f"\n[FLUSH] Indexing remaining {len(batch)} articles...")
            success, errors = bulk_index(zinc_url, batch)
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

    # Check final index count
    try:
        es_url = zinc_url.rstrip('/') + '/es'
        count_url = f"{es_url}/{OPENSEARCH_INDEX}/_search"
        result = zinc_request(count_url, method="POST", data={"query": {"match_all": {}}, "size": 0})
        if result:
            total = result.get("hits", {}).get("total", {})
            doc_count = total.get("value", 0) if isinstance(total, dict) else (total or 0)
            print(f"  Index '{OPENSEARCH_INDEX}' now contains {doc_count:,} documents")
    except Exception:
        pass

    return total_imported, total_errors


# ─── CLI ──────────────────────────────────────────────────────────────────

def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Eesha Search — Wikipedia Abstracts Import (Memory-Safe for 512MB RAM)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                                # Import 10K articles (safe for 512MB RAM)
  %(prog)s --limit 50000                  # Import 50K articles (needs more RAM)
  %(prog)s --url http://host:4080         # Custom ZincSearch URL
  %(prog)s --once                         # Run once and exit (default)
        """,
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("OPENSEARCH_URL", DEFAULT_ZINC_URL),
        help=f"ZincSearch URL (default: {DEFAULT_ZINC_URL})",
    )
    parser.add_argument(
        "--dump-url",
        default=WIKI_DUMP_URL,
        help="Wikipedia abstract dump URL (default: latest English Wikipedia)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10000,
        help="Limit number of articles to import (default: 10000, safe for 512MB RAM)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        default=True,
        help="Run once and exit (this is the default behavior)",
    )
    parser.add_argument(
        "--state-dir",
        default=os.environ.get("STATE_DIR", os.path.dirname(os.path.abspath(__file__))),
        help="Directory for state file",
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
    print("║   Memory-Safe for 512MB RAM environments             ║")
    print("║   Powered by ZincSearch (lightweight Go binary)      ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()
    print(f"  ZincSearch URL : {args.url}")
    print(f"  Dump URL       : {args.dump_url}")
    print(f"  Batch size     : {args.batch_size}")
    print(f"  Article limit  : {args.limit:,}")
    print(f"  State dir      : {args.state_dir}")
    print(f"  XML parser     : {'lxml (fast)' if HAS_LXML else 'stdlib (xml.etree)'}")
    print()

    # Ensure state directory exists
    os.makedirs(args.state_dir, exist_ok=True)

    total_imported, total_errors = run_import(
        zinc_url=args.url,
        dump_url=args.dump_url,
        limit=args.limit,
        once=True,
        state_dir=args.state_dir,
        batch_size=args.batch_size,
    )

    if total_errors > 0 and total_imported == 0:
        print(f"\n[ERROR] All imports failed. Check ZincSearch connectivity.")
        sys.exit(1)
    elif total_errors > 0:
        print(f"\n[WARN] {total_errors:,} errors during import. "
              f"Re-run to retry failed documents.")


if __name__ == "__main__":
    main()
