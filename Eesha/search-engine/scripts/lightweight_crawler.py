#!/usr/bin/env python3
"""
Eesha Search - Lightweight Crawler for HF Spaces
=================================================
A simple web crawler that replaces Apache Nutch for single-container deployments.
Fetches URLs, extracts text + links, indexes to OpenSearch.

NOT external search engines. This is our OWN crawler building our OWN index.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
import re
import hashlib
from datetime import datetime
from html.parser import HTMLParser

OPENSEARCH_URL = os.environ.get('OPENSEARCH_URL', 'http://localhost:9200')
OPENSEARCH_INDEX = os.environ.get('OPENSEARCH_INDEX', 'nutch')
MAX_PAGES = int(os.environ.get('CRAWL_MAX_PAGES', '10000'))
MAX_DEPTH = int(os.environ.get('CRAWL_MAX_DEPTH', '4'))
CRAWL_DELAY = float(os.environ.get('CRAWL_DELAY', '0.5'))
USER_AGENT = 'EeshaSearch/1.0 (Eesha Browser Independent Search Crawler; +https://eesha.search)'
# Inlink tracking for authority scoring
INLINK_TRACKER = {}  # url -> count of pages linking to it

class PageParser(HTMLParser):
    """Simple HTML parser that extracts title, text, links, images, and meta tags."""
    
    def __init__(self):
        super().__init__()
        self.title = ''
        self.in_title = False
        self.text_parts = []
        self.links = []
        self.images = []
        self.description = ''
        self.in_meta = False
        self.current_tag = None
    
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        self.current_tag = tag.lower()
        
        if tag.lower() == 'title':
            self.in_title = True
        elif tag.lower() == 'a' and 'href' in attrs_dict:
            self.links.append(attrs_dict['href'])
        elif tag.lower() == 'img' and 'src' in attrs_dict:
            self.images.append(attrs_dict['src'])
        elif tag.lower() == 'meta':
            name = attrs_dict.get('name', attrs_dict.get('property', '')).lower()
            if name in ('description', 'og:description'):
                self.description = attrs_dict.get('content', '')
            elif name in ('og:image', 'thumbnail'):
                img_url = attrs_dict.get('content', '')
                if img_url:
                    self.images.append(img_url)
    
    def handle_endtag(self, tag):
        if tag.lower() == 'title':
            self.in_title = False
    
    def handle_data(self, data):
        if self.in_title:
            self.title += data
        else:
            stripped = data.strip()
            if stripped:
                self.text_parts.append(stripped)
    
    def get_text(self, max_length=5000):
        text = ' '.join(self.text_parts)
        return text[:max_length]


def is_valid_url(url):
    """Check if URL is crawlable."""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        if not parsed.hostname:
            return False
        skip = {'localhost', '127.0.0.1', 'facebook.com', 'instagram.com', 
                'twitter.com', 'x.com', 'tiktok.com', 'linkedin.com'}
        if parsed.hostname in skip:
            return False
        return True
    except Exception:
        return False


def resolve_url(base_url, href):
    """Resolve a relative URL against a base URL."""
    try:
        return urllib.parse.urljoin(base_url, href)
    except Exception:
        return None


def fetch_page(url, timeout=15):
    """Fetch a web page and return its content."""
    try:
        headers = {'User-Agent': USER_AGENT}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get('Content-Type', '')
            if 'text/html' not in content_type and 'text/plain' not in content_type:
                return None
            return resp.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"  [WARN] Failed to fetch {url}: {e}")
        return None


def parse_page(html, base_url):
    """Parse HTML and extract structured data."""
    parser = PageParser()
    try:
        parser.feed(html)
    except Exception:
        pass
    
    # Resolve relative URLs
    resolved_links = []
    for link in parser.links:
        resolved = resolve_url(base_url, link)
        if resolved and is_valid_url(resolved):
            resolved_links.append(resolved)
    
    resolved_images = []
    for img in parser.images:
        resolved = resolve_url(base_url, img)
        if resolved and resolved.startswith('http'):
            resolved_images.append(resolved)
    
    return {
        'title': parser.title.strip() or 'Untitled',
        'content': parser.get_text(),
        'description': parser.description[:500] if parser.description else '',
        'url': base_url,
        'links': resolved_links[:50],
        'images': resolved_images[:20],
        'host': urllib.parse.urlparse(base_url).hostname,
        'inlink_count': 0,  # Updated after crawl by update_inlinks()
        'crawlDate': datetime.utcnow().isoformat() + 'Z',
    }


def index_document(doc):
    """Index a document to OpenSearch."""
    try:
        # Use URL hash as document ID for deduplication
        doc_id = hashlib.md5(doc['url'].encode()).hexdigest()
        
        data = json.dumps({
            'doc': doc,
            'doc_as_upsert': True
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f"{OPENSEARCH_URL}/{OPENSEARCH_INDEX}/_update/{doc_id}",
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception as e:
        print(f"  [WARN] Failed to index {doc['url']}: {e}")
        return False


def create_index():
    """Create the OpenSearch index if it doesn't exist."""
    try:
        req = urllib.request.Request(
            f"{OPENSEARCH_URL}/{OPENSEARCH_INDEX}",
            method='HEAD'
        )
        try:
            urllib.request.urlopen(req, timeout=5)
            print(f"[OK] Index '{OPENSEARCH_INDEX}' already exists")
            return
        except urllib.error.HTTPError:
            pass
        
        mapping = {
            "mappings": {
                "properties": {
                    "title": {"type": "text", "analyzer": "english"},
                    "url": {"type": "keyword"},
                    "content": {"type": "text", "analyzer": "english"},
                    "description": {"type": "text", "analyzer": "english"},
                    "keywords": {"type": "keyword"},
                    "images": {"type": "keyword"},
                    "videos": {"type": "keyword"},
                    "host": {"type": "keyword"},
                    "crawlDate": {"type": "date", "format": "strict_date_optional_time||epoch_millis"},
                    # Autocomplete field - uses edge_ngram for prefix matching
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
        
        data = json.dumps(mapping).encode('utf-8')
        req = urllib.request.Request(
            f"{OPENSEARCH_URL}/{OPENSEARCH_INDEX}",
            data=data,
            headers={'Content-Type': 'application/json'},
            method='PUT'
        )
        urllib.request.urlopen(req, timeout=10)
        print(f"[OK] Created index '{OPENSEARCH_INDEX}' with autocomplete mapping")
    except Exception as e:
        print(f"[WARN] Could not create index: {e}")


def crawl(seed_urls, max_pages=MAX_PAGES, max_depth=MAX_DEPTH):
    """Crawl URLs up to max_pages and max_depth."""
    visited = set()
    queue = [(url, 0) for url in seed_urls]  # (url, depth)
    indexed = 0
    
    print(f"\n{'='*60}")
    print(f"Eesha Search - Independent Crawler")
    print(f"Seeds: {len(seed_urls)} | Max pages: {max_pages} | Max depth: {max_depth}")
    print(f"{'='*60}")
    
    while queue and indexed < max_pages:
        url, depth = queue.pop(0)
        
        if url in visited or depth > max_depth:
            continue
        
        visited.add(url)
        
        if not is_valid_url(url):
            continue
        
        print(f"  [{indexed+1}/{max_pages}] Fetching (depth {depth}): {url[:80]}...")
        
        html = fetch_page(url)
        if not html:
            continue
        
        page_data = parse_page(html, url)
        
        # Also populate the autocomplete suggest field
        page_data['title_suggest'] = page_data['title']
        
        if index_document(page_data):
            indexed += 1
            print(f"    → Indexed: {page_data['title'][:60]}")
        
        # Track inlinks for authority scoring
        for link in page_data['links'][:50]:
            INLINK_TRACKER[link] = INLINK_TRACKER.get(link, 0) + 1
        
        # Add discovered links to queue
        if depth < max_depth:
            for link in page_data['links'][:30]:
                if link not in visited:
                    queue.append((link, depth + 1))
        
        # Respect crawl delay
        time.sleep(CRAWL_DELAY)
    
    # Update inlink counts in OpenSearch for authority scoring
    update_inlinks()
    
    print(f"\n[DONE] Crawled and indexed {indexed} pages")
    return indexed


def update_inlinks():
    """Update inlink_count field in OpenSearch for authority scoring."""
    if not INLINK_TRACKER:
        return
    
    print(f"\n[INLINKS] Updating authority scores for {len(INLINK_TRACKER)} URLs...")
    updated = 0
    for url, count in INLINK_TRACKER.items():
        if count < 2:  # Only update pages with 2+ incoming links (reduces API calls)
            continue
        try:
            doc_id = hashlib.md5(url.encode()).hexdigest()[:16]
            data = json.dumps({'doc': {'inlink_count': count}}).encode('utf-8')
            req = urllib.request.Request(
                f"{OPENSEARCH_URL}/{OPENSEARCH_INDEX}/_update/{doc_id}",
                data=data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            urllib.request.urlopen(req, timeout=5)
            updated += 1
        except Exception:
            pass  # Document may not exist in our index
    
    print(f"[INLINKS] Updated authority scores for {updated} pages")


def get_seed_urls():
    """Get seed URLs from seed file or use defaults."""
    seed_file = os.environ.get('SEED_OUTPUT', '/root/nutch/urls/seed.txt')
    urls = []
    
    if os.path.exists(seed_file):
        with open(seed_file, 'r') as f:
            for line in f:
                url = line.strip()
                if url and not url.startswith('#') and is_valid_url(url):
                    urls.append(url)
    
    if not urls:
        # Default seed URLs — expanded for aggressive crawling
        urls = [
            # Reference
            'https://en.wikipedia.org/wiki/Main_Page',
            'https://en.wikipedia.org/wiki/Portal:Current_events',
            'https://www.britannica.com/',
            # News
            'https://news.ycombinator.com/',
            'https://www.bbc.com/news',
            'https://www.reuters.com/',
            'https://www.theguardian.com/international',
            'https://apnews.com/',
            'https://www.aljazeera.com/',
            # Tech
            'https://techcrunch.com/',
            'https://arstechnica.com/',
            'https://lobste.rs/',
            'https://theverge.com/',
            'https://www.wired.com/',
            'https://9to5linux.com/',
            # Science
            'https://www.nature.com/',
            'https://www.scientificamerican.com/',
            'https://arxiv.org/',
            'https://www.nasa.gov/',
            # Education
            'https://www.khanacademy.org/',
            'https://www.coursera.org/',
            'https://www.edx.org/',
            'https://ocw.mit.edu/',
            # Programming
            'https://github.com/trending',
            'https://stackoverflow.com/',
            'https://dev.to/',
            'https://www.freecodecamp.org/',
            # Health
            'https://www.who.int/',
            'https://www.mayoclinic.org/',
            'https://www.webmd.com/',
            # Finance
            'https://www.reuters.com/business/',
            'https://www.bloomberg.com/',
            # Culture
            'https://www.reddit.com/r/all/',
            'https://www.reddit.com/r/science/',
            'https://www.reddit.com/r/technology/',
            'https://www.reddit.com/r/worldnews/',
            # Africa-focused
            'https://www.bbc.com/news/world/africa',
            'https://www.aljazeera.com/africa/',
            'https://allafrica.com/',
            'https://techcabal.com/',
        ]
    
    return urls[:100]


def main():
    """Main entry point."""
    single_run = '--once' in sys.argv
    
    # Ensure index exists
    create_index()
    
    if single_run:
        urls = get_seed_urls()
        count = crawl(urls)
        print(f"\n[DONE] Single crawl complete. Indexed {count} pages.")
        return
    
    # Continuous mode
    interval = int(os.environ.get('CRAWL_INTERVAL', '21600'))  # 6 hours
    print(f"Eesha Search Independent Crawler starting...")
    print(f"Crawl interval: {interval}s ({interval//3600}h)")
    
    while True:
        try:
            urls = get_seed_urls()
            crawl(urls)
        except Exception as e:
            print(f"[ERROR] Crawl cycle failed: {e}")
        
        print(f"\n[NEXT] Sleeping {interval}s until next crawl...")
        time.sleep(interval)


if __name__ == '__main__':
    main()
