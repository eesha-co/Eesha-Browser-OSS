# Eesha Search — 100% Independent Search Engine
# Docker image for Render.com deployment — SEARCH INSTANCE
# Stack: ZincSearch (index) + Flask (UI/API) + Nginx (proxy) + Python crawler
# NO external search engines. Only our own crawled & indexed data.
#
# Architecture (Two-Instance):
#   Search Instance (this): ZincSearch + Flask + Nginx + lightweight crawlers
#   Crawler Instance: Common Crawl + Wikipedia + heavy crawling → pushes via API
#
# Why ZincSearch instead of OpenSearch?
#   - OpenSearch: Java-based, 512MB+ RAM, 1GB+ image, 60-90s startup
#   - ZincSearch:  Single Go binary, ~20MB, 256MB RAM, <5s startup
#   - ZincSearch is Elasticsearch-compatible — same _search API
#   - Perfect for free hosting (Render free tier = 512MB RAM)

FROM ubuntu:22.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# ─── Install system dependencies ──────────────────────────────────────────
# NO Java, NO JRE — ZincSearch is a single Go binary!
# gettext-base provides envsubst for nginx config templating
RUN apt-get update && apt-get install -y \
    curl wget \
    python3 python3-pip \
    nginx supervisor cron \
    gettext-base \
    && rm -rf /var/lib/apt/lists/*

# ─── Install ZincSearch ──────────────────────────────────────────────────
# Single ~20MB Go binary — no JVM, no Java, no 512MB heap
# v0.4.10 is the latest stable release
RUN mkdir -p /opt/zincsearch-bin && \
    curl -sSL https://github.com/zincsearch/zincsearch/releases/download/v0.4.10/zincsearch_0.4.10_linux_x86_64.tar.gz \
    | tar -xz -C /opt/zincsearch-bin && \
    chmod +x /opt/zincsearch-bin/zincsearch

# ─── Install Python dependencies ─────────────────────────────────────────
RUN pip3 install --no-cache-dir flask feedparser beautifulsoup4 lxml gunicorn

# ─── Create directories ─────────────────────────────────────────────────
RUN mkdir -p /opt/eesha/templates /opt/eesha-scripts /var/log/eesha /var/log/supervisor /data

# ─── Copy Flask App (Custom Search UI & API) — shared with huggingface/ ──
COPY huggingface/app.py /opt/eesha/app.py
COPY huggingface/templates/index.html /opt/eesha/templates/index.html
COPY huggingface/templates/results.html /opt/eesha/templates/results.html

# ─── Copy Configuration Files — Render-specific ─────────────────────────
COPY render/supervisord.conf /etc/supervisor/conf.d/eesha-search.conf
COPY render/nginx.conf /etc/nginx/sites-available/default.template
COPY render/entrypoint.sh /opt/eesha/entrypoint.sh
COPY render/bootstrap.sh /opt/eesha/bootstrap.sh
COPY render/crontab /etc/cron.d/eesha-cron

# ─── Copy ALL Python scripts (including common_crawl_import) ────────────
# On Search Instance: common_crawl runs in background with limits
# On Crawler Instance: common_crawl runs as primary process
COPY huggingface/scripts/common_crawl_import.py /opt/eesha-scripts/common_crawl_import.py
COPY huggingface/scripts/lightweight_crawler.py /opt/eesha-scripts/lightweight_crawler.py
COPY huggingface/scripts/seed_generator.py /opt/eesha-scripts/seed_generator.py
COPY huggingface/scripts/multimedia_extract.py /opt/eesha-scripts/multimedia_extract.py
COPY huggingface/scripts/wikipedia_import.py /opt/eesha-scripts/wikipedia_import.py
COPY huggingface/scripts/rss_indexer.py /opt/eesha-scripts/rss_indexer.py

# ─── Setup permissions ──────────────────────────────────────────────────
RUN chmod +x /opt/eesha/entrypoint.sh && \
    chmod +x /opt/eesha/bootstrap.sh && \
    chmod +x /opt/zincsearch-bin/zincsearch && \
    chmod 0644 /etc/cron.d/eesha-cron && \
    touch /var/log/eesha/cron.log && \
    crontab /etc/cron.d/eesha-cron && \
    chown -R www-data:www-data /var/log/nginx && \
    chown -R 1000:1000 /data && \
    rm -f /etc/nginx/sites-enabled/default

# ─── Environment ────────────────────────────────────────────────────────
# ZincSearch auth (default credentials — can be changed via env)
ENV ZINC_FIRST_ADMIN_USER=admin
ENV ZINC_FIRST_ADMIN_PASSWORD=Complexpass#123
ENV ZINC_SEARCH_URL=http://localhost:4080
# Legacy compat — app.py reads OPENSEARCH_URL, point it at ZincSearch
ENV OPENSEARCH_URL=http://localhost:4080
ENV PORT=10000
ENV FLASK_PORT=8888
# API key for Crawler Instance authentication (set this on Render!)
ENV EESHA_API_KEY=

# Render provides PORT, nginx listens on it
EXPOSE 10000

# Data volume for ZincSearch persistence
VOLUME ["/data"]

ENTRYPOINT ["/opt/eesha/entrypoint.sh"]
