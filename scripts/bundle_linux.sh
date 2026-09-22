#!/usr/bin/env bash
# Build the Linux desktop bundles (AppImage + deb), working around two
# Arch-specific linuxdeploy issues:
#  1. its bundled `strip` can't read `.relr.dyn` sections  -> NO_STRIP=1
#  2. the gtk plugin hard-requires a gdk-pixbuf loaders dir, which Arch
#     doesn't ship -> shadow .pc file pointing it at an empty stub dir
#     (harmless: this is a WebView app; CI/Ubuntu builds canonical artifacts)
# Usage: bash scripts/bundle_linux.sh   (artifacts land in dist/)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.cargo/bin:$PATH"
export NO_STRIP=1 APPIMAGE_EXTRACT_AND_RUN=1

STUB="$ROOT/.cache/pixbuf-stub"
mkdir -p "$STUB/gdk-pixbuf-2.0/2.10.0/loaders" "$STUB/pc"
touch "$STUB/gdk-pixbuf-2.0/2.10.0/loaders.cache"
sed 's|^gdk_pixbuf_binarydir=.*|gdk_pixbuf_binarydir='"$STUB/gdk-pixbuf-2.0/2.10.0|" /usr/lib/pkgconfig/gdk-pixbuf-2.0.pc \
  > "$STUB/pc/gdk-pixbuf-2.0.pc" 2>/dev/null || true
if [ -f "$STUB/pc/gdk-pixbuf-2.0.pc" ]; then
  export PKG_CONFIG_PATH="$STUB/pc${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
fi

cd "$ROOT/spectrahunt-web" && npm run build
cd "$ROOT/desktop/src-tauri" && npx @tauri-apps/cli build
mkdir -p "$ROOT/dist"
cp target/release/bundle/appimage/*.AppImage target/release/bundle/deb/*.deb "$ROOT/dist/" 2>/dev/null || true
ls -la "$ROOT/dist/"
