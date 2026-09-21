#!/bin/bash
# Audit loop: 50 passes of tests + types + lint + build + route/API/data checks.
# Logs only; commits nothing (code changes come from the builder).
# Usage: nohup scripts/audit_loop.sh >/tmp/opencode/spectrahunt-logs/audit.log 2>&1 &
cd /home/himel/Documents/spectrahunt || exit 1
LOG=/tmp/opencode/spectrahunt-logs/audit.log
WEB=NOT_SET
for i in $(seq 1 50); do
  echo "=== audit pass $i $(date '+%H:%M:%S') ===" | tee -a "$LOG"
  .venv/bin/python -m pytest backend/tests/ -q 2>&1 | tail -1 | tee -a "$LOG"
  (cd spectrahunt-web && (npm run test 2>&1 | tail -3)) | tee -a "$LOG"
  (cd spectrahunt-web && npx tsc --noEmit 2>&1 | grep -c error | xargs echo "tsc errors:") | tee -a "$LOG"
  (cd spectrahunt-web && npx eslint src 2>&1 | tail -1) | tee -a "$LOG"
  ok=0; fail=0
  for p in "" "sky/" "candidates/" "about/" "blink/3i-atlas/" "coverage.json"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/$p" --max-time 10)
    if [ "$code" = "200" ]; then ok=$((ok+1)); else fail=$((fail+1)); echo "ROUTE FAIL: /$p -> $code" | tee -a "$LOG"; fi
  done
  api=$(curl -s http://localhost:8000/health --max-time 10)
  echo "routes ok=$ok fail=$fail api=$api" | tee -a "$LOG"
  cells=$(curl -s http://localhost:3000/coverage.json --max-time 15 | .venv/bin/python -c "import json,sys; print(len(json.load(sys.stdin)['cells']))" 2>/dev/null || echo "?")
  pngs=$(ls spectrahunt-web/public/cutouts/*.png 2>/dev/null | wc -l)
  echo "data: cells=$cells pngs=$pngs" | tee -a "$LOG"
  [ "$i" -lt 50 ] && sleep 240
done
echo "=== audit loop done $(date '+%H:%M:%S') ===" | tee -a "$LOG"
