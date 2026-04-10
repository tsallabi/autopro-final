import React, { useState, useEffect } from 'react';
import { Car } from '../types';
import { Clock, ChevronRight, ChevronLeft, Lock } from 'lucide-react';
import { useStore } from '../context/StoreContext';

interface UpcomingCarsQueueProps {
    cars: Car[];
    onCarSelect: (car: Car) => void;
    currentAuctionTimeLeft: number; // Time left for the active auction
}

export const UpcomingCarsQueue: React.FC<UpcomingCarsQueueProps> = ({ cars, onCarSelect, currentAuctionTimeLeft }) => {
    const [estimatedTimes, setEstimatedTimes] = useState<Record<string, number>>({});

    // Calculate estimated entry times based on current auction's time left
    // Assuming each auction is roughly 3 minutes (180s)
    useEffect(() => {
        const times: Record<string, number> = {};
        let accumulatedTime = currentAuctionTimeLeft;

        cars.forEach((car, index) => {
            // First car starts after current auction
            // Subsequent cars start after previous + 180s
            accumulatedTime += (index === 0 ? 0 : 180);
            times[car.id] = accumulatedTime;
        });

        setEstimatedTimes(times);
    }, [cars, currentAuctionTimeLeft]);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getPercentage = (seconds: number) => {
        // arbitrary scale for the circular queue timer logic based on max 30mins
        return Math.min(100, Math.max(0, 100 - (seconds / 1800) * 100));
    };

    if (!cars || cars.length === 0) return null;

    return (
        <div className="mt-8 bg-slate-900/60 p-6 rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden glass-dark">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    السيارات القادمة في المزاد <span className="text-sm font-medium text-slate-400">({cars.length})</span>
                </h3>
                <div className="flex gap-2">
                    <button title="التالي" aria-label="التالي" className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors border border-white/5">
                        <ChevronRight className="w-5 h-5 text-slate-300" />
                    </button>
                    <button title="السابق" aria-label="السابق" className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors border border-white/5">
                        <ChevronLeft className="w-5 h-5 text-slate-300" />
                    </button>
                </div>
            </div>

            <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-4 snap-x">
                {cars.map((car, idx) => {
                    const eta = estimatedTimes[car.id] || 0;
                    const pct = getPercentage(eta);

                    return (
                        <div
                            key={car.id}
                            onClick={() => onCarSelect(car)}
                            className="min-w-[280px] max-w-[280px] bg-slate-800/80 rounded-2xl p-4 border border-slate-700 shrink-0 snap-start cursor-pointer hover:border-orange-500/50 hover:bg-slate-800 transition-all group relative overflow-hidden"
                        >
                            <div className="absolute top-2 left-2 z-10 glass-dark px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1">
                                <span className="text-xs font-bold">{idx + 1}</span>
                            </div>

                            {/* Circular Timer overlay */}
                            <div className="absolute top-4 right-4 z-10 bg-black/60 backdrop-blur-md rounded-full px-2 py-1 flex items-center gap-1.5 border border-white/10 shrink-0">
                                <div className="relative w-4 h-4 aspect-square rounded-full border-2 border-slate-600 overflow-hidden flex items-center justify-center">
                                    <div
                                        className="absolute inset-0 bg-orange-500 origin-bottom"
                                        style={{ height: `${pct}%`, bottom: 0, top: 'auto' }}
                                    ></div>
                                </div>
                                <span className="text-[10px] font-mono font-bold">{formatTime(eta)}</span>
                            </div>

                            <div className="w-full aspect-video rounded-xl bg-slate-900 overflow-hidden mb-4 relative border border-white/5">
                                <img
                                    src={(() => { const imgs = typeof car.images === 'string' ? (()=>{ try{ return JSON.parse(car.images); }catch{ return []; } })() : (car.images || []); return (Array.isArray(imgs) && imgs[0]) || 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&q=80'; })()}
                                    alt={car.model}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                            </div>

                            <h4 className="font-bold text-sm truncate mb-1" title={`${car.make} ${car.model}`}>
                                {car.make} {car.model}
                            </h4>

                            <div className="flex justify-between items-end mt-3">
                                <div>
                                    <div className="text-[10px] text-slate-400 font-medium">Bid Amount</div>
                                    <div className="font-mono font-bold text-lg text-white">${(car.currentBid || 0).toLocaleString('en-US')}</div>
                                </div>

                                {car.reservePrice && car.reservePrice > 0 ? (
                                    <div className="text-[10px] bg-slate-700/50 text-slate-300 px-2 py-1 rounded border border-slate-600/50 font-medium flex items-center gap-1">
                                        On Reserve
                                    </div>
                                ) : (
                                    <div className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/30 font-medium flex items-center gap-1">
                                        Pure Sale
                                    </div>
                                )}
                            </div>

                            <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-700">
                                <div className="h-full bg-orange-500 transition-all duration-1000" style={{ width: `${pct}%` }}></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
