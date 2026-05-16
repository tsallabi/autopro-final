/**
 * AuctionSessionsPanel — admin UI for the scheduled multi-session auction feature.
 *
 * Lets ops staff schedule sequential daily auction sessions per vehicle category
 * (cars, trucks, heavy equipment, motorcycles, jet skis, boats), attach cars to
 * each session, edit, cancel, and recur. Live sessions are surfaced at the top
 * with a pulsing dot; past sessions are collapsed by default.
 *
 * Backend endpoints (already exist on server.ts):
 *   GET    /api/admin/auction-sessions
 *   POST   /api/admin/auction-sessions
 *   PATCH  /api/admin/auction-sessions/:id
 *   POST   /api/admin/auction-sessions/:id/cars
 *   DELETE /api/admin/auction-sessions/:id/cars/:carId
 *   POST   /api/admin/auction-sessions/:id/cancel
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Edit, Trash2, RotateCw, Pause, X, AlertCircle, Search, CheckCircle2 } from 'lucide-react';
import { authFetch } from '../../context/StoreContext';

type SessionStatus = 'scheduled' | 'live' | 'closed' | 'cancelled';

interface AuctionSession {
  id: string;
  name: string;
  category: string;
  scheduledStart: string;
  durationMinPerCar: number;
  transitionGraceSeconds?: number;
  status: SessionStatus;
  actualStart?: string | null;
  actualEnd?: string | null;
  recurringDaily?: 0 | 1;
  recurringTime?: string | null;
  carCount?: number;
  soldCount?: number;
  createdAt?: string;
}

interface CarLite {
  id: string;
  lotNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  price?: number | string;
  status?: string;
  category?: string;
}

interface CategoryDef {
  key: string;
  label: string;
  icon: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'cars', label: 'سيارات ركوبة', icon: '🚗' },
  { key: 'trucks', label: 'شاحنات', icon: '🚚' },
  { key: 'heavy_equipment', label: 'معدات ثقيلة', icon: '🏗️' },
  { key: 'motorcycles', label: 'دراجات نارية', icon: '🏍️' },
  { key: 'jet_skis', label: 'دراجات بحرية', icon: '🌊' },
  { key: 'boats', label: 'قوارب', icon: '🚤' },
];

const CAT_MAP: Record<string, CategoryDef> = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

function catOf(key: string): CategoryDef {
  return CAT_MAP[key] || { key, label: key, icon: '📦' };
}

function fmtAbs(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US');
  } catch {
    return iso;
  }
}

/** Relative-Arabic string for a future / past instant. */
function fmtRelative(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const now = Date.now();
  const diffMin = Math.round((t - now) / 60000);
  const abs = Math.abs(diffMin);

  if (diffMin > 0) {
    if (abs < 1) return 'الآن';
    if (abs < 60) return `بعد ${abs} دقيقة`;
    if (abs < 24 * 60) {
      const h = Math.round(abs / 60);
      return `بعد ${h} ساعة`;
    }
    const d = Math.round(abs / (60 * 24));
    return `بعد ${d} يوم`;
  } else {
    if (abs < 1) return 'الآن';
    if (abs < 60) return `قبل ${abs} دقيقة`;
    if (abs < 24 * 60) {
      const sameDay = new Date(t).toDateString() === new Date().toDateString();
      const hhmm = new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return sameDay ? `اليوم ${hhmm}` : `أمس ${hhmm}`;
    }
    const d = Math.round(abs / (60 * 24));
    return `قبل ${d} يوم`;
  }
}

/** Combine a YYYY-MM-DD + HH:MM (Libya local, UTC+2) into a full ISO. */
function combineToIso(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return '';
  // Treat the input as Libya local time (UTC+2). Browsers parse `YYYY-MM-DDTHH:MM`
  // as the user's local zone, so we just rely on the user's machine being close.
  // We append `:00` for seconds; backend stores ISO.
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

/** Split an ISO back into YYYY-MM-DD / HH:MM for form pre-fill. */
function splitIso(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

interface FormState {
  name: string;
  category: string;
  date: string;
  time: string;
  durationMinPerCar: number;
  transitionGraceSeconds: number;
  recurringDaily: boolean;
  recurringTime: string;
  carIds: string[];
}

const EMPTY_FORM: FormState = {
  name: '',
  category: 'cars',
  date: '',
  time: '',
  durationMinPerCar: 5,
  transitionGraceSeconds: 7,
  recurringDaily: false,
  recurringTime: '',
  carIds: [],
};

export default function AuctionSessionsPanel() {
  const [sessions, setSessions] = useState<AuctionSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AuctionSession | null>(null);
  const [bulkAddTarget, setBulkAddTarget] = useState<AuctionSession | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/auction-sessions');
      if (!res.ok) {
        setError('فشل تحميل الجلسات');
        setSessions([]);
        return;
      }
      const data = await res.json();
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch {
      setError('خطأ في الاتصال بالخادم');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // Group sessions: live first, scheduled (ASC by start), then closed/cancelled
  const { live, scheduled, past } = useMemo(() => {
    const live: AuctionSession[] = [];
    const scheduled: AuctionSession[] = [];
    const past: AuctionSession[] = [];
    for (const s of sessions) {
      if (s.status === 'live') live.push(s);
      else if (s.status === 'scheduled') scheduled.push(s);
      else past.push(s);
    }
    scheduled.sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
    past.sort((a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime());
    return { live, scheduled, past };
  }, [sessions]);

  const handleCancel = async (s: AuctionSession) => {
    const strong = s.status === 'live'
      ? 'هذه الجلسة مباشرة الآن! إلغاؤها سيوقف المزاد فوراً. هل أنت متأكد؟'
      : 'هل أنت متأكد؟ السيارات ستعود إلى مخزون السيارات.';
    if (!window.confirm(strong)) return;
    try {
      const res = await authFetch(`/api/admin/auction-sessions/${s.id}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        window.alert(err?.error || 'فشل إلغاء الجلسة');
        return;
      }
      fetchSessions();
    } catch {
      window.alert('خطأ في الاتصال');
    }
  };

  const handleRecur = (s: AuctionSession) => {
    // Open create modal pre-filled from a previous session (tomorrow same time)
    const { time } = splitIso(s.scheduledStart);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
    setEditing(null);
    setShowCreate(true);
    // Defer prefill via a ref-like pattern; we just stash it in window for the modal to consume.
    (window as any).__recurPrefill = {
      name: s.name,
      category: s.category,
      date: dateStr,
      time: time || '18:00',
      durationMinPerCar: s.durationMinPerCar || 5,
      transitionGraceSeconds: s.transitionGraceSeconds ?? 7,
      recurringDaily: false,
      recurringTime: '',
      carIds: [],
    };
  };

  return (
    <div className="p-6 md:p-8 animate-in fade-in duration-300" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-2xl">
            <Calendar className="w-9 h-9 text-orange-500" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-800">📅 إدارة جلسات المزاد الحي</h2>
            <p className="text-slate-500 text-sm mt-1 font-bold">
              جدول مزادات يومية مجدولة (سيارات + شاحنات + دراجات + قوارب...)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={async () => {
              if (!window.confirm('تحرير كل السيارات العالقة من جلسات منتهية؟ ستصبح متاحة لجلسة اليوم.')) return;
              try {
                const res = await authFetch('/api/admin/auction-sessions/free-orphans', { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  alert(data?.error || 'فشل تحرير السيارات');
                  return;
                }
                alert(`تم تحرير ${data?.freed ?? 0} سيارة. يمكنك الآن نقلها إلى الجلسات.`);
                fetchSessions();
              } catch (e: any) {
                alert(e?.message || 'فشل تحرير السيارات');
              }
            }}
            className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-black px-5 py-3 rounded-2xl border border-amber-300 transition-all active:scale-95 flex items-center gap-2"
            title="إذا كانت السيارات متاحة في تبويب قريباً لكن الجلسة تقول 0، اضغط هنا"
          >
            🔓 تحرير السيارات العالقة
          </button>
          <button
            onClick={() => { setEditing(null); setShowCreate(true); }}
            className="bg-orange-500 hover:bg-orange-600 text-white font-black px-6 py-3 rounded-2xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            جلسة جديدة
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl font-bold flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-slate-500 font-bold">
          جاري التحميل...
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="text-6xl mb-4">📅</div>
          <h3 className="text-xl font-black text-slate-800 mb-2">لا توجد جلسات</h3>
          <p className="text-slate-500 font-bold mb-6">أنشئ جلستك الأولى لجدولة مزاد قادم</p>
          <button
            onClick={() => { setEditing(null); setShowCreate(true); }}
            className="bg-orange-500 hover:bg-orange-600 text-white font-black px-6 py-3 rounded-2xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            إنشاء جلسة جديدة
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* LIVE */}
          {live.length > 0 && (
            <section>
              <h3 className="font-black text-sm text-emerald-600 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                مباشرة الآن ({live.length})
              </h3>
              <div className="space-y-3">
                {live.map(s => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onCancel={() => handleCancel(s)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* SCHEDULED */}
          {scheduled.length > 0 && (
            <section>
              <h3 className="font-black text-sm text-blue-600 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                قادمة ({scheduled.length})
              </h3>
              <div className="space-y-3">
                {scheduled.map(s => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onEdit={() => { setShowCreate(false); setEditing(s); }}
                    onCancel={() => handleCancel(s)}
                    onBulkAdd={() => setBulkAddTarget(s)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* PAST (collapsed) */}
          {past.length > 0 && (
            <section>
              <button
                onClick={() => setShowPast(v => !v)}
                className="w-full text-right bg-slate-100 hover:bg-slate-200 transition-colors rounded-2xl p-4 font-black text-slate-700 flex items-center justify-between"
              >
                <span>سابقة ({past.length})</span>
                <span className="text-xs text-slate-500">{showPast ? 'إخفاء ▲' : 'إظهار ▼'}</span>
              </button>
              {showPast && (
                <div className="space-y-3 mt-3">
                  {past.map(s => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      onRecur={() => handleRecur(s)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      {(showCreate || editing) && (
        <SessionFormModal
          editing={editing}
          onClose={() => { setShowCreate(false); setEditing(null); (window as any).__recurPrefill = null; }}
          onSaved={() => { setShowCreate(false); setEditing(null); (window as any).__recurPrefill = null; fetchSessions(); }}
        />
      )}

      {/* Bulk-add modal */}
      {bulkAddTarget && (
        <BulkAddModal
          session={bulkAddTarget}
          onClose={() => setBulkAddTarget(null)}
          onDone={() => { setBulkAddTarget(null); fetchSessions(); }}
        />
      )}
    </div>
  );
}

/* ============================================================
   Session Card
   ============================================================ */

function SessionCard({
  session,
  onEdit,
  onCancel,
  onRecur,
  onBulkAdd,
}: {
  session: AuctionSession;
  onEdit?: () => void;
  onCancel?: () => void;
  onRecur?: () => void;
  onBulkAdd?: () => void;
}) {
  const cat = catOf(session.category);

  let pill: React.ReactNode;
  if (session.status === 'live') {
    pill = (
      <span className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 font-black text-xs px-3 py-1 rounded-full">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        🟢 الآن
      </span>
    );
  } else if (session.status === 'scheduled') {
    pill = (
      <span className="bg-blue-100 text-blue-700 font-black text-xs px-3 py-1 rounded-full">
        🔵 قادم
      </span>
    );
  } else if (session.status === 'cancelled') {
    pill = (
      <span className="bg-rose-100 text-rose-700 font-black text-xs px-3 py-1 rounded-full">
        ❌ ملغى
      </span>
    );
  } else {
    pill = (
      <span className="bg-slate-100 text-slate-600 font-black text-xs px-3 py-1 rounded-full">
        ⚪ منتهى
      </span>
    );
  }

  const isLive = session.status === 'live';
  const isScheduled = session.status === 'scheduled';
  const isClosedLike = session.status === 'closed' || session.status === 'cancelled';

  return (
    <div className={`bg-white rounded-2xl border ${isLive ? 'border-emerald-300 shadow-lg shadow-emerald-100' : 'border-slate-200 shadow-sm'} p-5 transition-all`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            {pill}
            <h4 className="font-black text-lg text-slate-800">{session.name}</h4>
            {session.recurringDaily === 1 && (
              <span className="bg-amber-100 text-amber-700 font-black text-[10px] px-2 py-1 rounded-full inline-flex items-center gap-1">
                <RotateCw className="w-3 h-3" /> يتكرر يومياً
                {session.recurringTime ? ` (${session.recurringTime})` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-x-4 gap-y-1 text-sm text-slate-600 font-bold flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-lg">{cat.icon}</span> {cat.label}
            </span>
            <span className="text-slate-300">●</span>
            <span title={fmtAbs(session.scheduledStart)}>
              {fmtRelative(session.scheduledStart)}
              <span className="text-slate-400 mr-2 font-normal ltr:ml-2" dir="ltr">
                {fmtAbs(session.scheduledStart)}
              </span>
            </span>
            <span className="text-slate-300">●</span>
            <span>{session.carCount ?? 0} مركبة</span>
            {typeof session.soldCount === 'number' && session.soldCount > 0 && (
              <>
                <span className="text-slate-300">●</span>
                <span className="text-emerald-600">{session.soldCount} مباعة</span>
              </>
            )}
            <span className="text-slate-300">●</span>
            <span className="text-slate-500">{session.durationMinPerCar} د/سيارة</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isScheduled && (
            <>
              <button
                onClick={onBulkAdd}
                title="نقل السيارات الموجودة في المخزون إلى هذه الجلسة (آمن — لا يلمس السيارات في البث المباشر)"
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black px-4 py-2 rounded-xl text-xs transition-all active:scale-95 inline-flex items-center gap-1.5"
              >
                📥 نقل سيارات
              </button>
              <button
                onClick={onEdit}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black px-4 py-2 rounded-xl text-xs transition-all active:scale-95 inline-flex items-center gap-1.5"
              >
                <Edit className="w-4 h-4" /> تعديل
              </button>
              <button
                onClick={onCancel}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-black px-4 py-2 rounded-xl text-xs transition-all active:scale-95 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> إلغاء
              </button>
            </>
          )}
          {isLive && (
            <button
              onClick={onCancel}
              className="bg-rose-500 hover:bg-rose-600 text-white font-black px-4 py-2 rounded-xl text-xs transition-all active:scale-95 inline-flex items-center gap-1.5"
            >
              <Pause className="w-4 h-4" /> إيقاف الجلسة
            </button>
          )}
          {isClosedLike && (
            <button
              onClick={onRecur}
              className="bg-orange-50 hover:bg-orange-100 text-orange-700 font-black px-4 py-2 rounded-xl text-xs transition-all active:scale-95 inline-flex items-center gap-1.5"
            >
              <RotateCw className="w-4 h-4" /> تكرار
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Create / Edit Form Modal
   ============================================================ */

function SessionFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: AuctionSession | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const recurPrefill: Partial<FormState> | null =
    (typeof window !== 'undefined' && (window as any).__recurPrefill) || null;

  const [form, setForm] = useState<FormState>(() => {
    if (editing) {
      const { date, time } = splitIso(editing.scheduledStart);
      return {
        name: editing.name || '',
        category: editing.category || 'cars',
        date,
        time,
        durationMinPerCar: editing.durationMinPerCar || 5,
        transitionGraceSeconds: editing.transitionGraceSeconds ?? 7,
        recurringDaily: editing.recurringDaily === 1,
        recurringTime: editing.recurringTime || '',
        carIds: [],
      };
    }
    if (recurPrefill) {
      return { ...EMPTY_FORM, ...recurPrefill };
    }
    return { ...EMPTY_FORM };
  });

  const [cars, setCars] = useState<CarLite[]>([]);
  const [carsLoading, setCarsLoading] = useState(false);
  const [carQuery, setCarQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setCarsLoading(true);
      try {
        const res = await authFetch('/api/cars');
        if (!res.ok) {
          if (!cancelled) setCars([]);
          return;
        }
        const data = await res.json();
        // /api/cars may return an array or { cars: [] }
        const list: CarLite[] = Array.isArray(data) ? data : (data?.cars || []);
        if (!cancelled) setCars(list);
      } catch {
        if (!cancelled) setCars([]);
      } finally {
        if (!cancelled) setCarsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const filteredCars = useMemo(() => {
    const q = carQuery.trim().toLowerCase();
    return cars.filter(c => {
      if ((c.status || '').toLowerCase() !== 'upcoming') return false;
      if (c.category && c.category !== form.category) {
        // tolerate cars without explicit category
        return false;
      }
      if (!q) return true;
      const blob = `${c.lotNumber || ''} ${c.make || ''} ${c.model || ''} ${c.year || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [cars, carQuery, form.category]);

  // Cars without an explicit category still need to be shown when none match
  const fallbackCars = useMemo(() => {
    if (filteredCars.length > 0) return [];
    const q = carQuery.trim().toLowerCase();
    return cars.filter(c => {
      if ((c.status || '').toLowerCase() !== 'upcoming') return false;
      if (c.category) return false; // these are already filtered
      if (!q) return true;
      const blob = `${c.lotNumber || ''} ${c.make || ''} ${c.model || ''} ${c.year || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [cars, carQuery, filteredCars]);

  const carsForDisplay = filteredCars.length > 0 ? filteredCars : fallbackCars;

  const toggleCar = (id: string) => {
    setForm(f => ({
      ...f,
      carIds: f.carIds.includes(id) ? f.carIds.filter(x => x !== id) : [...f.carIds, id],
    }));
  };
  const selectAll = () => setForm(f => ({ ...f, carIds: carsForDisplay.map(c => c.id) }));
  const clearAll = () => setForm(f => ({ ...f, carIds: [] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim()) { setFormError('الاسم مطلوب'); return; }
    if (!form.date || !form.time) { setFormError('التاريخ والوقت مطلوبان'); return; }

    const scheduledStart = combineToIso(form.date, form.time);
    if (!scheduledStart) { setFormError('تاريخ غير صالح'); return; }

    if (!editing) {
      // creating: must be in future
      if (new Date(scheduledStart).getTime() <= Date.now()) {
        setFormError('وقت الجلسة يجب أن يكون في المستقبل');
        return;
      }
    }

    if (form.durationMinPerCar < 1 || form.durationMinPerCar > 60) {
      setFormError('المدة بين 1 و 60 دقيقة');
      return;
    }
    if (form.transitionGraceSeconds < 0 || form.transitionGraceSeconds > 60) {
      setFormError('مدة الانتقال بين السيارات بين 0 و 60 ثانية');
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        const body: any = {
          name: form.name.trim(),
          scheduledStart,
          durationMinPerCar: form.durationMinPerCar,
          transitionGraceSeconds: form.transitionGraceSeconds,
          recurringDaily: form.recurringDaily ? 1 : 0,
          recurringTime: form.recurringDaily ? form.recurringTime || null : null,
        };
        const res = await authFetch(`/api/admin/auction-sessions/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setFormError(err?.error || 'فشل حفظ التعديلات');
          return;
        }
        // If cars were also chosen, attach them
        if (form.carIds.length > 0) {
          await authFetch(`/api/admin/auction-sessions/${editing.id}/cars`, {
            method: 'POST',
            body: JSON.stringify({ carIds: form.carIds }),
          });
        }
      } else {
        const body: any = {
          name: form.name.trim(),
          category: form.category,
          scheduledStart,
          durationMinPerCar: form.durationMinPerCar,
          transitionGraceSeconds: form.transitionGraceSeconds,
          carIds: form.carIds,
        };
        if (form.recurringDaily) {
          body.recurringDaily = 1;
          body.recurringTime = form.recurringTime || null;
        }
        const res = await authFetch('/api/admin/auction-sessions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setFormError(err?.error || 'فشل إنشاء الجلسة');
          return;
        }
      }
      onSaved();
    } catch {
      setFormError('خطأ في الاتصال');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <Calendar className="w-7 h-7 text-orange-500" />
            {editing ? 'تعديل الجلسة' : 'جلسة مزاد جديدة'}
          </h3>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5 flex-1">
          {formError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> {formError}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase">اسم الجلسة *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="مزاد السيارات الركوبة"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase">الفئة *</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {CATEGORIES.map(c => {
                const active = form.category === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    disabled={!!editing}
                    onClick={() => setForm(f => ({ ...f, category: c.key, carIds: [] }))}
                    className={`p-3 rounded-xl text-sm font-black border transition-all text-right flex items-center gap-2
                      ${active ? 'bg-orange-500 text-white border-orange-500' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}
                      ${editing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <span className="text-lg">{c.icon}</span> {c.label}
                  </button>
                );
              })}
            </div>
            {editing && (
              <p className="text-[11px] text-slate-400 mt-1.5 font-bold">لا يمكن تغيير الفئة بعد إنشاء الجلسة</p>
            )}
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase">التاريخ *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase">الوقت *</label>
              <input
                type="time"
                required
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-bold -mt-3">⏰ بتوقيت ليبيا (UTC+2)</p>

          {/* Duration */}
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase">مدة كل سيارة (دقائق) *</label>
            <input
              type="number"
              min={1}
              max={60}
              required
              value={form.durationMinPerCar}
              onChange={e => setForm(f => ({ ...f, durationMinPerCar: Number(e.target.value) || 5 }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-500"
            />
          </div>

          {/* Transition grace between cars */}
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase">مدة الانتقال بين السيارات (ثوان)</label>
            <input
              type="number"
              min={0}
              max={60}
              value={form.transitionGraceSeconds}
              onChange={e => setForm(f => ({ ...f, transitionGraceSeconds: Number(e.target.value) }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-500"
            />
            <p className="text-[11px] text-slate-500 mt-1 font-medium">
              الوقت الذي تظهر فيه شاشة "السيارة القادمة هي ..." قبل بدء مزاد السيارة التالية. الافتراضي 7 ثوان.
            </p>
          </div>

          {/* Recurring */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-black text-sm text-slate-700">يتكرر يومياً</span>
              <input
                type="checkbox"
                checked={form.recurringDaily}
                onChange={e => setForm(f => ({ ...f, recurringDaily: e.target.checked }))}
                className="w-5 h-5 accent-orange-500"
              />
            </label>
            {form.recurringDaily && (
              <div className="mt-3">
                <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase">وقت التكرار اليومي</label>
                <input
                  type="time"
                  value={form.recurringTime}
                  onChange={e => setForm(f => ({ ...f, recurringTime: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-500"
                />
              </div>
            )}
          </div>

          {/* Cars */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="block text-xs font-black text-slate-400 uppercase">
                السيارات ({form.carIds.length} مختارة)
              </label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={selectAll}
                  className="text-[11px] font-black text-orange-600 hover:text-orange-700">
                  تحديد الكل
                </button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={clearAll}
                  className="text-[11px] font-black text-slate-500 hover:text-slate-700">
                  إلغاء التحديد
                </button>
              </div>
            </div>

            <div className="relative mb-2">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={carQuery}
                onChange={e => setCarQuery(e.target.value)}
                placeholder="بحث (LOT، صنع، موديل، سنة)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pr-9 text-sm outline-none focus:border-orange-500"
              />
            </div>

            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100">
              {carsLoading ? (
                <div className="p-4 text-center text-slate-500 text-sm font-bold">جاري تحميل السيارات...</div>
              ) : carsForDisplay.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm font-bold">
                  لا توجد سيارات قادمة متاحة لهذه الفئة
                </div>
              ) : (
                carsForDisplay.map(c => {
                  const checked = form.carIds.includes(c.id);
                  const priceNum = typeof c.price === 'string' ? Number(c.price) : c.price;
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${checked ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCar(c.id)}
                        className="w-4 h-4 accent-orange-500"
                      />
                      <div className="flex-1 text-sm font-bold text-slate-700">
                        🏷️ <span className="font-mono text-xs">{c.lotNumber || c.id}</span>
                        {' — '}
                        {c.year ? `${c.year} ` : ''}{c.make || ''} {c.model || ''}
                        {priceNum ? <span className="text-emerald-600"> — ${Number(priceNum).toLocaleString()}</span> : null}
                      </div>
                      {checked && <CheckCircle2 className="w-4 h-4 text-orange-500" />}
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-black px-5 py-2.5 rounded-xl text-sm transition-all"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black px-6 py-2.5 rounded-xl text-sm shadow-lg shadow-orange-500/20 transition-all active:scale-95 inline-flex items-center gap-2"
          >
            {submitting ? 'جاري الحفظ...' : (editing ? '✓ حفظ التعديلات' : '+ إنشاء الجلسة')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Bulk-Add Modal — safely move free upcoming cars into a session
   ============================================================ */

interface BulkPreview {
  sessionCategory: string;
  totalFreeUpcoming: number;
  matchingCategory: number;
  uncategorized: number;
  defaultMode: 'matching' | 'uncategorized';
}

function BulkAddModal({
  session,
  onClose,
  onDone,
}: {
  session: AuctionSession;
  onClose: () => void;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'matching' | 'uncategorized' | 'all'>('matching');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ attached: number; candidates: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`/api/admin/auction-sessions/${session.id}/bulk-add-preview`);
        const data = await res.json();
        if (!res.ok) {
          setErr(data?.error || 'فشل التحضير');
        } else {
          setPreview(data);
          setMode(data.defaultMode || 'matching');
        }
      } catch (e: any) {
        setErr(e?.message || 'خطأ في الاتصال');
      } finally {
        setLoading(false);
      }
    })();
  }, [session.id]);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await authFetch(`/api/admin/auction-sessions/${session.id}/bulk-add`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error || 'فشل النقل');
      } else {
        setResult({ attached: data.attached, candidates: data.candidates });
      }
    } catch (e: any) {
      setErr(e?.message || 'خطأ في الاتصال');
    } finally {
      setSubmitting(false);
    }
  }

  const catLabel = catOf(session.category)?.label || session.category;
  const willMove =
    mode === 'matching' ? preview?.matchingCategory ?? 0 :
    mode === 'uncategorized' ? preview?.uncategorized ?? 0 :
    preview?.totalFreeUpcoming ?? 0;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
            📥 نقل سيارات إلى جلسة
          </h3>
          <p className="text-xs text-slate-500 font-bold mt-1">
            الجلسة: <span className="font-black text-slate-700">{session.name}</span> · {catLabel}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {loading && <div className="text-center text-slate-500 font-bold py-6">...جاري التحضير</div>}

          {!loading && err && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold rounded-xl p-3">
              ❌ {err}
            </div>
          )}

          {!loading && preview && !result && (
            <>
              <div className="bg-blue-50 border border-blue-100 text-blue-800 text-xs font-bold rounded-xl p-3">
                🔒 <strong>آمن:</strong> سيتم نقل السيارات في وضع <code>upcoming</code> فقط — لن نلمس أي سيارة في البث المباشر.
              </div>

              <div className="space-y-2">
                <label className="block">
                  <input
                    type="radio"
                    checked={mode === 'matching'}
                    onChange={() => setMode('matching')}
                    className="ml-2"
                  />
                  <span className="font-bold text-slate-800">سيارات من نفس الفئة ({catLabel})</span>
                  <span className="text-xs text-slate-500 font-bold mr-2">
                    — {preview.matchingCategory} سيارة
                  </span>
                </label>

                <label className="block">
                  <input
                    type="radio"
                    checked={mode === 'uncategorized'}
                    onChange={() => setMode('uncategorized')}
                    className="ml-2"
                  />
                  <span className="font-bold text-slate-800">سيارات بدون فئة محددة</span>
                  <span className="text-xs text-slate-500 font-bold mr-2">
                    — {preview.uncategorized} سيارة (المخزون الحالي قبل تحديث الفئات)
                  </span>
                </label>

                <label className="block">
                  <input
                    type="radio"
                    checked={mode === 'all'}
                    onChange={() => setMode('all')}
                    className="ml-2"
                  />
                  <span className="font-bold text-slate-800">⚠️ كل السيارات الـ upcoming</span>
                  <span className="text-xs text-slate-500 font-bold mr-2">
                    — {preview.totalFreeUpcoming} سيارة (بصرف النظر عن الفئة — استخدم بحذر)
                  </span>
                </label>
              </div>

              <div className="bg-amber-50 border border-amber-200 text-amber-900 font-bold rounded-xl p-3 text-sm text-center">
                سيتم نقل <span className="text-2xl font-black text-amber-700 mx-2">{willMove}</span> سيارة
              </div>
            </>
          )}

          {result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <div className="text-4xl mb-2">✅</div>
              <div className="font-black text-emerald-700 text-lg">
                تم نقل {result.attached} سيارة بنجاح
              </div>
              {result.attached !== result.candidates && (
                <div className="text-xs text-emerald-600 font-bold mt-1">
                  ({result.candidates - result.attached} سيارة تم تخطّيها — قد تكون في جلسة أخرى)
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          {!result ? (
            <>
              <button
                onClick={onClose}
                disabled={submitting}
                className="bg-white hover:bg-slate-100 text-slate-700 font-black px-4 py-2 rounded-xl text-sm transition-all"
              >
                إلغاء
              </button>
              <button
                disabled={submitting || loading || willMove === 0}
                onClick={submit}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-black px-6 py-2 rounded-xl text-sm shadow-lg shadow-emerald-500/20 transition-all active:scale-95 inline-flex items-center gap-2"
              >
                {submitting ? '...جاري النقل' : `📥 نقل ${willMove} سيارة`}
              </button>
            </>
          ) : (
            <button
              onClick={onDone}
              className="bg-orange-500 hover:bg-orange-600 text-white font-black px-6 py-2 rounded-xl text-sm shadow-lg shadow-orange-500/20 transition-all active:scale-95"
            >
              تم
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
