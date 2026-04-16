import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, Image, MousePointerClick, BarChart3, GripVertical, X, Check, ExternalLink } from 'lucide-react';
import { authFetch } from '../../context/StoreContext';

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  linkText: string;
  position: string;
  gradient: string;
  isActive: number;
  sortOrder: number;
  startDate: string | null;
  endDate: string | null;
  clickCount: number;
  viewCount: number;
  createdAt: string;
}

const POSITION_OPTIONS = [
  { value: 'sidebar', label: 'الشريط الجانبي' },
  { value: 'hero', label: 'البانر الرئيسي' },
  { value: 'marketplace_top', label: 'أعلى السوق' },
];

const GRADIENT_OPTIONS = [
  { value: 'from-cyan-500 to-teal-600', label: 'سماوي → أخضر مزرق' },
  { value: 'from-amber-500 to-orange-500', label: 'ذهبي → برتقالي' },
  { value: 'from-blue-500 to-indigo-600', label: 'أزرق → نيلي' },
  { value: 'from-emerald-500 to-green-600', label: 'زمردي → أخضر' },
  { value: 'from-purple-500 to-pink-600', label: 'بنفسجي → وردي' },
  { value: 'from-red-500 to-rose-600', label: 'أحمر → وردي' },
  { value: 'from-slate-700 to-slate-900', label: 'داكن' },
  { value: 'from-orange-500 to-red-500', label: 'برتقالي → أحمر' },
];

const emptyForm = {
  title: '',
  subtitle: '',
  imageUrl: '',
  linkUrl: '',
  linkText: 'التفاصيل',
  position: 'sidebar',
  gradient: 'from-cyan-500 to-blue-600',
  isActive: true,
  sortOrder: 0,
  startDate: '',
  endDate: '',
};

export const BannersManager: React.FC = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [filterPosition, setFilterPosition] = useState<string>('all');

  const fetchBanners = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/banners');
      if (res.ok) {
        const data = await res.json();
        setBanners(data);
      }
    } catch (e) {
      console.error('Failed to fetch banners:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBanners(); }, [fetchBanners]);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        isActive: form.isActive ? 1 : 0,
        sortOrder: Number(form.sortOrder) || 0,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        imageUrl: form.imageUrl || null,
        linkUrl: form.linkUrl || null,
      };
      const url = editingId ? `/api/admin/banners/${editingId}` : '/api/admin/banners';
      const method = editingId ? 'PUT' : 'POST';
      const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        setForm({ ...emptyForm });
        await fetchBanners();
      }
    } catch (e) {
      console.error('Save banner error:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (b: Banner) => {
    setEditingId(b.id);
    setForm({
      title: b.title,
      subtitle: b.subtitle || '',
      imageUrl: b.imageUrl || '',
      linkUrl: b.linkUrl || '',
      linkText: b.linkText || 'التفاصيل',
      position: b.position,
      gradient: b.gradient,
      isActive: !!b.isActive,
      sortOrder: b.sortOrder,
      startDate: b.startDate || '',
      endDate: b.endDate || '',
    });
    setShowForm(true);
  };

  const handleToggle = async (b: Banner) => {
    await authFetch(`/api/admin/banners/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: b.isActive ? 0 : 1 }),
    });
    fetchBanners();
  };

  const handleDelete = async (id: string) => {
    await authFetch(`/api/admin/banners/${id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    fetchBanners();
  };

  const filtered = filterPosition === 'all' ? banners : banners.filter(b => b.position === filterPosition);
  const totalClicks = banners.reduce((s, b) => s + (b.clickCount || 0), 0);
  const totalViews = banners.reduce((s, b) => s + (b.viewCount || 0), 0);
  const activeCount = banners.filter(b => b.isActive).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <Image className="w-8 h-8 text-orange-500" />
            البانرات الإعلانية
          </h2>
          <p className="text-slate-400 text-sm mt-1">إدارة الإعلانات والبانرات في جميع أنحاء المنصة</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ ...emptyForm }); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-all"
        >
          <Plus className="w-4 h-4" /> إضافة بانر جديد
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي البانرات', value: banners.length, icon: Image, color: 'text-blue-400' },
          { label: 'نشطة', value: activeCount, icon: Eye, color: 'text-emerald-400' },
          { label: 'إجمالي النقرات', value: totalClicks, icon: MousePointerClick, color: 'text-orange-400' },
          { label: 'إجمالي المشاهدات', value: totalViews, icon: BarChart3, color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-slate-400 text-xs font-bold">{s.label}</span>
            </div>
            <div className="text-2xl font-black text-white">{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Position filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-400 text-sm font-bold">تصفية:</span>
        {[{ value: 'all', label: 'الكل' }, ...POSITION_OPTIONS].map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilterPosition(opt.value)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${filterPosition === opt.value ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Banner list */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500 font-bold">لا توجد بانرات</div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(b => (
            <div key={b.id} className={`bg-slate-800/60 border rounded-2xl overflow-hidden transition-all ${b.isActive ? 'border-slate-700' : 'border-red-800/50 opacity-60'}`}>
              <div className="flex flex-col md:flex-row">
                {/* Preview */}
                <div className={`w-full md:w-56 min-h-[120px] bg-gradient-to-br ${b.gradient} flex items-center justify-center p-4 relative`}>
                  {b.imageUrl ? (
                    <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover absolute inset-0" />
                  ) : (
                    <div className="text-white/60 text-center">
                      <Image className="w-10 h-10 mx-auto mb-1" />
                      <span className="text-xs">معاينة</span>
                    </div>
                  )}
                  {!b.isActive && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-red-400 font-black text-sm">معطّل</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-white font-black text-lg">{b.title}</h3>
                        {b.subtitle && <p className="text-slate-400 text-sm mt-0.5">{b.subtitle}</p>}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black ${
                        b.position === 'hero' ? 'bg-purple-500/20 text-purple-300' :
                        b.position === 'marketplace_top' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-cyan-500/20 text-cyan-300'
                      }`}>
                        {POSITION_OPTIONS.find(p => p.value === b.position)?.label || b.position}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                      {b.linkUrl && (
                        <span className="flex items-center gap-1"><ExternalLink className="w-3 h-3" />{b.linkUrl}</span>
                      )}
                      <span className="flex items-center gap-1"><MousePointerClick className="w-3 h-3" />{b.clickCount} نقرة</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{b.viewCount} مشاهدة</span>
                      <span>ترتيب: {b.sortOrder}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => handleEdit(b)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-white font-bold flex items-center gap-1 transition-all">
                      <Edit className="w-3.5 h-3.5" /> تعديل
                    </button>
                    <button onClick={() => handleToggle(b)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${b.isActive ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}>
                      {b.isActive ? <><EyeOff className="w-3.5 h-3.5" /> تعطيل</> : <><Eye className="w-3.5 h-3.5" /> تفعيل</>}
                    </button>
                    {deleteConfirm === b.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(b.id)} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> تأكيد</button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs font-bold"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(b.id)} className="px-3 py-1.5 bg-red-500/20 text-red-300 hover:bg-red-500/30 rounded-lg text-xs font-bold flex items-center gap-1 transition-all">
                        <Trash2 className="w-3.5 h-3.5" /> حذف
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white">{editingId ? 'تعديل البانر' : 'إضافة بانر جديد'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-700 rounded-xl"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            {/* Preview */}
            <div className={`w-full h-32 bg-gradient-to-br ${form.gradient} rounded-2xl flex items-center justify-center relative overflow-hidden`}>
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
              ) : null}
              <div className="relative z-10 text-center text-white p-4">
                <h4 className="font-black text-lg drop-shadow">{form.title || 'عنوان البانر'}</h4>
                {form.subtitle && <p className="text-sm text-white/80 mt-1">{form.subtitle}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">العنوان *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white text-sm" placeholder="عنوان البانر" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">العنوان الفرعي</label>
                <input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white text-sm" placeholder="وصف مختصر" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">رابط الصورة</label>
                <input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white text-sm" placeholder="https://..." dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">رابط الوجهة</label>
                <input value={form.linkUrl} onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white text-sm" placeholder="/shipping" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">نص الزر</label>
                <input value={form.linkText} onChange={e => setForm(f => ({ ...f, linkText: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white text-sm" placeholder="التفاصيل" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">الموقع</label>
                <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white text-sm">
                  {POSITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">التدرج اللوني</label>
                <select value={form.gradient} onChange={e => setForm(f => ({ ...f, gradient: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white text-sm">
                  {GRADIENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">الترتيب</label>
                <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white text-sm" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">تاريخ البداية</label>
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white text-sm" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">تاريخ النهاية</label>
                <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white text-sm" dir="ltr" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="w-5 h-5 rounded accent-orange-500" />
                <span className="text-sm font-bold text-slate-300">نشط</span>
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-slate-700">
              <button onClick={handleSave} disabled={saving || !form.title.trim()}
                className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-black text-sm transition-all">
                {saving ? 'جاري الحفظ...' : editingId ? 'حفظ التعديلات' : 'إضافة البانر'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl font-bold text-sm transition-all">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BannersManager;
