#!/usr/bin/env bash
# Assemble android/app/src/main/assets/nodejs-project from the committed
# nodejs-src/ plus the dk pivot server (dist/create-app.cjs + node_modules).
#
# node_modules ships as ONE gzipped tar (extracted on-device by untar.cjs on
# first run) instead of ~19.5k individual asset files, so builds stay fast and
# the first-run copy is one file, not thousands.
#
# Run from anywhere; paths are resolved relative to this script.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MOBILE="$(dirname "$HERE")"
REPO="$(dirname "$MOBILE")"
PIVOT="$REPO/pivot"
SRC="$MOBILE/nodejs-src"
ASSETS="$MOBILE/android/app/src/main/assets"
PROJ="$ASSETS/nodejs-project"

echo "[prepare] repo=$REPO"
# Mobile uses the mashlib-databrowser variant of the compiled config
# (build with: bash pivot/build-compiled-config.sh mobile).
CREATE_APP="$PIVOT/dist/create-app-mobile.cjs"
[ -f "$CREATE_APP" ] || { echo "ERROR: $CREATE_APP missing — run: bash pivot/build-compiled-config.sh mobile"; exit 1; }
[ -d "$PIVOT/node_modules" ] || { echo "ERROR: $PIVOT/node_modules missing"; exit 1; }

echo "[prepare] wiping $PROJ"
rm -rf "$PROJ"
mkdir -p "$PROJ/dist"

echo "[prepare] copying node source + compiled CSS config + patches"
cp "$SRC/main.js" "$SRC/untar.cjs" "$SRC/proxy.js" "$SRC/router.js" "$SRC/connect-agent.js" "$SRC/package.json" "$PROJ/"
# Shared router/proxy core (server-core.cjs) lives at the repo root; router.js and
# proxy.js require it as a sibling ('./server-core.cjs'). Copy the REAL file (not
# the nodejs-src symlink, which would break in the flat bundle).
cp "$REPO/server-core.cjs" "$PROJ/"
cp "$CREATE_APP" "$PROJ/dist/create-app.cjs"
mkdir -p "$PROJ/patches"
cp "$SRC/patches/"*.cjs "$PROJ/patches/"

# --- dk frontend (second frontend, alongside mashlib) -----------------------
# engine.nmz: the read-only dk ENGINE the router serves (sol-components +
# component-interop [dev symlinks -> tar -h to deref], dk's bundle, plugin dist,
# assets). sol-components/dist/vendor self-contains rdflib/solid-ui/etc., so this
# stays ~16MB. Nested node_modules/tests/docs pruned (match electron-builder).
if [ -e "$REPO/dist/dk.bundle.js" ] && [ -e "$REPO/node_modules/sol-components" ]; then
  echo "[prepare] tarring dk engine (engine.nmz)…"
  PLUGIN_DIST=$(cd "$REPO" && ls -d plugins/*/dist 2>/dev/null || true)
  # open-media-player: the media tabs' package since the 2026-07-02 cutover
  # (index.html data-manifest loads node_modules/open-media-player/…) — the
  # engine must carry its manifest + dist bundle + src (runtime-fetched
  # assets: help/about pages, shell fragments). Symlinked in dev like
  # sol-components; tar -h dereferences.
  OMP="node_modules/open-media-player/omp.manifest.json node_modules/open-media-player/dist node_modules/open-media-player/src"
  tar czhf "$PROJ/engine.nmz" -C "$REPO" \
    --exclude='*/node_modules' --exclude='*/.git' --exclude='*/tests' \
    --exclude='*/tests-disabled' --exclude='*/coverage' --exclude='*/docs' \
    --exclude='*/examples' --exclude='*/drafts' --exclude='*/claude' --exclude='*.map' \
    node_modules/sol-components node_modules/component-interop $OMP dist src assets $PLUGIN_DIST
  echo "[prepare] engine.nmz = $(du -h "$PROJ/engine.nmz" | cut -f1)"

  # pod-seed.nmz: dk's app DEFINITION seeded into the pod (index.html at root;
  # everything else under dk-pod/dk/ — matches electron-config/seed.cjs). plugin
  # dist/node_modules are engine, not pod, so prune them.
  echo "[prepare] building dk pod seed (pod-seed.nmz)…"
  SEED="$(mktemp -d)"
  cp "$REPO/index.html" "$SEED/"
  mkdir -p "$SEED/dk-pod/dk"
  for e in dk.manifest.json dokieli.manifest.json ui-data pages help shapes plugins; do
    [ -e "$REPO/$e" ] && cp -rL "$REPO/$e" "$SEED/dk-pod/dk/$e" 2>/dev/null || true
  done
  find "$SEED/dk-pod/dk/plugins" -depth -type d \( -name dist -o -name node_modules \) -exec rm -rf {} + 2>/dev/null || true
  find "$SEED" -name '*.map' -delete 2>/dev/null || true
  tar czf "$PROJ/pod-seed.nmz" -C "$SEED" index.html dk-pod
  rm -rf "$SEED"
  echo "[prepare] pod-seed.nmz = $(du -h "$PROJ/pod-seed.nmz" | cut -f1)"
else
  echo "[prepare] NOTE: dk engine not found (dist/dk.bundle.js or sol-components) — building mashlib-only bundle"
fi
# ----------------------------------------------------------------------------

# `.nmz` (not `.tar.gz`): the Android asset pipeline gunzips & renames a `.gz`
# asset, which breaks node_flutter's copy. `.nmz` is marked noCompress in Gradle
# so the gzipped bytes ship as-is; untar.cjs auto-detects the gzip magic.
# Cached so iterating on the JS source doesn't re-tar 245MB each build; the cache
# is invalidated when pivot/node_modules is newer. Pass FORCE_TAR=1 to rebuild it.
CACHE="$MOBILE/.nmz-cache.nmz"
if [ "${FORCE_TAR:-0}" != "1" ] && [ -f "$CACHE" ] && [ -z "$(find "$PIVOT/node_modules" -newer "$CACHE" -print -quit 2>/dev/null)" ]; then
  echo "[prepare] reusing cached node_modules tarball"
else
  echo "[prepare] tarring node_modules ($(du -sh "$PIVOT/node_modules" | cut -f1))…"
  # GNU tar; long paths handled via 'L' entries which untar.cjs understands.
  tar czf "$CACHE" -C "$PIVOT" node_modules
fi
cp "$CACHE" "$PROJ/node_modules.nmz"
echo "[prepare] node_modules.nmz = $(du -h "$PROJ/node_modules.nmz" | cut -f1)"

echo "[prepare] generating dir.list / file.list (node_flutter fast-copy path)"
( cd "$ASSETS" && find nodejs-project -type d > dir.list && find nodejs-project -type f > file.list )
echo "[prepare] files to copy on-device: $(wc -l < "$ASSETS/file.list")"

echo "[prepare] done. assets/nodejs-project:"
ls -lh "$PROJ"
