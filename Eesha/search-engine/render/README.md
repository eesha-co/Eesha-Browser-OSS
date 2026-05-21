# Eesha Search — Render.com Deployment

## 100% Independent Search Engine
No external search APIs. No Google, no Bing, no DuckDuckGo. Only our own crawled and indexed data.

## Stack
- **ZincSearch** — Lightweight search index (single Go binary, ~256MB RAM)
- **Flask + Gunicorn** — Custom search UI & API
- **Nginx** — Reverse proxy
- **Python Crawler** — Aggressive web crawling (allowed on Render!)

## Features
- BM25 + Authority + Freshness ranking
- Spell correction ("Did you mean?")
- Wikipedia Knowledge Boxes
- Browser-as-Crawler (anonymous page submissions)
- RSS Feed Indexing (every 15 min)
- Aggressive Web Crawling (every 6 hours)
- Wikipedia dump import (every Sunday)
- Common Crawl import (monthly)

## Deploy to Render (Free Tier)

### Option 1: Blueprint (Recommended)
1. Push this repo to GitHub (`eesha-co/Eesha`)
2. Go to [Render Dashboard](https://dashboard.render.com/blueprints)
3. Click "New Blueprint"
4. Connect your GitHub repo
5. Render detects `render.yaml` at the repo root
6. Click "Apply" — done!

### Option 2: Manual
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repo
4. Set:
   - **Runtime**: Docker
   - **Docker Context**: `search-engine`
   - **Dockerfile Path**: `search-engine/render/Dockerfile`
   - **Plan**: Free
5. Add environment variables:
   - `PORT`: `10000`
   - `ZINC_FIRST_ADMIN_USER`: `admin`
   - `ZINC_FIRST_ADMIN_PASSWORD`: (auto-generate)
6. Deploy!

## Endpoints
| Endpoint | Description |
|----------|-------------|
| `/` | Search homepage |
| `/search?q=` | Search results (HTML + JSON) |
| `/suggest?q=` | Autocomplete API |
| `/submit` | Browser-as-Crawler POST API |
| `/spellcheck?q=` | Spell check API |
| `/health` | Health check |
| `/opensearch.xml` | Browser search provider |

## Memory Usage (Render Free Tier = 512MB)
- ZincSearch: ~256MB
- Flask/Gunicorn: ~64MB
- Nginx: ~8MB
- Python crawler: ~64MB (periodic)
- OS + buffer: ~120MB
- **Total: ~512MB** ✅ Fits in free tier!

## URL
After deployment: `https://eesha-search.onrender.com`
