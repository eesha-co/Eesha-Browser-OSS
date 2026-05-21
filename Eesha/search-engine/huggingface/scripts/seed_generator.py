#!/usr/bin/env python3
"""
Eesha Search - Automatic Seed Generator
=========================================
Pulls trending URLs from RSS feeds and appends them to Nutch's seed.txt file.
Runs every hour via cron to keep the crawl queue fresh.

RSS Sources:
  - Hacker News (tech trending)
  - Reddit (general trending)
  - BBC News (world news)
  - NYT (headlines)
  - Wikipedia (featured articles)
  - Product Hunt (new products)
  - Lobsters (tech discussion)
"""

import feedparser
import urllib.request
import urllib.error
import json
import hashlib
import os
import sys
import time
import re
import base64
from datetime import datetime
from urllib.parse import urlparse

# ─── Configuration ────────────────────────────────────────────────────────
SEED_OUTPUT = os.environ.get('SEED_OUTPUT', '/root/nutch/urls/seed.txt')
SEED_ARCHIVE = os.environ.get('SEED_ARCHIVE', '/root/nutch/urls/archive.txt')
SCAN_INTERVAL = int(os.environ.get('SCAN_INTERVAL', '3600'))
MAX_SEEDS_PER_FEED = 50
MAX_TOTAL_SEEDS = 500

# ZincSearch connection
ZINC_SEARCH_URL = os.environ.get('OPENSEARCH_URL', 'http://localhost:4080')
ZINC_ES_URL = ZINC_SEARCH_URL.rstrip('/') + '/es'
ZINC_API_URL = ZINC_SEARCH_URL.rstrip('/') + '/api/index'
OPENSEARCH_INDEX = os.environ.get('OPENSEARCH_INDEX', 'nutch')

# ZincSearch Basic Auth
ZINC_USER = os.environ.get('ZINC_FIRST_ADMIN_USER', 'admin')
ZINC_PASSWORD = os.environ.get('ZINC_FIRST_ADMIN_PASSWORD', 'Complexpass#123')
ZINC_AUTH_HEADER = 'Basic ' + base64.b64encode(f'{ZINC_USER}:{ZINC_PASSWORD}'.encode()).decode()
EESHA_API_KEY = os.environ.get('EESHA_API_KEY', '')

# RSS Feed URLs - curated for diversity and quality
DEFAULT_FEEDS = [
    # Tech
    'https://hnrss.org/frontpage',
    'https://lobste.rs/rss',
    'https://www.producthunt.com/feed',
    'https://techcrunch.com/feed/',
    # News
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    'https://www.theguardian.com/world/rss',
    # Science & Knowledge
    'https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=featured',
    'https://www.nature.com/nature.rss',
    # Culture
    'https://www.reddit.com/r/all/.rss',
    'https://www.reddit.com/r/science/.rss',
    'https://www.reddit.com/r/technology/.rss',
]

FEEDS = os.environ.get('RSS_FEEDS', ','.join(DEFAULT_FEEDS)).split(',')

# ─── ZincSearch Helper ────────────────────────────────────────────────────

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


def check_url_in_index(url):
    """Check if a URL already exists in the ZincSearch index."""
    try:
        doc_id = hashlib.md5(url.encode()).hexdigest()
        result = zinc_request(
            f"{ZINC_ES_URL}/{OPENSEARCH_INDEX}/_doc/{doc_id}",
            method='GET'
        )
        return result.get('found', False)
    except (urllib.error.HTTPError, Exception):
        return False


# ─── Helper Functions ─────────────────────────────────────────────────────

def is_valid_url(url):
    """Validate URL format and filter out non-HTTP schemes."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        if not parsed.hostname:
            return False
        # Skip common non-indexable domains
        skip_domains = {
            'localhost', '127.0.0.1', '0.0.0.0',
            'youtube.com', 'youtu.be',  # YouTube pages are poor text sources
            'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
            'tiktok.com', 'linkedin.com',
        }
        if parsed.hostname in skip_domains:
            return False
        return True
    except Exception:
        return False


def load_existing_seeds():
    """Load URLs already in the seed file to avoid duplicates."""
    existing = set()
    try:
        if os.path.exists(SEED_OUTPUT):
            with open(SEED_OUTPUT, 'r') as f:
                for line in f:
                    url = line.strip()
                    if url and not url.startswith('#'):
                        existing.add(url)
        if os.path.exists(SEED_ARCHIVE):
            with open(SEED_ARCHIVE, 'r') as f:
                for line in f:
                    url = line.strip()
                    if url and not url.startswith('#'):
                        existing.add(url)
    except Exception:
        pass
    return existing


def archive_old_seeds():
    """Move current seeds to archive to keep seed file fresh."""
    try:
        if os.path.exists(SEED_OUTPUT):
            with open(SEED_OUTPUT, 'r') as src, open(SEED_ARCHIVE, 'a') as dst:
                dst.write(src.read())
            # Clear the seed file for new URLs
            with open(SEED_OUTPUT, 'w') as f:
                f.write(f"# Eesha Search Seed URLs - Refreshed {datetime.utcnow().isoformat()}\n")
    except Exception:
        pass


def fetch_feed_urls(feed_url):
    """Fetch and parse an RSS feed, extracting URLs."""
    urls = []
    try:
        headers = {'User-Agent': 'EeshaSearch/0.9.2 (Eesha Browser Search Crawler)'}
        req = urllib.request.Request(feed_url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            feed_data = feedparser.parse(response.read())

        for entry in feed_data.entries[:MAX_SEEDS_PER_FEED]:
            url = entry.get('link', '')
            if url and is_valid_url(url):
                urls.append(url)
    except Exception as e:
        print(f"[WARN] Failed to fetch {feed_url}: {e}")
    return urls


def inject_seeds_to_nutch():
    """Tell Nutch to inject new seeds from the seed file."""
    try:
        import subprocess
        result = subprocess.run(
            ['nutch', 'inject', '/root/nutch/crawl/crawldb', SEED_OUTPUT],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0:
            print(f"[OK] Seeds injected into Nutch crawl DB")
        else:
            print(f"[WARN] Nutch inject returned: {result.stderr}")
    except Exception as e:
        print(f"[WARN] Could not inject seeds into Nutch: {e}")


def run_seed_cycle():
    """Execute one full seed generation cycle."""
    print(f"\n{'='*60}")
    print(f"Eesha Search - Seed Generation Cycle")
    print(f"Time: {datetime.utcnow().isoformat()}")
    print(f"{'='*60}")

    # Load existing seeds to avoid duplicates
    existing = load_existing_seeds()
    print(f"[INFO] Found {len(existing)} existing seed URLs")

    # Archive old seeds
    archive_old_seeds()

    # Collect new URLs from all feeds
    new_urls = []
    for feed_url in FEEDS:
        feed_urls = fetch_feed_urls(feed_url)
        fresh = [u for u in feed_urls if u not in existing]
        new_urls.extend(fresh)
        print(f"[OK] {feed_url}: {len(feed_urls)} total, {len(fresh)} new")

    # Deduplicate and limit
    seen = set()
    unique_urls = []
    for url in new_urls:
        if url not in seen:
            seen.add(url)
            unique_urls.append(url)
    unique_urls = unique_urls[:MAX_TOTAL_SEEDS]

    # Write new seeds
    if unique_urls:
        with open(SEED_OUTPUT, 'a') as f:
            for url in unique_urls:
                f.write(url + '\n')
        print(f"\n[OK] Added {len(unique_urls)} new seed URLs to {SEED_OUTPUT}")

        # Try to inject into Nutch if available
        inject_seeds_to_nutch()
    else:
        print(f"\n[INFO] No new seed URLs found this cycle")

    return len(unique_urls)


def main():
    """Main entry point - either run once or in continuous loop."""
    single_run = '--once' in sys.argv

    if single_run:
        count = run_seed_cycle()
        print(f"\n[DONE] Single run complete. Added {count} seeds.")
        return

    # Continuous mode - run every SCAN_INTERVAL seconds
    print(f"Eesha Search Seed Generator starting...")
    print(f"Scan interval: {SCAN_INTERVAL}s ({SCAN_INTERVAL//60}m)")
    print(f"Seed output: {SEED_OUTPUT}")
    print(f"Monitoring {len(FEEDS)} RSS feeds")

    while True:
        try:
            run_seed_cycle()
        except Exception as e:
            print(f"[ERROR] Seed cycle failed: {e}")

        print(f"\n[NEXT] Sleeping {SCAN_INTERVAL}s until next cycle...")
        time.sleep(SCAN_INTERVAL)


if __name__ == '__main__':
    main()
