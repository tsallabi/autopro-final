import React, { useEffect, useState } from 'react';
import { MapPin, Plus, Edit3, Trash2, Save, X, Globe, Phone, MessageCircle, Map as MapIcon } from 'lucide-react';
import { authFetch } from '../../context/StoreContext';

type Center = {
  id: string;
  name: string;
  nameEn?: string;
  country: string;
  countryCode?: string;
  city: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  latitude: number;
  longitude: number;
  lat?: number;
  lng?: number;
  workingHours?: string;
  services?: string[];
  isActive?: boolean;
  sortOrder?: number;
};

const emptyForm: Partial<Center> = {
  name: '', nameEn: '', country: 'ليبيا', countryCode: 'LY', city: '', address: '',
  phone: '', whatsapp: '', email: '', latitude: 0, longitude: 0,
  workingHours: '', services: [], isActive: true, sortOrder: 0,
};

// Extract lat/lng from a pasted Google Maps URL
function parseMapsUrl(url: string): { lat: number; lng: number } | null {
  if (!url) return null;
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
  const q = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (q) return { lat: parseFloat(q[1]), lng: parseFloat(q[2]) };
  const pair = url.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (pair) return { lat: parseFloat(pair[1]), lng: parseFloat(pair[2]) };
  return null;
}

export const ShippingCentersManager: React.FC = () => {
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Center> | null>(null);
  const [saving, setSaving] = useState(false);
  const [mapsUrl, setMapsUrl] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/shipping-centers');
      const data = await res.json();
      setCenters(data.map((c: any) => ({ ...c, latitude: c.lat ?? c.latitude, longitude: c.lng ?? c.longitude })));
      setError(null);
    } catch {
      setError('تعذر تحميل المراكز');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startAdd = () => { setEditing({ ...emptyForm }); setMapsUrl(''); };
  const startEdit = (c: Center) => { setEditing({ ...c, services: c.services || [] }); setMapsUrl(''); };
  const cancel = () => { setEditing(null); setMapsUrl(''); };

  const save = async () => {
    if (!editing) return;
    if (!editing.name || !editing.country || !editing.city || editing.latitude == null || editing.longitude == null) {
      setError('يرجى تعبئة الاسم، الدولة، المدينة، والإحداثيات');
      return;
    }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const url = isNew ? '/api/admin/shipping-centers' : `/api/admin/shipping-centers/${editing.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'فشل الحفظ');
      }
      setEditing(null);
      setError(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Center) => {
    if (!window.confirm(`تعطيل المركز "${c.name}"؟`)) return;
    try {
      const res = await authFetch(`/api/admin/shipping-centers/${c.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('فشل الحذف');
      await load();
    } catch (e: any) {
      setError(e?.message || 'فشل الحذف');
    }
  };

  const applyMapsUrl = () => {
    const parsed = parseMapsUrl(mapsUrl);
    if (parsed && editing) {
      setEditing({ ...editing, latitude: parsed.lat, longitude: parsed.lng });
      setMapsUrl('');
    } else {
      setError('لم أتمكن من استخراج الإحداثيات من الرابط');
    }
  };

  return (
    <div dir="rtl" className="p-6 md:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-3">
            <MapPin className="w-7 h-7 text-orange-500" />
            مراكز الشحن
          </h2>
          <p className="text-slate-400 font-bold text-sm mt-1">إدارة المراكز التي تظهر في صفحة "أقرب مركز شحن".</p>
        </div>
        <button onClick={startAdd} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl px-5 py-3 transition-colors">
          <Plus className="w-4 h-4" />
          <span>إضافة مركز</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 text-sm font-bold">{error}</div>
      )}

      {editing && (
        <div className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-100 text-lg">{editing.id ? 'تعديل مركز' : 'مركز جديد'}</h3>
            <button onClick={cancel} className="text-slate-400 hover:text-slate-200" aria-label="إغلاق"><X className="w-5 h-5" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="الاسم (عربي)" value={editing.name || ''} onChange={(v) => setEditing({ ...editing, name: v })} />
            <Field label="Name (English)" value={editing.nameEn || ''} onChange={(v) => setEditing({ ...editing, nameEn: v })} />
            <Field label="الدولة" value={editing.country || ''} onChange={(v) => setEditing({ ...editing, country: v })} />
            <Field label="رمز الدولة (LY/AE/...)" value={editing.countryCode || ''} onChange={(v) => setEditing({ ...editing, countryCode: v.toUpperCase() })} />
            <Field label="المدينة" value={editing.city || ''} onChange={(v) => setEditing({ ...editing, city: v })} />
            <Field label="العنوان" value={editing.address || ''} onChange={(v) => setEditing({ ...editing, address: v })} />
            <Field label="الهاتف" value={editing.phone || ''} onChange={(v) => setEditing({ ...editing, phone: v })} />
            <Field label="واتساب" value={editing.whatsapp || ''} onChange={(v) => setEditing({ ...editing, whatsapp: v })} />
            <Field label="البريد الإلكتروني" value={editing.email || ''} onChange={(v) => setEditing({ ...editing, email: v })} />
            <Field label="ساعات العمل" value={editing.workingHours || ''} onChange={(v) => setEditing({ ...editing, workingHours: v })} />
            <Field label="خط العرض (latitude)" type="number" value={String(editing.latitude ?? '')} onChange={(v) => setEditing({ ...editing, latitude: parseFloat(v) })} />
            <Field label="خط الطول (longitude)" type="number" value={String(editing.longitude ?? '')} onChange={(v) => setEditing({ ...editing, longitude: parseFloat(v) })} />
            <Field label="الخدمات (مفصولة بفواصل)" value={(editing.services || []).join(', ')} onChange={(v) => setEditing({ ...editing, services: v.split(',').map((s) => s.trim()).filter(Boolean) })} />
            <Field label="ترتيب العرض" type="number" value={String(editing.sortOrder ?? 0)} onChange={(v) => setEditing({ ...editing, sortOrder: parseInt(v, 10) || 0 })} />
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
            <label className="block text-xs font-black text-slate-300 mb-2">الصق رابط Google Maps لاستخراج الإحداثيات تلقائياً</label>
            <div className="flex gap-2">
              <input value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://www.google.com/maps/@32.88,13.19,15z" className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" />
              <button onClick={applyMapsUrl} type="button" className="bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg px-4 py-2 text-sm">استخراج</button>
            </div>
          </div>

          <label className="flex items-center gap-3 text-slate-200 font-bold cursor-pointer">
            <input type="checkbox" checked={editing.isActive !== false} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
            <span>مفعّل</span>
          </label>

          <div className="flex justify-end gap-3">
            <button onClick={cancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl px-5 py-2.5">إلغاء</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black rounded-xl px-5 py-2.5">
              <Save className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : 'حفظ'}</span>
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center text-slate-400 py-12">جاري التحميل...</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-300">
              <tr>
                <th className="text-right p-3 font-black">الاسم</th>
                <th className="text-right p-3 font-black">الدولة / المدينة</th>
                <th className="text-right p-3 font-black">الهاتف</th>
                <th className="text-right p-3 font-black">الإحداثيات</th>
                <th className="text-right p-3 font-black">الحالة</th>
                <th className="text-center p-3 font-black">إجراءات</th>
              </tr>
            </thead>
            <tbody className="bg-slate-950 text-slate-200">
              {centers.map((c) => (
                <tr key={c.id} className="border-t border-slate-800 hover:bg-slate-900/60">
                  <td className="p-3">
                    <div className="font-black">{c.name}</div>
                    {c.nameEn && <div className="text-xs text-slate-400">{c.nameEn}</div>}
                  </td>
                  <td className="p-3"><Globe className="w-3 h-3 inline-block ml-1 text-slate-500" />{c.country} — {c.city}</td>
                  <td className="p-3">
                    {c.phone && <div className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" />{c.phone}</div>}
                    {c.whatsapp && <div className="flex items-center gap-1 text-xs text-emerald-400"><MessageCircle className="w-3 h-3" />{c.whatsapp}</div>}
                  </td>
                  <td className="p-3 text-xs font-mono">{Number(c.latitude).toFixed(4)}, {Number(c.longitude).toFixed(4)}</td>
                  <td className="p-3">
                    {c.isActive ? (
                      <span className="bg-emerald-500/20 text-emerald-300 text-xs font-black px-2 py-1 rounded-full">مفعّل</span>
                    ) : (
                      <span className="bg-slate-700 text-slate-300 text-xs font-black px-2 py-1 rounded-full">معطّل</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <a href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-orange-400" title="عرض على الخريطة"><MapIcon className="w-4 h-4" /></a>
                      <button onClick={() => startEdit(c)} className="text-blue-400 hover:text-blue-300" title="تعديل"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => remove(c)} className="text-red-400 hover:text-red-300" title="تعطيل"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {centers.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-slate-400">لا توجد مراكز بعد — أضف مركزاً جديداً.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string }> = ({ label, value, onChange, type = 'text' }) => (
  <label className="block">
    <span className="block text-xs font-black text-slate-300 mb-1">{label}</span>
    <input type={type} step="any" value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700 focus:border-orange-500 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none" />
  </label>
);

export default ShippingCentersManager;
