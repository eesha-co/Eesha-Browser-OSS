#!/bin/sh
# Eesha Search — Entrypoint for Render.com
#
# Render provides the PORT env var (default 10000 on free tier).
# SearXNG uses BIND_ADDRESS env var (default [::]:8080).
# This script maps PORT → BIND_ADDRESS so SearXNG listens on the correct port.
#
# It also patches settings.yml to remove port conflicts and disable broken engines.

set -e

PORT="${PORT:-8080}"
SETTINGS="/etc/searxng/settings.yml"

echo "[Eesha Entrypoint] Configuring SearXNG for Render..."
echo "[Eesha Entrypoint] PORT=${PORT}"

# Set BIND_ADDRESS so SearXNG listens on the Render-provided port
export BIND_ADDRESS="0.0.0.0:${PORT}"
echo "[Eesha Entrypoint] BIND_ADDRESS=${BIND_ADDRESS}"

# Patch settings.yml to match the port (some SearXNG versions read from settings)
if [ -f "${SETTINGS}" ]; then
    sed -i "s/port: [0-9]\+/port: ${PORT}/" "${SETTINGS}"
    PATCHED_PORT=$(grep -oP 'port: \K[0-9]+' "${SETTINGS}" | head -1)
    echo "[Eesha Entrypoint] Patched settings.yml port to: ${PATCHED_PORT}"
fi

echo "[Eesha Entrypoint] Starting SearXNG..."

# Start SearXNG using the original entrypoint/command
exec /usr/local/searxng/dockerfiles/docker-entrypoint.sh
