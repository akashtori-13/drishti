#!/bin/bash
# Data watcher: commit + push whenever processed data lands.
# Runs until killed. Interval 600s.
cd /home/himel/Documents/spectrahunt || exit 1
LOG=/tmp/opencode/spectrahunt-logs/watcher.log
while true; do
  sleep 600
  echo "=== watch $(date '+%H:%M:%S') ===" >> "$LOG"
  git add -A 2>/dev/null
  if git diff --cached --quiet; then
    echo "no changes" >> "$LOG"
  else
    cells=$(python3 -c "import json; print(len(json.load(open('spectrahunt-web/public/coverage.json'))['cells']))" 2>/dev/null || echo "?")
    pngs=$(ls spectrahunt-web/public/cutouts/*.png spectrahunt-web/public/compare/*.jpg 2>/dev/null | wc -l)
    reps=$(ls spectrahunt-web/public/reports/*.json 2>/dev/null | wc -l)
    git commit -m "data: ${cells} cells, ${pngs} images, ${reps} reports" >> "$LOG" 2>&1
    git push origin main >> "$LOG" 2>&1
    echo "pushed: cells=$cells pngs=$pngs reports=$reps" >> "$LOG"
  fi
done
