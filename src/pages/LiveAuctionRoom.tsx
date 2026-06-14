import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { LiveAuction } from '../components/LiveAuction';
import { Clock, Radio, MonitorPlay, Car, Gavel, Timer, ArrowLeft } from 'lucide-react';

export const LiveAuctionRoom = () => {
    const navigate = useNavigate();
    const { cars } = useStore();

    // [sold-cars-out] Defensive filter: only truly-live or final-seconds
    // (ultimo) cars; explicit AND against finalized states so a stale
    // cars[] entry whose status string was patched out-of-band (e.g. via
    // a different socket update path) can't slip through. The OR already
    // implies this, but the AND makes the contract explicit at the call
    // site and future-proofs against new finalized state names.
    const FINALIZED = new Set(['sold', 'closed', 'cancelled', 'expired', 'pending_review']);
    const liveCar = cars.find(c =>
      (c.status === 'live' || c.status === 'ultimo')
      && !FINALIZED.has(String(c.status))
    );
    // [precise-schedule] Match the backend's tickAuctionSessions ordering:
    // primary = auctionStartTime ASC (sessions assign this on attach),
    // tie-break = id ASC (deterministic when scheduled times collide).
    // Cars with no auctionStartTime sort last so legacy queue cars don't
    // jump ahead of session-scheduled cars. The frontend and backend must
    // agree on this exact order; otherwise the "next car" transition screen
    // and the car that actually activates disagree.
    const upcomingCars = cars
        .filter(c => c.status === 'upcoming')
        .sort((a, b) => {
            const aTime = a.auctionStartTime ? new Date(a.auctionStartTime).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.auctionStartTime ? new Date(b.auctionStartTime).getTime() : Number.MAX_SAFE_INTEGER;
            if (aTime !== bTime) return aTime - bTime;
            return String(a.id).localeCompare(String(b.id));
        });
    const nextCar = upcomingCars[0];

    const containerRef = useRef<HTMLDivElement>(null);
    const [isTvMode, setIsTvMode] = useState(false);
    const [countdown, setCountdown] = useState('');

    // Countdown timer for next auction
    useEffect(() => {
        if (!nextCar?.auctionStartTime && !nextCar?.auctionEndDate) return;
        const target = new Date(nextCar.auctionStartTime || nextCar.auctionEndDate).getTime();
        const interval = setInterval(() => {
            const now = Date.now();
            const diff = target - now;
            if (diff <= 0) {
                setCountdown('يبدأ الآن...');
                clearInterval(interval);
                return;
            }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setCountdown(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        }, 1000);
        return () => clearInterval(interval);
    }, [nextCar]);

    useEffect(() => {
        const handleFullscreenChange = () => setIsTvMode(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleTvMode = async () => {
        try {
            if (!document.fullscreenElement) {
                await containerRef.current?.requestFullscreen?.();
            } else {
                await document.exitFullscreen?.();
            }
        } catch (err) { console.error(err); }
    };

    // ── LIVE AUCTION MODE ──
    if (liveCar) {
        return (
            <div ref={containerRef} className="h-full w-full bg-slate-950">
                <LiveAuction car={liveCar} upcomingCars={upcomingCars} onBack={() => navigate('/marketplace')} />
            </div>
        );
    }

    // ── Parse next car image ──
    let mainImage = 'https://images.unsplash.com/photo-1550314405-50d4f185eb14?w=800&q=80';
    if (nextCar?.images) {
        try {
            const parsed = typeof nextCar.images === 'string' ? JSON.parse(nextCar.images) : nextCar.images;
            if (Array.isArray(parsed) && parsed.length > 0) mainImage = parsed[0];
        } catch { if (typeof nextCar.images === 'string' && nextCar.images.startsWith('http')) mainImage = nextCar.images; }
    }

    // ── WAITING ROOM (next car scheduled) ──
    if (nextCar) {
        return (
            <div ref={containerRef} className={`min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white overflow-hidden relative ${isTvMode ? 'p-0' : 'pt-24 pb-12'}`} dir="rtl">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/5 blur-[150px] rounded-full pointer-events-none" />

                {/* TV Toggle */}
                <button onClick={toggleTvMode} className={`absolute z-50 border border-white/10 px-6 py-4 rounded-2xl hover:bg-slate-800 transition-all flex flex-col items-center gap-2 group bg-slate-900/50 ${isTvMode ? 'top-6 left-6 opacity-30 hover:opacity-100' : 'top-24 left-6 hidden md:flex'}`}>
                    <MonitorPlay className={`w-8 h-8 ${isTvMode ? 'text-orange-500' : 'text-slate-400 group-hover:text-white'}`} />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-300">{isTvMode ? 'إنهاء العرض' : 'عرض تلفزيوني'}</span>
                </button>

                <div className={`w-full mx-auto relative z-10 flex-grow flex flex-col justify-center ${isTvMode ? 'h-screen px-8 py-8 max-w-[1920px]' : 'max-w-7xl px-4'}`}>
                    <div className="flex items-center justify-center gap-4 mb-6 lg:mb-10 animate-pulse">
                        <Radio className="w-10 h-10 text-orange-500 shrink-0" />
                        <h1 className="text-3xl lg:text-5xl font-black tracking-tighter text-white text-center">السيارة القادمة في المزاد الحي</h1>
                    </div>

                    {/* Countdown */}
                    {countdown && (
                        <div className="text-center mb-8">
                            <div className="inline-flex items-center gap-3 px-8 py-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl">
                                <Timer className="w-6 h-6 text-orange-400 animate-pulse" />
                                <span className="text-orange-400 font-black text-sm">يبدأ خلال</span>
                                <span className="text-3xl font-black text-white font-mono tracking-widest">{countdown}</span>
                            </div>
                        </div>
                    )}

                    <div className="bg-slate-900/60 backdrop-blur-2xl p-6 md:p-10 rounded-3xl border border-white/10 shadow-[0_0_100px_rgba(249,115,22,0.15)] flex flex-col md:flex-row gap-10 items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 blur-[100px] rounded-full pointer-events-none" />

                        {/* Image */}
                        <div className="w-full md:w-1/2 aspect-video rounded-2xl overflow-hidden relative shadow-2xl border border-white/10 group">
                            <img src={mainImage} alt={nextCar.model} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-transparent p-6 flex justify-between items-end">
                                <div>
                                    <div className="text-orange-400 text-xs font-black uppercase tracking-widest mb-1">العلامة التجارية</div>
                                    <div className="text-2xl font-black text-white">{nextCar.make}</div>
                                </div>
                                <div className="text-left">
                                    <div className="text-orange-400 text-xs font-black uppercase tracking-widest mb-1">الموديل</div>
                                    <div className="text-2xl font-black text-white">{nextCar.model}</div>
                                </div>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="w-full md:w-1/2 space-y-8 z-10">
                            <div>
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-400 rounded-full text-sm font-black mb-6 border border-orange-500/20">
                                    <Clock className="w-4 h-4" /> في وضع الاستعداد
                                </div>
                                <h2 className="text-4xl md:text-5xl font-black text-white leading-tight">
                                    {nextCar.year} <span className="text-orange-500">{nextCar.make}</span> {nextCar.model}
                                </h2>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-950/50 p-5 rounded-2xl border border-white/5">
                                    <p className="text-slate-500 text-xs font-black uppercase tracking-widest mb-2">رقم اللوت</p>
                                    <p className="text-2xl font-black text-white font-mono">{nextCar.lotNumber || 'N/A'}</p>
                                </div>
                                <div className="bg-slate-950/50 p-5 rounded-2xl border border-white/5">
                                    <p className="text-slate-500 text-xs font-black uppercase tracking-widest mb-2">سنة الصنع</p>
                                    <p className="text-2xl font-black text-white">{nextCar.year}</p>
                                </div>
                            </div>
                            <div className="pt-4 flex items-center gap-4 border-t border-white/10">
                                <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center animate-pulse">
                                    <Radio className="w-6 h-6 text-orange-500" />
                                </div>
                                <div>
                                    <p className="text-white font-black text-lg">المزاد سيبدأ قريباً...</p>
                                    <p className="text-sm text-slate-400 font-medium">يرجى البقاء في هذه الشاشة — سيبدأ تلقائياً</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── NO AUCTION — EMPTY STATE ──
    return (
        <div ref={containerRef} className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white overflow-hidden relative" dir="rtl">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-slate-800/30 blur-[150px] rounded-full pointer-events-none" />

            <div className="relative z-10 text-center max-w-xl w-full mx-4 p-10 md:p-16 bg-slate-900/60 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 via-red-500 to-orange-600 rounded-t-3xl" />

                {/* Icon */}
                <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-slate-800/80 border border-white/10 flex items-center justify-center">
                    <Gavel className="w-12 h-12 text-slate-600" />
                </div>

                <h1 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">
                    لا يوجد مزاد حي حالياً
                </h1>

                <p className="text-slate-400 font-bold mb-4 text-lg">
                    لا توجد أي سيارات مجدولة للمزاد المباشر في الوقت الحالي.
                </p>

                <div className="bg-slate-800/50 rounded-2xl p-6 mb-8 border border-white/5">
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <Clock className="w-5 h-5 text-orange-400" />
                        <span className="text-orange-400 font-black text-sm">مواعيد المزادات</span>
                    </div>
                    <p className="text-slate-300 text-sm font-medium">
                        تُعقد المزادات المباشرة يومياً. تابع صفحة السيارات لمعرفة الجدول القادم.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-6 text-xs text-slate-500 font-bold">
                        <div className="flex items-center gap-2">
                            <Car className="w-4 h-4" />
                            <span>{cars.filter(c => c.status === 'upcoming').length} سيارة في الانتظار</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Timer className="w-4 h-4" />
                            <span>مدة كل مزاد: 2 دقيقة</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                    <Link
                        to="/marketplace"
                        className="flex-1 bg-orange-600 hover:bg-orange-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-lg shadow-orange-600/20 active:scale-95 text-center flex items-center justify-center gap-2"
                    >
                        <Car className="w-5 h-5" />
                        استكشاف أسطول السيارات
                    </Link>
                    <Link
                        to="/"
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-2xl font-black transition-all border border-white/10 text-center flex items-center justify-center gap-2"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        الصفحة الرئيسية
                    </Link>
                </div>
            </div>
        </div>
    );
};
