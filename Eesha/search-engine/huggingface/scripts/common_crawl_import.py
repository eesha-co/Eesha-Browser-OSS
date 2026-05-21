#!/usr/bin/env python3
"""
Eesha Search - Common Crawl Data Import Script
================================================
Imports high-quality web pages into our ZincSearch index using the Tranco
top-1M domains list as a seed source.

Strategy:
1. Download Tranco top-1M domains list (~6MB zip)
2. Select top N domains (configurable, default 5000)
3. For each domain, crawl the homepage + linked pages (depth 1)
4. Bulk index to ZincSearch in batches of 500 (ES-compatible API)
5. Track inlink counts as a "PageRank-lite" signal
6. Resumable via state file, respectful crawl delays

Powered by ZincSearch — single Go binary (~20MB, ~256MB RAM).
Replaced OpenSearch (Java, 512MB+ RAM) for lightweight free-tier hosting.

Uses ONLY Python stdlib + urllib (no pip install needed).
"""

import argparse
import gzip
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import base64
import zipfile
from collections import defaultdict
from datetime import datetime
from html.parser import HTMLParser

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OPENSEARCH_INDEX = os.environ.get('OPENSEARCH_INDEX', 'nutch')
USER_AGENT = 'EeshaSearch/1.0 (Eesha Browser Search; +https://eesha.search)'
TRANCO_URL = 'https://tranco-list.eu/top-1m.csv.zip'
STATE_FILE = os.environ.get('COMMON_CRAWL_STATE', 'common_crawl_state.json')
BULK_BATCH_SIZE = 500
CRAWL_DELAY = 1.0  # seconds between requests to same domain
REQUEST_TIMEOUT = 15  # seconds
MAX_CONTENT_LENGTH = 2 * 1024 * 1024  # 2MB max page size
MAX_LINKS_PER_PAGE = 100
MAX_TEXT_LENGTH = 10000

# ZincSearch connection
ZINC_SEARCH_URL = os.environ.get('OPENSEARCH_URL', 'http://localhost:4080')
ZINC_ES_URL = ZINC_SEARCH_URL.rstrip('/') + '/es'
ZINC_API_URL = ZINC_SEARCH_URL.rstrip('/') + '/api/index'

# ZincSearch Basic Auth
ZINC_USER = os.environ.get('ZINC_FIRST_ADMIN_USER', 'admin')
ZINC_PASSWORD = os.environ.get('ZINC_FIRST_ADMIN_PASSWORD', 'Complexpass#123')
ZINC_AUTH_HEADER = 'Basic ' + base64.b64encode(f'{ZINC_USER}:{ZINC_PASSWORD}'.encode()).decode()
EESHA_API_KEY = os.environ.get('EESHA_API_KEY', '')

# High-value bonus seed domains
BONUS_SEED_DOMAINS = [
    'bbc.com', 'reuters.com', 'apnews.com', 'aljazeera.com',
    'nytimes.com', 'theguardian.com',
    'wikipedia.org', 'britannica.com', 'dictionary.com', 'wiktionary.org',
    'github.com', 'stackoverflow.com', 'arstechnica.com', 'techcrunch.com',
    'nature.com', 'scientificamerican.com', 'nasa.gov', 'arxiv.org',
    'khanacademy.org', 'mit.edu', 'coursera.org', 'edx.org',
]

# Domains to skip
SKIP_DOMAINS = {
    'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
    'tiktok.com', 'linkedin.com', 'pinterest.com', 'reddit.com',
    'snapchat.com', 'whatsapp.com', 'telegram.org', 'discord.com',
    'paypal.com', 'bankofamerica.com', 'chase.com', 'wellsfargo.com',
    'netflix.com', 'hulu.com', 'primevideo.com', 'disneyplus.com',
    'spotify.com', 'apple.com', 'google.com', 'youtube.com',
    'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.co.jp',
    'ebay.com', 'etsy.com', 'aliexpress.com',
    'login.microsoftonline.com', 'accounts.google.com',
}

# File extensions to skip
SKIP_EXTENSIONS = {
    '.pdf', '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.webp',
    '.css', '.js', '.json', '.xml', '.rss', '.atom',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.exe', '.dmg', '.deb', '.rpm', '.apk',
}

# ---------------------------------------------------------------------------
# HTML Parser
# ---------------------------------------------------------------------------

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
        self.in_script = False
        self.in_style = False

    def handle_starttag(self, tag, attrs):
        tag_lower = tag.lower()
        attrs_dict = dict(attrs)

        if tag_lower == 'title':
            self.in_title = True
        elif tag_lower == 'script':
            self.in_script = True
        elif tag_lower == 'style':
            self.in_style = True
        elif tag_lower == 'a' and 'href' in attrs_dict:
            href = attrs_dict['href']
            if href and not href.startswith(('javascript:', 'mailto:', 'tel:', '#')):
                self.links.append(href)
        elif tag_lower == 'img' and 'src' in attrs_dict:
            src = attrs_dict['src']
            if src and not src.startswith('data:'):
                self.images.append(src)
        elif tag_lower == 'meta':
            name = attrs_dict.get('name', attrs_dict.get('property', '')).lower()
            if name in ('description', 'og:description'):
                content = attrs_dict.get('content', '')
                if content and not self.description:
                    self.description = content
            elif name in ('og:image', 'twitter:image'):
                content = attrs_dict.get('content', '')
                if content:
                    self.images.append(content)

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

    def get_text(self, max_length=MAX_TEXT_LENGTH):
        text = ' '.join(self.text_parts)
        text = re.sub(r'\s+', ' ', text).strip()
        return text[:max_length]


# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------

def is_valid_url(url):
    """Check if URL is crawlable."""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        if not parsed.hostname:
            return False
        hostname_lower = parsed.hostname.lower()
        for skip in SKIP_DOMAINS:
            if hostname_lower == skip or hostname_lower.endswith('.' + skip):
                return False
        path_lower = parsed.path.lower()
        for ext in SKIP_EXTENSIONS:
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


def domain_from_url(url):
    """Extract the registered domain."""
    try:
        hostname = urllib.parse.urlparse(url).hostname or ''
        parts = hostname.split('.')
        if len(parts) >= 2:
            return '.'.join(parts[-2:])
        return hostname
    except Exception:
        return ''


def fetch_page(url, timeout=REQUEST_TIMEOUT):
    """Fetch a web page and return its HTML content. Returns None on failure."""
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
            if 'text/html' not in content_type and 'application/xhtml' not in content_type:
                return None
            content_length = resp.headers.get('Content-Length')
            if content_length and int(content_length) > MAX_CONTENT_LENGTH:
                return None
            data = resp.read(MAX_CONTENT_LENGTH + 1)
            if len(data) > MAX_CONTENT_LENGTH:
                return None
            return data.decode('utf-8', errors='replace')
    except Exception:
        return None


def parse_page(html, base_url):
    """Parse HTML and extract structured data including outgoing links."""
    parser = PageParser()
    try:
        parser.feed(html)
    except Exception:
        pass

    resolved_links = []
    for link in parser.links:
        resolved = resolve_url(base_url, link)
        if resolved and is_valid_url(resolved):
            resolved_links.append(resolved)

    # Resolve image URLs
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
        'links': resolved_links[:MAX_LINKS_PER_PAGE],
        'images': resolved_images[:20],
        'host': urllib.parse.urlparse(base_url).hostname or '',
    }


# ---------------------------------------------------------------------------
# Tranco List Downloader
# ---------------------------------------------------------------------------

def download_tranco_list(target_path='top-1m.csv'):
    """Download and extract the Tranco top-1M domains list."""
    if os.path.exists(target_path):
        print(f"[OK] Tranco list already exists: {target_path}")
        return target_path

    print(f"[...] Downloading Tranco top-1M list from {TRANCO_URL}...")
    try:
        req = urllib.request.Request(TRANCO_URL, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as resp:
            zip_data = resp.read()
        print(f"[OK] Downloaded {len(zip_data):,} bytes")
    except Exception as e:
        print(f"[ERROR] Failed to download Tranco list: {e}")
        print("[INFO] Will use bonus seed domains only.")
        return None

    try:
        with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
            csv_names = [n for n in zf.namelist() if n.endswith('.csv')]
            if not csv_names:
                print(f"[ERROR] No CSV file found in zip.")
                return None
            csv_name = csv_names[0]
            with zf.open(csv_name) as csv_file:
                csv_data = csv_file.read()
            with open(target_path, 'wb') as f:
                f.write(csv_data)
        print(f"[OK] Extracted {csv_name} → {target_path} ({len(csv_data):,} bytes)")
        return target_path
    except Exception as e:
        print(f"[ERROR] Failed to extract Tranco zip: {e}")
        return None


def load_domains(csv_path, max_domains):
    """Load top N domains from the Tranco CSV."""
    domains = []
    if not csv_path or not os.path.exists(csv_path):
        print("[WARN] No Tranco CSV available, using bonus seeds only.")
        return list(BONUS_SEED_DOMAINS)

    try:
        with open(csv_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = line.split(',', 1)
                if len(parts) < 2:
                    continue
                domain = parts[1].strip().lower()
                if not domain:
                    continue
                if domain in SKIP_DOMAINS:
                    continue
                if '.' not in domain:
                    continue
                domains.append(domain)
                if len(domains) >= max_domains:
                    break
    except Exception as e:
        print(f"[ERROR] Failed to read Tranco CSV: {e}")
        return list(BONUS_SEED_DOMAINS)

    seen = set(domains)
    bonus = [d for d in BONUS_SEED_DOMAINS if d not in seen]
    domains = bonus + domains

    print(f"[OK] Loaded {len(domains)} domains (incl. {len(bonus)} bonus seeds)")
    return domains


# ---------------------------------------------------------------------------
# ZincSearch Operations
# ---------------------------------------------------------------------------

def zinc_request(url, data=None, method='GET', timeout=30, content_type='application/json'):
    """Make an authenticated request to ZincSearch. Returns response body or None on failure."""
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
        try:
            err_body = e.read().decode('utf-8', errors='replace')
            if data and len(err_body) < 500:
                print(f"  [DEBUG] ZincSearch error: {err_body}")
        except Exception:
            pass
        return None
    except Exception:
        return None


def ensure_index(zinc_url=None, index_name=OPENSEARCH_INDEX):
    """Create the ZincSearch index with proper mapping if it doesn't exist."""
    if zinc_url is None:
        zinc_url = ZINC_SEARCH_URL
    api_url = zinc_url.rstrip('/') + '/api/index'

    # Check if index exists via ZincSearch native API
    try:
        zinc_request(f"{api_url}/{index_name}", method='GET')
        print(f"[OK] Index '{index_name}' already exists")
        return True
    except (urllib.error.HTTPError, Exception):
        pass

    mapping = {
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

    # Create index using ZincSearch native API
    resp = zinc_request(f"{api_url}/{index_name}", data=mapping, method='PUT')
    if resp:
        print(f"[OK] Created index '{index_name}' with mapping")
        return True
    else:
        print(f"[WARN] Could not create index (may already exist)")
        return False


def bulk_index(docs, zinc_url=None, index_name=OPENSEARCH_INDEX):
    """Bulk index documents to ZincSearch using the ES-compatible /es/_bulk API."""
    if not docs:
        return 0

    if zinc_url is None:
        zinc_url = ZINC_SEARCH_URL
    es_url = zinc_url.rstrip('/') + '/es'

    lines = []
    for doc in docs:
        doc_id = hashlib.md5(doc['url'].encode()).hexdigest()
        action = {"index": {"_index": index_name, "_id": doc_id}}
        lines.append(json.dumps(action, ensure_ascii=False))
        lines.append(json.dumps(doc, ensure_ascii=False))

    body = '\n'.join(lines) + '\n'
    body_bytes = body.encode('utf-8')

    # ZincSearch ES-compatible bulk API
    full_url = f"{es_url}/_bulk"
    try:
        req = urllib.request.Request(
            full_url,
            data=body_bytes,
            headers={
                'Content-Type': 'application/x-ndjson',
                'Authorization': ZINC_AUTH_HEADER
            },
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))

        errors = result.get('errors', False)
        if errors:
            error_count = sum(1 for item in result.get('items', [])
                              if item.get('index', {}).get('error'))
            print(f"  [WARN] Bulk index: {error_count} errors out of {len(docs)} docs")
            return len(docs) - error_count
        return len(docs)
    except Exception as e:
        print(f"  [ERROR] Bulk index failed: {e}")
        return 0


def update_inlink_counts(inlinks, zinc_url=None, index_name=OPENSEARCH_INDEX):
    """Update inlink_count for all URLs that have incoming links.
    
    Uses individual GET+PUT instead of bulk update because ZincSearch v0.4.10
    doesn't reliably support the 'update' action in bulk API.
    Only updates docs that already exist in the index.
    """
    if not inlinks:
        print("[INFO] No inlinks to update")
        return

    if zinc_url is None:
        zinc_url = ZINC_SEARCH_URL
    es_url = zinc_url.rstrip('/') + '/es'

    print(f"\n[...] Updating inlink counts for {len(inlinks):,} URLs...")

    updated = 0
    errors = 0
    for url, count in inlinks.items():
        doc_id = hashlib.md5(url.encode()).hexdigest()
        try:
            # GET existing doc, then PUT back with updated inlink_count
            existing = zinc_request(
                f"{es_url}/{index_name}/_doc/{doc_id}",
                method='GET',
                timeout=5
            )
            if existing and existing.get('found'):
                source = existing.get('_source', {})
                source['inlink_count'] = count
                zinc_request(
                    f"{es_url}/{index_name}/_doc/{doc_id}",
                    data=source,
                    method='PUT',
                    timeout=10
                )
                updated += 1
            # Doc doesn't exist in our index — skip
        except Exception:
            errors += 1

        if updated > 0 and updated % 500 == 0:
            print(f"  Updated {updated:,}/{len(inlinks):,} inlink counts...")

    print(f"[OK] Updated inlink counts for {updated:,} URLs ({errors:,} errors)")


def _send_bulk_update(lines, es_url, index_name=OPENSEARCH_INDEX):
    """Send a bulk update request to ZincSearch."""
    body = '\n'.join(lines) + '\n'
    body_bytes = body.encode('utf-8')

    # ZincSearch ES-compatible bulk API
    full_url = f"{es_url}/_bulk"
    try:
        req = urllib.request.Request(
            full_url,
            data=body_bytes,
            headers={
                'Content-Type': 'application/x-ndjson',
                'Authorization': ZINC_AUTH_HEADER
            },
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        if result.get('errors'):
            error_count = sum(1 for item in result.get('items', [])
                              if item.get('update', {}).get('error'))
            if error_count > 5:
                print(f"  [WARN] Bulk update: {error_count} errors")
    except Exception as e:
        print(f"  [ERROR] Bulk update failed: {e}")


# ---------------------------------------------------------------------------
# State Management
# ---------------------------------------------------------------------------

def load_state(state_path):
    """Load resume state from file."""
    if not os.path.exists(state_path):
        return {'completed_domains': [], 'indexed_urls': [], 'pages_indexed': 0,
                'domains_processed': 0}
    try:
        with open(state_path, 'r') as f:
            state = json.load(f)
        print(f"[OK] Resuming from state: {state.get('domains_processed', 0)} domains, "
              f"{state.get('pages_indexed', 0)} pages indexed")
        return state
    except Exception as e:
        print(f"[WARN] Could not load state file: {e}. Starting fresh.")
        return {'completed_domains': [], 'indexed_urls': [], 'pages_indexed': 0,
                'domains_processed': 0}


def save_state(state, state_path):
    """Save resume state to file."""
    try:
        with open(state_path, 'w') as f:
            json.dump(state, f)
    except Exception as e:
        print(f"[WARN] Could not save state: {e}")


# ---------------------------------------------------------------------------
# Progress Reporting
# ---------------------------------------------------------------------------

class ProgressReporter:
    """Tracks and displays crawl progress with rate and ETA."""

    def __init__(self, total_domains, page_limit):
        self.total_domains = total_domains
        self.page_limit = page_limit
        self.domains_done = 0
        self.pages_indexed = 0
        self.pages_failed = 0
        self.start_time = time.time()
        self.last_report_time = self.start_time

    def report(self, domain=None, force=False):
        now = time.time()
        if not force and (now - self.last_report_time) < 5:
            return
        self.last_report_time = now

        elapsed = now - self.start_time
        if elapsed < 1:
            elapsed = 1
        rate = self.pages_indexed / elapsed

        if self.page_limit:
            remaining_pages = max(0, self.page_limit - self.pages_indexed)
            eta_secs = remaining_pages / rate if rate > 0 else 0
        else:
            if self.domains_done > 0:
                avg_pages = self.pages_indexed / self.domains_done
                remaining_domains = self.total_domains - self.domains_done
                remaining_pages = remaining_domains * avg_pages
                eta_secs = remaining_pages / rate if rate > 0 else 0
            else:
                eta_secs = 0

        eta_str = self._format_duration(eta_secs)
        elapsed_str = self._format_duration(elapsed)
        domain_info = f" | Domain: {domain}" if domain else ""
        print(f"  [PROGRESS] Domains: {self.domains_done}/{self.total_domains} | "
              f"Pages: {self.pages_indexed}" +
              (f"/{self.page_limit}" if self.page_limit else "") +
              f" | Rate: {rate:.1f} pg/s | Elapsed: {elapsed_str} | ETA: {eta_str}"
              f"{domain_info}")

    def final_report(self):
        elapsed = time.time() - self.start_time
        if elapsed < 1:
            elapsed = 1
        rate = self.pages_indexed / elapsed
        elapsed_str = self._format_duration(elapsed)

        print(f"\n{'='*60}")
        print(f"  IMPORT COMPLETE")
        print(f"  Domains processed: {self.domains_done:,}")
        print(f"  Pages indexed:     {self.pages_indexed:,}")
        print(f"  Pages failed:      {self.pages_failed:,}")
        print(f"  Time elapsed:      {elapsed_str}")
        print(f"  Average rate:      {rate:.1f} pages/sec")
        print(f"{'='*60}")

    @staticmethod
    def _format_duration(seconds):
        if seconds < 60:
            return f"{seconds:.0f}s"
        elif seconds < 3600:
            return f"{seconds/60:.1f}min"
        else:
            return f"{seconds/3600:.1f}h"


# ---------------------------------------------------------------------------
# Main Crawl Logic
# ---------------------------------------------------------------------------

def crawl_domain(domain, depth=1, max_pages_per_domain=15, crawl_delay=CRAWL_DELAY):
    """Crawl a single domain: homepage + linked pages at depth 1."""
    if domain.startswith(('http://', 'https://')):
        homepage = domain
    else:
        homepage = f'https://{domain}/'

    docs = []
    all_outgoing_links = []

    html = fetch_page(homepage)
    if html is None:
        if homepage.startswith('https://'):
            homepage = homepage.replace('https://', 'http://', 1)
            html = fetch_page(homepage)
    if html is None:
        return docs, all_outgoing_links

    page_data = parse_page(html, homepage)
    page_data['crawlDate'] = datetime.utcnow().isoformat() + 'Z'
    page_data['title_suggest'] = page_data['title']
    page_data['inlink_count'] = 0

    if len(page_data['content']) > 50:
        docs.append(page_data)
        all_outgoing_links.extend(page_data['links'])

    if depth < 1:
        return docs, all_outgoing_links

    base_domain = domain_from_url(homepage)
    seen_urls = {homepage}
    pages_crawled = 1

    for link in page_data['links'][:max_pages_per_domain]:
        if pages_crawled >= max_pages_per_domain:
            break
        if link in seen_urls:
            continue
        link_domain = domain_from_url(link)
        if link_domain != base_domain:
            continue
        if not is_valid_url(link):
            continue

        seen_urls.add(link)
        time.sleep(crawl_delay)

        link_html = fetch_page(link)
        if link_html is None:
            continue

        link_data = parse_page(link_html, link)
        link_data['crawlDate'] = datetime.utcnow().isoformat() + 'Z'
        link_data['title_suggest'] = link_data['title']
        link_data['inlink_count'] = 0

        if len(link_data['content']) > 50:
            docs.append(link_data)
            all_outgoing_links.extend(link_data['links'])
            pages_crawled += 1

    return docs, all_outgoing_links


def run_import(domains, zinc_url, page_limit, state_path,
               index_name=OPENSEARCH_INDEX, crawl_delay=CRAWL_DELAY):
    """Main import loop: crawl each domain, collect docs + inlinks,
    bulk index to ZincSearch, update inlink counts at the end."""
    state = load_state(state_path)
    completed_domains = set(state.get('completed_domains', []))
    indexed_urls = set(state.get('indexed_urls', []))
    total_indexed = state.get('pages_indexed', 0)

    remaining_domains = [d for d in domains if d not in completed_domains]

    print(f"\n{'='*60}")
    print(f"  Eesha Search — Common Crawl Import")
    print(f"  Domains: {len(remaining_domains)} remaining "
          f"({len(completed_domains)} already done)")
    print(f"  Pages indexed so far: {total_indexed:,}")
    if page_limit:
        print(f"  Page limit: {page_limit:,}")
    print(f"  ZincSearch: {zinc_url}")
    print(f"  Index: {index_name}")
    print(f"{'='*60}\n")

    progress = ProgressReporter(len(remaining_domains), page_limit)
    progress.pages_indexed = total_indexed

    inlinks = defaultdict(int)
    bulk_buffer = []
    last_save_time = time.time()

    for domain in remaining_domains:
        if page_limit and total_indexed >= page_limit:
            print(f"\n[INFO] Page limit reached ({page_limit:,}). Stopping.")
            break

        progress.report(domain=domain)

        try:
            docs, outgoing_links = crawl_domain(domain, depth=1, max_pages_per_domain=15,
                                                 crawl_delay=crawl_delay)
        except Exception as e:
            print(f"  [ERROR] Crawl failed for {domain}: {e}")
            docs, outgoing_links = [], []

        for link in outgoing_links:
            if is_valid_url(link):
                inlinks[link] += 1

        for doc in docs:
            if doc['url'] in indexed_urls:
                continue
            if page_limit and total_indexed >= page_limit:
                break

            indexed_urls.add(doc['url'])
            bulk_buffer.append(doc)
            total_indexed += 1
            progress.pages_indexed = total_indexed

        if len(bulk_buffer) >= BULK_BATCH_SIZE:
            count = bulk_index(bulk_buffer, zinc_url, index_name)
            print(f"  [BULK] Indexed {count}/{len(bulk_buffer)} pages")
            bulk_buffer = []

        completed_domains.add(domain)
        progress.domains_done += 1
        progress.pages_indexed = total_indexed

        now = time.time()
        if (now - last_save_time) >= 30:
            state = {
                'completed_domains': list(completed_domains),
                'indexed_urls': list(indexed_urls)[-50000:],
                'pages_indexed': total_indexed,
                'domains_processed': len(completed_domains),
                'last_updated': datetime.utcnow().isoformat() + 'Z',
            }
            save_state(state, state_path)
            last_save_time = now

        time.sleep(crawl_delay)

    if bulk_buffer:
        count = bulk_index(bulk_buffer, zinc_url, index_name)
        print(f"  [BULK] Final batch: indexed {count}/{len(bulk_buffer)} pages")

    print(f"\n[INFO] Total inlinks tracked: {len(inlinks):,} unique URLs")
    update_inlink_counts(inlinks, zinc_url, index_name)

    state = {
        'completed_domains': list(completed_domains),
        'indexed_urls': list(indexed_urls)[-50000:],
        'pages_indexed': total_indexed,
        'domains_processed': len(completed_domains),
        'last_updated': datetime.utcnow().isoformat() + 'Z',
        'status': 'complete',
    }
    save_state(state, state_path)

    progress.final_report()
    return total_indexed


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Eesha Search — Common Crawl Data Import (ZincSearch)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python common_crawl_import.py
  python common_crawl_import.py --domains 1000 --limit 10000
  python common_crawl_import.py --url http://localhost:4080
  python common_crawl_import.py --resume
"""
    )
    parser.add_argument('--domains', type=int, default=5000,
                        help='Number of top domains to import (default: 5000)')
    parser.add_argument('--limit', type=int, default=None,
                        help='Maximum number of pages to import (default: unlimited)')
    parser.add_argument('--url', type=str, default=os.environ.get('OPENSEARCH_URL', 'http://localhost:4080'),
                        help='ZincSearch URL (default: from OPENSEARCH_URL env var or http://localhost:4080)')
    parser.add_argument('--index', type=str, default=OPENSEARCH_INDEX,
                        help=f'Index name (default: {OPENSEARCH_INDEX})')
    parser.add_argument('--state-file', type=str, default=STATE_FILE,
                        help=f'State file path (default: {STATE_FILE})')
    parser.add_argument('--resume', action='store_true',
                        help='Resume from previous state file')
    parser.add_argument('--download-only', action='store_true',
                        help='Only download Tranco list, do not crawl')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be done without indexing')
    parser.add_argument('--delay', type=float, default=CRAWL_DELAY,
                        help=f'Delay between requests in seconds (default: {CRAWL_DELAY})')

    args = parser.parse_args()

    index_name = args.index
    crawl_delay = args.delay
    state_file = args.state_file

    zinc_url = args.url.rstrip('/')
    csv_path = 'top-1m.csv'

    tranco_path = download_tranco_list(csv_path)

    if args.download_only:
        if tranco_path:
            print(f"[DONE] Tranco list downloaded to: {tranco_path}")
        else:
            print("[ERROR] Download failed")
            sys.exit(1)
        return

    domains = load_domains(tranco_path, args.domains)

    if not domains:
        print("[ERROR] No domains to crawl.")
        sys.exit(1)

    if args.dry_run:
        print(f"\n[DRY RUN] Would crawl {len(domains)} domains:")
        for i, d in enumerate(domains[:20]):
            print(f"  {i+1}. {d}")
        if len(domains) > 20:
            print(f"  ... and {len(domains) - 20} more")
        return

    ensure_index(zinc_url, index_name)

    if not args.resume:
        if os.path.exists(state_file):
            os.remove(state_file)
            print("[INFO] Removed old state file (fresh start)")

    total = run_import(domains, zinc_url, args.limit, state_file,
                       index_name=index_name, crawl_delay=crawl_delay)
    print(f"\n[DONE] Import complete. Total pages indexed: {total:,}")


if __name__ == '__main__':
    main()
