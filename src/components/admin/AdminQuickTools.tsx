/**
 * AdminQuickTools — floating panel for admins.
 *
 * Mounted globally from App.tsx. Renders a bottom-left floating button
 * (only when currentUser.role === 'admin'); clicking opens a slide-up
 * panel with all the admin endpoints.
 *
 * Sections:
 *   - Cancel sale + (optional) suspend the winner + (optional) reschedule
 *   - Approve a pending car with a chosen auction window
 *   - Announce a car to all active users (inbox + bell + email)  ← NEW
 *   - Suspend a user account
 *   - Unsuspend a user account
 *   - Trigger an immediate local DB backup
 *
 * No DB schema dependency. Self-contained — uses authFetch from
 * StoreContext, the same pattern other admin calls use.
 */
import React, { useState } from 'react';
import { Wrench, X, AlertTriangle, UserX, UserCheck, Calendar, Database, Megaphone, ChevronDown, ChevronUp, Loader2, Ship, ArrowRightLeft } from 'lucide-react';
import { useStore, authFetch } from '../../context/StoreContext';

type ActionResult = { ok: boolean; message: string } | null;

type SectionKey = 'cancel-sale' | 'approve-schedule' | 'announce' | 'suspend' | 'unsuspend' | 'backup' | 'transit-add' | 'transit-move';

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, icon, open, onToggle, children }) => (
  <div className="border border-slate-700 rounded-xl bg-slate-800/60 overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 hover:bg-slate-700/40 transition"
      aria-expanded={open}
    >
      <span className="flex items-center gap-2 text-white font-bold text-sm">
        {icon}
        {title}
      </span>
      {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
    </button>
    {open && <div className="p-3 border-t border-slate-700 space-y-2">{children}</div>}
  </div>
);

const ResultLine: React.FC<{ result: ActionResult }> = ({ result }) => {
  if (!result) return null;
  const cls = result.ok
    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
    : 'bg-rose-500/15 border-rose-500/40 text-rose-200';
  return (
    <div className={`text-xs p-2 rounded-lg border ${cls} font-medium leading-relaxed`}>
      {result.message}
    </div>
  );
};

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, children, hint }) => (
  <label className="block">
    <span className="text-xs text-slate-300 font-bold mb-1 block">{label}</span>
    {children}
    {hint && <span className="text-[10px] text-slate-500 mt-1 block">{hint}</span>}
  </label>
);

const inputCls =
  'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-orange-500';

const btnPrimary =
  'w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/40 disabled:cursor-not-allowed text-white font-black py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm transition';

const btnDanger =
  'w-full bg-rose-500 hover:bg-rose-600 disabled:bg-rose-500/40 disabled:cursor-not-allowed text-white font-black py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm transition';

const btnSuccess =
  'w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/40 disabled:cursor-not-allowed text-white font-black py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm transition';

const btnInfo =
  'w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-500/40 disabled:cursor-not-allowed text-white font-black py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm transition';

// ── CANCEL SALE ──────────────────────────────────────────────────────
const CancelSaleSection: React.FC = () => {
  const [carId, setCarId] = useState('');
  const [reason, setReason] = useState('عدم سداد قيمة المزاد');
  const [suspendWinner, setSuspendWinner] = useState(true);
  const [rescheduleStart, setRescheduleStart] = useState('');
  const [rescheduleEnd, setRescheduleEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);

  const submit = async () => {
    if (!carId.trim()) return setResult({ ok: false, message: 'أدخل رقم السيارة' });
    setBusy(true);
    setResult(null);
    try {
      const res = await authFetch(`/api/admin/cars/${encodeURIComponent(carId.trim())}/cancel-sale`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          suspendWinner,
          rescheduleStartTime: rescheduleStart ? new Date(rescheduleStart).toISOString() : undefined,
          rescheduleEndTime: rescheduleEnd ? new Date(rescheduleEnd).toISOString() : undefined,
        }),
      });
      const data: any = await res.json();
      if (res.ok) {
        setResult({
          ok: true,
          message: `✅ تم إلغاء البيع. الحالة الجديدة: ${data?.car?.status}${data?.suspendedWinner ? ' — تم تعليق الفائز' : ''}.`,
        });
      } else {
        setResult({ ok: false, message: '❌ ' + (data?.error || 'فشل غير معروف') });
      }
    } catch (e: any) {
      setResult({ ok: false, message: '❌ خطأ شبكة: ' + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="رقم السيارة (carId / lot / VIN)" hint="أدخل أي رقم: lot 59511571 أو VIN أو carId الكامل">
        <input className={inputCls} value={carId} onChange={e => setCarId(e.target.value)} placeholder="59511571 أو KNDMC..." />
      </Field>
      <Field label="السبب">
        <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-white cursor-pointer select-none">
        <input
          type="checkbox"
          checked={suspendWinner}
          onChange={e => setSuspendWinner(e.target.checked)}
          className="w-4 h-4 rounded accent-rose-500"
        />
        <span>تعليق حساب الفائز (لا يستطيع المزايدة بعدها)</span>
      </label>
      <Field label="تاريخ بدء المزاد الجديد (اختياري)" hint="اتركه فارغاً لإرجاع السيارة لقائمة الانتظار">
        <input type="datetime-local" className={inputCls} value={rescheduleStart} onChange={e => setRescheduleStart(e.target.value)} />
      </Field>
      <Field label="تاريخ انتهاء المزاد الجديد (اختياري)">
        <input type="datetime-local" className={inputCls} value={rescheduleEnd} onChange={e => setRescheduleEnd(e.target.value)} />
      </Field>
      <button onClick={submit} disabled={busy} className={btnDanger}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
        إلغاء البيع وإعادة السيارة للمزاد
      </button>
      <ResultLine result={result} />
    </>
  );
};

// ── APPROVE WITH SCHEDULE ────────────────────────────────────────────
const ApproveScheduleSection: React.FC = () => {
  const [carId, setCarId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [duration, setDuration] = useState<string>('');
  const [autoAnnounce, setAutoAnnounce] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);

  const submit = async () => {
    if (!carId.trim()) return setResult({ ok: false, message: 'أدخل رقم السيارة' });
    if (!start) return setResult({ ok: false, message: 'أدخل تاريخ بدء المزاد' });
    setBusy(true);
    setResult(null);
    try {
      const body: any = {
        auctionStartTime: new Date(start).toISOString(),
        announce: autoAnnounce,
      };
      if (end) body.auctionEndDate = new Date(end).toISOString();
      else if (duration) body.durationMinutes = Number(duration);
      const res = await authFetch(`/api/admin/cars/${encodeURIComponent(carId.trim())}/approve-with-schedule`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data: any = await res.json();
      if (res.ok) {
        const announceMsg = data?.announcement?.recipientsCount
          ? ` — أُرسل إعلان لـ ${data.announcement.recipientsCount} مستخدم`
          : '';
        setResult({
          ok: true,
          message: `✅ اعتُمدت السيارة. تبدأ في: ${new Date(data.car.auctionStartTime).toLocaleString('en-US')}${announceMsg}`,
        });
      } else {
        setResult({ ok: false, message: '❌ ' + (data?.error || 'فشل') });
      }
    } catch (e: any) {
      setResult({ ok: false, message: '❌ خطأ شبكة: ' + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="رقم السيارة (carId / lot / VIN)">
        <input className={inputCls} value={carId} onChange={e => setCarId(e.target.value)} placeholder="59511571 أو car-..." />
      </Field>
      <Field label="تاريخ ووقت بدء المزاد">
        <input type="datetime-local" className={inputCls} value={start} onChange={e => setStart(e.target.value)} />
      </Field>
      <Field label="تاريخ ووقت انتهاء المزاد (اختياري)" hint="إذا تركته فارغاً يمكنك تحديد المدة أدناه">
        <input type="datetime-local" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} />
      </Field>
      {!end && (
        <Field label="المدة بالدقائق (اختياري)" hint="مثال: 30">
          <input type="number" min={1} className={inputCls} value={duration} onChange={e => setDuration(e.target.value)} placeholder="30" />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm text-white cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoAnnounce}
          onChange={e => setAutoAnnounce(e.target.checked)}
          className="w-4 h-4 rounded accent-orange-500"
        />
        <span>إرسال إعلان لكل المستخدمين تلقائياً (إيميل + رسالة + إشعار)</span>
      </label>
      <button onClick={submit} disabled={busy} className={btnPrimary}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
        اعتماد السيارة وجدولة المزاد
      </button>
      <ResultLine result={result} />
    </>
  );
};

// ── ANNOUNCE CAR TO ALL USERS  ───────────────────────────────────────
const AnnounceCarSection: React.FC = () => {
  const [carId, setCarId] = useState('');
  const [skipEmail, setSkipEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);

  const submit = async () => {
    if (!carId.trim()) return setResult({ ok: false, message: 'أدخل رقم السيارة' });
    if (!confirm('سيتم إرسال إعلان لكل المستخدمين النشطين. متابعة؟')) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await authFetch(`/api/admin/cars/${encodeURIComponent(carId.trim())}/announce`, {
        method: 'POST',
        body: JSON.stringify({ skipEmail }),
      });
      const data: any = await res.json();
      if (res.ok) {
        setResult({
          ok: true,
          message: `✅ تم جدولة الإعلان لـ ${data?.recipientsCount || 0} مستخدم. ${skipEmail ? '(بدون إيميل)' : 'الإيميلات تُرسل في الخلفية.'}`,
        });
      } else {
        setResult({ ok: false, message: '❌ ' + (data?.error || 'فشل') });
      }
    } catch (e: any) {
      setResult({ ok: false, message: '❌ خطأ شبكة: ' + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-xs text-slate-400 leading-relaxed">
        يرسل إشعاراً لكل المستخدمين النشطين (مشترين وبائعين) يحتوي معلومات السيارة وصورتها وموعد المزاد. يصلهم في 3 أماكن: <strong className="text-white">صندوق الرسائل</strong>، <strong className="text-white">جرس التنبيهات</strong>، و<strong className="text-white">الإيميل</strong>.
      </p>
      <Field label="رقم السيارة (carId / lot / VIN)">
        <input className={inputCls} value={carId} onChange={e => setCarId(e.target.value)} placeholder="59511571 أو KNDMC..." />
      </Field>
      <label className="flex items-center gap-2 text-sm text-white cursor-pointer select-none">
        <input
          type="checkbox"
          checked={skipEmail}
          onChange={e => setSkipEmail(e.target.checked)}
          className="w-4 h-4 rounded accent-sky-500"
        />
        <span>بدون إيميل (إشعار + رسالة فقط — أسرع)</span>
      </label>
      <button onClick={submit} disabled={busy} className={btnInfo}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
        إرسال الإعلان لكل المستخدمين
      </button>
      <ResultLine result={result} />
    </>
  );
};

// ── SUSPEND USER ─────────────────────────────────────────────────────
const SuspendUserSection: React.FC = () => {
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('مخالفة شروط الاستخدام');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);

  const submit = async () => {
    if (!userId.trim()) return setResult({ ok: false, message: 'أدخل رقم المستخدم أو إيميله' });
    setBusy(true);
    setResult(null);
    try {
      const res = await authFetch(`/api/admin/users/${encodeURIComponent(userId.trim())}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      const data: any = await res.json();
      setResult(
        res.ok ? { ok: true, message: '✅ تم تعليق الحساب' } : { ok: false, message: '❌ ' + (data?.error || 'فشل') }
      );
    } catch (e: any) {
      setResult({ ok: false, message: '❌ خطأ شبكة: ' + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="رقم المستخدم أو الإيميل" hint="مثال: user@example.com أو user-1729...">
        <input className={inputCls} value={userId} onChange={e => setUserId(e.target.value)} placeholder="user@example.com" />
      </Field>
      <Field label="السبب">
        <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} />
      </Field>
      <button onClick={submit} disabled={busy} className={btnDanger}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
        تعليق الحساب
      </button>
      <ResultLine result={result} />
    </>
  );
};

// ── UNSUSPEND USER ────────────────────────────────────────────────────
const UnsuspendUserSection: React.FC = () => {
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);

  const submit = async () => {
    if (!userId.trim()) return setResult({ ok: false, message: 'أدخل رقم المستخدم أو إيميله' });
    setBusy(true);
    setResult(null);
    try {
      const res = await authFetch(`/api/admin/users/${encodeURIComponent(userId.trim())}/unsuspend`, { method: 'POST' });
      const data: any = await res.json();
      setResult(
        res.ok ? { ok: true, message: '✅ تم استعادة الحساب' } : { ok: false, message: '❌ ' + (data?.error || 'فشل') }
      );
    } catch (e: any) {
      setResult({ ok: false, message: '❌ خطأ شبكة: ' + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="رقم المستخدم أو الإيميل">
        <input className={inputCls} value={userId} onChange={e => setUserId(e.target.value)} placeholder="user@example.com" />
      </Field>
      <button onClick={submit} disabled={busy} className={btnSuccess}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
        استعادة الحساب
      </button>
      <ResultLine result={result} />
    </>
  );
};

// ── BACKUP NOW ──────────────────────────────────────────────────────
const BackupNowSection: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await authFetch('/api/admin/backup-now', { method: 'POST' });
      const data: any = await res.json();
      if (res.ok) {
        const sizeMB = data?.status?.lastBackup?.sizeMB;
        setResult({
          ok: true,
          message: `✅ تم إنشاء نسخة احتياطية${sizeMB ? ` (${sizeMB} MB)` : ''}. الإجمالي: ${data?.status?.count || '?'} نسخة.`,
        });
      } else {
        setResult({ ok: false, message: '❌ ' + (data?.error || 'فشل') });
      }
    } catch (e: any) {
      setResult({ ok: false, message: '❌ خطأ شبكة: ' + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-xs text-slate-400 leading-relaxed">
        ينشئ نسخة احتياطية فورية من قاعدة البيانات في <span className="font-mono text-orange-300">/data/backups</span>.
      </p>
      <button onClick={submit} disabled={busy} className={btnPrimary}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
        نسخة احتياطية الآن
      </button>
      <ResultLine result={result} />
    </>
  );
};

// ── ADD TRANSIT CAR ──────────────────────────────────────────────────
const AddTransitCarSection: React.FC = () => {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<string>('');
  const [lot, setLot] = useState('');
  const [vin, setVin] = useState('');
  const [eta, setEta] = useState('');
  const [vessel, setVessel] = useState('');
  const [origin, setOrigin] = useState('Newark, NJ');
  const [destination, setDestination] = useState('ميناء طرابلس');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);

  const submit = async () => {
    if (!make.trim() || !model.trim() || !year.trim()) {
      return setResult({ ok: false, message: 'الماركة والموديل والسنة مطلوبة' });
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await authFetch('/api/admin/cars/transit', {
        method: 'POST',
        body: JSON.stringify({
          make: make.trim(), model: model.trim(), year: Number(year),
          lot: lot.trim(), vin: vin.trim(),
          transitEta: eta || null,
          transitVessel: vessel.trim(),
          transitOrigin: origin.trim(),
          transitDestination: destination.trim(),
          images: imageUrl.trim() ? [imageUrl.trim()] : [],
        }),
      });
      const data: any = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: `✅ أُضيفت السيارة كـ "في الطريق". الـID: ${data?.car?.id}` });
        setMake(''); setModel(''); setYear(''); setLot(''); setVin('');
        setEta(''); setVessel(''); setImageUrl('');
      } else {
        setResult({ ok: false, message: '❌ ' + (data?.error || 'فشل') });
      }
    } catch (e: any) {
      setResult({ ok: false, message: '❌ خطأ شبكة: ' + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-xs text-slate-400 leading-relaxed">
        تُضاف السيارة بحالة <strong className="text-blue-300">in_transit</strong> ولا تدخل دورة المزاد حتى تنقر "نقل إلى المزاد" بعد وصولها.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الماركة"><input className={inputCls} value={make} onChange={e => setMake(e.target.value)} placeholder="Toyota" /></Field>
        <Field label="الموديل"><input className={inputCls} value={model} onChange={e => setModel(e.target.value)} placeholder="Camry" /></Field>
        <Field label="السنة"><input className={inputCls} type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="2022" /></Field>
        <Field label="رقم Lot"><input className={inputCls} value={lot} onChange={e => setLot(e.target.value)} placeholder="59511571" /></Field>
      </div>
      <Field label="VIN"><input className={inputCls} value={vin} onChange={e => setVin(e.target.value)} placeholder="KNDMC..." /></Field>
      <Field label="رابط صورة السيارة" hint="رابط مباشر لأول صورة">
        <input className={inputCls} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
      </Field>
      <Field label="ETA — تاريخ الوصول المتوقّع">
        <input type="date" className={inputCls} value={eta} onChange={e => setEta(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="من (الميناء/المدينة)"><input className={inputCls} value={origin} onChange={e => setOrigin(e.target.value)} /></Field>
        <Field label="إلى"><input className={inputCls} value={destination} onChange={e => setDestination(e.target.value)} /></Field>
      </div>
      <Field label="اسم السفينة (اختياري)"><input className={inputCls} value={vessel} onChange={e => setVessel(e.target.value)} placeholder="MSC ANNA" /></Field>
      <button onClick={submit} disabled={busy} className={btnInfo}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ship className="w-4 h-4" />}
        إضافة سيارة قادمة في الطريق
      </button>
      <ResultLine result={result} />
    </>
  );
};

// ── MOVE TRANSIT CAR TO AUCTION ──────────────────────────────────────
const MoveTransitSection: React.FC = () => {
  const [carId, setCarId] = useState('');
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState<string>('30');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);

  const submit = async () => {
    if (!carId.trim()) return setResult({ ok: false, message: 'أدخل رقم السيارة' });
    if (!confirm('سيتم نقل السيارة من "في الطريق" إلى دورة المزاد وإبلاغ كل المهتمين. متابعة؟')) return;
    setBusy(true);
    setResult(null);
    try {
      const body: any = {};
      if (start) {
        body.auctionStartTime = new Date(start).toISOString();
        body.durationMinutes = Number(duration) || 30;
      }
      const res = await authFetch(`/api/admin/cars/${encodeURIComponent(carId.trim())}/move-to-auction`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data: any = await res.json();
      if (res.ok) {
        setResult({
          ok: true,
          message: `✅ ${data?.message || 'نُقلت'} الحالة الجديدة: ${data?.car?.status}. أُبلِغ ${data?.notifiedCount || 0} مهتم.`,
        });
      } else {
        setResult({ ok: false, message: '❌ ' + (data?.error || 'فشل') });
      }
    } catch (e: any) {
      setResult({ ok: false, message: '❌ خطأ شبكة: ' + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-xs text-slate-400 leading-relaxed">
        عند وصول السيارة فعلياً، استخدم هذا لنقلها من "في الطريق" إلى دورة المزاد. سيُرسل إشعار + إيميل لكل من سجّل اهتمامه.
      </p>
      <Field label="رقم السيارة (carId)">
        <input className={inputCls} value={carId} onChange={e => setCarId(e.target.value)} placeholder="car-tx-..." />
      </Field>
      <Field label="موعد بدء المزاد (اختياري)" hint="اتركه فارغاً ⇒ ستذهب لـ 'pending' بانتظار اعتماد لاحق">
        <input type="datetime-local" className={inputCls} value={start} onChange={e => setStart(e.target.value)} />
      </Field>
      {start && (
        <Field label="المدة بالدقائق"><input type="number" min={1} className={inputCls} value={duration} onChange={e => setDuration(e.target.value)} /></Field>
      )}
      <button onClick={submit} disabled={busy} className={btnPrimary}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
        نقل السيارة إلى دورة المزاد
      </button>
      <ResultLine result={result} />
    </>
  );
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────
export const AdminQuickTools: React.FC = () => {
  const { currentUser } = useStore();
  const [open, setOpen] = useState(false);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);

  if (!currentUser || currentUser.role !== 'admin') return null;

  const toggle = (key: SectionKey) => setOpenSection(prev => (prev === key ? null : key));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="أدوات الإدارة السريعة"
        className="fixed bottom-20 left-4 z-[80] bg-orange-500 hover:bg-orange-600 text-white rounded-full p-3 shadow-2xl border-2 border-orange-400/50 transition-transform hover:scale-110"
        style={{ display: open ? 'none' : 'flex' }}
      >
        <Wrench className="w-5 h-5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            dir="rtl"
            className="fixed bottom-0 left-0 right-0 z-[91] max-w-md mx-auto bg-slate-900 border-t-2 border-orange-500 rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="font-black text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-orange-400" /> أدوات الإدارة السريعة
              </h3>
              <button
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="p-2 hover:bg-slate-800 rounded-full text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-3">
              <Section
                title="إلغاء بيع وإعادة السيارة للمزاد"
                icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
                open={openSection === 'cancel-sale'}
                onToggle={() => toggle('cancel-sale')}
              >
                <CancelSaleSection />
              </Section>

              <Section
                title="اعتماد سيارة بجدولة المزاد"
                icon={<Calendar className="w-4 h-4 text-orange-400" />}
                open={openSection === 'approve-schedule'}
                onToggle={() => toggle('approve-schedule')}
              >
                <ApproveScheduleSection />
              </Section>

              <Section
                title="إعلان عن سيارة لكل المستخدمين"
                icon={<Megaphone className="w-4 h-4 text-sky-400" />}
                open={openSection === 'announce'}
                onToggle={() => toggle('announce')}
              >
                <AnnounceCarSection />
              </Section>

              <Section
                title="تعليق حساب مستخدم"
                icon={<UserX className="w-4 h-4 text-rose-400" />}
                open={openSection === 'suspend'}
                onToggle={() => toggle('suspend')}
              >
                <SuspendUserSection />
              </Section>

              <Section
                title="استعادة حساب معلّق"
                icon={<UserCheck className="w-4 h-4 text-emerald-400" />}
                open={openSection === 'unsuspend'}
                onToggle={() => toggle('unsuspend')}
              >
                <UnsuspendUserSection />
              </Section>

              <Section
                title="🚢 إضافة سيارة قادمة في الطريق"
                icon={<Ship className="w-4 h-4 text-blue-400" />}
                open={openSection === 'transit-add'}
                onToggle={() => toggle('transit-add')}
              >
                <AddTransitCarSection />
              </Section>

              <Section
                title="نقل سيارة قادمة إلى دورة المزاد"
                icon={<ArrowRightLeft className="w-4 h-4 text-orange-400" />}
                open={openSection === 'transit-move'}
                onToggle={() => toggle('transit-move')}
              >
                <MoveTransitSection />
              </Section>

              <Section
                title="نسخة احتياطية فورية"
                icon={<Database className="w-4 h-4 text-blue-400" />}
                open={openSection === 'backup'}
                onToggle={() => toggle('backup')}
              >
                <BackupNowSection />
              </Section>

              <p className="text-[10px] text-slate-500 text-center pt-2 leading-relaxed">
                هذه الأدوات تستدعي endpoints محمية بصلاحيات المدير. الـ JWT يُرسل تلقائياً.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default AdminQuickTools;
