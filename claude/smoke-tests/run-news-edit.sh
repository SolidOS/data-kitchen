#!/usr/bin/env bash
# Snapshot feeds.ttl → run the mutating News-edit e2e → always restore via PUT.
set -u
URL="http://localhost:3000/solid/open_media_player/libraries/news/feeds.ttl"
BAK="$(mktemp)"
curl -s -o "$BAK" "$URL" || { echo "backup failed"; exit 1; }
node "$(dirname "$0")/e2e-news-edit.mjs"; rc=$?
curl -s -o /dev/null -w "restore PUT: %{http_code}\n" -X PUT -H "Content-Type: text/turtle" --data-binary @"$BAK" "$URL"
rm -f "$BAK"
exit $rc
