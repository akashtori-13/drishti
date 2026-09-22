# SpectraHunt one-source builds: web, mobile, desktop all come from spectrahunt-web/out.
#   make up       local dev (API :8000 + web :3000 live mode)
#   make warm     front-load slow IRSA queries into the SQLite cache
#   make check    backend tests + frontend tests + tsc + eslint + web build
#   make web      production static export -> spectrahunt-web/out
#   make down     stop local servers started by `make up`

PY := .venv/bin/python
WEB := spectrahunt-web

.PHONY: up warm check web down release

up:
	@test -x $(PY) || python3 -m venv .venv
	@$(PY) -m pip install -q -r requirements.txt
	@($(PY) -m backend > /tmp/spectrahunt-backend.log 2>&1 & echo $$! > /tmp/spectrahunt-backend.pid)
	@bash -c 'for i in $$(seq 1 30); do curl -sf http://localhost:8000/health >/dev/null && break; sleep 1; done'
	@(cd $(WEB) && npm install --no-audit --no-fund && NEXT_PUBLIC_DATA_MODE=live NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev -- --port 3000 > /tmp/spectrahunt-web.log 2>&1 & echo $$! > /tmp/spectrahunt-web.pid)
	@echo "API http://localhost:8000/health  web http://localhost:3000"

warm:
	$(PY) scripts/warm_cache.py

check:
	$(PY) -m pytest backend/tests/ -q
	cd $(WEB) && npm test --silent && npx tsc --noEmit && npx eslint src && npm run build

web:
	cd $(WEB) && npm run build

down:
	-@kill $$(cat /tmp/spectrahunt-backend.pid) 2>/dev/null; rm -f /tmp/spectrahunt-backend.pid
	-@kill $$(cat /tmp/spectrahunt-web.pid) 2>/dev/null; rm -f /tmp/spectrahunt-web.pid
	@echo stopped

# release: VERSION=x.y.z www=1 android=1 desktop=1 (parts opt-in; default all)
release:
	$(PY) scripts/release.py $(if $(VERSION),--version $(VERSION),) $(if $(SKIP_WWW),--skip-www,) $(if $(SKIP_ANDROID),--skip-android,) $(if $(SKIP_DESKTOP),--skip-desktop,)
