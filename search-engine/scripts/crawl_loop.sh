#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Eesha Search - Crawl Loop
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Automates the Nutch crawl cycle: Inject → Generate → Fetch → Parse → Index
# Designed to run every 6 hours via cron job.
#
# Usage:
#   ./crawl_loop.sh                    # Run a full crawl cycle
#   ./crawl_loop.sh --continuous       # Run every 6 hours automatically
#
# Cron Setup (every 6 hours):
#   0 */6 * * * /path/to/search-engine/scripts/crawl_loop.sh >> /var/log/eesha-crawl.log 2>&1
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────
NUTCH_HOME="${NUTCH_HOME:-/root/nutch}"
CRAWL_DIR="${NUTCH_HOME}/crawl"
SEED_DIR="${NUTCH_HOME}/urls"
OPENSEARCH_URL="${OPENSEARCH_URL:-http://opensearch:9200}"
OPENSEARCH_INDEX="${OPENSEARCH_INDEX:-nutch}"
DEPTH="${CRAWL_DEPTH:-3}"              # How deep to follow links
TOP_N="${CRAWL_TOP_N:-50000}"          # Max URLs per round
THREADS="${CRAWL_THREADS:-10}"         # Fetch threads
INTERVAL="${CRAWL_INTERVAL:-21600}"    # 6 hours in seconds

# ─── Logging ──────────────────────────────────────────────────────────────
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Eesha Search - Crawl Cycle Starting"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Step 1: INJECT - Add new seeds ──────────────────────────────────────
log "[1/5] INJECT: Adding new seed URLs to crawl database..."
if [ -f "${SEED_DIR}/seed.txt" ]; then
    nutch inject "${CRAWL_DIR}/crawldb" "${SEED_DIR}/seed.txt"
    log "[1/5] INJECT: ✅ Seeds injected"
else
    log "[1/5] INJECT: ⚠️  No seed.txt found, skipping injection"
fi

# ─── Step 2: GENERATE - Select URLs to fetch ─────────────────────────────
log "[2/5] GENERATE: Selecting URLs to crawl..."
nutch generate "${CRAWL_DIR}/crawldb" "${CRAWL_DIR}/segments" -topN "${TOP_N}" -numFetchers 2
SEGMENT=$(ls -td "${CRAWL_DIR}/segments/"* | head -1)
log "[2/5] GENERATE: ✅ Selected segment: ${SEGMENT}"

# ─── Step 3: FETCH - Download content ────────────────────────────────────
log "[3/5] FETCH: Downloading pages (threads: ${THREADS})..."
nutch fetch "${SEGMENT}" -threads "${THREADS}"
log "[3/5] FETCH: ✅ Pages fetched"

# ─── Step 4: PARSE - Extract content and links ───────────────────────────
log "[4/5] PARSE: Extracting text and links..."
nutch parse "${SEGMENT}"
log "[4/5] PARSE: ✅ Content parsed"

# Update the crawl database with parsed data
nutch updatedb "${CRAWL_DIR}/crawldb" "${SEGMENT}"
log "[4/5] UPDATEDB: ✅ Crawl database updated"

# ─── Step 5: INDEX - Push to OpenSearch ───────────────────────────────────
log "[5/5] INDEX: Pushing indexed data to OpenSearch..."

# Create index if it doesn't exist
if ! curl -sf "${OPENSEARCH_URL}/${OPENSEARCH_INDEX}" > /dev/null 2>&1; then
    log "[5/5] INDEX: Creating OpenSearch index '${OPENSEARCH_INDEX}'..."
    curl -sf -X PUT "${OPENSEARCH_URL}/${OPENSEARCH_INDEX}" \
        -H 'Content-Type: application/json' \
        -d '{
            "mappings": {
                "properties": {
                    "title": { "type": "text", "analyzer": "english" },
                    "url": { "type": "keyword" },
                    "content": { "type": "text", "analyzer": "english" },
                    "description": { "type": "text", "analyzer": "english" },
                    "keywords": { "type": "keyword" },
                    "images": { "type": "keyword" },
                    "videos": { "type": "keyword" },
                    "crawlDate": { "type": "date" },
                    "host": { "type": "keyword" }
                }
            }
        }' > /dev/null
    log "[5/5] INDEX: ✅ Index created"
fi

# Index using Nutch's OpenSearch indexer
nutch index "${CRAWL_DIR}/crawldb" "${CRAWL_DIR}/linkdb" "${SEGMENT}" \
    -opensearchUrl "${OPENSEARCH_URL}" \
    -opensearchIndex "${OPENSEARCH_INDEX}"
log "[5/5] INDEX: ✅ Data indexed to OpenSearch"

# ─── Cleanup ─────────────────────────────────────────────────────────────
log "[CLEANUP] Removing processed segments..."
nutch mergesegs "${CRAWL_DIR}/merged_segments" -dir "${CRAWL_DIR}/segments" -filter
log "[CLEANUP] ✅ Segments merged"

# ─── Stats ────────────────────────────────────────────────────────────────
DOC_COUNT=$(curl -sf "${OPENSEARCH_URL}/${OPENSEARCH_INDEX}/_count" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count','?'))" 2>/dev/null || echo "?")
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Crawl cycle complete! Index now contains ${DOC_COUNT} documents"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Continuous Mode ─────────────────────────────────────────────────────
if [ "${1:-}" = "--continuous" ]; then
    log "Sleeping ${INTERVAL}s until next cycle..."
    sleep "${INTERVAL}"
    exec "$0" --continuous
fi
