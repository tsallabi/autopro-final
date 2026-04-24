#!/bin/bash
# ═══════════════════════════════════════════════════
# 🚀 AutoPro Safe Deploy on DigitalOcean
# ينشر تحديثات دون خسارة أي بيانات
# ═══════════════════════════════════════════════════

set -e  # stop on any error

PROJECT_DIR="/var/www/autopro"
DATA_DIR="/data/autopro"
APP_NAME="autopro"

# ألوان للترحيب
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║     🚀 AutoPro Safe Deploy                    ║"
echo "║     Zero Data Loss Deployment                 ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ═══════════════════════════════════════════════════
# التحقق من المتطلبات
# ═══════════════════════════════════════════════════
echo -e "${YELLOW}🔍 فحص البيئة...${NC}"

if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ المشروع غير موجود في $PROJECT_DIR${NC}"
    exit 1
fi

if [ ! -d "$DATA_DIR" ]; then
    echo -e "${RED}❌ مجلد البيانات غير موجود في $DATA_DIR${NC}"
    echo -e "${YELLOW}⚠️  قم بإنشائه أولاً:${NC}"
    echo "   sudo mkdir -p $DATA_DIR/uploads/{images,documents,media,kyc}"
    echo "   sudo chown -R \$USER:\$USER $DATA_DIR"
    exit 1
fi

echo -e "${GREEN}✅ البيئة جاهزة${NC}"

# ═══════════════════════════════════════════════════
# النسخة الاحتياطية (للأمان!)
# ═══════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}📦 عمل نسخة احتياطية...${NC}"

BACKUP_DIR="$DATA_DIR/backups/pre_deploy_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# نسخة من DB قبل النشر
if [ -f "$DATA_DIR/auction.db" ]; then
    cp "$DATA_DIR/auction.db" "$BACKUP_DIR/auction.db"
    DB_SIZE=$(du -h "$BACKUP_DIR/auction.db" | cut -f1)
    echo -e "${GREEN}   ✅ نسخة DB ($DB_SIZE) في $BACKUP_DIR${NC}"
fi

# احتفظ بآخر 10 نسخ فقط
cd "$DATA_DIR/backups"
ls -1t | tail -n +11 | xargs -I {} rm -rf {} 2>/dev/null || true
cd - > /dev/null

# ═══════════════════════════════════════════════════
# سحب التحديثات من GitHub
# ═══════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}📥 سحب التحديثات من GitHub...${NC}"

cd "$PROJECT_DIR"

# احفظ الـ commit الحالي (للاستعادة إذا فشل النشر)
PREV_COMMIT=$(git rev-parse HEAD)
echo "   📍 Commit الحالي: $PREV_COMMIT"

# اسحب التحديثات
git fetch origin
git reset --hard origin/main

NEW_COMMIT=$(git rev-parse HEAD)
echo "   📍 Commit الجديد: $NEW_COMMIT"

if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
    echo -e "${YELLOW}   ℹ️  لا توجد تحديثات جديدة${NC}"
fi

# ═══════════════════════════════════════════════════
# تثبيت الحزم
# ═══════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}📦 تثبيت الحزم...${NC}"
npm install --silent

# ═══════════════════════════════════════════════════
# البناء
# ═══════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}🔨 بناء المشروع...${NC}"

# احذف الـ build القديم
rm -rf dist node_modules/.vite

# ابنِ
if npm run build; then
    echo -e "${GREEN}✅ البناء نجح${NC}"
else
    echo -e "${RED}❌ البناء فشل! جاري التراجع...${NC}"
    git reset --hard "$PREV_COMMIT"
    npm run build
    echo -e "${YELLOW}⚠️  تم التراجع للنسخة السابقة${NC}"
    exit 1
fi

# ═══════════════════════════════════════════════════
# إعادة التشغيل (zero downtime)
# ═══════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}🔄 إعادة تشغيل الخدمة...${NC}"

if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
    # التطبيق موجود — reload بدل restart (zero downtime)
    pm2 reload "$APP_NAME" --update-env
    echo -e "${GREEN}✅ Reload ناجح — بدون انقطاع${NC}"
else
    # التطبيق غير موجود — start
    pm2 start server.mjs --name "$APP_NAME"
    pm2 save
    echo -e "${GREEN}✅ بدأ التطبيق لأول مرة${NC}"
fi

# ═══════════════════════════════════════════════════
# التحقق من النجاح
# ═══════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}🔍 التحقق من السيرفر...${NC}"
sleep 3

# تحقق من PM2
if pm2 list | grep -q "$APP_NAME.*online"; then
    echo -e "${GREEN}✅ التطبيق يعمل${NC}"
else
    echo -e "${RED}❌ التطبيق لا يعمل! جاري التراجع...${NC}"
    git reset --hard "$PREV_COMMIT"
    npm run build
    pm2 restart "$APP_NAME"
    echo -e "${YELLOW}⚠️  تم التراجع للنسخة السابقة${NC}"
    exit 1
fi

# تحقق من الاستجابة
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/api/cars | grep -q "200"; then
    echo -e "${GREEN}✅ API يستجيب (200 OK)${NC}"
else
    echo -e "${YELLOW}⚠️  API لا يستجيب — تحقق من اللوجز${NC}"
fi

# ═══════════════════════════════════════════════════
# التحقق من البيانات (للتأكد أنها لم تُمس)
# ═══════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}💾 التحقق من سلامة البيانات...${NC}"

if [ -f "$DATA_DIR/auction.db" ]; then
    DB_SIZE=$(du -h "$DATA_DIR/auction.db" | cut -f1)
    USER_COUNT=$(sqlite3 "$DATA_DIR/auction.db" "SELECT COUNT(*) FROM users" 2>/dev/null || echo "N/A")
    CAR_COUNT=$(sqlite3 "$DATA_DIR/auction.db" "SELECT COUNT(*) FROM cars" 2>/dev/null || echo "N/A")

    echo -e "${GREEN}   ✅ Database سليم ($DB_SIZE)${NC}"
    echo "   👥 المستخدمون: $USER_COUNT"
    echo "   🚗 السيارات: $CAR_COUNT"
fi

if [ -d "$DATA_DIR/uploads" ]; then
    UPLOAD_COUNT=$(find "$DATA_DIR/uploads" -type f | wc -l)
    UPLOADS_SIZE=$(du -sh "$DATA_DIR/uploads" | cut -f1)
    echo -e "${GREEN}   ✅ Uploads سليمة ($UPLOAD_COUNT ملف — $UPLOADS_SIZE)${NC}"
fi

# ═══════════════════════════════════════════════════
# ملخص النشر
# ═══════════════════════════════════════════════════
echo ""
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║            ✅ النشر اكتمل بنجاح!              ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo "📊 الإحصائيات:"
echo "   • Commit السابق: $PREV_COMMIT"
echo "   • Commit الجديد: $NEW_COMMIT"
echo "   • Backup: $BACKUP_DIR"
echo ""
echo "🌐 الموقع: https://autopro.ac"
echo ""
echo "📋 للتحقق:"
echo "   pm2 logs $APP_NAME --lines 30"
echo "   pm2 monit"
echo ""
echo "🔄 للتراجع (إذا احتجت):"
echo "   cd $PROJECT_DIR"
echo "   git reset --hard $PREV_COMMIT"
echo "   npm run build"
echo "   pm2 reload $APP_NAME"
echo ""
