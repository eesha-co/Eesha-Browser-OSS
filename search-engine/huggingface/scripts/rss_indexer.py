#!/usr/bin/env python3
"""
Eesha Search — RSS Feed Indexer
================================
Indexes RSS/Atom feeds from major news sites every 15 minutes.
Ensures fresh content for news queries. 100% Independent.

Uses feedparser to parse RSS feeds and indexes articles to ZincSearch (ES-compatible API).
NO external search engines. Only our OWN index.
Powered by ZincSearch — single Go binary (~20MB, ~256MB RAM).
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
import base64
import hashlib
from datetime import datetime

try:
    import feedparser
    HAS_FEEDPARSER = True
except ImportError:
    HAS_FEEDPARSER = False

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

USER_AGENT = 'EeshaSearch/2.0 (Eesha Browser RSS Indexer; +https://eesha.search)'

# ─── RSS Feeds to Index ────────────────────────────────────────────────────
# Major news sites with public RSS feeds — ensures fresh content
RSS_FEEDS = [
    # ─── International News ─────────────────────────────────────────────
    ('http://feeds.bbci.co.uk/news/rss.xml', 'BBC News'),
    ('http://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World'),
    ('http://feeds.bbci.co.uk/news/technology/rss.xml', 'BBC Technology'),
    ('http://feeds.bbci.co.uk/news/science_and_environment/rss.xml', 'BBC Science'),
    ('https://www.aljazeera.com/xml/rss/all.xml', 'Al Jazeera'),
    ('https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', 'NYT Home'),
    ('https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'NYT World'),
    ('https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', 'NYT Tech'),

    # ─── Technology ─────────────────────────────────────────────────────
    ('https://techcrunch.com/feed/', 'TechCrunch'),
    ('https://feeds.arstechnica.com/arstechnica/index', 'Ars Technica'),
    ('https://www.theverge.com/rss/index.xml', 'The Verge'),
    ('https://www.wired.com/feed/rss', 'Wired'),
    ('https://feeds.feedburner.com/ruanyifeng', 'Ruan Yifeng'),
    ('https://hnrss.org/frontpage', 'Hacker News'),
    ('https://lobste.rs/rss', 'Lobsters'),

    # ─── Science ────────────────────────────────────────────────────────
    ('https://www.nature.com/nature.rss', 'Nature'),
    ('https://rss.sciencedaily.com/all.xml', 'Science Daily'),
    ('https://feeds.newscientist.com/home', 'New Scientist'),

    # ─── Business & Finance ────────────────────────────────────────────
    ('https://www.reuters.com/rssFeed/businessNews', 'Reuters Business'),
    ('https://www.reuters.com/rssFeed/technologyNews', 'Reuters Tech'),

    # ─── Open Source & Dev ──────────────────────────────────────────────
    ('https://github.blog/feed/', 'GitHub Blog'),
    ('https://blog.rust-lang.org/feed.xml', 'Rust Blog'),
    ('https://blog.mozilla.org/feed/', 'Mozilla Blog'),

    # ─── Africa-focused ─────────────────────────────────────────────────
    ('http://feeds.bbci.co.uk/news/world/africa/rss.xml', 'BBC Africa'),
    ('https://www.aljazeera.com/xml/rss/africa.xml', 'Al Jazeera Africa'),
]


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


def index_article(article, feed_name=''):
    """Index an RSS article to ZincSearch (ES-compatible API)."""
    try:
        url = article.get('link', '')
        if not url:
            return False

        # Validate URL
        try:
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme not in ('http', 'https'):
                return False
            if not parsed.hostname:
                return False
        except Exception:
            return False

        # Use URL hash as document ID for deduplication
        doc_id = hashlib.md5(url.encode()).hexdigest()

        # Extract title
        title = article.get('title', 'Untitled')
        if not title or title == 'Untitled':
            return False

        # Clean title — remove HTML entities
        title = title.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').strip()
        if len(title) > 500:
            title = title[:500]

        # Extract description/summary
        description = ''
        if article.get('summary'):
            # feedparser returns HTML in summary, strip tags
            description = article.get('summary', '')
            # Simple HTML stripping
            import re
            description = re.sub(r'<[^>]+>', '', description)
            description = description.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').strip()
        elif article.get('description'):
            description = article.get('description', '')
            import re
            description = re.sub(r'<[^>]+>', '', description).strip()

        if len(description) > 1000:
            description = description[:1000]

        # Extract date
        pub_date = ''
        if article.get('published_parsed'):
            try:
                t = article.get('published_parsed')
                pub_date = time.strftime('%Y-%m-%dT%H:%M:%SZ', t)
            except Exception:
                pass
        elif article.get('updated_parsed'):
            try:
                t = article.get('updated_parsed')
                pub_date = time.strftime('%Y-%m-%dT%H:%M:%SZ', t)
            except Exception:
                pass

        if not pub_date:
            pub_date = datetime.utcnow().isoformat() + 'Z'

        # Parse host
        host = urllib.parse.urlparse(url).hostname or ''

        # Build document
        doc = {
            'title': title,
            'url': url,
            'description': description,
            'content': description,  # Use description as content for RSS articles
            'host': host,
            'inlink_count': 0,
            'crawlDate': pub_date,
            'title_suggest': title,
            'source': 'rss-indexer',
            'feed_name': feed_name
        }

        zinc_request(
            f"{ZINC_ES_URL}/{OPENSEARCH_INDEX}/_doc/{doc_id}",
            data=doc,
            method='PUT'
        )
        return True
    except Exception as e:
        # Silently skip articles that fail to index
        return False


def fetch_and_index_feed(feed_url, feed_name=''):
    """Fetch and index all articles from an RSS feed."""
    if not HAS_FEEDPARSER:
        print(f"[WARN] feedparser not installed, skipping {feed_name}")
        return 0

    try:
        # Fetch the feed
        headers = {'User-Agent': USER_AGENT}
        req = urllib.request.Request(feed_url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            feed_data = resp.read()

        # Parse with feedparser
        feed = feedparser.parse(feed_data)

        if not feed.entries:
            return 0

        indexed = 0
        for entry in feed.entries[:20]:  # Index max 20 articles per feed per cycle
            if index_article(entry, feed_name):
                indexed += 1

        return indexed
    except Exception as e:
        print(f"  [WARN] Failed to fetch {feed_name} ({feed_url}): {e}")
        return 0


def run_rss_indexer():
    """Run the RSS feed indexer — fetch and index all feeds."""
    if not HAS_FEEDPARSER:
        print("[ERROR] feedparser is not installed!")
        print("  Install with: pip3 install feedparser")
        return

    print(f"\n{'='*60}")
    print(f"Eesha Search — RSS Feed Indexer")
    print(f"Indexing {len(RSS_FEEDS)} feeds...")
    print(f"{'='*60}")

    total_indexed = 0
    total_feeds = 0
    failed_feeds = 0

    for feed_url, feed_name in RSS_FEEDS:
        print(f"  Fetching: {feed_name}...", end=' ')
        try:
            count = fetch_and_index_feed(feed_url, feed_name)
            total_indexed += count
            if count > 0:
                total_feeds += 1
                print(f"✓ {count} articles")
            else:
                print("0 articles (empty or no new)")
        except Exception as e:
            failed_feeds += 1
            print(f"✗ Error: {e}")

        # Small delay between feeds to be respectful
        time.sleep(0.5)

    print(f"\n[DONE] Indexed {total_indexed} articles from {total_feeds} feeds ({failed_feeds} failed)")


def main():
    """Main entry point."""
    single_run = '--once' in sys.argv

    if single_run:
        run_rss_indexer()
        return

    # Continuous mode — run every 15 minutes
    interval = int(os.environ.get('RSS_INTERVAL', '900'))  # 15 minutes
    print(f"Eesha Search RSS Indexer starting...")
    print(f"Index interval: {interval}s ({interval//60}m)")

    while True:
        try:
            run_rss_indexer()
        except Exception as e:
            print(f"[ERROR] RSS indexer cycle failed: {e}")

        print(f"\n[NEXT] Sleeping {interval}s until next RSS index...")
        time.sleep(interval)


if __name__ == '__main__':
    main()
