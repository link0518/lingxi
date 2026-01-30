#!/usr/bin/env bash
set -euo pipefail

# One-click update script.
# Usage:
#   bash scripts/update.sh
# Optional:
#   APP_DIR="/path/to/repo" bash scripts/update.sh

APP_DIR="${APP_DIR:-$(pwd)}"

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "Please run this script from the repo root, or set APP_DIR to the repo path."
  exit 1
fi

echo "[1/4] Pull latest code..."
git -C "$APP_DIR" fetch --all
git -C "$APP_DIR" reset --hard origin/main

echo "[2/4] Install dependencies..."
cd "$APP_DIR"
npm install

echo "[3/4] Build frontend..."
npm run build

echo "[4/4] Reload services..."
pm2 restart lingxi-api || pm2 start "node server/index.js" --name lingxi-api
pm2 restart lingxi-web || pm2 start "serve -s dist -l 5173" --name lingxi-web

echo "Update complete."
