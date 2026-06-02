#!/usr/bin/env bash
# Clear the communal favourites/ folder, run the mutating e2e, clear again.
set -u
BASE="http://localhost:3000/solid/open_media_player/favourites/"
clear_favs(){
  for id in $(curl -s "$BASE" -H "Accept: text/turtle" | grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" | sort -u); do
    curl -s -o /dev/null -X DELETE "$BASE$id"
  done
}
clear_favs
node "$(dirname "$0")/e2e-favourites.mjs"; rc=$?
clear_favs
echo "(favourites folder cleared)"
exit $rc
