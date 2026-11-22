#!/bin/sh
# Start the Time Tracker server on macOS or Linux.
cd "$(dirname "$0")" || exit 1
npm install --no-audit --no-fund --loglevel=error || exit 1
npm run build || exit 1
command -v tailscale >/dev/null && tailscale serve --bg 8787
exec npm start
