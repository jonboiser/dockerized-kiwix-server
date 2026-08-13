#!/bin/bash
set -eo pipefail

ZIMDIR=${ZIMDIR:-/zims}
LIBRARY_XML="/tmp/library.xml"

last_zims="INIT_STATE"

cleanup() {
  if [[ -n "$PID" ]]; then
    kill -TERM "$PID" 2>/dev/null || true
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM

while true; do
  # Get space-separated list of existing ZIM files
  current_zims=$(ls -1 "$ZIMDIR"/*.zim 2>/dev/null | sort | tr '\n' ' ' || true)

  if [[ "$current_zims" != "$last_zims" ]]; then
    last_zims="$current_zims"

    # Terminate previous server process if running
    if [[ -n "$PID" && -d "/proc/$PID" ]]; then
      kill "$PID" 2>/dev/null || true
      wait "$PID" 2>/dev/null || true
    fi

    if [[ -n "$current_zims" ]]; then
      echo "[kiwix-entrypoint] Launching kiwix-serve with ZIM files: $current_zims"
      kiwix-serve --port 8080 $current_zims &
      PID=$!
    else
      echo "[kiwix-entrypoint] No ZIM files found in $ZIMDIR. Running in standby mode..."
      echo "<library></library>" > "$LIBRARY_XML"
      kiwix-serve --port 8080 --library "$LIBRARY_XML" &
      PID=$!
    fi
  fi

  sleep 3 &
  wait $!
done
