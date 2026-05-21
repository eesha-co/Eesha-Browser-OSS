#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Eesha Search — 100% Independent Search Engine
# Render.com Entrypoint
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# This script ONLY does configuration and then hands off to supervisord.
# Supervisord manages ALL long-running processes:
#   - ZincSearch (search index)
#   - Bootstrap script (create indices, import Wikipedia, crawl)
#   - Flask/Gunicorn (search UI & API)
#   - Nginx (reverse proxy)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXTERNAL_PORT="${PORT:-10000}"
EESHA_API_KEY="${EESHA_API_KEY:-}"

echo "╔══════════════════════════════════════════╗"
echo "║   Eesha Search — 100% Independent        ║"
echo "║   No external search engines              ║"
echo "║   Only our own crawled & indexed data     ║"
echo "║   Custom Flask Search UI & API            ║"
echo "║   Powered by ZincSearch (lightweight!)    ║"
echo "║   Deployed on Render.com                  ║"
echo "╚══════════════════════════════════════════╝"

# ─── Step 1: Create data directory ──────────────────────────────────────
mkdir -p /data
chown -R 1000:1000 /data 2>/dev/null || true

# ─── Step 2: Configure Nginx ────────────────────────────────────────────
echo "[CONFIG] Configuring Nginx reverse proxy on port ${EXTERNAL_PORT}..."

if command -v envsubst > /dev/null 2>&1; then
    EXTERNAL_PORT="${EXTERNAL_PORT}" EESHA_API_KEY="${EESHA_API_KEY}" \
        envsubst '${EXTERNAL_PORT} ${EESHA_API_KEY}' \
        < /etc/nginx/sites-available/default.template \
        > /etc/nginx/sites-available/default
else
    sed -e "s/\${EXTERNAL_PORT}/${EXTERNAL_PORT}/g" \
        -e "s/\${EESHA_API_KEY}/${EESHA_API_KEY}/g" \
        < /etc/nginx/sites-available/default.template \
        > /etc/nginx/sites-available/default
fi

ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t 2>&1 || echo "[WARN] Nginx config test failed"
echo "[CONFIG] Nginx configured for port ${EXTERNAL_PORT}"
if [ -n "${EESHA_API_KEY}" ]; then
    echo "[CONFIG] Crawler API enabled with API key authentication"
else
    echo "[CONFIG] Crawler API disabled (no EESHA_API_KEY set)"
fi

# ─── Step 3: Start Cron ─────────────────────────────────────────────────
echo "[CONFIG] Starting cron scheduler..."
service cron start 2>/dev/null || cron
echo "[CONFIG] Cron started"

# ─── Step 4: Export env vars for supervisor ─────────────────────────────
export OPENSEARCH_URL="${OPENSEARCH_URL:-http://localhost:4080}"
export ZINC_SEARCH_URL="${ZINC_SEARCH_URL:-http://localhost:4080}"
export FLASK_PORT="${FLASK_PORT:-8888}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Eesha Search v3.0 starting...         ║"
echo "║   Supervisord will manage:               ║"
echo "║     1. ZincSearch (search index)         ║"
echo "║     2. Bootstrap (indices + import)      ║"
echo "║     3. Flask/Gunicorn (search API)       ║"
echo "║     4. Nginx (reverse proxy)             ║"
echo "╚══════════════════════════════════════════╝"

# ─── Start Supervisord (manages ALL processes) ─────────────────────────
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/eesha-search.conf
