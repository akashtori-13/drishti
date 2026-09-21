#!/bin/bash
# Overnight build-check loop: merge census -> indexer follow-up -> rebuild ->
# verify -> commit-if-changed. 6 passes x ~10 min. Logs to overnight.log.
cd /home/himel/Documents/spectrahunt || exit 1
LOG=/tmp/opencode/spectrahunt-logs/overnight.log
export NEXT_PUBLIC_DATA_MODE=live NEXT_PUBLIC_API_URL=http://localhost:8000

for i in $(seq 1 6); do
  echo "=== pass $i $(date '+%H:%M:%S') ===" | tee -a "$LOG"

  # 1. merge census shards -> coverage.json (never regress cell count)
  BEFORE=$(.venv/bin/python -c "import json; print(len(json.load(open('spectrahunt-web/public/coverage.json'))['cells']))" 2>/dev/null || echo 0)
  cp spectrahunt-web/public/coverage.json /tmp/opencode/coverage.bak 2>/dev/null
  .venv/bin/python scripts/sky_census.py --merge 2>&1 | tail -2 | tee -a "$LOG"
  AFTER=$(.venv/bin/python -c "import json; print(len(json.load(open('spectrahunt-web/public/coverage.json'))['cells']))" 2>/dev/null || echo 0)
  if [ "$AFTER" -lt "$BEFORE" ]; then
    echo "merge regressed ($BEFORE -> $AFTER); restoring backup" | tee -a "$LOG"
    cp /tmp/opencode/coverage.bak spectrahunt-web/public/coverage.json
  fi

  # 2. indexer follow-up: fill any png:null fields if indexer idle
  if ! pgrep -f "[b]uild_showcases" > /dev/null; then
    MISSING=$(.venv/bin/python -c "
import json, glob
for f in sorted(glob.glob('spectrahunt-web/public/showcases/*.json')):
    d = json.load(open(f))
    if any(not e.get('png') for e in d.get('epochs', [])):
        print(d['id'])
" 2>/dev/null)
    if [ -n "$MISSING" ]; then
      echo "indexer follow-up for: $MISSING" | tee -a "$LOG"
      (for sid in $MISSING; do
        timeout 900 .venv/bin/python scripts/build_showcases.py --only "$sid" --size 0.15 --timeout 120 >> "$LOG" 2>&1
      done) &
    else
      echo "all showcase PNGs filled" | tee -a "$LOG"
    fi
  else
    echo "indexer still running" | tee -a "$LOG"
  fi

  # 3. rebuild
  (cd spectrahunt-web && npm run build 2>&1 | tail -2) | tee -a "$LOG"

  # 4. verify (routes, data, api, tests)
  CELLS=$(curl -s http://localhost:3000/coverage.json --max-time 15 | .venv/bin/python -c "import json,sys; print(len(json.load(sys.stdin)['cells']))" 2>/dev/null || echo "?")
  PNGS=$(ls spectrahunt-web/public/cutouts/*.png 2>/dev/null | wc -l)
  API=$(curl -s http://localhost:8000/api/showcases --max-time 15 | .venv/bin/python -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
  TESTS=$(.venv/bin/python -m pytest backend/tests/ -q 2>&1 | tail -1)
  echo "verify: cells=$CELLS pngs=$PNGS api_showcases=$API tests=$TESTS" | tee -a "$LOG"

  # 5. commit if changed
  git add -A 2>/dev/null
  if git diff --cached --quiet; then
    echo "no changes to commit" | tee -a "$LOG"
  else
    git commit -m "overnight pass $i: ${CELLS} cells, ${PNGS} cutouts" 2>&1 | tail -1 | tee -a "$LOG"
  fi

  [ "$i" -lt 6 ] && sleep 600
done
echo "=== overnight loop done $(date '+%H:%M:%S') ===" | tee -a "$LOG"
