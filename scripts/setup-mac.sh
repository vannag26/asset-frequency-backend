#!/usr/bin/env bash
# setup-mac.sh - Run Asset Frequency backend on Mac with Cloudflare Tunnel
set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"
echo "=== Asset Frequency Backend Mac Setup ==="
if ! command -v docker &>/dev/null; then
  echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"; exit 1
fi
if ! docker info &>/dev/null; then
  echo "Start Docker Desktop, then re-run."; exit 1
fi
echo "Docker OK"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Fill in ALPHA_VANTAGE_KEY and SUPABASE_JWT_SECRET in .env, then re-run."
  exit 0
fi
grep -q "your_alpha_vantage_key_here" .env && echo "Set ALPHA_VANTAGE_KEY in .env" && exit 1
grep -q "your_supabase_jwt_secret_here" .env && echo "Set SUPABASE_JWT_SECRET in .env" && exit 1
echo ".env OK"
echo "Starting services..."
docker compose -f docker-compose.yml -f docker-compose.mac.yml up -d --build
for i in $(seq 1 30); do
  curl -sf http://localhost:4000/health &>/dev/null && echo "API up at http://localhost:4000" && break
  sleep 2
done
echo ""
if ! command -v cloudflared &>/dev/null; then
  brew install cloudflare/cloudflare/cloudflared
fi
if [ -f ~/.cloudflared/config.yml ]; then
  cloudflared tunnel run asset-frequency
else
  echo "Tunnel not configured yet. See CLOUDFLARE-SETUP.md"
  echo "Quick test: cloudflared tunnel --url http://localhost:80"
fi