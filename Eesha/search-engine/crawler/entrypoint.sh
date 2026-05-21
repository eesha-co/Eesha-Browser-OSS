#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Eesha Crawler — Crawler Instance Entrypoint
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# This is the CRAWLER INSTANCE that pushes data to the Search Instance.
# It runs all heavy data import processes that would OOM the Search Instance.
#
# Required Environment Variables:
#   EESHA_SEARCH_URL  — URL of the Search Instance (e.g. https://eesha-search.onrender.com)
#   EESHA_API_KEY     — API key for authentication with the Search Instance
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "╔══════════════════════════════════════════╗"
echo "║   Eesha Crawler Instance                 ║"
echo "║   Building the search index              ║"
echo "║   Pushing data to Search Instance        ║"
echo "╚══════════════════════════════════════════╝"

# Validate required environment variables
if [ -z "${EESHA_SEARCH_URL}" ]; then
    echo "[ERROR] EESHA_SEARCH_URL is not set!"
    echo "[ERROR] Set it to your Search Instance URL (e.g. https://eesha-search.onrender.com)"
    echo "[ERROR] The Crawler Instance cannot start without this."
fi

if [ -z "${EESHA_API_KEY}" ]; then
    echo "[WARN] EESHA_API_KEY is not set!"
    echo "[WARN] The Crawler Instance will NOT be able to push data."
    echo "[WARN] Set the same EESHA_API_KEY on both instances."
fi

# Set OPENSEARCH_URL to point to remote Search Instance's ZincSearch proxy
if [ -n "${EESHA_SEARCH_URL}" ] && [ -n "${EESHA_API_KEY}" ]; then
    export OPENSEARCH_URL="${EESHA_SEARCH_URL}/zinc-api"
    echo "[CONFIG] OPENSEARCH_URL set to: ${OPENSEARCH_URL}"
else
    export OPENSEARCH_URL="${OPENSEARCH_URL:-http://localhost:4080}"
    echo "[CONFIG] OPENSEARCH_URL set to: ${OPENSEARCH_URL} (local)"
fi

# Quick connectivity check — NON-BLOCKING
# We just check once and warn if not reachable. The scripts have their own retry logic.
echo "[CONFIG] Checking connectivity to Search Instance..."
if curl -sf --max-time 30 "${EESHA_SEARCH_URL:-http://localhost:4080}/health" > /dev/null 2>&1; then
    echo "[CONFIG] Search Instance is reachable!"
else
    echo "[WARN] Search Instance not reachable right now."
    echo "[WARN] This is normal if the Search Instance is spinning up (free tier cold start)."
    echo "[WARN] Crawler scripts will retry automatically on each request."
    echo "[WARN] The Search Instance will wake up when the first request hits it."
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Eesha Crawler starting...              ║"
echo "║   Supervisord will manage:               ║"
echo "║     1. Health server (Render requires)    ║"
echo "║     2. Common Crawl / Tranco import      ║"
echo "║     3. Wikipedia import (looping)         ║"
echo "║     4. Web Crawler (continuous)           ║"
echo "║     5. RSS Indexer (periodic)            ║"
echo "║     6. Media Extractor (images/videos)   ║"
echo "╚══════════════════════════════════════════╝"

# ─── Start Supervisord ──────────────────────────────────────────────────
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/eesha-crawler.conf
