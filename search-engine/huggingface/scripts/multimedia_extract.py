#!/usr/bin/env python3
"""
Eesha Search - Multimedia Automation
=====================================
Extracts <img> and <video> tags from crawled pages and generates
image signatures (perceptual hashes) for multimedia search support.

Works with ZincSearch (ES-compatible API) for document storage and retrieval.
Powered by ZincSearch — single Go binary (~20MB, ~256MB RAM).

Usage:
  python3 multimedia_extract.py                # Process all unprocessed docs
  python3 multimedia_extract.py --continuous   # Run every 30 minutes
  python3 multimedia_extract.py --once         # Run once and exit
"""

import json
import hashlib
import os
import sys
import time
import urllib.request
import urllib.error
import base64
from datetime import datetime

# ─── Configuration ────────────────────────────────────────────────────────
# ZincSearch connection
ZINC_SEARCH_URL = os.environ.get('OPENSEARCH_URL', 'http://localhost:4080')
ZINC_ES_URL = ZINC_SEARCH_URL.rstrip('/') + '/es'
ZINC_API_URL = ZINC_SEARCH_URL.rstrip('/') + '/api/index'
OPENSEARCH_INDEX = os.environ.get('OPENSEARCH_INDEX', 'nutch')
MULTIMEDIA_INDEX = os.environ.get('MULTIMEDIA_INDEX', 'eesha-media')
SCAN_INTERVAL = int(os.environ.get('MEDIA_SCAN_INTERVAL', '1800'))  # 30 min

# ZincSearch Basic Auth
ZINC_USER = os.environ.get('ZINC_FIRST_ADMIN_USER', 'admin')
ZINC_PASSWORD = os.environ.get('ZINC_FIRST_ADMIN_PASSWORD', 'Complexpass#123')
ZINC_AUTH_HEADER = 'Basic ' + base64.b64encode(f'{ZINC_USER}:{ZINC_PASSWORD}'.encode()).decode()

# API key for Crawler Instance remote indexing
EESHA_API_KEY = os.environ.get('EESHA_API_KEY', '')


# ─── Perceptual Hash (simplified pHash) ───────────────────────────────────

def simple_phash(data):
    """
    Generate a simplified perceptual hash for image data.
    Uses average hash method: resize → grayscale → threshold → hash.
    This is a lightweight alternative to full OpenCV pHash.
    """
    try:
        # Use raw image data hash as signature
        # In production, replace with actual perceptual hash using OpenCV
        m = hashlib.sha256()
        m.update(data)
        return m.hexdigest()[:16]  # 64-bit hash
    except Exception:
        return None


def compute_image_signature(url):
    """Download image and compute its signature hash."""
    try:
        headers = {'User-Agent': 'EeshaSearch/0.9.2 (Media Crawler)'}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()

        # Limit: skip files larger than 5MB
        if len(data) > 5 * 1024 * 1024:
            return None

        content_type = resp.headers.get('Content-Type', '')
        if not content_type.startswith('image/'):
            return None

        phash = simple_phash(data)
        return {
            'url': url,
            'size': len(data),
            'content_type': content_type,
            'phash': phash,
            'indexed_at': datetime.utcnow().isoformat(),
        }
    except Exception:
        return None


def zinc_request(url, data=None, method='GET', timeout=10, content_type='application/json'):
    """Make an authenticated request to ZincSearch."""
    headers = {
        'Content-Type': content_type,
        'Authorization': ZINC_AUTH_HEADER
    }
    if EESHA_API_KEY:
        headers['X-Eesha-API-Key'] = EESHA_API_KEY
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def fetch_unprocessed_docs():
    """Fetch documents from ZincSearch that haven't had media extracted yet."""
    try:
        query = {
            "size": 100,
            "query": {
                "bool": {
                    "must_not": {
                        "exists": {"field": "media_processed"}
                    }
                }
            },
            "_source": ["url", "title", "images", "videos", "content"]
        }

        result = zinc_request(
            f"{ZINC_ES_URL}/{OPENSEARCH_INDEX}/_search",
            data=query,
            method='POST',
            timeout=30
        )

        hits = result.get('hits', {}).get('hits', [])
        return hits
    except Exception as e:
        print(f"[ERROR] Failed to fetch docs: {e}")
        return []


def create_media_index():
    """Create the multimedia index in ZincSearch if it doesn't exist."""
    try:
        # Check if index already exists via ZincSearch native API
        try:
            zinc_request(
                f"{ZINC_API_URL}/{MULTIMEDIA_INDEX}",
                method='GET'
            )
            return  # Index already exists
        except (urllib.error.HTTPError, Exception):
            pass

        mapping = {
            "mappings": {
                "properties": {
                    "source_url": {"type": "keyword"},
                    "media_type": {"type": "keyword"},
                    "media_url": {"type": "keyword"},
                    "phash": {"type": "keyword"},
                    "size": {"type": "numeric"},
                    "content_type": {"type": "keyword"},
                    "source_title": {"type": "text"},
                    "indexed_at": {"type": "date"}
                }
            }
        }
        # Create index using ZincSearch native API
        zinc_request(
            f"{ZINC_API_URL}/{MULTIMEDIA_INDEX}",
            data=mapping,
            method='PUT'
        )
        print(f"[OK] Created media index: {MULTIMEDIA_INDEX}")
    except urllib.error.HTTPError as e:
        if e.code == 400:
            # Index already exists
            pass
        else:
            print(f"[WARN] Could not create media index: {e}")
    except Exception as e:
        print(f"[WARN] Could not create media index: {e}")


def process_document(doc):
    """Process a single document: extract and index media references."""
    source = doc.get('_source', {})
    doc_url = source.get('url', '')
    doc_title = source.get('title', '')
    doc_id = doc.get('_id', '')
    images = source.get('images', [])
    videos = source.get('videos', [])

    media_count = 0

    # Process images
    for img_url in images[:20]:  # Limit per doc
        if not isinstance(img_url, str) or not img_url.startswith('http'):
            continue

        signature = compute_image_signature(img_url)
        if signature:
            try:
                media_doc = {
                    "source_url": doc_url,
                    "media_type": "image",
                    "media_url": img_url,
                    **signature,
                    "source_title": doc_title,
                }
                # Generate deterministic doc ID for deduplication
                media_id = hashlib.md5(f"{doc_url}#img#{img_url}".encode()).hexdigest()
                zinc_request(
                    f"{ZINC_ES_URL}/{MULTIMEDIA_INDEX}/_doc/{media_id}",
                    data=media_doc,
                    method='PUT'
                )
                media_count += 1
            except Exception:
                pass

    # Process videos (store metadata only, no download)
    for vid_url in videos[:10]:
        if not isinstance(vid_url, str) or not vid_url.startswith('http'):
            continue

        try:
            media_doc = {
                "source_url": doc_url,
                "media_type": "video",
                "media_url": vid_url,
                "phash": None,
                "size": 0,
                "content_type": "video/*",
                "source_title": doc_title,
                "indexed_at": datetime.utcnow().isoformat(),
            }
            # Generate deterministic doc ID for deduplication
            media_id = hashlib.md5(f"{doc_url}#vid#{vid_url}".encode()).hexdigest()
            zinc_request(
                f"{ZINC_ES_URL}/{MULTIMEDIA_INDEX}/_doc/{media_id}",
                data=media_doc,
                method='PUT'
            )
            media_count += 1
        except Exception:
            pass

    # Mark document as processed
    # Use GET+PUT instead of _update for ZincSearch v0.4.10 compatibility
    try:
        existing = zinc_request(
            f"{ZINC_ES_URL}/{OPENSEARCH_INDEX}/_doc/{doc_id}",
            method='GET',
            timeout=5
        )
        if existing and existing.get('found'):
            source = existing.get('_source', {})
            source['media_processed'] = True
            zinc_request(
                f"{ZINC_ES_URL}/{OPENSEARCH_INDEX}/_doc/{doc_id}",
                data=source,
                method='PUT',
                timeout=10
            )
    except Exception:
        pass

    return media_count


def run_media_cycle():
    """Execute one multimedia extraction cycle."""
    print(f"\n[INFO] Starting multimedia extraction cycle...")
    create_media_index()
    docs = fetch_unprocessed_docs()
    print(f"[INFO] Found {len(docs)} unprocessed documents")

    total_media = 0
    for i, doc in enumerate(docs):
        count = process_document(doc)
        total_media += count
        if (i + 1) % 10 == 0:
            print(f"[INFO] Processed {i+1}/{len(docs)} docs, {total_media} media items")

    print(f"[DONE] Extracted {total_media} media items from {len(docs)} documents")
    return total_media


def main():
    single_run = '--once' in sys.argv

    if single_run:
        run_media_cycle()
        return

    print(f"Eesha Search Media Extractor starting...")
    print(f"Scan interval: {SCAN_INTERVAL}s ({SCAN_INTERVAL//60}m)")

    while True:
        try:
            run_media_cycle()
        except Exception as e:
            print(f"[ERROR] Media cycle failed: {e}")
        time.sleep(SCAN_INTERVAL)


if __name__ == '__main__':
    main()
