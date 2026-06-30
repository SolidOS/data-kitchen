#!/usr/bin/env bash
# Fetch the nodejs-mobile prebuilt (libnode.so + headers) into the vendored
# node_flutter plugin. Required once after a clean clone (the ~116MB .so files
# are gitignored). node_flutter ships NO Node runtime — we supply this.
#
# We use the COMMUNITY fork (nodejs-mobile/nodejs-mobile) at Node 18.20.4 — the
# minimum CSS 7.x needs. (node_flutter's README points at the older janeasystems
# repo, which is Node 16 and won't run CSS.)
#
#   bash mobile/tool/fetch-libnode.sh
set -euo pipefail

VER=v18.20.4
URL="https://github.com/nodejs-mobile/nodejs-mobile/releases/download/$VER/nodejs-mobile-$VER-android.zip"
HERE="$(cd "$(dirname "$0")" && pwd)"
MOBILE="$(dirname "$HERE")"
LIBNODE="$MOBILE/third_party/node_flutter/android/libnode"

if [ -f "$LIBNODE/bin/arm64-v8a/libnode.so" ]; then
  echo "[fetch-libnode] already present at $LIBNODE — nothing to do"
  exit 0
fi

TMP="$(mktemp -d)"
echo "[fetch-libnode] downloading $URL (~57MB)…"
curl -fL -o "$TMP/nm.zip" "$URL"
echo "[fetch-libnode] extracting…"
unzip -q "$TMP/nm.zip" -d "$TMP/nm"

mkdir -p "$LIBNODE"
cp -r "$TMP/nm/bin" "$LIBNODE/bin"
cp -r "$TMP/nm/include" "$LIBNODE/include"
# We build only the phone ABIs (no x86_64 emulator). Drop x86_64 to match the
# plugin's android/build.gradle abiFilters; remove this line to keep it.
rm -rf "$LIBNODE/bin/x86_64"

rm -rf "$TMP"
echo "[fetch-libnode] done:"
grep -E '#define NODE_(MAJOR|MINOR|PATCH)_VERSION' "$LIBNODE/include/node/node_version.h" | sed 's/^/  /'
ls "$LIBNODE/bin"
