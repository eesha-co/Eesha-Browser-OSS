# Eesha Search — SearXNG Dockerfile for Render.com
# Based on the official SearXNG image with Eesha Search branding overlay
#
# Deployment URL: https://eesha-search.onrender.com
# JSON API:       https://eesha-search.onrender.com/search?q=...&format=json
# Suggestions:    https://eesha-search.onrender.com/autocompleter?q=...
# Health check:   https://eesha-search.onrender.com/healthz
#
# Branding: SearXNG UI is replaced with Eesha Search identity
# - Templates: base.html (footer, meta), index.html (homepage), search.html (results header), opensearch.xml
# - Static: Custom CSS (eesha-branding.css), favicon, logo
# - CSS: Hides engine source labels (Google, DuckDuckGo, etc.)
# - All "SearXNG" references replaced with "Eesha Search"
# - AGPLv3 compliance: Source code link in footer + About page
#
# Port: Render provides PORT env var (default 10000 on free tier).
# SearXNG uses BIND_ADDRESS env var (default [::]:8080).
# We set BIND_ADDRESS in the render.yaml environment to match PORT.

FROM searxng/searxng:latest

# ─── Copy SearXNG settings ───
COPY settings.yml /etc/searxng/settings.yml

# ─── Apply Eesha Search Branding Overlay ───

# Override templates — replaces SearXNG branding with Eesha Search
COPY branding/templates/simple/base.html /usr/local/searxng/searx/templates/simple/base.html
COPY branding/templates/simple/index.html /usr/local/searxng/searx/templates/simple/index.html
COPY branding/templates/simple/search.html /usr/local/searxng/searx/templates/simple/search.html
COPY branding/templates/simple/opensearch.xml /usr/local/searxng/searx/templates/simple/opensearch.xml

# Copy custom branding CSS (loaded by base.html via url_for('static'))
# Hides: engine source labels, SearXNG URLs, version text
# Styles: Eesha logo text, brand colors, search accent, category tabs
COPY branding/static/css/eesha-branding.css /usr/local/searxng/searx/static/css/eesha-branding.css

# Replace SearXNG logo/favicon with Eesha Search branding
COPY branding/logo.png /usr/local/searxng/searx/static/themes/simple/img/searxng.png
COPY branding/logo.png /usr/local/searxng/searx/static/themes/simple/img/favicon.png
COPY branding/static/img/favicon.svg /usr/local/searxng/searx/static/themes/simple/img/favicon.svg
COPY branding/static/img/favicon.svg /usr/local/searxng/searx/static/themes/simple/img/favicon.svg

# Set the base URL from environment variable (Render provides this)
ENV SEARXNG_BASE_URL=${SEARXNG_BASE_URL}

# Health check — uses BIND_ADDRESS port (set via env var in render.yaml)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:10000/healthz || exit 1

# Use the original SearXNG entrypoint — no custom entrypoint needed
# BIND_ADDRESS env var controls which port SearXNG listens on
