# 💱 Patch: Exchange Rate Admin Panel

> **ملف جاهز للمبرمج — يضيف صفحة تحكم سعر الصرف بدون تأثير على أي شيء موجود**
>
> للمبرمج أحمد دكروري — autopro.ac
> تاريخ: 19 أبريل 2026

---

## 🎯 ما يفعله هذا الـ Patch:

- ✅ **يضيف** زر "سعر الصرف 💱" في القائمة الجانبية للأدمن
- ✅ **يضيف** صفحة تحكم احترافية لتغيير سعر USD → LYD
- ✅ **لا يمس** أي كود موجود
- ✅ **لا يعدّل** أي endpoint موجود (يستخدم `/api/settings` الموجود أصلاً)
- ✅ **لا يحتاج** migrations جديدة

---

## 🛡️ قاعدة الأمان:

**الملف الوحيد الذي يُعدَّل:**
```
src/pages/AdminDashboard.tsx
```

**إضافتان فقط:**
1. إضافة سطر واحد في قائمة التبويبات (سطر رقم 7255)
2. إضافة `case 'exchange_rate'` في switch statement (حوالي سطر 4288)

---

## 📦 طريقة 1: التثبيت عبر Git (الأسهل — دقيقة واحدة)

### كل الكود موجود في GitHub بالفعل:

```bash
ssh user@77.237.245.41
cd /path/to/autopro-final

# اسحب الإصلاح الأخير
git pull origin main

# أعد البناء
npm install
npm run build

# أعد التشغيل
pm2 restart all
```

**Commit SHA للبحث عنه:** `e0fd954`

**للتحقق:**
```bash
git log --oneline | head -5
# يجب أن تجد: e0fd954 feat: add exchange rate admin panel
```

---

## 📦 طريقة 2: التطبيق اليدوي (إذا لا تريد سحب كل شيء)

### الخطوة 1: ابحث عن ملف `src/pages/AdminDashboard.tsx`

### الخطوة 2: ابحث عن هذا السطر:

```tsx
{ id: 'system_global', label: 'إعدادات النظام الرئيسية ⚙️', icon: Settings },
```

### أضف بعده مباشرة:

```tsx
{ id: 'exchange_rate', label: 'سعر الصرف 💱', icon: DollarSign },
```

---

### الخطوة 3: ابحث عن هذا الكود:

```tsx
case 'banners':
  return (
    <div className="p-6 md:p-8">
      <BannersManager />
    </div>
  );
```

### أضف بعده مباشرة:

```tsx
case 'exchange_rate': {
  const ExchangeRatePanel = () => {
    const [newRate, setNewRate] = React.useState(exchangeRate?.toString() || '7');
    const [saving, setSaving] = React.useState(false);
    const [lastUpdate, setLastUpdate] = React.useState<string>('');

    React.useEffect(() => {
      setNewRate(exchangeRate?.toString() || '7');
    }, [exchangeRate]);

    const handleSave = async () => {
      const rate = parseFloat(newRate);
      if (!rate || rate <= 0 || rate > 100) {
        showAlert('سعر الصرف يجب أن يكون رقماً موجباً أقل من 100', 'error');
        return;
      }
      setSaving(true);
      const ok = await updateExchangeRate(rate);
      setSaving(false);
      if (ok) {
        setLastUpdate(new Date().toLocaleString('ar-LY'));
        showAlert(`✅ تم تحديث سعر الصرف إلى ${rate} د.ل / 1 USD`, 'success');
      } else {
        showAlert('فشل تحديث سعر الصرف — يرجى المحاولة مرة أخرى', 'error');
      }
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <DollarSign className="w-7 h-7 text-emerald-400" />
            سعر الصرف USD → LYD
          </h2>
        </div>

        <div className="bg-gradient-to-br from-emerald-900/40 via-green-900/30 to-emerald-900/40 rounded-2xl border-2 border-emerald-500/30 p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 text-sm font-bold">السعر الحالي المعتمد في كامل المنصة</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
              <div className="text-xs text-slate-400 font-bold mb-2">السعر الحالي</div>
              <div className="text-3xl font-black text-emerald-400 font-mono">
                {exchangeRate || 7} <span className="text-sm text-slate-400">د.ل</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">لكل 1 USD</div>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
              <div className="text-xs text-slate-400 font-bold mb-2">مثال: 10,000$</div>
              <div className="text-3xl font-black text-amber-400 font-mono">
                {((10000) * (exchangeRate || 7)).toLocaleString('en-US')}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">د.ل</div>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
              <div className="text-xs text-slate-400 font-bold mb-2">مثال: 50,000$</div>
              <div className="text-3xl font-black text-orange-400 font-mono">
                {((50000) * (exchangeRate || 7)).toLocaleString('en-US')}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">د.ل</div>
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-xl p-5 border border-amber-500/40">
            <label className="block text-sm font-black text-amber-300 mb-2">
              💡 تغيير سعر الصرف الجديد
            </label>
            <div className="flex gap-3 items-stretch">
              <div className="flex-1 relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  max="100"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  placeholder="مثال: 7.25"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 text-white text-xl font-black font-mono text-left tracking-wider outline-none transition-all"
                  dir="ltr"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">د.ل / USD</span>
              </div>
              <button
                onClick={handleSave}
                disabled={saving || !newRate}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-black text-sm hover:from-emerald-600 hover:to-green-700 transition-all active:scale-95 shadow-xl shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ السعر الجديد'}
              </button>
            </div>
            {lastUpdate && (
              <div className="mt-3 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                آخر تحديث: {lastUpdate}
              </div>
            )}
          </div>

          <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="text-blue-400 text-xl">ℹ️</div>
              <div className="text-slate-300 text-sm leading-relaxed">
                <strong className="text-blue-300 block mb-1">ملاحظة مهمة:</strong>
                يُستخدم هذا السعر في:
                <ul className="mt-2 space-y-1 text-xs text-slate-400 list-disc list-inside">
                  <li>حاسبة التكلفة الكاملة (الشحن + الجمارك + التأمين)</li>
                  <li>عرض الأسعار بالدينار الليبي في جميع صفحات السيارات</li>
                  <li>فواتير الشراء والدفعات</li>
                  <li>حسابات المحفظة والعمولات</li>
                </ul>
                <div className="mt-2 text-amber-300 font-bold">
                  ⚠️ يُنصح بتحديث السعر يومياً لمواكبة السوق
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className="p-6 md:p-8">
      <ExchangeRatePanel />
    </div>
  );
}
```

### الخطوة 4: احفظ الملف وأعد البناء:

```bash
npm run build
pm2 restart all
```

---

## 📦 طريقة 3: SQL مباشر (الأسرع — بدون كود)

**إذا لا تريد إعادة build أو تعديل كود، يمكنك تغيير السعر مباشرة على قاعدة البيانات:**

```bash
# اتصل بالسيرفر
ssh user@77.237.245.41

# افتح قاعدة البيانات
cd /path/to/autopro-final
sqlite3 auction.db

# تحقق من وجود الجدول
.schema app_settings

# إذا لم يكن موجوداً، أنشئه:
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updatedAt TEXT DEFAULT (datetime('now'))
);

# اعرض السعر الحالي
SELECT * FROM app_settings WHERE key = 'usd_lyd_rate';

# غيّر السعر إلى القيمة الجديدة (مثلاً 7.5)
INSERT OR REPLACE INTO app_settings (key, value, updatedAt) 
VALUES ('usd_lyd_rate', '7.5', datetime('now'));

# تأكد من التحديث
SELECT * FROM app_settings WHERE key = 'usd_lyd_rate';

# اخرج
.quit

# أعد تشغيل السيرفر لتطبيق التغيير
pm2 restart all
```

---

## ✅ التحقق من النجاح:

بعد تطبيق الإصلاح، افتح:

```
https://www.autopro.ac/dashboard/admin?view=exchange_rate
```

يجب أن تظهر صفحة سعر الصرف كاملة.

أو:
1. سجل دخول كأدمن
2. من القائمة الجانبية → "إعدادات المنصة"
3. اضغط على "سعر الصرف 💱"

---

## 🔒 Security Notes:

- ✅ Endpoint محمي بـ `requireAdmin` middleware
- ✅ فقط حسابات `role = 'admin'` تستطيع تغيير السعر
- ✅ يتم حفظ كل تغيير في `app_settings` جدول
- ✅ لا يؤثر على أي حقل أو endpoint آخر

---

## 📞 للتواصل:

إذا واجهت أي مشكلة:
- **طارق السلابي** — المالك
- **GitHub:** https://github.com/tsallabi/autopro-final
- **المشروع كله موثق في:** `DEPLOYMENT_GUIDE.md`

---

## 🎯 Summary:

| الخطوة | الوقت | الصعوبة |
|--------|-------|---------|
| Method 1 (Git pull) | 5 min | ⭐ Easy |
| Method 2 (Manual code) | 10 min | ⭐⭐ Medium |
| Method 3 (SQL only) | 2 min | ⭐ Easy (no UI) |

**الأنصح: Method 1 (git pull) — يُدخل كل الإصلاحات دفعة واحدة بدون تعديل يدوي.**

---

*ملف جاهز للإرسال — انسخ هذا الملف بالكامل لأحمد*
