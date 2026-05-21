# Eesha Crawler — Crawler Instance for Render.com
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# This is the CRAWLER INSTANCE that pushes data to the Search Instance.
# It does NOT run ZincSearch or Nginx — all 512MB RAM is for crawling!
#
# Required Environment Variables (set on Render):
#   EESHA_SEARCH_URL  — URL of the Search Instance
#   EESHA_API_KEY     — Shared secret for authentication
#
# Architecture:
#   1. Health Server — Minimal HTTP server for Render health checks
#   2. Common Crawl — Crawls Tranco top-10K domains (50K+ pages)
#   3. Wikipedia — Imports 100K Wikipedia abstracts (loops every 6h)
#   4. Web Crawler — Continuous crawling with depth 3
#   5. RSS Indexer — Indexes news feeds every 15 minutes

FROM python:3.11-slim

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl wget \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir feedparser beautifulsoup4 lxml

# Create directories
RUN mkdir -p /opt/eesha-crawler /opt/eesha-scripts /var/log/supervisor

# Copy health server and utility scripts
COPY crawler/health_server.py /opt/eesha-crawler/health_server.py
COPY crawler/remote_push.py /opt/eesha-crawler/remote_push.py
COPY crawler/loop_wikipedia.sh /opt/eesha-crawler/loop_wikipedia.sh

# Copy all crawler scripts
COPY huggingface/scripts/common_crawl_import.py /opt/eesha-scripts/common_crawl_import.py
COPY huggingface/scripts/lightweight_crawler.py /opt/eesha-scripts/lightweight_crawler.py
COPY huggingface/scripts/seed_generator.py /opt/eesha-scripts/seed_generator.py
COPY huggingface/scripts/multimedia_extract.py /opt/eesha-scripts/multimedia_extract.py
COPY huggingface/scripts/wikipedia_import.py /opt/eesha-scripts/wikipedia_import.py
COPY huggingface/scripts/rss_indexer.py /opt/eesha-scripts/rss_indexer.py

# Copy supervisor config and entrypoint
COPY crawler/supervisord.conf /etc/supervisor/conf.d/eesha-crawler.conf
COPY crawler/entrypoint.sh /opt/eesha-crawler/entrypoint.sh

# Setup permissions
RUN chmod +x /opt/eesha-crawler/entrypoint.sh && \
    chmod +x /opt/eesha-crawler/loop_wikipedia.sh

# ─── Environment ────────────────────────────────────────────────────────
ENV ZINC_FIRST_ADMIN_USER=admin
ENV ZINC_FIRST_ADMIN_PASSWORD=Complexpass#123
# These MUST be set on Render:
ENV EESHA_SEARCH_URL=
ENV EESHA_API_KEY=
# Render provides PORT automatically for web services
# OPENSEARCH_URL will be set by entrypoint.sh based on EESHA_SEARCH_URL
ENV OPENSEARCH_URL=http://localhost:4080

# Render provides PORT automatically, we just need to listen on it
EXPOSE 10000

ENTRYPOINT ["/opt/eesha-crawler/entrypoint.sh"]
