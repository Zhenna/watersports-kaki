#!/usr/bin/env bash
# Copies the app's files into the landing site's app/ folder, so one website serves both.
# Usage, from the watersports-kaki repo:  bash scripts/sync_app.sh
# Another landing folder:                 bash scripts/sync_app.sh ~/path/to/wsk-landing/app
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/frontend"
DEST="${1:-$HOME/my_code/wsk-landing/app}"

mkdir -p "$DEST"
for f in index.html app.js lib.js config.js styles.css logo-emblem.png favicon.png apple-touch-icon.png; do
  cp "$SRC/$f" "$DEST/$f"
done

echo "Copied the app into: $DEST"
ls -1 "$DEST"
