#!/bin/bash
set -e

# Auto-generate SECRET_KEY if not provided so the app boots out-of-the-box
# without requiring the user to create backend/.env first. Persists in the
# data volume so JWTs survive container restarts.
if [ -z "$SECRET_KEY" ]; then
    SECRET_FILE="${DATA_DIR:-/app/data}/.secret_key"
    mkdir -p "$(dirname "$SECRET_FILE")"
    if [ ! -f "$SECRET_FILE" ]; then
        echo "🔑 No SECRET_KEY provided — generating one (saved to $SECRET_FILE)"
        head -c 48 /dev/urandom | base64 | tr -d '\n' > "$SECRET_FILE"
    fi
    export SECRET_KEY="$(cat "$SECRET_FILE")"
fi

# Arduino cores (arduino:avr, rp2040:rp2040, esp32:esp32@2.0.17)
# are installed during Docker build (Dockerfile.standalone) — baked into the image.
# ATTinyCore is NOT installed at build time because its download server (azduino.com)
# is frequently down. We attempt it here as a best-effort background install AFTER
# the web server starts, so it never blocks Render's port-scan health check.

# Source ESP-IDF environment (fast — only sets env vars, no downloads)
if [ -f /opt/esp-idf/export.sh ]; then
    echo "🔧 Sourcing ESP-IDF environment..."
    . /opt/esp-idf/export.sh || true
    echo "✅ ESP-IDF $(cat /opt/esp-idf/version.txt 2>/dev/null || echo 'unknown') ready"
fi

# ── Adapt nginx port for Render ──────────────────────────────────────
# Render sets the PORT env var (default 10000). We patch nginx.conf to
# listen on that port so Render's health check reaches us.
NGINX_PORT="${PORT:-80}"
if [ "$NGINX_PORT" != "80" ]; then
    echo "🔧 Patching nginx to listen on port $NGINX_PORT (Render mode)..."
    sed -i "s/listen 80 default_server;/listen ${NGINX_PORT} default_server;/" /etc/nginx/conf.d/default.conf
    sed -i "s/listen \[::\]:80 default_server;/listen [::]:${NGINX_PORT} default_server;/" /etc/nginx/conf.d/default.conf
fi

# Start FastAPI backend in the background on port 8001
echo "🚀 Starting Eesha Learn Backend..."
uvicorn app.main:app --host 127.0.0.1 --port 8001 &
UVICORN_PID=$!

# Wait for backend to be healthy before starting nginx
sleep 2

# Start Nginx in the background (not exec — we need to monitor both)
echo "🌐 Starting Nginx Web Server on port ${NGINX_PORT}..."
nginx -g "daemon off;" &
NGINX_PID=$!

# ── Best-effort ATTinyCore install (background, non-blocking) ─────────
# ATTinyCore's download server (azduino.com) is frequently down, so we
# can't install it at build time. Try in the background after the server
# is already accepting connections. Failure is silently ignored.
(
    sleep 5
    echo "📦 Attempting ATTinyCore install (best-effort, non-blocking)..."
    arduino-cli core install ATTinyCore:avr 2>/dev/null \
        && echo "✅ ATTinyCore installed" \
        || echo "⚠️  ATTinyCore install failed (server may be down) — ATtiny85 sketches won't compile"
) &

# Exit as soon as either process dies so Docker can restart the container.
wait -n $UVICORN_PID $NGINX_PID
EXIT_CODE=$?

echo "⚠️  A process exited (code $EXIT_CODE) — shutting down container"
kill $UVICORN_PID $NGINX_PID 2>/dev/null || true
wait $UVICORN_PID $NGINX_PID 2>/dev/null || true
exit $EXIT_CODE
