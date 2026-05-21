# Eesha Search — 100% Independent Search Engine
# Single-container deployment for Hugging Face Spaces
# Stack: ZincSearch (index) + Flask (UI/API) + Nginx (proxy) + Python crawler
# NO external search engines. Only our own crawled & indexed data.
# NO SearXNG — replaced with custom Flask search UI.
#
# Why ZincSearch instead of OpenSearch?
#   - OpenSearch: Java-based, 512MB+ RAM, 1GB+ image, 60-90s startup
#   - ZincSearch:  Single Go binary, ~20MB, 256MB RAM, <5s startup
#   - ZincSearch is Elasticsearch-compatible — same _search API
#   - Perfect for free hosting (HF Spaces free tier = 2CPU/16GB)

FROM ubuntu:22.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# ─── Install system dependencies ──────────────────────────────────────────
# NO Java, NO JRE — ZincSearch is a single Go binary!
RUN apt-get update && apt-get install -y \
    curl wget \
    python3 python3-pip \
    nginx supervisor cron \
    && rm -rf /var/lib/apt/lists/*

# ─── Install ZincSearch ──────────────────────────────────────────────────
# Single ~20MB Go binary — no JVM, no Java, no 512MB heap
RUN curl -sSL https://github.com/zincsearch/zincsearch/releases/download/v0.4.11/zincsearch_0.4.11_Linux_x86_64.tar.gz \
    | tar -xz -C /opt && \
    mv /opt/zincsearch /opt/zincsearch-bin && \
    chmod +x /opt/zincsearch-bin/zincsearch

# ─── Install Python dependencies ─────────────────────────────────────────
RUN pip3 install --no-cache-dir flask feedparser beautifulsoup4 lxml

# ─── Create directories ─────────────────────────────────────────────────
RUN mkdir -p /opt/eesha/templates /opt/eesha-scripts /var/log/eesha /var/log/supervisor /data

# ─── Copy Flask App (Custom Search UI & API) ────────────────────────────
COPY app.py /opt/eesha/app.py
COPY templates/index.html /opt/eesha/templates/index.html
COPY templates/results.html /opt/eesha/templates/results.html

# ─── Copy Configuration Files ───────────────────────────────────────────
COPY supervisord.conf /etc/supervisor/conf.d/eesha-search.conf
COPY nginx.conf /etc/nginx/sites-available/default
COPY entrypoint.sh /opt/eesha/entrypoint.sh
COPY crontab /etc/cron.d/eesha-cron

# Copy Python scripts
COPY scripts/lightweight_crawler.py /opt/eesha-scripts/lightweight_crawler.py
COPY scripts/seed_generator.py /opt/eesha-scripts/seed_generator.py
COPY scripts/multimedia_extract.py /opt/eesha-scripts/multimedia_extract.py
COPY scripts/wikipedia_import.py /opt/eesha-scripts/wikipedia_import.py
COPY scripts/common_crawl_import.py /opt/eesha-scripts/common_crawl_import.py
COPY scripts/rss_indexer.py /opt/eesha-scripts/rss_indexer.py

# ─── Setup permissions ──────────────────────────────────────────────────
RUN chmod +x /opt/eesha/entrypoint.sh && \
    chmod +x /opt/zincsearch-bin/zincsearch && \
    chmod 0644 /etc/cron.d/eesha-cron && \
    crontab /etc/cron.d/eesha-cron && \
    chown -R www-data:www-data /var/log/nginx && \
    chown -R 1000:1000 /data && \
    rm -f /etc/nginx/sites-enabled/default && \
    ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true

# ─── Environment ────────────────────────────────────────────────────────
# ZincSearch auth (default credentials — can be changed via env)
ENV ZINC_FIRST_ADMIN_USER=admin
ENV ZINC_FIRST_ADMIN_PASSWORD=Complexpass#123
ENV ZINC_SEARCH_URL=http://localhost:4080
# Legacy compat — app.py reads OPENSEARCH_URL, point it at ZincSearch
ENV OPENSEARCH_URL=http://localhost:4080
ENV PORT=8888

# HF Spaces requires port 7860
EXPOSE 7860

# Data volume for ZincSearch persistence
VOLUME ["/data"]

ENTRYPOINT ["/opt/eesha/entrypoint.sh"]
