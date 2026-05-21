#!/usr/bin/env python3
"""
Eesha Crawler — Remote Index Pusher
=====================================
Wraps ZincSearch requests with API key authentication for
pushing documents to the Search Instance via the /zinc-api/ proxy.

This module is imported by the crawler scripts when EESHA_API_KEY
is set and EESHA_SEARCH_URL points to a remote instance.
"""

import os
import json
import urllib.request
import urllib.error
import base64
import hashlib

# Remote Search Instance configuration
EESHA_SEARCH_URL = os.environ.get('EESHA_SEARCH_URL', '')
EESHA_API_KEY = os.environ.get('EESHA_API_KEY', '')
ZINC_AUTH_HEADER = 'Basic ' + base64.b64encode(
    f'{os.environ.get("ZINC_FIRST_ADMIN_USER", "admin")}:'
    f'{os.environ.get("ZINC_FIRST_ADMIN_PASSWORD", "Complexpass#123")}'.encode()
).decode()


def push_document(doc, index='nutch'):
    """Push a single document to the remote Search Instance."""
    if not EESHA_SEARCH_URL or not EESHA_API_KEY:
        return False

    doc_id = hashlib.md5(doc['url'].encode()).hexdigest()
    if 'inlink_count' not in doc:
        doc['inlink_count'] = 0
    if 'crawlDate' not in doc:
        from datetime import datetime
        doc['crawlDate'] = datetime.utcnow().isoformat() + 'Z'
    if 'title_suggest' not in doc:
        doc['title_suggest'] = doc.get('title', '')

    url = f"{EESHA_SEARCH_URL}/zinc-api/es/{index}/_doc/{doc_id}"
    headers = {
        'Content-Type': 'application/json',
        'Authorization': ZINC_AUTH_HEADER,
        'X-Eesha-API-Key': EESHA_API_KEY,
    }
    try:
        data = json.dumps(doc).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers, method='PUT')
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            return result.get('result') in ('created', 'updated')
    except Exception as e:
        print(f"[PUSH-WARN] Failed to push {doc.get('url', '')[:60]}: {e}")
        return False


def push_bulk(documents, index='nutch'):
    """Push a batch of documents to the remote Search Instance using bulk API."""
    if not EESHA_SEARCH_URL or not EESHA_API_KEY:
        return 0

    lines = []
    for doc in documents:
        doc_id = hashlib.md5(doc['url'].encode()).hexdigest()
        if 'inlink_count' not in doc:
            doc['inlink_count'] = 0
        if 'crawlDate' not in doc:
            from datetime import datetime
            doc['crawlDate'] = datetime.utcnow().isoformat() + 'Z'
        if 'title_suggest' not in doc:
            doc['title_suggest'] = doc.get('title', '')

        action = json.dumps({"index": {"_index": index, "_id": doc_id}})
        doc_line = json.dumps(doc, ensure_ascii=False)
        lines.append(action)
        lines.append(doc_line)

    bulk_body = '\n'.join(lines) + '\n'
    url = f"{EESHA_SEARCH_URL}/zinc-api/es/_bulk"
    headers = {
        'Content-Type': 'application/x-ndjson',
        'Authorization': ZINC_AUTH_HEADER,
        'X-Eesha-API-Key': EESHA_API_KEY,
    }
    try:
        data = bulk_body.encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            if result.get('errors'):
                errors = sum(1 for item in result.get('items', []) if item.get('index', {}).get('error'))
                return len(documents) - errors
            return len(documents)
    except Exception as e:
        print(f"[PUSH-ERROR] Bulk push failed: {e}")
        return 0


def get_zinc_base_url():
    """Get the ZincSearch base URL — remote if EESHA_SEARCH_URL is set, local otherwise."""
    if EESHA_SEARCH_URL and EESHA_API_KEY:
        return f"{EESHA_SEARCH_URL}/zinc-api"
    return os.environ.get('OPENSEARCH_URL', 'http://localhost:4080')


def get_auth_headers():
    """Get the headers needed for ZincSearch requests including API key."""
    headers = {
        'Authorization': ZINC_AUTH_HEADER,
    }
    if EESHA_API_KEY:
        headers['X-Eesha-API-Key'] = EESHA_API_KEY
    return headers
