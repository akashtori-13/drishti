#!/usr/bin/env python3
"""Static server with hard-refresh semantics.

HTML (unhashed entry points) is served `no-store` so browsers can never show
a stale page after a rebuild. Hashed Next.js assets stay immutable-cached.
Range requests + directory index behave like http.server.
"""
import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 3000


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        path = self.path.split("?", 1)[0]
        if path.endswith(".html") or path.endswith("/") or "." not in path.rsplit("/", 1)[-1]:
            # entry HTML (incl. extensionless SPA-ish paths): always revalidate
            self.send_header("Cache-Control", "no-store, must-revalidate")
        elif "/_next/static/" in path:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        elif path.endswith((".png", ".jpg", ".json")):
            self.send_header("Cache-Control", "public, max-age=3600")
        super().end_headers()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
