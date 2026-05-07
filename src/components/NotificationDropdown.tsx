import React from 'react';
import { Bell, Check, Info, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Notification } from '../types';
import { useNavigate } from 'react-router-dom';

// notif.data may arrive as a JSON string (from SQLite) or as a parsed object
// (depending on how the backend serialized it). Normalise to an object.
function readNotifData(raw: any): any {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(String(raw)); } catch { return {}; }
}

export const NotificationDropdown: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { notifications, markNotificationAsRead, markAllNotificationsAsRead, unreadCounts } = useStore();
    const navigate = useNavigate();

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'الآن';
        if (diffInSeconds < 3600) return `منذ ${Math.floor(diffInSeconds / 60)} دقيقة`;
        if (diffInSeconds < 86400) return `منذ ${Math.floor(diffInSeconds / 3600)} ساعة`;
        return date.toLocaleDateString('ar-LY');
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case 'alert': return <AlertCircle className="w-4 h-4 text-red-500" />;
            case 'bid': return <Bell className="w-4 h-4 text-orange-500" />;
            default: return <Info className="w-4 h-4 text-blue-500" />;
        }
    };

    const handleNotifClick = (notif: Notification) => {
        if (!notif.isRead) markNotificationAsRead(notif.id);
        if (notif.link) {
            onClose();
            navigate(notif.link);
        }
    };

    return (
        <div className="absolute top-full mt-2 ltr:right-0 rtl:left-0 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-slate-800 z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-black text-slate-900">التنبيهات</h3>
                    {unreadCounts.notifications > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            {unreadCounts.notifications}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => markAllNotificationsAsRead()}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors flex items-center gap-1"
                >
                    <Check className="w-3 h-3" />
                    تحديد الكل كمقروء
                </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm font-bold">لا يوجد تنبيهات حالياً</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {notifications.map((notif) => {
                            const data = readNotifData((notif as any).data);
                            const imageUrl: string | undefined = data?.imageUrl;
                            return (
                                <div
                                    key={notif.id}
                                    onClick={() => handleNotifClick(notif)}
                                    className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer group ${!notif.isRead ? 'bg-orange-50/30' : ''} ${notif.link ? 'hover:bg-orange-50/50' : ''}`}
                                >
                                    <div className="flex gap-3">
                                        {imageUrl ? (
                                            <img
                                                src={imageUrl}
                                                alt={data?.title || 'صورة'}
                                                className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-slate-100"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        ) : (
                                            <div className="mt-1 flex-shrink-0">
                                                {getTypeIcon(notif.type)}
                                            </div>
                                        )}
                                        <div className="flex-grow min-w-0">
                                            <div className="flex items-start justify-between gap-1">
                                                <h4 className={`text-sm mb-0.5 ${!notif.isRead ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>
                                                    {notif.title}
                                                </h4>
                                                {notif.link && (
                                                    <ExternalLink className="w-3 h-3 text-orange-400 flex-shrink-0 mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-600 font-bold leading-relaxed line-clamp-2">{notif.message}</p>
                                            {notif.link && (
                                                <span className="inline-block mt-1 text-[10px] font-black text-orange-600 group-hover:text-orange-700 transition-colors">
                                                    اضغط للمشاهدة ←
                                                </span>
                                            )}
                                            <span className="text-[10px] text-slate-500 mt-1 block font-black">
                                                {formatTimeAgo(notif.timestamp)}
                                            </span>
                                        </div>
                                        {!notif.isRead && (
                                            <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-2 ring-4 ring-orange-500/20 flex-shrink-0"></div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {notifications.length > 0 && (
                <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
                    <button className="text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest">عرض كل النشاطات</button>
                </div>
            )}
        </div>
    );
};
