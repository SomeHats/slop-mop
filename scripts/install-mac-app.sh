#!/usr/bin/env bash
# Build the Tauri app and copy the resulting .app bundle to /Applications.
# Run via `pnpm install-mac-app` from the repo root.
set -euo pipefail

APP_NAME="Slop Mop.app"
SOURCE="src-tauri/target/release/bundle/macos/$APP_NAME"
DEST="/Applications/$APP_NAME"

echo "==> pnpm install"
pnpm install

echo "==> pnpm build"
pnpm build

if [ ! -d "$SOURCE" ]; then
  echo "error: build did not produce $SOURCE" >&2
  exit 1
fi

if [ -e "$DEST" ]; then
  printf "%s already exists. Overwrite? [y/N] " "$DEST"
  read -r answer
  case "$answer" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "aborted." ; exit 1 ;;
  esac
  rm -rf "$DEST"
fi

cp -R "$SOURCE" "$DEST"
echo "==> installed $DEST"
