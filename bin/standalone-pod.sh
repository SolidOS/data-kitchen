#!/usr/bin/env bash
# Standalone pivot (CSS) server — NO auth, NO gate — a place to test
# stand-alone apps outside of dk (built apps under /dk-pod/apps/, the sc
# examples, anything on the pod tree).
#
#   bin/standalone-pod.sh [root] [port]
#
# Defaults: root ~/solid, port 3000 → http://localhost:3000/
#
# No DK_GATE_TOKEN is exported, so the gate in pivot/run-server.cjs is a
# no-op and every request passes — no blessing, no cookies. The server still
# binds loopback-only (run-server.cjs pins listen() to 127.0.0.1).
set -euo pipefail

DK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${1:-$HOME/solid}"
PORT="${2:-3000}"

# Generated apps load /node_modules/sol-components/… from the served root;
# warn when that path won't resolve there.
if [ ! -e "$ROOT/node_modules/sol-components" ]; then
  echo "note: $ROOT/node_modules/sol-components not found —" >&2
  echo "      apps that load /node_modules/sol-components/… will 404." >&2
  echo "      fix: ln -s \"$DK_ROOT/node_modules\" \"$ROOT/node_modules\"" >&2
fi

# -u: make sure a stray gate token or baseUrl from the environment can't
# sneak in — this server is meant to be open and to advertise its own port.
exec env -u DK_GATE_TOKEN -u DK_CSS_BASEURL \
  node "$DK_ROOT/pivot/run-server.cjs" "$ROOT" "$PORT"
