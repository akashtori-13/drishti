#!/usr/bin/env python3
"""One source builds all: web, Android, desktop — from spectrahunt-web/out.

Usage:
    python scripts/release.py [--version X.Y.Z] [--skip-www] [--skip-android] [--skip-desktop]

- version truth: spectrahunt-web/package.json (+ desktop Cargo.toml mirror)
- web: npm run build -> out/ (+ out/build-info.json stamp)
- android: cap sync + gradlew assembleDebug (+ assembleRelease when signed)
- desktop: tauri build (nsis + appimage + deb; Windows via CI, Linux locally)
- artifacts collected into dist/ (git-ignored) with versioned names

Toolchain steps skip gracefully when SDKs are absent (CI provides them).
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
WEB = ROOT / "spectrahunt-web"
PKG = WEB / "package.json"
CARGO = ROOT / "desktop" / "src-tauri" / "Cargo.toml"
DIST = ROOT / "dist"


def run(cmd, cwd=None, env=None, check=True):
    print(f"$ {' '.join(str(c) for c in cmd)}", flush=True)
    return subprocess.run(cmd, cwd=cwd or ROOT, env=env or os.environ.copy(), check=check)


def read_version() -> str:
    return json.loads(PKG.read_text())["version"]


def bump_version(v: str) -> None:
    if not re.fullmatch(r"\d+\.\d+\.\d+", v):
        raise SystemExit(f"bad version: {v!r} (want X.Y.Z)")
    doc = json.loads(PKG.read_text())
    doc["version"] = v
    PKG.write_text(json.dumps(doc, indent=2) + "\n")
    for path, pat in [
        (CARGO, r'^(version = ")\d+\.\d+\.\d+(")'),
        (ROOT / "desktop" / "src-tauri" / "tauri.conf.json", r'^(  "version": ")\d+\.\d+\.\d+(")'),
    ]:
        if path.exists():
            text = path.read_text()
            text, n = re.subn(pat, rf'\g<1>{v}\g<2>', text, count=1, flags=re.M)
            assert n == 1, f"version pattern not found in {path}"
            path.write_text(text)
    major, minor, patch = (int(x) for x in v.split('.'))
    gradle = WEB / "android" / "app" / "build.gradle"
    if gradle.exists():
        text = gradle.read_text()
        text, n1 = re.subn(r'versionCode \d+', f'versionCode {major * 10000 + minor * 100 + patch}', text, count=1)
        text, n2 = re.subn(r'versionName "\d+\.\d+\.\d+"', f'versionName "{v}"', text, count=1)
        assert n1 == 1 and n2 == 1, f"version pattern not found in {gradle}"
        gradle.write_text(text)
    print(f"version -> {v}")


def data_counts() -> dict:
    def count(pat):
        return len(list((WEB / "public").glob(pat)))

    epochs = pngs = 0
    for f in (WEB / "public" / "showcases").glob("*.json"):
        try:
            eps = json.loads(f.read_text()).get("epochs", [])
        except Exception:
            eps = []
        epochs += len(eps)
        pngs += sum(1 for e in eps if e.get("png"))
    return {
        "fields": len(list((WEB / "public" / "showcases").glob("*.json"))),
        "epochs": epochs,
        "epoch_pngs": pngs,
        "reports": count("reports/*.json"),
        "cutouts": count("cutouts/*"),
    }


def build_web(version: str) -> None:
    run(["npm", "run", "build"], cwd=WEB)
    try:
        rev = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    except Exception:
        rev = "unknown"
    info = {"app": "DRISHTI", "version": version, "commit": rev, **data_counts()}
    (WEB / "out" / "build-info.json").write_text(json.dumps(info, indent=2))
    print(f"web built: {info}")


def have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def build_android(version: str) -> None:
    if not (WEB / "android" / "gradlew").exists():
        print("android: platform missing, skipping (run: npx cap add android)")
        return
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or str(Path.home() / "Android" / "Sdk")
    if not Path(sdk, "platform-tools").exists():
        print(f"android: no SDK at {sdk}, skipping (CI builds the APK)")
        return
    env = os.environ.copy()
    env["ANDROID_HOME"] = env["ANDROID_SDK_ROOT"] = sdk
    # Gradle 8.x needs a Java 17-23 runtime; system Java may be newer.
    if not env.get("JAVA_HOME"):
        cands = sorted(Path.home().glob("jdks/jdk-2*")) or sorted(Path.home().glob("jdks/jdk-17*"))
        if cands:
            env["JAVA_HOME"] = str(cands[-1])
            env["PATH"] = f"{env['JAVA_HOME']}/bin:{env['PATH']}"
            print(f"android: JAVA_HOME={env['JAVA_HOME']}")
    run(["npx", "cap", "sync", "android"], cwd=WEB, env=env)
    run(["./gradlew", "assembleDebug", "--no-daemon"], cwd=WEB / "android", env=env)
    DIST.mkdir(exist_ok=True)
    for apk in (WEB / "android" / "app" / "build" / "outputs" / "apk" / "debug").glob("*.apk"):
        dest = DIST / f"drishti-{version}-debug.apk"
        shutil.copy(apk, dest)
        print(f"android APK -> {dest} ({dest.stat().st_size // 1024} KB)")
    # signed release when the keystore env is present (played manually for
    # v3.1.0; scripted so future ships don't rediscover it — audit O5).
    # DRISHTI_* primary (rebrand), STELLAR_* fallback (legacy + CI docs).
    def _env(*names):
        for n in names:
            v = env.get(n) or os.environ.get(n)
            if v:
                return v
        return None
    ks = {"STELLAR_KEYSTORE_FILE": _env("DRISHTI_KEYSTORE_FILE", "STELLAR_KEYSTORE_FILE"),
          "STELLAR_KEYSTORE_PASSWORD": _env("DRISHTI_KEYSTORE_PASSWORD", "STELLAR_KEYSTORE_PASSWORD"),
          "STELLAR_KEY_ALIAS": _env("DRISHTI_KEY_ALIAS", "STELLAR_KEY_ALIAS") or "stellar",
          "STELLAR_KEY_PASSWORD": _env("DRISHTI_KEY_PASSWORD", "STELLAR_KEY_PASSWORD")}
    if ks["STELLAR_KEYSTORE_FILE"] and ks["STELLAR_KEYSTORE_PASSWORD"] \
            and ks["STELLAR_KEY_PASSWORD"] \
            and Path(str(ks["STELLAR_KEYSTORE_FILE"])).exists():
        env.update({k: v for k, v in ks.items() if v})
        run(["./gradlew", "assembleRelease", "--no-daemon"], cwd=WEB / "android", env=env)
        for apk in (WEB / "android" / "app" / "build" / "outputs" / "apk" / "release").glob("*.apk"):
            dest = DIST / f"drishti-{version}.apk"
            shutil.copy(apk, dest)
            print(f"android signed APK -> {dest} ({dest.stat().st_size // 1024} KB)")
    else:
        print("android: no keystore env, skipping signed release (debug only)")


def build_desktop(version: str) -> None:
    cargo = str(Path.home() / ".cargo" / "bin" / "cargo")
    if not Path(cargo).exists() and not have("cargo"):
        print("desktop: no cargo toolchain, skipping (CI builds Windows/Linux)")
        return
    env = os.environ.copy()
    env["PATH"] = f"{Path.home() / '.cargo' / 'bin'}:{env['PATH']}"
    run([cargo, "install", "tauri-cli", "--locked"], cwd=ROOT, check=False)
    run(["npx", "@tauri-apps/cli", "build"], cwd=ROOT / "desktop" / "src-tauri", env=env)
    DIST.mkdir(exist_ok=True)
    bundle = ROOT / "desktop" / "src-tauri" / "target" / "release" / "bundle"
    exts = {".AppImage", ".deb", ".exe", ".msi"}
    found = 0
    for f in bundle.rglob("*"):
        if f.is_file() and (f.suffix in exts or ".AppImage" in f.name):
            dest = DIST / f"drishti-{version}-{f.name}"
            shutil.copy(f, dest)
            print(f"desktop -> {dest}")
            found += 1
    if not found:
        print("desktop: build ran but no bundles found")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default=None)
    ap.add_argument("--skip-www", action="store_true")
    ap.add_argument("--skip-android", action="store_true")
    ap.add_argument("--skip-desktop", action="store_true")
    args = ap.parse_args()
    if args.version:
        bump_version(args.version)
    version = read_version()
    print(f"=== DRISHTI release {version} ===", flush=True)
    if not args.skip_www:
        build_web(version)
    if not args.skip_android:
        build_android(version)
    if not args.skip_desktop:
        build_desktop(version)
    print("=== done ===")


if __name__ == "__main__":
    sys.exit(main())
