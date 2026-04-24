#!/bin/bash
# ═══════════════════════════════════════════════════
# 🛡️ Safe Deploy Script for AutoPro
# يحمي البيانات قبل أي git pull
# ═══════════════════════════════════════════════════

set -e

PROJECT_DIR="${1:-$(pwd)}"
DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="/tmp/autopro-backup-$(date +%Y%m%d_%H%M%S)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AutoPro Safe Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Project: $PROJECT_DIR"
echo "Data:    $DATA_DIR"
echo "Backup:  $BACKUP_DIR"
echo ""

# Step 1: Verify data directory exists
if [ ! -d "$DATA_DIR" ]; then
  echo "⚠️  $DATA_DIR does not exist — creating it..."
  sudo mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/backups"
  sudo chown -R $USER:$USER "$DATA_DIR"
fi

# Step 2: Backup current state (safety!)
echo "📦 Creating safety backup..."
mkdir -p "$BACKUP_DIR"

if [ -f "$PROJECT_DIR/auction.db" ]; then
  cp "$PROJECT_DIR/auction.db" "$BACKUP_DIR/auction.db.project"
  echo "   ✅ Backed up auction.db from project"
fi

if [ -d "$PROJECT_DIR/uploads" ] && [ "$(ls -A $PROJECT_DIR/uploads 2>/dev/null)" ]; then
  cp -r "$PROJECT_DIR/uploads" "$BACKUP_DIR/uploads.project"
  echo "   ✅ Backed up uploads/ from project"
fi

if [ -f "$DATA_DIR/auction.db" ]; then
  cp "$DATA_DIR/auction.db" "$BACKUP_DIR/auction.db.data"
  echo "   ✅ Backed up $DATA_DIR/auction.db"
fi

# Step 3: Migrate project data to /data if not already there
if [ -f "$PROJECT_DIR/auction.db" ] && [ ! -f "$DATA_DIR/auction.db" ]; then
  echo ""
  echo "🚚 Moving auction.db to $DATA_DIR..."
  cp "$PROJECT_DIR/auction.db" "$DATA_DIR/auction.db"
  echo "   ✅ DB migrated"
fi

if [ -d "$PROJECT_DIR/uploads" ]; then
  if [ ! -d "$DATA_DIR/uploads" ] || [ -z "$(ls -A $DATA_DIR/uploads 2>/dev/null)" ]; then
    echo ""
    echo "🚚 Moving uploads/ to $DATA_DIR..."
    cp -rn "$PROJECT_DIR/uploads/"* "$DATA_DIR/uploads/" 2>/dev/null || true
    echo "   ✅ Uploads migrated"
  fi
fi

# Step 4: Pull latest code
echo ""
echo "📥 Pulling latest code from GitHub..."
cd "$PROJECT_DIR"
git pull origin main
echo "   ✅ Code updated"

# Step 5: Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install --silent
echo "   ✅ Dependencies installed"

# Step 6: Clean old build artifacts
echo ""
echo "🧹 Cleaning old build..."
rm -rf dist node_modules/.vite
echo "   ✅ Clean"

# Step 7: Build
echo ""
echo "🔨 Building production bundle..."
npm run build
echo "   ✅ Build complete"

# Step 8: Restart server
echo ""
echo "🔄 Restarting server..."
if command -v pm2 &> /dev/null; then
  pm2 restart all
  echo "   ✅ PM2 restarted"
elif command -v systemctl &> /dev/null; then
  sudo systemctl restart autopro
  echo "   ✅ systemd restarted"
else
  echo "   ⚠️  Please restart manually"
fi

# Step 9: Verify
echo ""
echo "🔍 Verifying deployment..."
sleep 3
if command -v pm2 &> /dev/null; then
  pm2 list
  echo ""
  pm2 logs --lines 15 --nostream | tail -20
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Backup location: $BACKUP_DIR"
echo "(keep for safety, delete after verifying site works)"
echo ""
echo "Data location:   $DATA_DIR"
echo "DB:              $DATA_DIR/auction.db"
echo "Uploads:         $DATA_DIR/uploads/"
echo ""
echo "Visit: https://www.autopro.ac"
echo ""
