---
title: Eesha Search
emoji: 🔍
colorFrom: green
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Eesha Search — 100% Independent Search Engine

> Privacy-first, 100% independent search engine powering [Eesha Browser](https://github.com/eesha-co/Eesha).
> No external search engines. Only our own crawled & indexed data.

## Architecture

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Crawler** | Lightweight Python Crawler | Discovers, fetches, and indexes web pages |
| **Index** | ZincSearch | Stores and serves search data in real-time (~20MB, ~256MB RAM) |
| **UI & API** | Custom Flask App | Search interface, API, and autocomplete |
| **Proxy** | Nginx | Reverse proxy on port 7860 |
| **Scheduler** | Cron + Supervisor | Automation and process management |

### Why ZincSearch?

| | OpenSearch (before) | ZincSearch (now) |
|---|---|---|
| **Runtime** | Java/JVM | Single Go binary |
| **RAM** | 512MB+ (JVM heap) | ~256MB |
| **Binary size** | ~1GB | ~20MB |
| **Startup time** | 60-90 seconds | <5 seconds |
| **ES-compatible API** | N/A (native) | Yes (`/es/` prefix) |
| **Free tier fit** | Tight | Comfortable |

## Automation Loop

| System | Task | Frequency |
|--------|------|-----------|
| Seed Generator | Find new URLs from RSS feeds | Every 1 Hour |
| Python Crawler | Crawl and Index new sites | Every 6 Hours |
| Media Extractor | Process images and videos | Every 30 Minutes |
| ZincSearch | Store and Serve data | Real-time |
| Flask App | Search UI & API | Real-time |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Search homepage |
| `GET /search?q=...` | Search results (HTML) or API (`?format=json`) |
| `GET /search?q=...&category=images` | Image search |
| `GET /search?q=...&category=videos` | Video search |
| `GET /suggest?q=...` | Autocomplete suggestions (JSON) |
| `GET /health` | Health check (JSON) |
| `GET /opensearch.xml` | Browser search provider description |

## Cost: $0

The only "cost" is the electricity for your computer. You are effectively building a mini-Google that feeds itself while you sleep.

---

**Eesha Search v2.1** — 100% Independent — Part of Eesha Browser
