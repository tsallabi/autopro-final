import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { LiveAuction } from '../components/LiveAuction';
import { Clock, Radio, MonitorPlay } from 'lucide-react';

export const LiveAuctionRoom = () => {
    const navigate = useNavigate();
    const { cars } = useStore();

    const liveCar = cars.find(c => c.status === 'live');
    const upcomingCars = cars.filter(c => c.status === 'upcoming');
    const nextCar = upcomingCars.sort((a, b) => new Date(a.auctionStartTime || 0).getTime() - new Date(b.auctionStartTime || 0).getTime())[0];

    const containerRef = useRef<HTMLDivElement>(null);
    const [isTvMode, setIsTvMode] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsTvMode(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleTvMode = async () => {
        try {
            if (!document.fullscreenElement) {
                if (containerRef.current?.requestFullscreen) {
                    await containerRef.current.requestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                }
            }
        } catch (err) {
            console.error('Error toggling fullscreen', err);
        }
    };

    if (liveCar) {
        return (
            <div ref={containerRef} className="h-full w-full bg-slate-950">
                <LiveAuction
                    car={liveCar}
                    upcomingCars={upcomingCars}
                    onBack={() => navigate('/marketplace')}
                />
            </div>
        );
    }

    let mainImage = 'https://images.unsplash.com/photo-1550314405-50d4f185eb14?w=800&q=80';
    if (nextCar && nextCar.images) {
        try {
            const parsed = typeof nextCar.images === 'string' ? JSON.parse(nextCar.images) : nextCar.images;
            if (Array.isArray(parsed) && parsed.length > 0) mainImage = parsed[0];
        } catch (e) {
            if (typeof nextCar.images === 'string' && (nextCar.images as string).startsWith('http')) {
                mainImage = nextCar.images as string;
            }
        }
    }

    return (
        <div ref={containerRef} className={`min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white selection:bg-accent-500/30 overflow-hidden relative ${isTvMode ? 'p-0' : 'pt-24 pb-12'}`} dir="rtl">

            {/* Ambient Base Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent-500/5 blur-[150px] rounded-full pointer-events-none"></div>

            {/* TV Toggle */}
            <button
                onClick={toggleTvMode}
                className={`absolute z-50 glass-dark border border-white/10 px-6 py-4 rounded-2xl hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-2 group shadow-2xl ${isTvMode ? 'top-6 left-6 opacity-30 hover:opacity-100' : 'top-24 left-6 hidden md:flex'}`}
            >
                <MonitorPlay className={`w-8 h-8 transition-colors ${isTvMode ? 'text-orange-500' : 'text-slate-400 group-hover:text-white'}`} />
                <span className="text-xs font-black uppercase tracking-widest text-slate-300 group-hover:text-white transition-colors">
                    {isTvMode ? 'إنهاء العرض' : 'عرض تلفزيوني'}
                </span>
            </button>

            {nextCar ? (
                <div className={`w-full mx-auto relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 flex-grow flex flex-col justify-center ${isTvMode ? 'h-screen px-8 py-8 max-w-[1920px]' : 'max-w-7xl px-4'}`}>
                    <div className="flex items-center justify-center gap-4 mb-4 lg:mb-10 animate-pulse mt-4 lg:mt-0">
                        <Radio className="w-10 h-10 text-orange-500 shrink-0" />
                        <h1 className="text-3xl lg:text-5xl font-black tracking-tighter text-white drop-shadow-lg text-center">
                            السيارة القادمة في المزاد الحي
                        </h1>
                    </div>

                    <div className="bg-slate-900/60 backdrop-blur-2xl p-6 md:p-10 rounded-3xl border border-white/10 shadow-[0_0_100px_rgba(249,115,22,0.15)] flex flex-col md:flex-row gap-10 items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 blur-[100px] rounded-full pointer-events-none"></div>

                        {/* Image Section */}
                        <div className="w-full md:w-1/2 aspect-video rounded-2xl overflow-hidden relative shadow-2xl shadow-black/80 border border-white/10 group">
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

                        {/* Details Section */}
                        <div className="w-full md:w-1/2 space-y-8 z-10">
                            <div>
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-400 rounded-full text-sm font-black mb-6 border border-orange-500/20">
                                    <Clock className="w-4 h-4 animate-spin-slow" />
                                    في وضع الاستعداد
                                </div>
                                <h2 className="text-4xl md:text-5xl font-black text-white leading-tight">
                                    {nextCar.year} <span className="text-orange-500">{nextCar.make}</span> {nextCar.model}
                                </h2>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-950/50 p-5 rounded-2xl border border-white/5 shadow-inner">
                                    <p className="text-slate-500 text-xs font-black uppercase tracking-widest mb-2">رقم اللوت (Lot)</p>
                                    <p className="text-2xl font-black text-white font-mono">{nextCar.lotNumber || 'N/A'}</p>
                                </div>
                                <div className="bg-slate-950/50 p-5 rounded-2xl border border-white/5 shadow-inner">
                                    <p className="text-slate-500 text-xs font-black uppercase tracking-widest mb-2">سنة الصنع</p>
                                    <p className="text-2xl font-black text-white">{nextCar.year}</p>
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-between border-t border-white/10">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center animate-pulse">
                                        <Radio className="w-6 h-6 text-orange-500" />
                                    </div>
                                    <div>
                                        <p className="text-white font-black text-lg">المزاد سيبدأ قريباً...</p>
                                        <p className="text-sm text-slate-400 font-medium">يرجى البقاء في هذه الشاشة</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            ) : (
                <div className="glass-dark p-12 rounded-3xl border border-white/10 text-center max-w-lg w-full mx-4 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-red-600"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent blur-3xl rounded-full pointer-events-none"></div>

                    <div className="relative z-10">
                        <Radio className="w-20 h-20 text-slate-700 mx-auto mb-6" />
                        <h1 className="text-3xl font-black mb-4 tracking-tighter">لا توجد سيارات في الطابور</h1>

                        <p className="text-slate-500 font-bold mb-8">
                            لا توجد أي سيارات مجدولة للمزاد المباشر في الوقت الحالي.
                        </p>

                        <Link
                            to="/marketplace"
                            className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 rounded-full font-black transition-all w-full shadow-lg shadow-orange-600/20 active:scale-95 block text-center"
                        >
                            استكشاف أسطول السيارات
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};
