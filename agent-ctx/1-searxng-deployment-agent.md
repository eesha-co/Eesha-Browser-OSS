# Task 1 — SearXNG Deployment Agent

## Task: Create SearXNG Render deployment configuration

## Work Done

### 1. Created `/home/z/my-project/search-engine/searxng-render/Dockerfile`
- Based on `searxng/searxng:latest` official image
- Copies custom `settings.yml` into `/etc/searxng/settings.yml`
- Sets `SEARXNG_BASE_URL` from env var
- Exposes port 8080
- Health check via `/healthz` endpoint (30s interval, 5s timeout, 30s start period)

### 2. Created `/home/z/my-project/search-engine/searxng-render/settings.yml`
- `use_default_settings: true` — loads all 70+ default engines for maximum coverage
- Instance name: "Eesha Search"
- JSON + HTML formats enabled for API access
- Safe search: 0, autocomplete: DuckDuckGo, default language: auto
- Server: bind 0.0.0.0:8080, limiter disabled (for API), image proxy enabled, POST method
- UI: simple theme, center alignment, static hash
- Plugins: Tracker URL remover, Hash plugin, Self Information
- Disabled: scanr structures, semantic scholar (branding/watermark engines)
- Generated proper secret_key (64-char random hex)

### 3. Updated `/home/z/my-project/render.yaml`
- Changed from ZincSearch+Flask to SearXNG Docker
- Service name: eesha-search (kept same)
- Plan: free (kept same)
- dockerContext: search-engine/searxng-render
- dockerfilePath: search-engine/searxng-render/Dockerfile
- Removed old env vars: ZINC_FIRST_ADMIN_USER, ZINC_FIRST_ADMIN_PASSWORD, ZINC_SEARCH_URL, OPENSEARCH_URL, FLASK_PORT, CRAWL_MAX_PAGES, CRAWL_MAX_DEPTH, PORT
- Added: SEARXNG_BASE_URL=https://eesha-search.onrender.com, SEARXNG_SECRET (generated)
- healthCheckPath: /healthz

## API Endpoints
- JSON API: https://eesha-search.onrender.com/search?q=...&format=json
- Suggestions: https://eesha-search.onrender.com/autocompleter?q=...
- Web UI: https://eesha-search.onrender.com/
- Health: https://eesha-search.onrender.com/healthz
