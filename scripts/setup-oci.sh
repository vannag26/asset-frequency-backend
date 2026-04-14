#!/bin/bash
# ── The Asset Frequency — Oracle Cloud (OCI) VM Setup ─────────────────────────
# Run this once on a fresh OCI ARM A1 Ubuntu 22.04 instance
# Instance: VM.Standard.A1.Flex  (4 OCPUs, 24GB RAM — Always Free)

set -e
echo "🔵 Setting up The Asset Frequency backend on Oracle Cloud..."

# ── 1. System update ─────────────────────────────────────────────────────────
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw certbot

# ── 2. Install Docker ─────────────────────────────────────────────────────────
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker

# Install Docker Compose v2
sudo apt-get install -y docker-compose-plugin
echo "✅ Docker installed: $(docker --version)"

# ── 3. Firewall (OCI requires both UFW AND OCI Security List rules) ───────────
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# OCI iptables rule (required on OCI Ubuntu instances)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 7 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

echo "✅ Firewall configured"

# ── 4. Clone your repo ────────────────────────────────────────────────────────
# Replace with your actual GitHub repo URL
REPO_URL="https://github.com/vannag26/asset-frequency-backend"
if [ ! -d "asset-frequency-backend" ]; then
  git clone $REPO_URL
fi
cd asset-frequency-backend

# ── 5. Set up environment ─────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  IMPORTANT: Edit .env before continuing!"
  echo "   nano .env"
  echo ""
  echo "   Required fields:"
  echo "   - POSTGRES_PASSWORD (strong password)"
  echo "   - REDIS_PASSWORD"
  echo "   - JWT_SECRET (64+ random chars)"
  echo "   - SUPABASE_JWT_SECRET (from Supabase dashboard)"
  echo "   - ALPHA_VANTAGE_KEY (free from alphavantage.co)"
  echo "   - POLYGON_API_KEY (for real-time — optional)"
  echo ""
  read -p "Press Enter after editing .env to continue..."
fi

# ── 6. Get SSL certificate (Let's Encrypt) ────────────────────────────────────
echo ""
read -p "Enter your domain (e.g. api.theassetfrequency.com): " DOMAIN
read -p "Enter your email for SSL cert: " EMAIL

sudo certbot certonly --standalone \
  -d $DOMAIN \
  --email $EMAIL \
  --agree-tos \
  --non-interactive

# Copy certs to nginx ssl folder
mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem   nginx/ssl/
sudo chown $USER:$USER nginx/ssl/*.pem

# Update nginx.conf with actual domain
sed -i "s/api.theassetfrequency.com/$DOMAIN/g" nginx/nginx.conf

# ── 7. Auto-renew SSL ─────────────────────────────────────────────────────────
(crontab -l 2>/dev/null; echo "0 3 1 * * certbot renew --quiet && docker compose restart nginx") | crontab -

echo "✅ SSL configured for $DOMAIN"

# ── 8. Build and launch ───────────────────────────────────────────────────────
docker compose build
docker compose up -d

echo ""
echo "✅ All done! The Asset Frequency backend is live."
echo ""
echo "   API:       https://$DOMAIN/api/market/snapshot"
echo "   Health:    https://$DOMAIN/health"
echo "   WebSocket: wss://$DOMAIN/live?token=<JWT>"
echo ""
echo "   View logs:  docker compose logs -f api"
echo "   View stats: docker compose ps"
