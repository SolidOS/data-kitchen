#!/bin/bash
# Regenerates pivot/dist/create-app.cjs (the pre-compiled server config).
# Run from the repo root after changing pivot-config/*.json or upgrading
# @solid/pivot:  bash pivot/build-compiled-config.sh
#
# The compile runs in an isolated copy under /tmp because componentsjs'
# module scan walks ancestor node_modules — inside the repo it would see the
# file:-linked sol-components/podz dev trees and fail (see compile-config.cjs).
set -e
cd "$(dirname "$0")/.."   # repo root

BUILD=/tmp/dk-pivot-build
rm -rf "$BUILD"
mkdir -p "$BUILD/pivot"
cp pivot/package.json pivot/compile-config.cjs "$BUILD/pivot/"
cp -r pivot/node_modules "$BUILD/pivot/node_modules"
cp -r pivot-config "$BUILD/pivot-config"

cd "$BUILD/pivot"
node compile-config.cjs . > create-app.cjs.new
cd - > /dev/null

mkdir -p pivot/dist
mv "$BUILD/pivot/create-app.cjs.new" pivot/dist/create-app.cjs
rm -rf "$BUILD"
echo "wrote pivot/dist/create-app.cjs"
