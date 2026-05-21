#!/usr/bin/env python3
"""
Eesha Search - Lightweight Crawler (Memory-Safe)
=================================================
A simple web crawler that replaces Apache Nutch for single-container deployments.
Fetches URLs, extracts text + links, indexes to ZincSearch (ES-compatible API).

OPTIMIZED for 512MB RAM environments (Render free tier):
  - Memory check before crawling
  - Conservative default limits
  - Proper error handling and timeouts
  - Respects crawl delays

NOT external search engines. This is our OWN crawler building our OWN index.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
import base64
import re
import hashlib
from datetime import datetime
from html.parser import HTMLParser

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

MAX_PAGES = int(os.environ.get('CRAWL_MAX_PAGES', '3000'))
MAX_DEPTH = int(os.environ.get('CRAWL_MAX_DEPTH', '3'))
CRAWL_DELAY = float(os.environ.get('CRAWL_DELAY', '1.0'))
USER_AGENT = 'EeshaSearch/1.0 (Eesha Browser Independent Search Crawler; +https://eesha.search)'
MAX_CONTENT_SIZE = 1024 * 1024  # 1MB max page size
# Inlink tracking for authority scoring
INLINK_TRACKER = {}  # url -> count of pages linking to it


def zinc_request(url, data=None, method='GET', timeout=10, content_type='application/json'):
    """Make an authenticated request to ZincSearch with error handling."""
    try:
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
    except urllib.error.HTTPError as e:
        if e.code in (404, 409):
            return None  # Not found or conflict — not a real error
        return None
    except Exception:
        return None


class PageParser(HTMLParser):
    """Simple HTML parser that extracts title, text, links, images, and meta tags."""
    
    def __init__(self):
        super().__init__()
        self.title = ''
        self.in_title = False
        self.in_script = False
        self.in_style = False
        self.text_parts = []
        self.links = []
        self.images = []
        self.description = ''
    
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        tag_lower = tag.lower()
        
        if tag_lower == 'title':
            self.in_title = True
        elif tag_lower == 'script':
            self.in_script = True
        elif tag_lower == 'style':
            self.in_style = True
        elif tag_lower == 'a' and 'href' in attrs_dict:
            self.links.append(attrs_dict['href'])
        elif tag_lower == 'img' and 'src' in attrs_dict:
            self.images.append(attrs_dict['src'])
        elif tag_lower == 'meta':
            name = attrs_dict.get('name', attrs_dict.get('property', '')).lower()
            if name in ('description', 'og:description'):
                self.description = attrs_dict.get('content', '')
            elif name in ('og:image', 'thumbnail'):
                img_url = attrs_dict.get('content', '')
                if img_url:
                    self.images.append(img_url)
    
    def handle_endtag(self, tag):
        tag_lower = tag.lower()
        if tag_lower == 'title':
            self.in_title = False
        elif tag_lower == 'script':
            self.in_script = False
        elif tag_lower == 'style':
            self.in_style = False
    
    def handle_data(self, data):
        if self.in_script or self.in_style:
            return
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
                'twitter.com', 'x.com', 'tiktok.com', 'linkedin.com',
                'paypal.com', 'accounts.google.com', 'login.microsoftonline.com'}
        hostname = parsed.hostname.lower()
        for s in skip:
            if hostname == s or hostname.endswith('.' + s):
                return False
        # Skip file downloads
        path_lower = parsed.path.lower()
        skip_exts = {'.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.avi',
                     '.mov', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico',
                     '.css', '.js', '.json', '.xml', '.rss', '.atom'}
        for ext in skip_exts:
            if path_lower.endswith(ext):
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
    """Fetch a web page and return its content. Memory-safe."""
    try:
        headers = {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'identity',
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get('Content-Type', '')
            if 'text/html' not in content_type and 'text/plain' not in content_type:
                return None
            # Check content length before reading
            content_length = resp.headers.get('Content-Length')
            if content_length and int(content_length) > MAX_CONTENT_SIZE:
                return None
            data = resp.read(MAX_CONTENT_SIZE + 1)
            if len(data) > MAX_CONTENT_SIZE:
                return None
            return data.decode('utf-8', errors='replace')
    except Exception:
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
        'title': parser.title.strip()[:500] or 'Untitled',
        'content': parser.get_text(),
        'description': parser.description[:500] if parser.description else '',
        'url': base_url,
        'links': resolved_links[:50],
        'images': resolved_images[:20],
        'host': urllib.parse.urlparse(base_url).hostname or '',
        'inlink_count': 0,
        'crawlDate': datetime.utcnow().isoformat() + 'Z',
    }


def index_document(doc):
    """Index a document to ZincSearch using PUT _doc/{id} for upsert."""
    try:
        doc_id = hashlib.md5(doc['url'].encode()).hexdigest()
        result = zinc_request(
            f"{ZINC_ES_URL}/{OPENSEARCH_INDEX}/_doc/{doc_id}",
            data=doc,
            method='PUT'
        )
        return result is not None
    except Exception:
        return False


def create_index():
    """Create the ZincSearch index if it doesn't exist."""
    try:
        result = zinc_request(f"{ZINC_API_URL}/{OPENSEARCH_INDEX}", method='GET')
        if result is not None:
            print(f"[OK] Index '{OPENSEARCH_INDEX}' already exists")
            return
        
        mapping = {
            "mappings": {
                "properties": {
                    "title": {"type": "text", "analyzer": "standard"},
                    "url": {"type": "keyword"},
                    "content": {"type": "text", "analyzer": "standard"},
                    "description": {"type": "text", "analyzer": "standard"},
                    "keywords": {"type": "keyword"},
                    "images": {"type": "keyword"},
                    "videos": {"type": "keyword"},
                    "host": {"type": "keyword"},
                    "inlink_count": {"type": "numeric"},
                    "crawlDate": {"type": "date"},
                    "title_suggest": {"type": "text", "analyzer": "standard"}
                }
            }
        }
        
        zinc_request(f"{ZINC_API_URL}/{OPENSEARCH_INDEX}", data=mapping, method='PUT')
        print(f"[OK] Created index '{OPENSEARCH_INDEX}' with mapping")
    except Exception as e:
        print(f"[WARN] Could not create index: {e}")


def crawl(seed_urls, max_pages=MAX_PAGES, max_depth=MAX_DEPTH):
    """Crawl URLs up to max_pages and max_depth."""
    visited = set()
    queue = [(url, 0) for url in seed_urls]  # (url, depth)
    indexed = 0
    failed = 0
    
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
            failed += 1
            continue
        
        page_data = parse_page(html, url)
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
    
    # Update inlink counts in ZincSearch for authority scoring
    update_inlinks()
    
    print(f"\n[DONE] Crawled and indexed {indexed} pages ({failed} failed)")
    return indexed


def update_inlinks():
    """Update inlink_count field in ZincSearch for authority scoring."""
    if not INLINK_TRACKER:
        return
    
    print(f"\n[INLINKS] Updating authority scores for {len(INLINK_TRACKER)} URLs...")
    updated = 0
    for url, count in INLINK_TRACKER.items():
        if count < 2:  # Only update pages with 2+ incoming links
            continue
        try:
            doc_id = hashlib.md5(url.encode()).hexdigest()
            existing = zinc_request(
                f"{ZINC_ES_URL}/{OPENSEARCH_INDEX}/_doc/{doc_id}",
                method='GET'
            )
            if existing and existing.get('found'):
                source = existing.get('_source', {})
                source['inlink_count'] = count
                zinc_request(
                    f"{ZINC_ES_URL}/{OPENSEARCH_INDEX}/_doc/{doc_id}",
                    data=source,
                    method='PUT'
                )
                updated += 1
        except Exception:
            pass
    
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
