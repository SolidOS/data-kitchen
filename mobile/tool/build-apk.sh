#!/usr/bin/env bash
# One command → the single installable APK a user downloads and runs.
#
# Runs the whole Android release chain in order, then leaves the APK at the
# conventional Flutter path AND copies it into the repo's release/ dir (next to
# the desktop electron-builder artifacts) with a product-named filename:
#
#     release/Solid_Data_Kitchen-<version>-android.apk
#
# Steps (each is individually re-runnable; this just sequences them):
#   1. fetch-libnode.sh         — the nodejs-mobile runtime (.so), one-time/idempotent
#   2. npm run build            — the dk frontend bundle (dist/dk.bundle.js)
#   3. build-compiled-config.sh — the mobile CSS/pivot config (skipped if already built)
#   4. prepare-node-project.sh  — stage assets/nodejs-project + the .nmz tarballs
#   5. flutter build apk        — the APK itself
#
# Usage:
#   bash mobile/tool/build-apk.sh              # release APK (default)
#   bash mobile/tool/build-apk.sh --debug      # debug APK (faster, for dev)
#   FORCE_CONFIG=1 bash mobile/tool/build-apk.sh   # rebuild the CSS config too
#
# Prereqs (see mobile/README.md): Flutter SDK, Android SDK + NDK 28.2.13676358,
# a JDK 21 (auto-uses ~/jdk-21 if JAVA_HOME is unset).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MOBILE="$(dirname "$HERE")"
REPO="$(dirname "$MOBILE")"

MODE="release"
case "${1:-}" in
  --debug)   MODE="debug" ;;
  --release) MODE="release" ;;
  "")        ;;
  *) echo "usage: build-apk.sh [--release|--debug]"; exit 2 ;;
esac

# Flutter's Gradle build needs a JDK; the known-good one here is Temurin 21.
# Only impose it when the caller hasn't set their own JAVA_HOME.
if [ -z "${JAVA_HOME:-}" ] && [ -d "$HOME/jdk-21" ]; then
  export JAVA_HOME="$HOME/jdk-21"
  export PATH="$JAVA_HOME/bin:$PATH"
  echo "[build-apk] JAVA_HOME -> $JAVA_HOME"
fi

# Pick a NON-SNAP Flutter. The snap build (/snap/bin/flutter) is strictly
# confined and leaks its host libstdc++ headers
# (/snap/flutter/current/usr/include/c++/9) into the NDK cross-compile, so
# uintptr_t/V8 Address resolve to 32-bit and node_flutter's native lib fails to
# compile ("cast from pointer to smaller type ... loses information"). A normal
# git/tarball Flutter compiles the NDK code cleanly. Prefer FLUTTER_ROOT, then
# ~/flutter, over a snap-resolved flutter.
is_snap_flutter() {                       # snap either by symlink path or wrapper target
  case "$1" in /snap/*) return 0 ;; esac
  case "$(readlink -f "$1" 2>/dev/null)" in /usr/bin/snap|*/snap/*) return 0 ;; esac
  return 1
}
FLUTTER="$(command -v flutter || true)"
if [ -z "$FLUTTER" ] || is_snap_flutter "$FLUTTER"; then
  alt=""
  for c in "${FLUTTER_ROOT:-}/bin/flutter" "$HOME/flutter/bin/flutter"; do
    [ -x "$c" ] && ! is_snap_flutter "$c" && { alt="$c"; break; }
  done
  if [ -n "$alt" ]; then
    FLUTTER="$alt"; export PATH="$(dirname "$alt"):$PATH"
    echo "[build-apk] avoiding snap Flutter; using $FLUTTER"
  elif [ -n "$FLUTTER" ]; then
    echo "[build-apk] WARNING: only the SNAP Flutter is available — its confined host"
    echo "            headers break the NDK native build (node_flutter v8-internal.h)."
    echo "            Install a non-snap Flutter (git/tarball) or set FLUTTER_ROOT."
  fi
fi
[ -n "$FLUTTER" ] || { echo "ERROR: flutter not found on PATH"; exit 1; }

# Gradle's Flutter plugin locates the SDK via flutter.sdk in local.properties,
# NOT via which `flutter` we invoke — so a snap path pinned there leaks the snap
# engine/headers into the NDK build even when we run a non-snap flutter. Repoint
# it to the flutter we actually selected (only when that one is non-snap).
if ! is_snap_flutter "$FLUTTER"; then
  FROOT="$(cd "$(dirname "$FLUTTER")/.." && pwd)"
  LP="$MOBILE/android/local.properties"
  if [ -f "$LP" ] && grep -q '^flutter.sdk=' "$LP" && ! grep -qx "flutter.sdk=$FROOT" "$LP"; then
    echo "[build-apk] repointing flutter.sdk -> $FROOT (was: $(grep '^flutter.sdk=' "$LP" | cut -d= -f2-))"
    sed -i "s|^flutter.sdk=.*|flutter.sdk=$FROOT|" "$LP"
  fi
fi

echo "[build-apk] === 1/5  nodejs-mobile runtime ==="
bash "$MOBILE/tool/fetch-libnode.sh"

echo "[build-apk] === 2/5  dk frontend bundle (npm run build) ==="
( cd "$REPO" && npm run build )

echo "[build-apk] === 3/5  mobile CSS/pivot config ==="
CONFIG="$REPO/pivot/dist/create-app-mobile.cjs"
if [ "${FORCE_CONFIG:-0}" = "1" ] || [ ! -f "$CONFIG" ]; then
  bash "$REPO/pivot/build-compiled-config.sh" mobile
else
  echo "[build-apk] reusing $CONFIG (FORCE_CONFIG=1 to rebuild)"
fi

echo "[build-apk] === 4/5  stage node project + bundles ==="
bash "$MOBILE/tool/prepare-node-project.sh"

echo "[build-apk] === 5/5  flutter build apk --$MODE ==="
echo "[build-apk] flutter: $FLUTTER"
# DK_VERSION feeds the in-app update check (lib/main.dart kAppVersion) — the
# same package.json version that names the release artifact below.
DK_VERSION="$(node -p "require('$REPO/package.json').version" 2>/dev/null || echo 0.0.0)"
# Stamp the Android package metadata with the same version: --build-name →
# versionName, --build-number → versionCode (pubspec's 1.0.0 default would
# show otherwise). versionCode must be a monotonic integer: major*10000 +
# minor*100 + patch (2.1.6 → 20106) — keep this formula or upgrades break.
DK_VERSION_CODE="$(node -p "(([a,b,c])=>a*10000+b*100+c)('$DK_VERSION'.split('.').map(Number))" 2>/dev/null || echo 1)"
echo "[build-apk] version $DK_VERSION (versionCode $DK_VERSION_CODE)"
( cd "$MOBILE" && "$FLUTTER" pub get && "$FLUTTER" build apk "--$MODE" \
    --dart-define=DK_VERSION="$DK_VERSION" \
    --build-name="$DK_VERSION" --build-number="$DK_VERSION_CODE" )

APK="$MOBILE/build/app/outputs/flutter-apk/app-$MODE.apk"
[ -f "$APK" ] || { echo "ERROR: expected APK not found at $APK"; exit 1; }

# Copy into release/ with a product-named filename, matching the desktop
# electron-builder output dir (build.directories.output = "release").
VERSION="$(node -p "require('$REPO/package.json').version" 2>/dev/null || echo 0.0.0)"
OUT="$REPO/release/Solid_Data_Kitchen-${VERSION}-android.apk"
mkdir -p "$REPO/release"
cp "$APK" "$OUT"

echo
echo "[build-apk] DONE ($MODE)"
echo "  flutter output : $APK"
echo "  release copy   : $OUT  ($(du -h "$OUT" | cut -f1))"
if [ "$MODE" = "release" ]; then
  echo "  NOTE: signed with the DEBUG key (android/app/build.gradle.kts has no"
  echo "        release signing config) — installable by sideload, NOT Play-Store"
  echo "        ready. Add a keystore + signingConfig for a store build."
fi
