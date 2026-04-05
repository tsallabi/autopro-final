import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Users, DollarSign, RefreshCw, BarChart,
  Plus, Edit2, Trash2, Search, Globe, Zap, Save, X, ChevronLeft, ChevronRight,
  Database, CheckCircle2, AlertCircle, SlidersHorizontal, Download
} from 'lucide-react';
import { BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ReportsPanelProps {
  reportsAnalytics: any;
  setReportsAnalytics: (val: any) => void;
}

interface CarPrice {
  id: string;
  condition: string;
  make: string;
  makeEn: string;
  model: string;
  modelEn: string;
  year: number;
  transmission: string;
  fuel: string;
  mileage: string;
  priceLYD: number | string;
  lastUpdated?: string;
}

const emptyForm: CarPrice = {
  id: '', condition: 'جديد', make: '', makeEn: '', model: '', modelEn: '',
  year: new Date().getFullYear(), transmission: 'اوتوماتيك', fuel: 'بنزين', mileage: '0', priceLYD: ''
};

const API = import.meta.env.VITE_API_URL || '';

export const ReportsPanel: React.FC<ReportsPanelProps> = ({ reportsAnalytics, setReportsAnalytics }) => {
  const [cars, setCars] = useState<CarPrice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [filterCondition, setFilterCondition] = useState('');
  const [refresh, setRefresh] = useState(0);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<CarPrice>(emptyForm);

  // Add new car modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<CarPrice>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchCars = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(pageSize));
      if (searchQ.trim()) params.set('q', searchQ.trim());
      if (filterCondition) params.set('condition', filterCondition);

      const res = await fetch(`${API}/api/libyan-market?${params.toString()}`);
      const json = await res.json();
      if (json && Array.isArray(json.data)) {
        setCars(json.data);
        setTotal(json.total || json.data.length);
        setPages(json.pages || 1);
      } else if (Array.isArray(json)) {
        // fallback if old format
        setCars(json);
        setTotal(json.length);
        setPages(1);
      }
    } catch (e) {
      console.error(e);
      showToast('فشل تحميل البيانات', 'err');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchQ, filterCondition, refresh]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/reports-analytics`);
      const data = await res.json();
      setReportsAnalytics(data);
    } catch (e) {
      console.error(e);
    }
  }, [setReportsAnalytics]);

  useEffect(() => {
    fetchCars();
    fetchAnalytics();
  }, [fetchCars, fetchAnalytics]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setRefresh(r => r + 1); }, 400);
    return () => clearTimeout(t);
  }, [searchQ, filterCondition]);

  // --- Inline edit handlers ---
  const startEdit = (car: CarPrice) => {
    setEditingId(car.id);
    setEditRow({ ...car });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditRow(emptyForm);
  };

  const saveEdit = async () => {
    if (!editRow.make || !editRow.model || !editRow.year) {
      showToast('الماركة والموديل والسنة مطلوبة', 'err');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/libyan-market/${editRow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editRow),
      });
      if (res.ok) {
        showToast('تم الحفظ بنجاح ✓');
        setEditingId(null);
        fetchCars();
      } else {
        showToast('فشل الحفظ', 'err');
      }
    } catch (e) {
      showToast('خطأ في الاتصال', 'err');
    } finally {
      setSaving(false);
    }
  };

  // --- Add new car ---
  const handleAdd = async () => {
    if (!addForm.make || !addForm.model || !addForm.year) {
      showToast('الماركة والموديل والسنة مطلوبة', 'err');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/libyan-market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        showToast('تمت الإضافة بنجاح ✓');
        setShowAddModal(false);
        setAddForm(emptyForm);
        setPage(1);
        fetchCars();
      } else {
        showToast('فشل الإضافة', 'err');
      }
    } catch (e) {
      showToast('خطأ في الاتصال', 'err');
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---
  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`هل تريد حذف: ${name}؟`)) return;
    try {
      const res = await fetch(`${API}/api/libyan-market/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('تم الحذف');
        fetchCars();
      } else {
        showToast('فشل الحذف', 'err');
      }
    } catch (e) {
      showToast('خطأ في الاتصال', 'err');
    }
  };

  // --- Reseed ---
  const handleReseed = async () => {
    if (!window.confirm('سيتم إعادة تحميل جميع بيانات السوق من المصدر الأصلي (227 سيارة). هل تريد المتابعة؟')) return;
    try {
      const res = await fetch(`${API}/api/admin/libyan-market/reseed`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast(`✓ ${json.message}`);
        setPage(1);
        fetchCars();
      }
    } catch (e) {
      showToast('فشل إعادة التهيئة', 'err');
    }
  };

  const conditionColor: Record<string, string> = {
    'جديد': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'مستعمل': 'bg-blue-50 text-blue-700 border-blue-200',
    'وارد أمريكا (حادث)': 'bg-amber-50 text-amber-700 border-amber-200',
  };

  const InlineInput: React.FC<{ value: string | number; onChange: (v: string) => void; type?: string; className?: string; dir?: string }> =
    ({ value, onChange, type = 'text', className = '', dir }) => (
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        dir={dir}
        className={`w-full bg-blue-50 border border-blue-300 rounded-lg px-2 py-1 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${className}`}
      />
    );

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-2 ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <Database className="w-7 h-7 text-orange-500" />
            قاعدة بيانات أسعار السوق الليبي
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            إجمالي السيارات: <span className="font-black text-slate-700">{total.toLocaleString()}</span>
            {' · '}تغذية تلقائية لحقول السعر التقديري في صفحات السيارات
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReseed}
            title="إعادة تحميل البيانات الأصلية"
            className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-200 transition-all border border-slate-200"
          >
            <Download className="w-4 h-4" />
            إعادة تهيئة البيانات
          </button>
          <button
            onClick={() => fetchCars()}
            title="تحديث"
            className="bg-slate-50 text-slate-600 p-3 rounded-xl hover:bg-slate-100 transition-all border border-slate-200"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setAddForm(emptyForm); setShowAddModal(true); }}
            className="bg-orange-500 text-white px-5 py-3 rounded-xl font-black text-sm flex items-center gap-2 hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
          >
            <Plus className="w-5 h-5" />
            إضافة سيارة
          </button>
        </div>
      </div>

      {/* Analytics KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'المستخدمين النشطين', value: reportsAnalytics?.activeUsers || 0, color: 'blue', icon: Users },
          { label: 'إجمالي المزايدات', value: reportsAnalytics?.totalBids || 0, color: 'amber', icon: Zap },
          { label: 'حجم المبيعات (USD)', value: `$${Number(reportsAnalytics?.salesVol || 0).toLocaleString()}`, color: 'emerald', icon: DollarSign },
          { label: 'دقة البيانات', value: '99.8%', color: 'purple', icon: Globe }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
            <div className={`p-3 bg-${stat.color}-50 text-${stat.color}-500 rounded-xl`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400">{stat.label}</p>
              <h3 className="text-xl font-black text-slate-800">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 rounded-3xl p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 blur-[120px] -mr-32 -mt-32 pointer-events-none"></div>
          <div className="relative z-10">
            <h3 className="text-base font-black text-white mb-6 flex items-center gap-2">
              <BarChart className="w-5 h-5 text-orange-400" />
              توزع المبيعات حسب الدولة
            </h3>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={reportsAnalytics?.geoSalesRaw || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" vertical={false} />
                  <XAxis dataKey="country" stroke="#475569" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} itemStyle={{ color: '#fb923c', fontWeight: 'bold' }} />
                  <Bar dataKey="total" fill="#f97316" radius={[6, 6, 0, 0]} barSize={36} />
                </ReBarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            <h3 className="font-black text-slate-800">ملخص قاعدة البيانات</h3>
          </div>
          {[
            { label: 'إجمالي السيارات المسجلة', val: total },
            { label: 'الصفحة الحالية', val: `${page} / ${pages}` },
            { label: 'سيارة في هذه الصفحة', val: cars.length },
            { label: 'آخر تحديث', val: '2026-04-05' },
          ].map((item, i) => (
            <div key={i} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
              <span className="text-slate-500 text-sm font-bold">{item.label}</span>
              <span className="font-black text-slate-800 text-sm">{item.val}</span>
            </div>
          ))}
          <button
            onClick={() => { setAddForm(emptyForm); setShowAddModal(true); }}
            className="mt-2 w-full bg-orange-500 text-white font-black py-3 rounded-xl hover:bg-orange-600 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            إضافة سيارة جديدة
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
        {/* Table Header / Filters */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-8 bg-orange-500 rounded-full"></div>
              <div>
                <h3 className="font-black text-slate-800 text-lg">أسعار السوق الليبي — جميع السيارات</h3>
                <p className="text-xs text-slate-400 font-bold mt-0.5">
                  يمكنك التعديل المباشر بالضغط على زر التعديل في كل صف
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="ابحث بالاسم عربي أو إنجليزي..."
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl py-2.5 pr-10 pl-4 text-sm font-bold w-64 focus:border-orange-400 outline-none transition-all shadow-sm"
                />
              </div>
              {/* Condition filter */}
              <div className="relative">
                <SlidersHorizontal className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  value={filterCondition}
                  onChange={e => { setFilterCondition(e.target.value); setPage(1); }}
                  aria-label="فلترة بالحالة"
                  className="bg-white border border-slate-200 rounded-xl py-2.5 pr-10 pl-4 text-sm font-bold appearance-none focus:border-orange-400 outline-none shadow-sm cursor-pointer"
                >
                  <option value="">جميع الحالات</option>
                  <option value="جديد">جديد / صفر</option>
                  <option value="مستعمل">مستعمل</option>
                  <option value="وارد أمريكا (حادث)">وارد أمريكا (حادث)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right min-w-[900px]">
            <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-4 py-4 text-center w-10">#</th>
                <th className="px-5 py-4">السيارة</th>
                <th className="px-4 py-4">الحالة</th>
                <th className="px-4 py-4">السنة</th>
                <th className="px-4 py-4">ناقل الحركة</th>
                <th className="px-4 py-4">الوقود</th>
                <th className="px-4 py-4">المسافة</th>
                <th className="px-5 py-4">السعر (LYD)</th>
                <th className="px-4 py-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16">
                    <RefreshCw className="w-8 h-8 text-orange-400 animate-spin mx-auto mb-3" />
                    <div className="text-slate-400 font-bold">جاري تحميل البيانات...</div>
                  </td>
                </tr>
              ) : cars.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-400 font-bold">
                    لا توجد نتائج
                    {searchQ && <span className="block text-xs mt-2">جرب بحثاً مختلفاً</span>}
                  </td>
                </tr>
              ) : cars.map((car, idx) => {
                const isEditing = editingId === car.id;
                const rowNum = (page - 1) * pageSize + idx + 1;

                return (
                  <tr key={car.id} className={`group transition-colors ${isEditing ? 'bg-blue-50 border-blue-200' : 'hover:bg-orange-50/30'}`}>
                    {/* Row number */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-[10px] font-black text-slate-300 font-mono">{rowNum}</span>
                    </td>

                    {/* Car name — Arabic big + English small */}
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <div className="flex flex-col gap-1.5 min-w-[200px]">
                          <div className="flex gap-1">
                            <InlineInput value={editRow.make} onChange={v => setEditRow(r => ({ ...r, make: v }))} className="text-base font-black" />
                            <InlineInput value={editRow.model} onChange={v => setEditRow(r => ({ ...r, model: v }))} className="text-base font-black" />
                          </div>
                          <div className="flex gap-1">
                            <InlineInput value={editRow.makeEn} onChange={v => setEditRow(r => ({ ...r, makeEn: v }))} dir="ltr" className="text-xs text-slate-500" />
                            <InlineInput value={editRow.modelEn} onChange={v => setEditRow(r => ({ ...r, modelEn: v }))} dir="ltr" className="text-xs text-slate-500" />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-base font-black text-slate-900 leading-tight">
                            {car.make} {car.model}
                          </div>
                          <div className="text-[11px] font-bold text-slate-400 mt-0.5 tracking-tight uppercase" dir="ltr">
                            {car.makeEn} {car.modelEn}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Condition */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editRow.condition}
                          onChange={e => setEditRow(r => ({ ...r, condition: e.target.value }))}
                          aria-label="حالة السيارة"
                          className="bg-blue-50 border border-blue-300 rounded-lg px-2 py-1 text-xs font-black outline-none"
                        >
                          <option value="جديد">جديد</option>
                          <option value="مستعمل">مستعمل</option>
                          <option value="وارد أمريكا (حادث)">وارد أمريكا (حادث)</option>
                        </select>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${conditionColor[car.condition] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {car.condition}
                        </span>
                      )}
                    </td>

                    {/* Year */}
                    <td className="px-4 py-3 font-mono font-bold text-slate-500 text-sm">
                      {isEditing ? (
                        <InlineInput value={editRow.year} onChange={v => setEditRow(r => ({ ...r, year: parseInt(v) || r.year }))} type="number" className="w-20 text-center" />
                      ) : car.year}
                    </td>

                    {/* Transmission */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editRow.transmission}
                          onChange={e => setEditRow(r => ({ ...r, transmission: e.target.value }))}
                          aria-label="ناقل الحركة"
                          className="bg-blue-50 border border-blue-300 rounded-lg px-2 py-1 text-xs font-black outline-none"
                        >
                          <option value="اوتوماتيك">اوتوماتيك</option>
                          <option value="عادي">عادي</option>
                        </select>
                      ) : (
                        <span className="text-xs font-bold text-slate-600">{car.transmission || '—'}</span>
                      )}
                    </td>

                    {/* Fuel */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editRow.fuel}
                          onChange={e => setEditRow(r => ({ ...r, fuel: e.target.value }))}
                          aria-label="الوقود"
                          className="bg-blue-50 border border-blue-300 rounded-lg px-2 py-1 text-xs font-black outline-none"
                        >
                          <option value="بنزين">بنزين</option>
                          <option value="ديزل">ديزل</option>
                          <option value="هجين">هجين</option>
                          <option value="كهربائي">كهربائي</option>
                        </select>
                      ) : (
                        <span className="text-xs font-bold text-slate-500">{car.fuel || '—'}</span>
                      )}
                    </td>

                    {/* Mileage */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <InlineInput value={editRow.mileage} onChange={v => setEditRow(r => ({ ...r, mileage: v }))} className="w-24 text-xs" />
                      ) : (
                        <span className="font-mono text-xs text-slate-400">{car.mileage ? `${car.mileage} KM` : '—'}</span>
                      )}
                    </td>

                    {/* Price LYD */}
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <InlineInput
                          value={editRow.priceLYD}
                          onChange={v => setEditRow(r => ({ ...r, priceLYD: v }))}
                          type="number"
                          className="text-lg font-black text-orange-600 w-32"
                        />
                      ) : (
                        <div>
                          <div className="text-base font-black text-emerald-600">
                            {car.priceLYD ? Number(car.priceLYD).toLocaleString() : '—'}
                          </div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase">ليبيا دينار</div>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              title="حفظ التعديلات"
                              className="w-9 h-9 flex items-center justify-center bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                            >
                              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={cancelEdit}
                              title="إلغاء"
                              className="w-9 h-9 flex items-center justify-center bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(car)}
                              title="تعديل"
                              className="w-9 h-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(car.id, `${car.make} ${car.model} ${car.year}`)}
                              title="حذف"
                              className="w-9 h-9 flex items-center justify-center bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="text-sm font-bold text-slate-500">
              عرض {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} من {total.toLocaleString()} سيارة
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                title="الصفحة السابقة"
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-orange-400 hover:text-orange-600 disabled:opacity-30 transition-all bg-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const p = Math.max(1, Math.min(pages - 4, page - 2)) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-black transition-all border ${p === page ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20' : 'border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600 bg-white'}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page >= pages}
                title="الصفحة التالية"
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-orange-400 hover:text-orange-600 disabled:opacity-30 transition-all bg-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Car Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md" dir="rtl">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-white/10">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-orange-500/20">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">إضافة سيارة جديدة</h3>
                  <p className="text-slate-400 text-xs font-bold mt-1">أدخل بيانات السيارة بدقة لضمان دقة التسعير</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} title="إغلاق" className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-8 grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">الماركة بالعربي *</label>
                <input type="text" placeholder="مثال: تويوتا" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-50" value={addForm.make} onChange={e => setAddForm(f => ({ ...f, make: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Make (English) *</label>
                <input type="text" placeholder="e.g. Toyota" dir="ltr" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-50" value={addForm.makeEn} onChange={e => setAddForm(f => ({ ...f, makeEn: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">الموديل بالعربي *</label>
                <input type="text" placeholder="مثال: كامري" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-50" value={addForm.model} onChange={e => setAddForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Model (English) *</label>
                <input type="text" placeholder="e.g. Camry" dir="ltr" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-50" value={addForm.modelEn} onChange={e => setAddForm(f => ({ ...f, modelEn: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">سنة الصنع *</label>
                <input type="number" placeholder="2024" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-400" value={addForm.year} onChange={e => setAddForm(f => ({ ...f, year: parseInt(e.target.value) || f.year }))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">السعر بالدينار الليبي (LYD)</label>
                <input type="number" placeholder="0" className="w-full bg-slate-50 border-2 border-orange-100 rounded-xl p-3 text-lg font-black text-orange-600 outline-none focus:border-orange-400" value={addForm.priceLYD} onChange={e => setAddForm(f => ({ ...f, priceLYD: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">الحالة</label>
                <select aria-label="حالة السيارة" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" value={addForm.condition} onChange={e => setAddForm(f => ({ ...f, condition: e.target.value }))}>
                  <option value="جديد">جديد / صفر</option>
                  <option value="مستعمل">مستعمل (خالي صدمة)</option>
                  <option value="وارد أمريكا (حادث)">وارد أمريكا (حادث)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">ناقل الحركة</label>
                <select aria-label="ناقل الحركة" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" value={addForm.transmission} onChange={e => setAddForm(f => ({ ...f, transmission: e.target.value }))}>
                  <option value="اوتوماتيك">اوتوماتيك</option>
                  <option value="عادي">عادي</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">نوع الوقود</label>
                <select aria-label="الوقود" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" value={addForm.fuel} onChange={e => setAddForm(f => ({ ...f, fuel: e.target.value }))}>
                  <option value="بنزين">بنزين</option>
                  <option value="ديزل">ديزل</option>
                  <option value="هجين">هجين</option>
                  <option value="كهربائي">كهربائي</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">المسافة المقطوعة (KM)</label>
                <input type="text" placeholder="مثال: 45000" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-orange-400" value={addForm.mileage} onChange={e => setAddForm(f => ({ ...f, mileage: e.target.value }))} />
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button onClick={handleAdd} disabled={saving} className="flex-grow bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-orange-500 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                حفظ السيارة
              </button>
              <button onClick={() => setShowAddModal(false)} className="px-8 bg-white text-slate-500 font-bold py-4 rounded-2xl border border-slate-200 hover:bg-slate-100 transition-all">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Small inline input component
const InlineInput: React.FC<{
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
  dir?: string;
}> = ({ value, onChange, type = 'text', className = '', dir }) => (
  <input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    dir={dir}
    className={`bg-blue-50 border border-blue-300 rounded-lg px-2 py-1 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${className}`}
  />
);
