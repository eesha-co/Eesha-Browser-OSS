# Eesha Search — Eesha Browser's Own Search Engine

> Privacy-first, self-hosted, $0 cost search engine powering Eesha Browser.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Apache Nutch│────▶│  OpenSearch  │────▶│    SearXNG      │
│  (Crawler)   │     │  (Index)     │     │    (UI/API)     │
└──────┬───────┘     └──────────────┘     └────────┬────────┘
       │                                          │
       │    ┌──────────────────┐                  │
       └───▶│  Seed Generator  │                  │
            │  (RSS → URLs)    │                  │
            └──────────────────┘                  │
                                                  ▼
                                          ┌──────────────┐
                                          │ Eesha Search  │
                                          │ (Bun Service) │
                                          │  Port: 3031   │
                                          └──────────────┘
```

## The Auto-Pilot Stack

| System | Task | Frequency |
|--------|------|-----------|
| Python Script | Find new URLs from RSS | Every 1 Hour |
| Nutch Crawler | Crawl and Index new sites | Every 6 Hours |
| OpenSearch | Store and Serve data | Real-time |
| SearXNG | Professional UI & Categories | Real-time |
| Eesha Search (Bun) | Browser-facing API | Real-time |

## Quick Start

### 1. Start the Full Stack (Docker Compose)

```bash
cd search-engine/docker
docker compose up -d
```

This launches:
- **OpenSearch** on port 9200 (index storage)
- **OpenSearch Dashboards** on port 5601 (index management)
- **SearXNG** on port 8888 (search UI + API)
- **Nutch** (on-demand crawler)
- **Seed Generator** (automatic URL discovery)

### 2. Start the Eesha Search Service (Bun)

```bash
cd mini-services/search-engine
bun run dev
```

This starts the browser-facing search API on port 3031.

### 3. Run a Crawl Cycle

```bash
# Single crawl cycle
cd search-engine/scripts
bash crawl_loop.sh

# Continuous (every 6 hours)
bash crawl_loop.sh --continuous
```

### 4. Generate Seed URLs

```bash
# Single run
python3 search-engine/scripts/seed_generator.py --once

# Continuous (every hour)
python3 search-engine/scripts/seed_generator.py
```

### 5. Set Up Cron Jobs

```bash
crontab search-engine/scripts/crontab
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Beautiful search UI |
| `GET /search?q=...` | Search API (JSON) |
| `GET /search?q=...&category=images` | Image search |
| `GET /search?q=...&category=videos` | Video search |
| `GET /search?q=...&category=news` | News search |
| `GET /search?q=...&format=html` | HTML results |
| `GET /suggest?q=...` | Autocomplete suggestions |
| `GET /opensearch.xml` | Browser integration |
| `GET /health` | Health check |

## Search Categories

- **All** — General web search
- **Images** — Image search with thumbnails
- **Videos** — Video search with duration
- **News** — News articles
- **Tech** — Programming & technology
- **Science** — Academic & research

## How It Works

1. **Seed Generator** pulls trending URLs from RSS feeds (BBC, Reddit, HN, etc.) every hour
2. **Nutch Crawler** follows the inject→generate→fetch→parse→index loop every 6 hours
3. **OpenSearch** stores the indexed documents with full-text search capability
4. **SearXNG** provides a professional search interface, combining local OpenSearch results with global sources
5. **Eesha Search** (Bun service) wraps SearXNG with a clean API and beautiful UI for Eesha Browser

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARXNG_URL` | `http://localhost:8888` | SearXNG instance URL |
| `OPENSEARCH_URL` | `http://opensearch:9200` | OpenSearch cluster URL |
| `OPENSEARCH_INDEX` | `nutch` | OpenSearch index name |
| `SEED_OUTPUT` | `/root/nutch/urls/seed.txt` | Seed file path |
| `SCAN_INTERVAL` | `3600` | Seed scan interval (seconds) |
| `CRAWL_DEPTH` | `3` | Nutch crawl depth |
| `CRAWL_TOP_N` | `50000` | Max URLs per crawl round |

## Cost: $0

The only "cost" is electricity. You are effectively building a mini-Google that feeds itself while you sleep.

## Version

Eesha Search v0.9.2 — Part of Eesha Browser
