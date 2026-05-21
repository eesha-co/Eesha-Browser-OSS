#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Eesha Search — 100% Independent Search Engine
# Hugging Face Spaces Entrypoint
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Starts: ZincSearch → Create Indices → Flask App → Initial Crawl → Nginx → Cron
# NO external search engines. Only our own crawled & indexed data.
# NO SearXNG — replaced with custom Flask search UI & API.
# NO Java/JVM — ZincSearch is a single Go binary (~20MB, ~5s startup).
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -e

echo "╔══════════════════════════════════════════╗"
echo "║   Eesha Search — 100% Independent        ║"
echo "║   No external search engines              ║"
echo "║   Only our own crawled & indexed data     ║"
echo "║   Custom Flask Search UI & API            ║"
echo "║   Powered by ZincSearch (lightweight!)    ║"
echo "╚══════════════════════════════════════════╝"

# ─── Step 1: Start ZincSearch ────────────────────────────────────────────
echo "[1/6] Starting ZincSearch..."
export ZINC_FIRST_ADMIN_USER="${ZINC_FIRST_ADMIN_USER:-admin}"
export ZINC_FIRST_ADMIN_PASSWORD="${ZINC_FIRST_ADMIN_PASSWORD:-Complexpass#123}"
export ZINC_DATA_PATH="${ZINC_DATA_PATH:-/data}"

# Ensure data directory exists with proper permissions
mkdir -p /data
chown -R 1000:1000 /data 2>/dev/null || true

# Start ZincSearch in background (single Go binary — no JVM, no heap settings!)
ZINC_DATA_PATH=/data /opt/zincsearch-bin/zincsearch > /var/log/eesha/zincsearch.log 2>&1 &
ZINC_PID=$!
echo "[1/6] ZincSearch started (PID: ${ZINC_PID})"

# Wait for ZincSearch to be ready (much faster than OpenSearch — typically <5s)
echo "[1/6] Waiting for ZincSearch to start..."
MAX_WAIT=60
WAITED=0
while ! curl -sf http://localhost:4080/healthz > /dev/null 2>&1; do
    sleep 2
    WAITED=$((WAITED + 2))
    if [ $WAITED -ge $MAX_WAIT ]; then
        echo "[WARN] ZincSearch not ready after ${MAX_WAIT}s, continuing anyway..."
        break
    fi
    echo "  ... waiting (${WAITED}s)"
done
echo "[1/6] ZincSearch is ready!"

# ─── Step 2: Create ZincSearch Indices ───────────────────────────────────
echo "[2/6] Setting up ZincSearch indices..."

# ZincSearch uses Basic Auth
ZINC_AUTH="${ZINC_FIRST_ADMIN_USER}:${ZINC_FIRST_ADMIN_PASSWORD}"
ZINC_BASE="http://localhost:4080"

# Main search index (with BM25 + authority scoring)
# Note: ZincSearch supports ES-compatible index creation API
if ! curl -sf -u "${ZINC_AUTH}" "${ZINC_BASE}/api/index/nutch" > /dev/null 2>&1; then
    curl -sf -X PUT "${ZINC_BASE}/api/index/nutch" \
        -u "${ZINC_AUTH}" \
        -H 'Content-Type: application/json' \
        -d '{
            "mappings": {
                "properties": {
                    "title": { "type": "text", "analyzer": "standard" },
                    "url": { "type": "keyword" },
                    "content": { "type": "text", "analyzer": "standard" },
                    "description": { "type": "text", "analyzer": "standard" },
                    "keywords": { "type": "keyword" },
                    "images": { "type": "keyword" },
                    "videos": { "type": "keyword" },
                    "host": { "type": "keyword" },
                    "inlink_count": { "type": "numeric" },
                    "crawlDate": { "type": "date" },
                    "title_suggest": { "type": "text", "analyzer": "standard" }
                }
            },
            "settings": {
                "analysis": {
                    "analyzer": {
                        "default": {
                            "type": "standard"
                        }
                    }
                }
            }
        }' > /dev/null 2>&1
    echo "[2/6] Index 'nutch' created with BM25 + authority support"
else
    echo "[2/6] Index 'nutch' already exists"
fi

# Media index
if ! curl -sf -u "${ZINC_AUTH}" "${ZINC_BASE}/api/index/eesha-media" > /dev/null 2>&1; then
    curl -sf -X PUT "${ZINC_BASE}/api/index/eesha-media" \
        -u "${ZINC_AUTH}" \
        -H 'Content-Type: application/json' \
        -d '{
            "mappings": {
                "properties": {
                    "source_url": { "type": "keyword" },
                    "media_type": { "type": "keyword" },
                    "media_url": { "type": "keyword" },
                    "phash": { "type": "keyword" },
                    "size": { "type": "numeric" },
                    "content_type": { "type": "keyword" },
                    "source_title": { "type": "text" },
                    "indexed_at": { "type": "date" }
                }
            }
        }' > /dev/null 2>&1
    echo "[2/6] Index 'eesha-media' created"
else
    echo "[2/6] Index 'eesha-media' already exists"
fi

# ─── Step 3: Start Flask Search App ──────────────────────────────────────
echo "[3/6] Starting Eesha Search Flask app on port 8888..."
export OPENSEARCH_URL="${OPENSEARCH_URL:-http://localhost:4080}"
export ZINC_SEARCH_URL="${ZINC_SEARCH_URL:-http://localhost:4080}"
export PORT=8888
python3 /opt/eesha/app.py > /var/log/eesha/flask.log 2>&1 &
FLASK_PID=$!

# Wait for Flask to start
WAITED=0
while ! curl -sf http://localhost:8888/health > /dev/null 2>&1; do
    sleep 2
    WAITED=$((WAITED + 2))
    if [ $WAITED -ge 30 ]; then
        echo "[WARN] Flask app not responding after 30s, continuing..."
        break
    fi
done
echo "[3/6] Eesha Search Flask app started (PID: ${FLASK_PID})"

# ─── Step 4: Bootstrap index with Wikipedia + crawl + RSS ────────────────
echo "[4/6] Bootstrapping search index..."

# Check if index is empty — if so, import Wikipedia abstracts first
DOC_COUNT=$(curl -sf -u "${ZINC_AUTH}" "${ZINC_BASE}/api/index/nutch/_count" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")

if [ "$DOC_COUNT" -lt 1000 ]; then
    echo "[4/6] Index has ${DOC_COUNT} docs — importing Wikipedia abstracts for bootstrap..."
    OPENSEARCH_URL="${ZINC_BASE}" python3 /opt/eesha-scripts/wikipedia_import.py --limit 50000 > /var/log/eesha/wikipedia-import.log 2>&1 &
    WIKI_PID=$!
    echo "[4/6] Wikipedia import started (PID: ${WIKI_PID}, limit: 50K articles)"
else
    echo "[4/6] Index already has ${DOC_COUNT} docs — skipping Wikipedia import"
fi

# Run initial crawl with lightweight crawler (aggressive settings)
OPENSEARCH_URL="${ZINC_BASE}" python3 /opt/eesha-scripts/lightweight_crawler.py --once > /var/log/eesha/crawl-init.log 2>&1 &
CRAWL_PID=$!
echo "[4/6] Initial crawl started in background (PID: ${CRAWL_PID})"

# Start seed generator in background
OPENSEARCH_URL="${ZINC_BASE}" python3 /opt/eesha-scripts/seed_generator.py --once > /var/log/eesha/seed-init.log 2>&1 &
echo "[4/6] Initial seed generation started"

# Run RSS indexer for fresh news content (Phase 4)
OPENSEARCH_URL="${ZINC_BASE}" python3 /opt/eesha-scripts/rss_indexer.py --once > /var/log/eesha/rss-init.log 2>&1 &
RSS_PID=$!
echo "[4/6] Initial RSS feed indexing started (PID: ${RSS_PID})"

# ─── Step 5: Start Nginx ────────────────────────────────────────────────
echo "[5/6] Starting Nginx reverse proxy on port 7860..."
nginx -g "daemon off;" &
echo "[5/6] Nginx started"

# ─── Step 6: Start Cron ──────────────────────────────────────────────────
echo "[6/6] Starting cron scheduler..."
service cron start 2>/dev/null || cron
echo "[6/6] Cron started"

# ─── Done! ───────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Eesha Search v2.0 is LIVE!            ║"
echo "║   100% INDEPENDENT — No external engines ║"
echo "║   Custom Flask Search UI & API           ║"
echo "║   Port: 7860 (HF Spaces)                ║"
echo "║                                          ║"
echo "║   Powered by ZincSearch:                 ║"
echo "║     ✓ Single Go binary (~20MB)           ║"
echo "║     ✓ ~256MB RAM (vs 512MB+ JVM)        ║"
echo "║     ✓ <5s startup (vs 60-90s Java)      ║"
echo "║     ✓ ES-compatible API                  ║"
echo "║                                          ║"
echo "║   Features:                              ║"
echo "║     ✓ BM25 + Authority + Freshness       ║"
echo "║     ✓ Spell Correction (Did you mean?)   ║"
echo "║     ✓ Wikipedia Knowledge Boxes          ║"
echo "║     ✓ Browser-as-Crawler (/submit)       ║"
echo "║     ✓ RSS Feed Indexing (every 15min)    ║"
echo "║                                          ║"
echo "║   Endpoints:                             ║"
echo "║     /           → Search UI              ║"
echo "║     /search?q= → Search API + Results    ║"
echo "║     /suggest?q=→ Autocomplete (our index)║"
echo "║     /submit    → Browser page submission ║"
echo "║     /health    → Health check            ║"
echo "║                                          ║"
echo "║   Internal:                              ║"
echo "║     :4080     → ZincSearch API           ║"
echo "║     :8888     → Flask app direct         ║"
echo "╚══════════════════════════════════════════╝"

# Keep container alive with supervisord
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/eesha-search.conf
