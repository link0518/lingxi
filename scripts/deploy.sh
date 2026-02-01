#!/usr/bin/env bash
set -euo pipefail

# One-click deploy for a Linux server (Ubuntu/Debian).
# Usage:
#   bash scripts/deploy.sh
# Optional:
#   APP_DIR="/opt/lingxi" API_BASE_URL="https://chat.faoo.de" bash scripts/deploy.sh
#   APP_DIR="/opt/lingxi" API_BASE_URL="https://chat.faoo.de" IDLE_NUDGE_ENABLED="true" bash scripts/deploy.sh
#   APP_DIR="/opt/lingxi" API_BASE_URL="https://chat.faoo.de" LLM_SETTINGS_KEY="(base64 32 bytes)" bash scripts/deploy.sh

APP_DIR="${APP_DIR:-$(pwd)}"
API_BASE_URL="${API_BASE_URL:-https://chat.faoo.de}"
IDLE_NUDGE_ENABLED="${IDLE_NUDGE_ENABLED:-false}"
IDLE_NUDGE_SCAN_INTERVAL_MINUTES="${IDLE_NUDGE_SCAN_INTERVAL_MINUTES:-10}"
IDLE_NUDGE_MAX_SENDS_PER_SWEEP="${IDLE_NUDGE_MAX_SENDS_PER_SWEEP:-20}"
IDLE_NUDGE_LOG_ENABLED="${IDLE_NUDGE_LOG_ENABLED:-true}"
IDLE_NUDGE_HISTORY_LIMIT="${IDLE_NUDGE_HISTORY_LIMIT:-40}"
# 用于加密存储用户在“API 设置”页填写的 LLM API Key（AES-256-GCM）。
# 必须是 32 字节随机值的 base64 编码（长度通常为 44 字符，末尾可能带 =）。
LLM_SETTINGS_KEY="${LLM_SETTINGS_KEY:-}"

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "Please run this script from the repo root, or set APP_DIR to the repo path."
  exit 1
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
git -C "$APP_DIR" fetch --all || true
git -C "$APP_DIR" reset --hard origin/main || true

echo "[4/6] Install dependencies..."
cd "$APP_DIR"
npm install
npm install -g pm2 serve

echo "[5/6] Build frontend..."
cat > .env.production <<EOF
VITE_API_BASE_URL=${API_BASE_URL}
EOF

# Backend env:
# - 前端构建使用 .env.production（仅 VITE_* 变量会进入前端）
# - 后端运行建议用 .env（本脚本写入一个最小可用版本；如你已有 .env 可自行覆盖）
if [[ ! -f ".env" ]]; then
  echo "Create .env for backend..."
  cat > .env <<EOF
PORT=8787
JWT_SECRET=replace_me

# Idle Nudge（用户消失后 AI 主动关心）
IDLE_NUDGE_ENABLED=${IDLE_NUDGE_ENABLED}
IDLE_NUDGE_SCAN_INTERVAL_MINUTES=${IDLE_NUDGE_SCAN_INTERVAL_MINUTES}
IDLE_NUDGE_MAX_SENDS_PER_SWEEP=${IDLE_NUDGE_MAX_SENDS_PER_SWEEP}
IDLE_NUDGE_LOG_ENABLED=${IDLE_NUDGE_LOG_ENABLED}
IDLE_NUDGE_HISTORY_LIMIT=${IDLE_NUDGE_HISTORY_LIMIT}

# LLM Settings 加密密钥（必须，否则保存 API Key 会失败并且后台无法触发）
LLM_SETTINGS_KEY=${LLM_SETTINGS_KEY}
EOF
  echo "NOTE: .env created. Please edit JWT_SECRET and LLM_SETTINGS_KEY before going production."
fi

npm run build

echo "[6/6] Start services with pm2..."
pm2 delete lingxi-api || true
pm2 delete lingxi-web || true

# Backend
# 使用 dotenv-cli 加载 .env，确保后端拿到 IDLE_NUDGE_* / LLM_SETTINGS_KEY 等配置
if ! command -v dotenv >/dev/null 2>&1; then
  npm install -g dotenv-cli
fi
pm2 start "dotenv -e .env -- node server/index.js" --name lingxi-api
# Frontend (static)
pm2 start "serve -s dist -l 5173" --name lingxi-web

pm2 save
pm2 startup | tail -n 1 | bash || true

echo "Deploy complete."
echo "Frontend: http://<server-ip>:5173"
echo "Backend:  http://<server-ip>:8787"
