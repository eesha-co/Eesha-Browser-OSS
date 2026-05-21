#!/usr/bin/env python3
"""
Eesha Search — Custom Search UI & API
======================================
A Flask application that serves as the search frontend and API,
directly querying our own ZincSearch index. 100% Independent.

NO external search engines. NO aggregation. Only our own crawled data.

Powered by ZincSearch — single Go binary (~20MB, ~256MB RAM, ES-compatible API).
Replaced OpenSearch (Java, 512MB+ RAM) for lightweight free-tier hosting.

Endpoints:
  /               → Search homepage
  /search         → Search results page (HTML) + API (JSON)
  /suggest        → Autocomplete API (JSON)
  /spellcheck     → Spell check API (JSON)
  /submit         → Browser-as-Crawler anonymous page submission (POST)
  /health         → Health check (JSON)
  /opensearch.xml → Browser search provider description
"""

import json
import os
import base64
import hashlib
import math
import re
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify, Response

# ─── Flask App ──────────────────────────────────────────────────────────────
app = Flask(__name__)
app.name = "eesha-search-app"

# ─── Configuration ──────────────────────────────────────────────────────────
ZINC_SEARCH_URL = os.environ.get('ZINC_SEARCH_URL', 'http://localhost:4080')
# Legacy compat: OPENSEARCH_URL may point to ZincSearch
if os.environ.get('OPENSEARCH_URL'):
    ZINC_SEARCH_URL = os.environ['OPENSEARCH_URL'].rstrip('/')

MAIN_INDEX = os.environ.get('OPENSEARCH_INDEX', 'nutch')
MEDIA_INDEX = os.environ.get('MULTIMEDIA_INDEX', 'eesha-media')
RESULTS_PER_PAGE = 20

# ZincSearch Basic Auth
ZINC_USER = os.environ.get('ZINC_FIRST_ADMIN_USER', 'admin')
ZINC_PASSWORD = os.environ.get('ZINC_FIRST_ADMIN_PASSWORD', 'Complexpass#123')
ZINC_AUTH_HEADER = 'Basic ' + base64.b64encode(f'{ZINC_USER}:{ZINC_PASSWORD}'.encode()).decode()

# Rate limiting for Browser-as-Crawler submissions
SUBMIT_RATE_LIMIT = {}  # {ip: [timestamps]}
SUBMIT_MAX_PER_MINUTE = 30

# API key for Crawler Instance authentication
EESHA_API_KEY = os.environ.get('EESHA_API_KEY', '')


# ─── Helper Functions ───────────────────────────────────────────────────────

def make_zinc_request(url, data=None, method='GET', timeout=15):
    """Make an authenticated request to ZincSearch ES-compatible API."""
    headers = {
        'Content-Type': 'application/json',
        'Authorization': ZINC_AUTH_HEADER
    }
    req_data = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def query_zincsearch(index, query_body, timeout=15):
    """Execute a search query against ZincSearch ES-compatible API."""
    try:
        return make_zinc_request(
            f"{ZINC_SEARCH_URL}/es/{index}/_search",
            data=query_body,
            method='POST',
            timeout=timeout
        )
    except urllib.error.HTTPError as e:
        # Index might not exist yet during bootstrap
        if e.code in (404, 500):
            print(f"[INFO] ZincSearch query returned {e.code} for index '{index}' — index may not exist yet")
            return None
        print(f"[ERROR] ZincSearch query HTTP {e.code}: {e}")
        return None
    except Exception as e:
        print(f"[ERROR] ZincSearch query failed: {e}")
        return None


def highlight_text(text, query, fragment_size=200):
    """Python-side highlighting — find best fragment and wrap matches in <em>."""
    if not text or not query:
        return text[:fragment_size] if text else ''
    
    # Find the best fragment containing query terms
    query_terms = set(re.findall(r'\w+', query.lower()))
    if not query_terms:
        return text[:fragment_size]
    
    words = text.split()
    best_start = 0
    best_score = 0
    
    # Sliding window to find the best fragment
    window_size = 40  # ~40 words ≈ 200 chars
    for i in range(max(1, len(words) - window_size + 1)):
        window = ' '.join(words[i:i + window_size]).lower()
        score = sum(1 for term in query_terms if term in window)
        if score > best_score:
            best_score = score
            best_start = i
    
    fragment = ' '.join(words[best_start:best_start + window_size])
    if len(fragment) > fragment_size:
        fragment = fragment[:fragment_size]
    
    # Wrap matches in <em> tags
    for term in query_terms:
        if len(term) < 2:
            continue
        pattern = re.compile(r'\b(' + re.escape(term) + r'\w*)\b', re.IGNORECASE)
        fragment = pattern.sub(r'<em>\1</em>', fragment)
    
    return fragment


def rerank_results(hits, query):
    """
    Python-side re-ranking: combine BM25 score with authority + freshness.
    ZincSearch doesn't support function_score, so we do it here.
    """
    now = datetime.now(timezone.utc)
    ranked = []
    
    for hit in hits:
        source = hit.get('_source', {})
        bm25_score = hit.get('_score', 1.0)
        
        # Authority boost: log1p(inlink_count)
        inlink_count = source.get('inlink_count', 0) or 0
        authority_score = math.log1p(max(inlink_count, 0) + 1)
        
        # Freshness boost: exponential decay
        freshness_score = 1.0
        crawl_date = source.get('crawlDate', '')
        if crawl_date:
            try:
                if isinstance(crawl_date, str):
                    # Parse ISO date
                    dt_str = crawl_date.replace('Z', '+00:00')
                    crawl_dt = datetime.fromisoformat(dt_str)
                    age_days = (now - crawl_dt).total_seconds() / 86400
                    # Exponential decay: half-life of 30 days, 7-day offset
                    freshness_score = math.exp(-0.023 * max(0, age_days - 7))
            except Exception:
                pass
        
        # Domain boost
        host = source.get('host', '')
        domain_score = 1.0
        if host == 'en.wikipedia.org':
            domain_score = 1.5
        elif host.endswith('.edu'):
            domain_score = 1.3
        elif host.endswith('.gov'):
            domain_score = 1.3
        
        # Combined score: 40% BM25, 35% authority, 25% freshness
        combined = (bm25_score * 0.4) * (authority_score ** 0.35) * (freshness_score ** 0.25) * domain_score
        
        ranked.append((combined, hit))
    
    # Sort by combined score descending
    ranked.sort(key=lambda x: x[0], reverse=True)
    return [hit for _, hit in ranked]


# ─── Search Functions ───────────────────────────────────────────────────────

def search_general(query, page=1):
    """Search the main index for web results using BM25 + Python re-ranking."""
    from_idx = (page - 1) * RESULTS_PER_PAGE
    # Fetch more results than needed for re-ranking, then slice
    fetch_size = min(RESULTS_PER_PAGE * 3, 60)
    
    # Use simple bool/match queries (ZincSearch compatible)
    # Python-side re-ranking handles authority + freshness + domain boost
    query_body = {
        "from": from_idx,
        "size": fetch_size,
        "query": {
            "bool": {
                "should": [
                    {"match": {"title": {"query": query, "boost": 4.0}}},
                    {"match": {"description": {"query": query, "boost": 2.5}}},
                    {"match": {"content": {"query": query, "boost": 1.0}}}
                ],
                "minimum_should_match": 1
            }
        },
        "_source": ["title", "url", "description", "content", "host", "crawlDate", "inlink_count", "images"]
    }
    result = query_zincsearch(MAIN_INDEX, query_body)
    if not result:
        return [], 0

    total = result.get('hits', {}).get('total', {})
    if isinstance(total, dict):
        total = total.get('value', 0)
    raw_hits = result.get('hits', {}).get('hits', [])
    
    # Re-rank with authority + freshness + domain boost
    ranked_hits = rerank_results(raw_hits, query)
    
    # Slice to page size
    page_hits = ranked_hits[:RESULTS_PER_PAGE]

    results = []
    for hit in page_hits:
        source = hit.get('_source', {})
        # Python-side highlighting
        snippet = ''
        desc = source.get('description', '')
        content = source.get('content', '')
        if desc and query:
            snippet = highlight_text(desc, query)
        elif content and query:
            snippet = highlight_text(content, query)
        elif desc:
            snippet = desc[:200]
        
        results.append({
            'title': source.get('title', 'Untitled'),
            'url': source.get('url', ''),
            'snippet': snippet,
            'host': source.get('host', ''),
            'date': source.get('crawlDate', ''),
            'images': source.get('images', [])
        })

    return results, total


def search_images(query, page=1):
    """Search the main index for documents with images matching the query.
    Flattens images from matching docs into individual image results."""
    from_idx = (page - 1) * RESULTS_PER_PAGE
    # Fetch more docs than needed since each doc may have multiple images
    fetch_size = RESULTS_PER_PAGE * 2
    query_body = {
        "from": 0,
        "size": fetch_size,
        "query": {
            "bool": {
                "should": [
                    {"match": {"title": {"query": query, "boost": 4.0}}},
                    {"match": {"description": {"query": query, "boost": 2.5}}},
                    {"match": {"content": {"query": query, "boost": 1.0}}}
                ],
                "minimum_should_match": 1
            }
        },
        "_source": ["title", "url", "host", "images"]
    }
    result = query_zincsearch(MAIN_INDEX, query_body)
    if not result:
        return [], 0

    total_docs = result.get('hits', {}).get('total', {})
    if isinstance(total_docs, dict):
        total_docs = total_docs.get('value', 0)
    hits = result.get('hits', {}).get('hits', [])

    # Flatten images from all matching docs
    all_images = []
    for hit in hits:
        source = hit.get('_source', {})
        images = source.get('images', [])
        if not images:
            continue
        page_title = source.get('title', 'Image')
        page_url = source.get('url', '')
        page_host = source.get('host', '')
        for img_url in images:
            if isinstance(img_url, str) and img_url:
                all_images.append({
                    'thumbnail': img_url,
                    'source_url': page_url,
                    'title': page_title,
                    'host': page_host
                })

    total = len(all_images)
    # Paginate the flattened results
    page_images = all_images[from_idx:from_idx + RESULTS_PER_PAGE]

    return page_images, total


def search_videos(query, page=1):
    """Search the main index for documents that may contain video references.
    Looks for pages with video-related URLs or content."""
    from_idx = (page - 1) * RESULTS_PER_PAGE
    fetch_size = RESULTS_PER_PAGE * 2
    query_body = {
        "from": 0,
        "size": fetch_size,
        "query": {
            "bool": {
                "should": [
                    {"match": {"title": {"query": query, "boost": 4.0}}},
                    {"match": {"description": {"query": query, "boost": 2.5}}},
                    {"match": {"content": {"query": query, "boost": 1.0}}}
                ],
                "minimum_should_match": 1
            }
        },
        "_source": ["title", "url", "host", "images", "description"]
    }
    result = query_zincsearch(MAIN_INDEX, query_body)
    if not result:
        return [], 0

    total_docs = result.get('hits', {}).get('total', {})
    if isinstance(total_docs, dict):
        total_docs = total_docs.get('value', 0)
    hits = result.get('hits', {}).get('hits', [])

    # Collect docs that have images (potential video thumbnails)
    all_videos = []
    for hit in hits:
        source = hit.get('_source', {})
        images = source.get('images', [])
        page_title = source.get('title', 'Video')
        page_url = source.get('url', '')
        page_host = source.get('host', '')
        thumbnail = ''
        if images and isinstance(images, list) and len(images) > 0:
            thumbnail = images[0] if isinstance(images[0], str) else ''
        all_videos.append({
            'url': page_url,
            'source_url': page_url,
            'title': page_title,
            'host': page_host,
            'thumbnail': thumbnail
        })

    total = len(all_videos)
    page_videos = all_videos[from_idx:from_idx + RESULTS_PER_PAGE]

    return page_videos, total


def get_suggestions(prefix):
    """Get autocomplete suggestions using ZincSearch prefix/wildcard queries."""
    if not prefix or len(prefix) < 2:
        return []
    
    # Strategy 1: match_phrase_prefix (most relevant)
    query_body = {
        "size": 8,
        "query": {
            "bool": {
                "should": [
                    {"match_phrase_prefix": {"title": {"query": prefix, "boost": 2.0}}},
                    {"match": {"title_suggest": {"query": prefix, "boost": 1.0}}},
                    {"wildcard": {"title": {"value": f"{prefix.lower()}*"}}}
                ],
                "minimum_should_match": 1
            }
        },
        "_source": ["title", "url"]
    }
    result = query_zincsearch(MAIN_INDEX, query_body)
    if not result:
        return []

    hits = result.get('hits', {}).get('hits', [])
    seen = set()
    suggestions = []
    for hit in hits:
        title = hit.get('_source', {}).get('title', '')
        if title and title.lower() not in seen:
            seen.add(title.lower())
            suggestions.append(title)
            if len(suggestions) >= 8:
                break
    return suggestions


# ─── Phase 3: Spell Correction ─────────────────────────────────────────────

def _levenshtein(s1, s2):
    """Simple Levenshtein distance calculation."""
    if len(s1) < len(s2):
        return _levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = prev_row[j + 1] + 1
            deletions = curr_row[j] + 1
            substitutions = prev_row[j] + (c1 != c2)
            curr_row.append(min(insertions, deletions, substitutions))
        prev_row = curr_row
    return prev_row[-1]


def spell_check(query):
    """
    Check spelling using fuzzy matching against our own ZincSearch index.
    Returns suggested correction string or None if no correction needed.
    100% independent — uses our OWN index as the dictionary.
    """
    if not query or len(query.strip()) < 3:
        return None
    
    words = query.strip().split()
    corrections = []
    has_correction = False
    
    for word in words:
        if len(word) < 3:
            corrections.append(word)
            continue
        
        # Check if the word exists in our index (search titles for this word)
        try:
            check_body = {
                "size": 1,
                "query": {"match": {"title": word}}
            }
            result = query_zincsearch(MAIN_INDEX, check_body)
            if result:
                total = result.get('hits', {}).get('total', {})
                if isinstance(total, dict):
                    total = total.get('value', 0)
                if total > 0:
                    # Word exists in index — probably correct
                    corrections.append(word)
                    continue
        except Exception:
            pass
        
        # Word not found — try fuzzy search
        try:
            fuzzy_body = {
                "size": 5,
                "query": {"fuzzy": {"title": {"value": word, "fuzziness": 2}}},
                "_source": ["title"]
            }
            result = query_zincsearch(MAIN_INDEX, fuzzy_body)
            if result:
                hits = result.get('hits', {}).get('hits', [])
                if hits:
                    # Find the closest matching word from returned titles
                    best_word = None
                    best_dist = 999
                    for hit in hits:
                        title = hit.get('_source', {}).get('title', '')
                        for tw in title.split():
                            if len(tw) >= 3 and tw.lower() != word.lower():
                                dist = _levenshtein(word.lower(), tw.lower())
                                if 0 < dist <= 2 and dist < best_dist:
                                    best_dist = dist
                                    best_word = tw
                    
                    if best_word:
                        corrections.append(best_word)
                        has_correction = True
                    else:
                        corrections.append(word)
                else:
                    corrections.append(word)
            else:
                corrections.append(word)
        except Exception:
            corrections.append(word)
    
    if has_correction:
        return ' '.join(corrections)
    return None


# ─── Phase 3: Wikipedia Knowledge Box ───────────────────────────────────────

def get_knowledge_box(query):
    """
    Get a Wikipedia knowledge box for the query.
    Searches our own index for Wikipedia articles matching the query.
    Returns a dict with title, description, url, content or None.
    100% independent — uses our OWN Wikipedia import data.
    """
    if not query or len(query.strip()) < 2:
        return None

    query_body = {
        "size": 1,
        "query": {
            "bool": {
                "must": [
                    {"match": {"host": "en.wikipedia.org"}},
                    {"bool": {
                        "should": [
                            {"match_phrase": {"title": {"query": query, "boost": 10.0}}},
                            {"match": {"title": {"query": query, "boost": 5.0}}},
                            {"match": {"description": {"query": query, "boost": 2.0}}}
                        ],
                        "minimum_should_match": 1
                    }}
                ]
            }
        },
        "_source": ["title", "url", "description", "content"]
    }

    result = query_zincsearch(MAIN_INDEX, query_body)
    if not result:
        return None

    total = result.get('hits', {}).get('total', {})
    if isinstance(total, dict):
        total = total.get('value', 0)
    
    if total == 0:
        return None

    hits = result.get('hits', {}).get('hits', [])
    if not hits:
        return None

    source = hits[0].get('_source', {})

    # Get the best snippet
    description = ''
    content = source.get('content', '')
    desc = source.get('description', '')
    
    if desc and query:
        description = highlight_text(desc, query, 400)
    elif content and query:
        description = highlight_text(content, query, 400)
    elif desc:
        description = desc[:400]
    elif content:
        description = content[:400]

    # Only show knowledge box if we have meaningful content
    if not description or len(description) < 50:
        return None

    title = source.get('title', '')
    url = source.get('url', '')
    
    # Clean up Wikipedia title
    if ' - Wikipedia' in title:
        title = title.replace(' - Wikipedia', '').strip()

    return {
        'title': title,
        'url': url,
        'description': description,
        'source': 'Wikipedia'
    }


# ─── Phase 4: Browser-as-Crawler Rate Limiting ─────────────────────────────

def check_rate_limit(ip):
    """Check if an IP is within rate limits for page submissions."""
    now = time.time()
    minute_ago = now - 60

    if ip in SUBMIT_RATE_LIMIT:
        SUBMIT_RATE_LIMIT[ip] = [t for t in SUBMIT_RATE_LIMIT[ip] if t > minute_ago]
    else:
        SUBMIT_RATE_LIMIT[ip] = []

    if len(SUBMIT_RATE_LIMIT[ip]) >= SUBMIT_MAX_PER_MINUTE:
        return False

    SUBMIT_RATE_LIMIT[ip].append(now)
    return True


def index_submitted_page(url, title, description=''):
    """
    Index a page submitted by an Eesha Browser user (Browser-as-Crawler).
    Privacy-first: only stores URL + title + description, NO personal data.
    """
    try:
        doc_id = hashlib.md5(url.encode()).hexdigest()

        # Check if we already have this URL indexed
        try:
            existing = make_zinc_request(
                f"{ZINC_SEARCH_URL}/es/{MAIN_INDEX}/_doc/{doc_id}",
                method='GET',
                timeout=3
            )
            if existing and existing.get('found'):
                return True  # Already indexed
        except Exception:
            pass

        # Parse host from URL
        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname or ''

        # Index the submitted page using ZincSearch ES-compatible API
        doc = {
            'title': title[:500] if title else 'Untitled',
            'url': url,
            'description': description[:1000] if description else '',
            'content': description[:2000] if description else '',
            'host': host,
            'inlink_count': 0,
            'crawlDate': datetime.utcnow().isoformat() + 'Z',
            'title_suggest': title[:500] if title else '',
            'source': 'browser-crawler'
        }

        make_zinc_request(
            f"{ZINC_SEARCH_URL}/es/{MAIN_INDEX}/_doc/{doc_id}",
            data=doc,
            method='PUT',
            timeout=10
        )
        return True
    except Exception as e:
        print(f"[WARN] Failed to index submitted page {url}: {e}")
        return False


def check_zincsearch_health():
    """Check if ZincSearch is reachable. Returns True/False."""
    try:
        result = make_zinc_request(
            f"{ZINC_SEARCH_URL}/healthz",
            method='GET',
            timeout=5
        )
        return True
    except Exception:
        return False


def get_index_counts():
    """Get document counts from our indices using ZincSearch search with size 0.
    Returns a dict with 'pages' and 'media' keys. Always returns a valid dict
    even if ZincSearch is down or indices don't exist yet."""
    counts = {'pages': 0, 'media': 0}
    for index_name, label in [(MAIN_INDEX, 'pages'), (MEDIA_INDEX, 'media')]:
        try:
            result = query_zincsearch(index_name, {"query": {"match_all": {}}, "size": 0})
            if result is None:
                continue
            total = result.get('hits', {}).get('total', {})
            if isinstance(total, dict):
                counts[label] = total.get('value', 0)
            else:
                counts[label] = total or 0
        except Exception:
            pass  # Index doesn't exist yet or ZincSearch is down
    return counts


# ─── CORS Helper ────────────────────────────────────────────────────────────

def add_cors_headers(response):
    """Add CORS headers to API responses."""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response


# ─── Routes ─────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    """Search homepage."""
    counts = get_index_counts()
    return render_template('index.html', index_counts=counts)


@app.route('/search')
def search():
    """Search results page (HTML) or API (JSON)."""
    query = request.args.get('q', '').strip()
    category = request.args.get('category', 'general')
    page = max(1, int(request.args.get('page', 1)))

    if not query:
        return render_template('index.html', index_counts=get_index_counts())

    # Perform search based on category
    spell_correction = None
    knowledge_box = None

    if category == 'images':
        results, total = search_images(query, page)
    elif category == 'videos':
        results, total = search_videos(query, page)
    else:
        results, total = search_general(query, page)
        category = 'general'

        # Phase 3: Spell correction — only if few results
        if total < 3:
            spell_correction = spell_check(query)

        # Phase 3: Wikipedia Knowledge Box
        knowledge_box = get_knowledge_box(query)

    # JSON API response
    if request.args.get('format') == 'json':
        response_data = {
            'query': query,
            'category': category,
            'page': page,
            'total_results': total,
            'results': results,
            'independent': True,
            'engine': 'Eesha Search'
        }
        if spell_correction:
            response_data['spell_correction'] = spell_correction
        if knowledge_box:
            response_data['knowledge_box'] = knowledge_box
        resp = jsonify(response_data)
        return add_cors_headers(resp)

    # HTML response
    total_pages = max(1, (total + RESULTS_PER_PAGE - 1) // RESULTS_PER_PAGE)
    # Build page range for pagination (max 10 page links shown)
    page_start = max(1, page - 5)
    page_end = min(total_pages + 1, page_start + 10)
    page_range = list(range(page_start, page_end))

    return render_template(
        'results.html',
        query=query,
        category=category,
        results=results,
        total=total,
        page=page,
        total_pages=total_pages,
        page_range=page_range,
        spell_correction=spell_correction,
        knowledge_box=knowledge_box
    )


@app.route('/suggest')
def suggest():
    """Autocomplete API endpoint."""
    prefix = request.args.get('q', '').strip()
    suggestions = get_suggestions(prefix)
    resp = jsonify(suggestions)
    return add_cors_headers(resp)


@app.route('/spellcheck')
def spellcheck():
    """Spell check API endpoint — returns suggested corrections."""
    query = request.args.get('q', '').strip()
    correction = spell_check(query)
    resp = jsonify({
        'query': query,
        'correction': correction,
        'has_correction': correction is not None
    })
    return add_cors_headers(resp)


@app.route('/submit', methods=['GET', 'POST', 'OPTIONS'])
def submit_page():
    """
    Browser-as-Crawler: Anonymous page submission from Eesha Browser.
    Privacy-first: Only submits URL + title + description (NO personal data).
    Rate limited to 30 submissions per IP per minute.
    """
    if request.method == 'OPTIONS':
        resp = jsonify({'status': 'ok'})
        return add_cors_headers(resp)

    if request.method == 'GET':
        resp = jsonify({
            'endpoint': '/submit',
            'method': 'POST',
            'description': 'Browser-as-Crawler anonymous page submission',
            'privacy': 'Only URL + title + description. No personal data.',
            'rate_limit': f'{SUBMIT_MAX_PER_MINUTE} submissions per minute per IP',
            'fields': {
                'url': 'string (required) — The page URL',
                'title': 'string (optional) — The page title',
                'description': 'string (optional) — Meta description or snippet'
            }
        })
        return add_cors_headers(resp)

    # POST: Process page submission
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown')
    if ',' in ip:
        ip = ip.split(',')[0].strip()

    if not check_rate_limit(ip):
        resp = jsonify({
            'status': 'rate_limited',
            'message': 'Too many submissions. Please wait a minute.'
        })
        resp.status_code = 429
        return add_cors_headers(resp)

    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}

    if not data:
        data = {
            'url': request.form.get('url', ''),
            'title': request.form.get('title', ''),
            'description': request.form.get('description', '')
        }

    url = data.get('url', '').strip()
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()

    if not url:
        resp = jsonify({'status': 'error', 'message': 'URL is required'})
        resp.status_code = 400
        return add_cors_headers(resp)

    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            resp = jsonify({'status': 'error', 'message': 'Only http/https URLs accepted'})
            resp.status_code = 400
            return add_cors_headers(resp)
        if not parsed.hostname:
            resp = jsonify({'status': 'error', 'message': 'Invalid URL'})
            resp.status_code = 400
            return add_cors_headers(resp)
    except Exception:
        resp = jsonify({'status': 'error', 'message': 'Invalid URL format'})
        resp.status_code = 400
        return add_cors_headers(resp)

    hostname = parsed.hostname.lower()
    blocked_hosts = {'localhost', '127.0.0.1', '0.0.0.0', '::1', '192.168.', '10.', '172.16.'}
    if any(hostname.startswith(bh) or hostname == bh for bh in blocked_hosts):
        resp = jsonify({'status': 'error', 'message': 'Private/internal URLs not accepted'})
        resp.status_code = 400
        return add_cors_headers(resp)

    success = index_submitted_page(url, title, description)

    if success:
        resp = jsonify({
            'status': 'ok',
            'message': 'Page submitted successfully. Thank you for contributing to Eesha Search!',
            'privacy': 'Only URL + title + description stored. No personal data.'
        })
    else:
        resp = jsonify({
            'status': 'error',
            'message': 'Failed to index page. It may already be in our index.'
        })
        resp.status_code = 500

    return add_cors_headers(resp)


@app.route('/health')
def health():
    """Health check endpoint."""
    zinc_healthy = check_zincsearch_health()
    counts = get_index_counts()
    status = 'ok' if zinc_healthy else 'degraded'
    code = 200 if zinc_healthy else 503
    resp = jsonify({
        'status': status,
        'service': 'Eesha Search',
        'version': '3.0.0',
        'independent': True,
        'engine': 'ZincSearch',
        'features': {
            'bm25_ranking': True,
            'authority_scoring': True,
            'freshness_boosting': True,
            'spell_correction': True,
            'knowledge_boxes': True,
            'browser_as_crawler': True,
            'rss_indexing': True
        },
        'zincsearch': zinc_healthy,
        'indexed_pages': counts.get('pages', 0),
        'indexed_media': counts.get('media', 0)
    })
    resp.status_code = code
    return add_cors_headers(resp)


# ─── Crawler Instance API Endpoints ────────────────────────────────────────

def _verify_api_key(request):
    """Verify the Eesha API key for Crawler Instance requests."""
    if not EESHA_API_KEY:
        return False, 'API key not configured on server'
    api_key = request.headers.get('X-Eesha-API-Key', '')
    if api_key != EESHA_API_KEY:
        return False, 'Invalid API key'
    return True, None


@app.route('/api/index', methods=['POST', 'OPTIONS'])
def api_index_doc():
    """
    Index a single document from the Crawler Instance.
    Requires X-Eesha-API-Key header.
    """
    if request.method == 'OPTIONS':
        resp = jsonify({'status': 'ok'})
        return add_cors_headers(resp)

    valid, err = _verify_api_key(request)
    if not valid:
        return jsonify({'error': err}), 401

    try:
        doc = request.get_json(force=True)
    except Exception:
        return jsonify({'error': 'Invalid JSON'}), 400

    if not doc or not doc.get('url'):
        return jsonify({'error': 'Document must have a url field'}), 400

    try:
        doc_id = hashlib.md5(doc['url'].encode()).hexdigest()
        # Ensure required fields
        if 'inlink_count' not in doc:
            doc['inlink_count'] = 0
        if 'crawlDate' not in doc:
            doc['crawlDate'] = datetime.utcnow().isoformat() + 'Z'
        if 'title_suggest' not in doc:
            doc['title_suggest'] = doc.get('title', '')

        index_name = doc.pop('_index', MAIN_INDEX)
        make_zinc_request(
            f"{ZINC_SEARCH_URL}/es/{index_name}/_doc/{doc_id}",
            data=doc,
            method='PUT',
            timeout=10
        )
        return jsonify({'status': 'ok', 'id': doc_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/bulk', methods=['POST', 'OPTIONS'])
def api_bulk_index():
    """
    Bulk index documents from the Crawler Instance.
    Forwards the NDJSON bulk request directly to ZincSearch.
    Requires X-Eesha-API-Key header.
    """
    if request.method == 'OPTIONS':
        resp = jsonify({'status': 'ok'})
        return add_cors_headers(resp)

    valid, err = _verify_api_key(request)
    if not valid:
        return jsonify({'error': err}), 401

    try:
        bulk_data = request.get_data()
        if not bulk_data:
            return jsonify({'error': 'Empty body'}), 400

        headers = {
            'Content-Type': 'application/x-ndjson',
            'Authorization': ZINC_AUTH_HEADER
        }
        req = urllib.request.Request(
            f"{ZINC_SEARCH_URL}/es/_bulk",
            data=bulk_data,
            headers=headers,
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        return jsonify(result)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')[:500]
        return jsonify({'error': f'ZincSearch error: {body}'}), e.code
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/counts')
def api_counts():
    """Get document counts (public, no auth required)."""
    counts = get_index_counts()
    resp = jsonify(counts)
    return add_cors_headers(resp)


@app.route('/opensearch.xml')
def opensearch_description():
    """OpenSearch description for browser integration."""
    # Use the request host to build the OpenSearch URL dynamically
    host_url = request.host_url.rstrip('/')
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Eesha Search</ShortName>
  <Description>Eesha Search - 100% Independent Search Engine</Description>
  <Tags>eesha search independent</Tags>
  <Contact>search@eesha.co</Contact>
  <Url type="text/html" method="get" template="{host_url}/search?q={{searchTerms}}&amp;category=general"/>
  <Url type="application/x-suggestions+json" method="get" template="{host_url}/suggest?q={{searchTerms}}"/>
  <Image height="16" width="16" type="image/x-icon">{host_url}/favicon.ico</Image>
  <Developer>Eesha Browser Team</Developer>
  <Attribution>100% Independent - No external search engines</Attribution>
  <SyndicationRight>open</SyndicationRight>
  <AdultContent>false</AdultContent>
  <Language>en-us</Language>
  <OutputEncoding>UTF-8</OutputEncoding>
  <InputEncoding>UTF-8</InputEncoding>
</OpenSearchDescription>'''
    return Response(xml, mimetype='application/opensearchdescription+xml')


@app.after_request
def after_request(response):
    """Add security and CORS headers to all responses."""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


@app.errorhandler(404)
def page_not_found(e):
    """Custom 404 page."""
    try:
        counts = get_index_counts()
    except Exception:
        counts = {'pages': 0, 'media': 0}
    return render_template('index.html', error='Page not found', index_counts=counts), 404


@app.errorhandler(500)
def internal_error(e):
    """Custom 500 page."""
    try:
        counts = get_index_counts()
    except Exception:
        counts = {'pages': 0, 'media': 0}
    return render_template('index.html', error='Internal server error', index_counts=counts), 500


# ─── Main ───────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8888))
    print(f"\n{'='*50}")
    print(f"  Eesha Search v3.0 — Custom Search UI & API")
    print(f"  100% Independent — No external engines")
    print(f"  Powered by ZincSearch (lightweight Go binary)")
    print(f"  Features: BM25 + Authority + Freshness + Spell Check")
    print(f"           + Knowledge Boxes + Browser-as-Crawler")
    print(f"  Listening on 0.0.0.0:{port}")
    print(f"  ZincSearch: {ZINC_SEARCH_URL}")
    print(f"{'='*50}\n")
    app.run(host='0.0.0.0', port=port, debug=False)
