#!/bin/bash
# Dev launcher for MayWiFin.
# - Kills any process already bound to $PORT (so re-running this script is always a fast, clean restart)
# - Starts the server with `node --watch`, which auto-restarts on any change to server.js,
#   routes/, db/, or lib/ (no restart needed for public/ - those are static files served
#   directly by Express, so frontend edits just need a browser refresh).

set -e
cd "$(dirname "$0")"

PORT="${PORT:-3000}"

# Kill whatever is bound to the port (the actual listening process)...
existing_pid="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
if [ -n "$existing_pid" ]; then
    echo "🛑 Killing existing process on port $PORT (PID $existing_pid)"
    kill -9 $existing_pid 2>/dev/null || true
fi

# ...and any leftover `node --watch` supervisor/child from a previous run of this script.
# `--watch` runs the script as a child process with its own argv (just "node server.js",
# no "--watch"), so the port-kill above can miss the supervisor or vice versa - sweep both.
pkill -9 -f "node --watch server.js" 2>/dev/null || true
pkill -9 -f "node server.js" 2>/dev/null || true
sleep 0.3

echo "🚀 MayWiFin dev server starting on port $PORT (auto-restart on backend file changes)..."
exec node --watch server.js
