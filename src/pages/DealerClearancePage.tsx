import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Droplets, Flame, Wrench, DollarSign, Car, Filter, ArrowRight } from 'lucide-react';
import { authFetch } from '../context/StoreContext';

const DAMAGE_CATEGORIES = [
  { id: 'all', label: 'الكل', icon: Car, color: 'bg-slate-600' },
  { id: 'flood', label: 'سيارات غارقة', icon: Droplets, color: 'bg-blue-600', keywords: ['flood', 'غرق', 'water'] },
  { id: 'fire', label: 'حريق', icon: Flame, color: 'bg-red-600', keywords: ['fire', 'حريق', 'burn'] },
  { id: 'mechanical', label: 'عطل ميكانيكي كبير', icon: Wrench, color: 'bg-amber-600', keywords: ['mechanical', 'ميكانيكي', 'engine'] },
  { id: 'totaled', label: 'مركبات مسترجعة (Total)', icon: AlertTriangle, color: 'bg-purple-600', keywords: ['total', 'salvage', 'junk', 'مسترجعة'] },
];

export const DealerClearancePage: React.FC = () => {
  const navigate = useNavigate();
  const [cars, setCars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/cars');
        const data = await res.json();
        // Filter: rejected cars OR cars with heavy damage OR unsold cars
        const clearance = (Array.isArray(data) ? data : []).filter((c: any) => {
          const damage = (c.primaryDamage || '').toLowerCase();
          const title = (c.titleType || '').toLowerCase();
          const status = c.status;
          return (
            status === 'rejected' ||
            status === 'unsold' ||
            (damage && damage !== 'بدون ضرر' && damage !== 'none' && damage !== '') ||
            title.includes('salvage') ||
            title.includes('junk') ||
            title.includes('flood')
          );
        });
        setCars(clearance);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredCars = filter === 'all' ? cars : cars.filter((c: any) => {
    const cat = DAMAGE_CATEGORIES.find(x => x.id === filter);
    if (!cat?.keywords) return true;
    const text = `${c.primaryDamage || ''} ${c.titleType || ''} ${c.notes || ''}`.toLowerCase();
    return cat.keywords.some((k: string) => text.includes(k.toLowerCase()));
  });

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-16" dir="rtl">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-purple-900 via-purple-950 to-slate-950 text-white py-16 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-500/20 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="inline-flex items-center gap-2 bg-purple-500/20 border border-purple-400/30 rounded-full px-5 py-2 mb-6">
            <AlertTriangle className="w-4 h-4 text-purple-300" />
            <span className="text-purple-200 text-sm font-bold">تصفية مخزون — فرصة للتجار</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-purple-300 to-pink-400">سيارات بأسعار رخيصة جداً</span>
          </h1>
          <p className="text-xl text-slate-300 max-w-3xl mb-8 leading-relaxed">
            سيارات غارقة، مكسورة، معطلة، مُسترجعة من شركات التأمين — فرصة ذهبية لمعارض التصليح وقطع الغيار.
            أسعار تبدأ من 10% من قيمة السيارة الأصلية.
          </p>
          <div className="flex flex-wrap gap-3">
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl px-4 py-2 text-sm">
              <span className="text-slate-400">متوفر: </span>
              <span className="font-black text-white">{cars.length} سيارة</span>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl px-4 py-2 text-sm">
              <span className="text-slate-400">خصم يصل إلى: </span>
              <span className="font-black text-emerald-400">90%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="sticky top-20 bg-white border-b border-slate-200 shadow-sm z-20">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <Filter className="w-5 h-5 text-slate-500 shrink-0" />
            {DAMAGE_CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isActive = filter === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setFilter(cat.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
                    isActive ? `${cat.color} text-white shadow-lg` : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Cars Grid */}
      <section className="py-10 px-6">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="text-center py-16 text-slate-500 font-bold">جاري التحميل...</div>
          ) : filteredCars.length === 0 ? (
            <div className="text-center py-16">
              <Car className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-black text-slate-700 mb-2">لا توجد سيارات في هذه الفئة حالياً</h3>
              <p className="text-slate-500 font-medium">تصفّح فئات أخرى أو عد لاحقاً</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCars.map((car: any) => (
                <div
                  key={car.id}
                  onClick={() => navigate(`/car-details/${car.id}`)}
                  className="bg-white rounded-2xl shadow-sm hover:shadow-2xl transition-all border-2 border-purple-200 overflow-hidden cursor-pointer group"
                >
                  <div className="relative aspect-video bg-slate-100 overflow-hidden">
                    <img
                      src={Array.isArray(car.images) && car.images[0] ? car.images[0] : 'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?auto=format&fit=crop&q=80&w=800'}
                      alt={`${car.make} ${car.model}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?auto=format&fit=crop&q=80&w=800'; }}
                    />
                    <div className="absolute top-3 right-3 bg-purple-600 text-white px-3 py-1 rounded-full text-xs font-black shadow-lg">
                      تصفية مخزون
                    </div>
                    {car.primaryDamage && (
                      <div className="absolute top-3 left-3 bg-black/80 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-bold">
                        {car.primaryDamage}
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-black text-slate-900 mb-1">
                      {car.year} {car.make} {car.model}
                    </h3>
                    <p className="text-slate-500 text-sm mb-4">{car.location || 'غير محدد'}</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-400 mb-1">السعر الحالي</div>
                        <div className="text-2xl font-black text-purple-600">
                          ${(car.currentBid || car.reservePrice || 0).toLocaleString()}
                        </div>
                      </div>
                      <button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all flex items-center gap-1">
                        شراء <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Info Section */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <DollarSign className="w-16 h-16 text-purple-600 mx-auto mb-6" />
          <h2 className="text-3xl font-black text-slate-900 mb-4">مثالية للتجار والمختصين</h2>
          <p className="text-slate-600 text-lg leading-relaxed mb-8">
            هذه السيارات تأتي من مزادات التأمين الأمريكية، وهي خيار ممتاز لمعارض التصليح،
            ورش إعادة التأهيل، وتجار قطع الغيار. استورد وأعد بيعها بأرباح كبيرة.
          </p>
        </div>
      </section>
    </div>
  );
};
