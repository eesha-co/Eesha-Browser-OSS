#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Wikipedia Import Loop Wrapper
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Runs wikipedia_import.py repeatedly with a delay between runs.
# Each run imports up to 100K articles (resumable via state file).
# After completing, waits 6 hours before running again.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LOOP_INTERVAL="${WIKI_INTERVAL:-21600}"  # 6 hours default

while true; do
    echo "[WIKI-LOOP] Starting Wikipedia import cycle..."
    python3 /opt/eesha-scripts/wikipedia_import.py --limit 100000
    
    EXIT_CODE=$?
    if [ $EXIT_CODE -ne 0 ]; then
        echo "[WIKI-LOOP] Import failed with exit code $EXIT_CODE"
        echo "[WIKI-LOOP] Waiting 5 minutes before retry..."
        sleep 300
    else
        echo "[WIKI-LOOP] Import completed successfully"
        echo "[WIKI-LOOP] Next cycle in ${LOOP_INTERVAL}s ($((LOOP_INTERVAL / 3600))h)"
        sleep $LOOP_INTERVAL
    fi
done
