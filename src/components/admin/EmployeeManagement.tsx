import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, UserCheck, ClipboardList, Star, Activity,
  Plus, ChevronDown, ChevronUp, RefreshCw, Clock,
  CheckCircle2, AlertCircle, Search, X, Calendar,
  BarChart3, LogIn, Car, MessageSquare, Loader2,
  StarOff, TrendingUp, ListTodo, FileText, Send
} from 'lucide-react';
import { authFetch } from '../../context/StoreContext';
import { useStore } from '../../context/StoreContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  lastActive: string;
  pendingTasks: number;
  carsAdded: number;
  rating: number;
  avatar?: string;
  isOnline?: boolean;
}

interface EmployeeStats {
  total: number;
  activeToday: number;
  pendingTasks: number;
  avgRating: number;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
  dueDate: string;
  createdAt: string;
}

interface ActivityLog {
  id: string;
  action: string;
  details: string;
  timestamp: string;
  type: 'login' | 'car' | 'bid' | 'task' | 'other';
}

interface Review {
  id: string;
  rating: number;
  period: string;
  notes: string;
  createdAt: string;
  reviewerName?: string;
}

interface Performance {
  carsAdded: number;
  customersHandled: number;
  tasksCompleted: number;
  loginHours: number;
  avgResponseTime: string;
  completionRate: number;
}

// ─── Priority / Status helpers ───────────────────────────────────────────────

const PRIORITY_MAP: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: 'عاجل', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  high: { label: 'عالي', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  medium: { label: 'متوسط', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  low: { label: 'منخفض', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'معلق', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  in_progress: { label: 'قيد التنفيذ', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  completed: { label: 'مكتمل', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
};

const PERIOD_OPTIONS = [
  { value: 'monthly', label: 'شهري' },
  { value: 'quarterly', label: 'ربع سنوي' },
  { value: 'annual', label: 'سنوي' },
];

// ─── Star Rating Component ───────────────────────────────────────────────────

const StarRating: React.FC<{ rating: number; onChange?: (r: number) => void; size?: number }> = ({
  rating, onChange, size = 18
}) => (
  <div className="flex gap-0.5" dir="ltr">
    {[1, 2, 3, 4, 5].map(i => (
      <button
        key={i}
        type="button"
        onClick={() => onChange?.(i)}
        disabled={!onChange}
        className={`transition-colors ${onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
      >
        <Star
          size={size}
          className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}
        />
      </button>
    ))}
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

export const EmployeeManagementPanel: React.FC = () => {
  const { showAlert } = useStore();

  // Data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<EmployeeStats>({ total: 0, activeToday: 0, pendingTasks: 0, avgRating: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Expanded employee
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'performance' | 'tasks' | 'activity' | 'reviews'>('performance');

  // Detail data (per employee)
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Task form
  const [taskForm, setTaskForm] = useState({ title: '', description: '', priority: 'medium', dueDate: '' });
  const [taskSaving, setTaskSaving] = useState(false);

  // Review form
  const [reviewForm, setReviewForm] = useState({ rating: 0, period: 'monthly', notes: '' });
  const [reviewSaving, setReviewSaving] = useState(false);

  // ─── Fetch employees ─────────────────────────────────────────────────────

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/employees');
      const data = await res.json();
      if (data.employees && Array.isArray(data.employees)) {
        setEmployees(data.employees);
        setStats({
          total: data.total ?? data.employees.length,
          activeToday: data.activeToday ?? 0,
          pendingTasks: data.pendingTasks ?? 0,
          avgRating: data.avgRating ?? 0,
        });
      } else if (Array.isArray(data)) {
        setEmployees(data);
        setStats({
          total: data.length,
          activeToday: data.filter((e: Employee) => e.isOnline).length,
          pendingTasks: data.reduce((sum: number, e: Employee) => sum + (e.pendingTasks || 0), 0),
          avgRating: data.length > 0 ? +(data.reduce((sum: number, e: Employee) => sum + (e.rating || 0), 0) / data.length).toFixed(1) : 0,
        });
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
      showAlert('فشل في تحميل بيانات الموظفين', 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // ─── Fetch detail data when expanding ────────────────────────────────────

  const fetchDetailData = useCallback(async (employeeId: string, tab: string) => {
    setDetailLoading(true);
    try {
      switch (tab) {
        case 'performance': {
          const res = await authFetch(`/api/admin/employees/${employeeId}/performance`);
          const data = await res.json();
          setPerformance(data);
          break;
        }
        case 'tasks': {
          const res = await authFetch(`/api/admin/employees/${employeeId}/tasks`);
          const data = await res.json();
          setTasks(Array.isArray(data) ? data : data.tasks || []);
          break;
        }
        case 'activity': {
          const res = await authFetch(`/api/admin/employees/${employeeId}/activity`);
          const data = await res.json();
          setActivityLog(Array.isArray(data) ? data : data.activities || []);
          break;
        }
        case 'reviews': {
          const res = await authFetch(`/api/admin/employees/${employeeId}/performance`);
          const data = await res.json();
          setReviews(data.reviews || []);
          break;
        }
      }
    } catch (err) {
      console.error(`Failed to fetch ${tab}:`, err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleExpandEmployee = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setActiveDetailTab('performance');
    setPerformance(null);
    setTasks([]);
    setActivityLog([]);
    setReviews([]);
    fetchDetailData(id, 'performance');
  };

  const handleTabChange = (tab: 'performance' | 'tasks' | 'activity' | 'reviews') => {
    setActiveDetailTab(tab);
    if (expandedId) fetchDetailData(expandedId, tab);
  };

  // ─── Create task ─────────────────────────────────────────────────────────

  const handleCreateTask = async () => {
    if (!expandedId) return;
    if (!taskForm.title.trim()) {
      showAlert('يرجى إدخال عنوان المهمة', 'error');
      return;
    }
    setTaskSaving(true);
    try {
      const res = await authFetch(`/api/admin/employees/${expandedId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskForm),
      });
      if (res.ok) {
        showAlert('تم إنشاء المهمة بنجاح', 'success');
        setShowTaskModal(false);
        setTaskForm({ title: '', description: '', priority: 'medium', dueDate: '' });
        fetchDetailData(expandedId, 'tasks');
        fetchEmployees();
      } else {
        showAlert('فشل في إنشاء المهمة', 'error');
      }
    } catch {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    } finally {
      setTaskSaving(false);
    }
  };

  // ─── Update task status ──────────────────────────────────────────────────

  const handleUpdateTask = async (taskId: string, status: string) => {
    try {
      const res = await authFetch(`/api/admin/employees/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showAlert('تم تحديث المهمة', 'success');
        if (expandedId) fetchDetailData(expandedId, 'tasks');
        fetchEmployees();
      }
    } catch {
      showAlert('فشل تحديث المهمة', 'error');
    }
  };

  // ─── Submit review ───────────────────────────────────────────────────────

  const handleSubmitReview = async () => {
    if (!expandedId) return;
    if (reviewForm.rating === 0) {
      showAlert('يرجى تحديد التقييم', 'error');
      return;
    }
    setReviewSaving(true);
    try {
      const res = await authFetch(`/api/admin/employees/${expandedId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewForm),
      });
      if (res.ok) {
        showAlert('تم حفظ التقييم بنجاح', 'success');
        setShowReviewModal(false);
        setReviewForm({ rating: 0, period: 'monthly', notes: '' });
        fetchDetailData(expandedId, 'reviews');
        fetchEmployees();
      } else {
        showAlert('فشل في حفظ التقييم', 'error');
      }
    } catch {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    } finally {
      setReviewSaving(false);
    }
  };

  // ─── Filtered list ───────────────────────────────────────────────────────

  const filtered = employees.filter(e => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.role.toLowerCase().includes(q);
  });

  // ─── Helper: format relative time ────────────────────────────────────────

  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return '---';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '---';
    return new Date(dateStr).toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // ─── Activity icon ──────────────────────────────────────────────────────

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'login': return <LogIn size={14} className="text-blue-400" />;
      case 'car': return <Car size={14} className="text-emerald-400" />;
      case 'bid': return <TrendingUp size={14} className="text-orange-400" />;
      case 'task': return <ListTodo size={14} className="text-violet-400" />;
      default: return <Activity size={14} className="text-slate-400" />;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <Users className="w-7 h-7 text-orange-400" />
            إدارة الموظفين
          </h2>
          <p className="text-slate-400 text-sm mt-1">متابعة أداء فريق العمل، المهام، والتقييمات</p>
        </div>
        <button
          onClick={fetchEmployees}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all border border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      {/* ─── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الموظفين', value: stats.total, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
          { label: 'نشطون اليوم', value: stats.activeToday, icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
          { label: 'مهام معلقة', value: stats.pendingTasks, icon: ClipboardList, color: 'text-amber-400', bg: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
          { label: 'متوسط التقييم', value: stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '---', icon: Star, color: 'text-orange-400', bg: 'bg-orange-500/10', borderColor: 'border-orange-500/20' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`${card.bg} border ${card.borderColor} rounded-2xl p-5 flex items-center gap-4`}
            >
              <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold">{card.label}</p>
                <p className={`text-xl font-black ${card.color}`}>{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Search bar ─────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="بحث بالاسم، البريد، أو الصلاحية..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-3 pr-11 pl-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute left-4 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-slate-500 hover:text-white transition-colors" />
          </button>
        )}
      </div>

      {/* ─── Employee Table ─────────────────────────────────────────────────── */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">

        {/* Table header */}
        <div className="hidden md:grid grid-cols-[2fr_2fr_1fr_1.2fr_0.8fr_0.8fr_1fr_40px] gap-3 px-6 py-3.5 text-xs font-black text-slate-400 border-b border-slate-700 bg-slate-800/80">
          <span>الاسم</span>
          <span>البريد</span>
          <span>الصلاحية</span>
          <span>آخر نشاط</span>
          <span className="text-center">مهام معلقة</span>
          <span className="text-center">سيارات أضافها</span>
          <span>تقييم</span>
          <span></span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
            <span className="text-slate-400 mr-3 text-sm font-bold">جاري التحميل...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="py-20 text-center">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-bold">
              {searchQuery ? 'لا توجد نتائج للبحث' : 'لا يوجد موظفون حالياً'}
            </p>
          </div>
        )}

        {/* Employee rows */}
        {!loading && filtered.map((emp) => (
          <div key={emp.id} className="border-b border-slate-700/50 last:border-b-0">

            {/* Row */}
            <div
              onClick={() => handleExpandEmployee(emp.id)}
              className={`grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr_1.2fr_0.8fr_0.8fr_1fr_40px] gap-3 px-6 py-4 items-center cursor-pointer transition-all hover:bg-slate-700/30 ${expandedId === emp.id ? 'bg-slate-700/40' : ''}`}
            >
              {/* Name + avatar */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-black text-orange-400 border border-slate-600">
                    {emp.avatar ? (
                      <img src={emp.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      emp.name.charAt(0)
                    )}
                  </div>
                  {emp.isOnline && (
                    <span className="absolute -bottom-0.5 -left-0.5 w-3 h-3 bg-emerald-400 border-2 border-slate-800 rounded-full" />
                  )}
                </div>
                <span className="font-bold text-white text-sm truncate">{emp.name}</span>
              </div>

              {/* Email */}
              <span className="text-slate-400 text-sm truncate hidden md:block" dir="ltr">{emp.email}</span>

              {/* Role */}
              <span className="hidden md:block">
                <span className="bg-slate-700/60 text-slate-300 text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-600/50">
                  {emp.role}
                </span>
              </span>

              {/* Last active */}
              <span className="text-slate-400 text-xs hidden md:block">{formatRelativeTime(emp.lastActive)}</span>

              {/* Pending tasks */}
              <span className="text-center hidden md:block">
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${emp.pendingTasks > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-700/50 text-slate-500'}`}>
                  {emp.pendingTasks}
                </span>
              </span>

              {/* Cars added */}
              <span className="text-center hidden md:block">
                <span className="text-slate-300 text-sm font-bold">{emp.carsAdded}</span>
              </span>

              {/* Rating */}
              <div className="hidden md:block">
                <StarRating rating={Math.round(emp.rating)} size={14} />
              </div>

              {/* Expand arrow */}
              <div className="hidden md:flex justify-center">
                {expandedId === emp.id ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>

              {/* Mobile extra info */}
              <div className="flex md:hidden items-center gap-4 text-xs text-slate-400">
                <span>{emp.role}</span>
                <span>|</span>
                <span>مهام: {emp.pendingTasks}</span>
                <span>|</span>
                <StarRating rating={Math.round(emp.rating)} size={12} />
              </div>
            </div>

            {/* ─── Expanded Detail Panel ─────────────────────────────────────── */}
            {expandedId === emp.id && (
              <div className="border-t border-slate-700 bg-slate-800/60 px-6 py-5 animate-in slide-in-from-top-2 duration-300">

                {/* Tabs */}
                <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
                  {[
                    { id: 'performance' as const, label: 'الأداء', icon: BarChart3 },
                    { id: 'tasks' as const, label: 'المهام', icon: ClipboardList },
                    { id: 'activity' as const, label: 'سجل النشاط', icon: Activity },
                    { id: 'reviews' as const, label: 'التقييمات', icon: Star },
                  ].map(tab => {
                    const TabIcon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                          activeDetailTab === tab.id
                            ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-600/50'
                        }`}
                      >
                        <TabIcon size={15} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Tab content */}
                {detailLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
                    <span className="text-slate-400 mr-2 text-sm">جاري التحميل...</span>
                  </div>
                ) : (
                  <>
                    {/* ── Performance Tab ──────────────────────────────────── */}
                    {activeDetailTab === 'performance' && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: 'سيارات مضافة', value: performance?.carsAdded ?? '---', icon: Car, color: 'text-emerald-400' },
                          { label: 'عملاء تمت خدمتهم', value: performance?.customersHandled ?? '---', icon: Users, color: 'text-blue-400' },
                          { label: 'مهام مكتملة', value: performance?.tasksCompleted ?? '---', icon: CheckCircle2, color: 'text-orange-400' },
                          { label: 'ساعات تسجيل الدخول', value: performance?.loginHours != null ? `${performance.loginHours} ساعة` : '---', icon: Clock, color: 'text-violet-400' },
                        ].map(m => {
                          const MIcon = m.icon;
                          return (
                            <div key={m.label} className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <MIcon size={16} className={m.color} />
                                <span className="text-slate-400 text-xs font-bold">{m.label}</span>
                              </div>
                              <p className={`text-lg font-black ${m.color}`}>{m.value}</p>
                            </div>
                          );
                        })}

                        {/* Extra metrics row */}
                        {performance && (
                          <>
                            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 col-span-2">
                              <div className="flex items-center gap-2 mb-2">
                                <TrendingUp size={16} className="text-emerald-400" />
                                <span className="text-slate-400 text-xs font-bold">نسبة إنجاز المهام</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 bg-slate-700 rounded-full h-2.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${
                                      performance.completionRate >= 80 ? 'bg-emerald-500' :
                                      performance.completionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.min(performance.completionRate, 100)}%` }}
                                  />
                                </div>
                                <span className={`text-sm font-black ${
                                  performance.completionRate >= 80 ? 'text-emerald-400' :
                                  performance.completionRate >= 50 ? 'text-amber-400' : 'text-red-400'
                                }`}>
                                  {performance.completionRate}%
                                </span>
                              </div>
                            </div>
                            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 col-span-2">
                              <div className="flex items-center gap-2 mb-2">
                                <Clock size={16} className="text-blue-400" />
                                <span className="text-slate-400 text-xs font-bold">متوسط وقت الاستجابة</span>
                              </div>
                              <p className="text-lg font-black text-blue-400">{performance.avgResponseTime || '---'}</p>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* ── Tasks Tab ────────────────────────────────────────── */}
                    {activeDetailTab === 'tasks' && (
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-slate-300 text-sm font-bold">
                            {tasks.length} مهمة
                          </span>
                          <button
                            onClick={() => setShowTaskModal(true)}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-orange-500/20"
                          >
                            <Plus size={16} />
                            مهمة جديدة
                          </button>
                        </div>

                        {tasks.length === 0 ? (
                          <div className="py-10 text-center">
                            <ClipboardList className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                            <p className="text-slate-500 text-sm font-bold">لا توجد مهام</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {tasks.map(task => (
                              <div key={task.id} className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="font-bold text-white text-sm">{task.title}</span>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${PRIORITY_MAP[task.priority]?.bg || ''} ${PRIORITY_MAP[task.priority]?.color || 'text-slate-400'}`}>
                                      {PRIORITY_MAP[task.priority]?.label || task.priority}
                                    </span>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${STATUS_MAP[task.status]?.bg || ''} ${STATUS_MAP[task.status]?.color || 'text-slate-400'}`}>
                                      {STATUS_MAP[task.status]?.label || task.status}
                                    </span>
                                  </div>
                                  {task.description && (
                                    <p className="text-slate-500 text-xs truncate">{task.description}</p>
                                  )}
                                  {task.dueDate && (
                                    <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                                      <Calendar size={11} />
                                      الاستحقاق: {formatDate(task.dueDate)}
                                    </p>
                                  )}
                                </div>

                                {/* Status actions */}
                                <div className="flex gap-2 shrink-0">
                                  {task.status !== 'in_progress' && task.status !== 'completed' && (
                                    <button
                                      onClick={() => handleUpdateTask(task.id, 'in_progress')}
                                      className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-blue-500/20 transition-all"
                                    >
                                      بدء
                                    </button>
                                  )}
                                  {task.status !== 'completed' && (
                                    <button
                                      onClick={() => handleUpdateTask(task.id, 'completed')}
                                      className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-500/20 transition-all"
                                    >
                                      إكمال
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Activity Tab ─────────────────────────────────────── */}
                    {activeDetailTab === 'activity' && (
                      <div>
                        {activityLog.length === 0 ? (
                          <div className="py-10 text-center">
                            <Activity className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                            <p className="text-slate-500 text-sm font-bold">لا يوجد سجل نشاط</p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                            {activityLog.map(log => (
                              <div key={log.id} className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 flex items-start gap-3">
                                <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center shrink-0 mt-0.5">
                                  {getActivityIcon(log.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm font-bold">{log.action}</p>
                                  {log.details && <p className="text-slate-500 text-xs mt-0.5 truncate">{log.details}</p>}
                                </div>
                                <span className="text-slate-500 text-[10px] whitespace-nowrap shrink-0">
                                  {formatRelativeTime(log.timestamp)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Reviews Tab ──────────────────────────────────────── */}
                    {activeDetailTab === 'reviews' && (
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-slate-300 text-sm font-bold">{reviews.length} تقييم</span>
                          <button
                            onClick={() => setShowReviewModal(true)}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-orange-500/20"
                          >
                            <Plus size={16} />
                            تقييم جديد
                          </button>
                        </div>

                        {reviews.length === 0 ? (
                          <div className="py-10 text-center">
                            <StarOff className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                            <p className="text-slate-500 text-sm font-bold">لا توجد تقييمات بعد</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {reviews.map(rev => (
                              <div key={rev.id} className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-3">
                                    <StarRating rating={rev.rating} size={14} />
                                    <span className="bg-slate-700/60 text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                      {PERIOD_OPTIONS.find(p => p.value === rev.period)?.label || rev.period}
                                    </span>
                                  </div>
                                  <span className="text-slate-500 text-xs">{formatDate(rev.createdAt)}</span>
                                </div>
                                {rev.notes && <p className="text-slate-400 text-sm">{rev.notes}</p>}
                                {rev.reviewerName && (
                                  <p className="text-slate-500 text-xs mt-2">المُقيّم: {rev.reviewerName}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TASK MODAL                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowTaskModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            dir="rtl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-orange-400" />
                مهمة جديدة
              </h3>
              <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-slate-400 text-xs font-bold mb-1.5">عنوان المهمة *</label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="مثال: مراجعة بيانات السيارات الجديدة"
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-slate-400 text-xs font-bold mb-1.5">الوصف</label>
                <textarea
                  value={taskForm.description}
                  onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="تفاصيل المهمة..."
                  rows={3}
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all resize-none"
                />
              </div>

              {/* Priority + Due date row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 text-xs font-bold mb-1.5">الأولوية</label>
                  <select
                    value={taskForm.priority}
                    onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all appearance-none"
                  >
                    <option value="urgent">عاجل</option>
                    <option value="high">عالي</option>
                    <option value="medium">متوسط</option>
                    <option value="low">منخفض</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-bold mb-1.5">تاريخ الاستحقاق</label>
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateTask}
                disabled={taskSaving}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/20"
              >
                {taskSaving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                إنشاء المهمة
              </button>
              <button
                onClick={() => setShowTaskModal(false)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-6 py-3 rounded-xl font-bold text-sm transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* REVIEW MODAL                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowReviewModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            dir="rtl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Star className="w-5 h-5 text-orange-400" />
                تقييم جديد
              </h3>
              <button onClick={() => setShowReviewModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              {/* Star rating */}
              <div>
                <label className="block text-slate-400 text-xs font-bold mb-2">التقييم *</label>
                <div className="flex items-center gap-3">
                  <StarRating rating={reviewForm.rating} onChange={r => setReviewForm(f => ({ ...f, rating: r }))} size={28} />
                  <span className="text-slate-400 text-sm font-bold">
                    {reviewForm.rating > 0 ? `${reviewForm.rating} / 5` : 'اختر التقييم'}
                  </span>
                </div>
              </div>

              {/* Period */}
              <div>
                <label className="block text-slate-400 text-xs font-bold mb-1.5">الفترة</label>
                <select
                  value={reviewForm.period}
                  onChange={e => setReviewForm(f => ({ ...f, period: e.target.value }))}
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all appearance-none"
                >
                  {PERIOD_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-400 text-xs font-bold mb-1.5">ملاحظات</label>
                <textarea
                  value={reviewForm.notes}
                  onChange={e => setReviewForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="ملاحظات حول أداء الموظف..."
                  rows={4}
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSubmitReview}
                disabled={reviewSaving}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/20"
              >
                {reviewSaving ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />}
                حفظ التقييم
              </button>
              <button
                onClick={() => setShowReviewModal(false)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-6 py-3 rounded-xl font-bold text-sm transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
