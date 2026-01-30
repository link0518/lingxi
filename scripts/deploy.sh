#!/usr/bin/env bash
set -euo pipefail

# One-click deploy for a fresh Linux server (Ubuntu/Debian).
# Usage:
#   REPO_URL="https://github.com/you/lingxi.git" DOMAIN="your.domain" bash scripts/deploy.sh
# Optional:
#   APP_DIR="/opt/lingxi" API_BASE_URL="https://api.your.domain"

REPO_URL="${REPO_URL:-}"
DOMAIN="${DOMAIN:-}"
APP_DIR="${APP_DIR:-/opt/lingxi}"
API_BASE_URL="${API_BASE_URL:-}"

if [[ -z "$REPO_URL" ]]; then
  echo "REPO_URL is required. Example: REPO_URL=https://github.com/you/lingxi.git"
  exit 1
fi

if [[ -z "$API_BASE_URL" ]]; then
  if [[ -n "$DOMAIN" ]]; then
    API_BASE_URL="https://${DOMAIN}"
  else
    echo "API_BASE_URL is required if DOMAIN is not set."
    exit 1
  fi
fi

echo "[1/6] Install system deps..."
sudo apt-get update -y
sudo apt-get install -y git curl build-essential

echo "[2/6] Install Node.js (via nvm) if missing..."
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  if [[ ! -d "$NVM_DIR" ]]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm use 22
fi

echo "[3/6] Clone or update repo..."
if [[ ! -d "$APP_DIR/.git" ]]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch --all
  git -C "$APP_DIR" reset --hard origin/main
fi

echo "[4/6] Install dependencies..."
cd "$APP_DIR"
npm install
npm install -g pm2 serve

echo "[5/6] Build frontend..."
cat > .env.production <<EOF
VITE_API_BASE_URL=${API_BASE_URL}
EOF
npm run build

echo "[6/6] Start services with pm2..."
pm2 delete lingxi-api || true
pm2 delete lingxi-web || true

# Backend
PORT=8787 pm2 start "node server/index.js" --name lingxi-api
# Frontend (static)
pm2 start "serve -s dist -l 5173" --name lingxi-web

pm2 save
pm2 startup | tail -n 1 | bash || true

echo "Deploy complete."
echo "Frontend: http://<server-ip>:5173"
echo "Backend:  http://<server-ip>:8787"
