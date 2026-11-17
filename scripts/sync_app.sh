#!/usr/bin/env bash
# Copies the app's files into the landing site's app/ folder, so one website serves both.
#
#   bash scripts/sync_app.sh                    copies, but refuses while the landing repo is on main
#   bash scripts/sync_app.sh --publish          allows it on main, which goes live (a release)
#   bash scripts/sync_app.sh [--publish] ~/path/to/wsk-landing/app
#
# Preview first: in the landing repo run  git switch -c preview/name  then sync without --publish.
set -euo pipefail

PUBLISH=0
if [ "${1:-}" = "--publish" ]; then PUBLISH=1; shift; fi

SRC="$(cd "$(dirname "$0")/.." && pwd)/frontend"
DEST="${1:-$HOME/my_code/wsk-landing/app}"

BRANCH="$(git -C "$DEST/.." branch --show-current 2>/dev/null || true)"
if [ -z "$BRANCH" ]; then
  echo "Can't tell which branch $DEST/.. is on. Check that it is a git repo with a branch checked out. Nothing was copied."
  exit 1
fi
if [ "$BRANCH" = "main" ] && [ "$PUBLISH" -ne 1 ]; then
  echo "The landing repo is on main, and main goes live. Nothing was copied."
  echo "For a preview: git -C \"$DEST/..\" switch -c preview/name"
  echo "For a release: run this again with --publish"
  exit 1
fi

mkdir -p "$DEST"
for f in index.html app.js lib.js wind-diagram.js tide-card.js analytics.js config.js styles.css logo-emblem.png favicon.png apple-touch-icon.png; do
  cp "$SRC/$f" "$DEST/$f"
done

echo "Copied the app into: $DEST (landing branch: $BRANCH)"
ls -1 "$DEST"
