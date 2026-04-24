#!/bin/bash
# ═══════════════════════════════════════════════════
# 🔒 AutoPro Auto-Backup to Google Drive
# يحفظ DB + uploads كل يوم تلقائياً
# ═══════════════════════════════════════════════════

set -e

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="$DATA_DIR/backups"
DATE=$(date +%Y%m%d_%H%M%S)
GDRIVE_FOLDER="${GDRIVE_FOLDER:-AutoPro_Backups}"

mkdir -p "$BACKUP_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AutoPro Auto-Backup"
echo "  Date: $(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. نسخة احتياطية من DB
echo "📦 Backing up database..."
cp "$DATA_DIR/auction.db" "$BACKUP_DIR/auction_${DATE}.db"
echo "   ✅ DB backed up"

# 2. نسخة مضغوطة من uploads
echo "📦 Backing up uploads..."
tar -czf "$BACKUP_DIR/uploads_${DATE}.tar.gz" -C "$DATA_DIR" uploads/ 2>/dev/null || true
echo "   ✅ Uploads compressed"

# 3. رفع إلى Google Drive (باستخدام rclone)
if command -v rclone &> /dev/null; then
    echo "☁️  Uploading to Google Drive..."

    # ارفع DB
    rclone copy "$BACKUP_DIR/auction_${DATE}.db" "gdrive:$GDRIVE_FOLDER/database/" --quiet
    echo "   ✅ DB uploaded to gdrive:$GDRIVE_FOLDER/database/"

    # ارفع uploads (مرة أسبوعياً فقط — يوم الأحد)
    if [ "$(date +%u)" = "7" ]; then
        rclone copy "$BACKUP_DIR/uploads_${DATE}.tar.gz" "gdrive:$GDRIVE_FOLDER/uploads/" --quiet
        echo "   ✅ Uploads uploaded"
    fi

    # احذف النسخ الأقدم من 30 يوم على Google Drive
    rclone delete "gdrive:$GDRIVE_FOLDER/database/" --min-age 30d --quiet 2>/dev/null || true
else
    echo "⚠️  rclone not installed — backups only saved locally"
fi

# 4. احذف النسخ المحلية الأقدم من 7 أيام
find "$BACKUP_DIR" -name "auction_*.db" -mtime +7 -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "uploads_*.tar.gz" -mtime +30 -delete 2>/dev/null || true

# 5. إحصائيات
DB_SIZE=$(du -h "$DATA_DIR/auction.db" | cut -f1)
UPLOADS_SIZE=$(du -sh "$DATA_DIR/uploads" 2>/dev/null | cut -f1)
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/auction_*.db 2>/dev/null | wc -l)

echo ""
echo "📊 Stats:"
echo "   DB size:       $DB_SIZE"
echo "   Uploads size:  $UPLOADS_SIZE"
echo "   Local backups: $BACKUP_COUNT"
echo ""
echo "✅ Backup complete"
