import React, { useState } from 'react';
import { Mail, Send, History, ChevronLeft, User, Shield, Wallet, ShoppingCart, Truck, Ship, FileText, CheckCircle2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Message } from '../types';

export const MessageDropdown: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { messages, markMessageAsRead, unreadCounts, sendMessage, currentUser } = useStore();
    const [view, setView] = useState<'list' | 'new' | 'chat'>('list');
    const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
    const [messageDraft, setMessageDraft] = useState('');
    const [sending, setSending] = useState(false);

    const teams = [
        { id: 'registration', label: 'فريق التسجيل', icon: Shield, color: 'text-blue-500' },
        { id: 'accounting', label: 'فريق المحاسبة', icon: Wallet, color: 'text-green-500' },
        { id: 'purchasing', label: 'فريق الشراء', icon: ShoppingCart, color: 'text-orange-500' },
        { id: 'transport', label: 'فريق النقل', icon: Truck, color: 'text-cyan-500' },
        { id: 'shipping', label: 'فريق الشحن', icon: Ship, color: 'text-indigo-500' },
        { id: 'customs', label: 'فريق التخليص الجمركي', icon: FileText, color: 'text-rose-500' },
    ];

    const handleSendMessage = async () => {
        if (!selectedTeam || !messageDraft.trim()) return;
        setSending(true);
        try {
            await sendMessage({
                receiverId: 'admin-1', // Sent to general management
                subject: `رسالة من مستخدم بخصوص ${teams.find(t => t.id === selectedTeam)?.label}`,
                content: messageDraft,
                category: selectedTeam
            });
            setMessageDraft('');
            setView('list');
            setSelectedTeam(null);
        } finally {
            setSending(false);
        }
    };

    const getTeamLabel = (category?: string) => {
        if (category === 'libyapro_inquiry') return '🏢 ليبيا برو للتقنية';
        return teams.find(t => t.id === category)?.label || 'دعم العملاء';
    };

    const getCategoryStyle = (category?: string) => {
        if (category === 'libyapro_inquiry') return 'text-amber-600 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300';
        return 'text-blue-500 bg-blue-50';
    };

    return (
        <div className="absolute top-full mt-2 ltr:right-0 rtl:left-0 w-[360px] bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden text-slate-800 z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="px-5 py-5 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                        <Mail className="w-4 h-4" />
                    </div>
                    <h3 className="font-black text-slate-900">مركز المساعدة والرسائل</h3>
                </div>
                {view !== 'list' && (
                    <button
                        title="الرجوع"
                        aria-label="الرجوع للقائمة"
                        onClick={() => { setView('list'); setSelectedTeam(null); }}
                        className="text-xs font-black text-slate-400 hover:text-slate-600 flex items-center gap-1 bg-slate-50 px-3 py-1.5 rounded-full transition-all"
                    >
                        رجوع
                        <ChevronLeft className="w-3 h-3" />
                    </button>
                )}
            </div>

            <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
                {view === 'list' && (
                    <div className="p-4 flex flex-col gap-4">
                        <button
                            onClick={() => setView('new')}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white p-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-slate-900/10 active:scale-95"
                        >
                            <Send className="w-4 h-4" />
                            تحدث مع فريق العمل المختص
                        </button>

                        <div className="flex items-center gap-2 mt-4 px-1">
                            <History className="w-3 h-3 text-slate-400" />
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">تاريخ الرسائل</h4>
                        </div>

                        {messages.length === 0 ? (
                            <div className="py-12 text-center">
                                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Mail className="w-6 h-6 text-slate-200" />
                                </div>
                                <p className="text-xs font-bold text-slate-400">لا توجد رسائل سابقة</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {messages.slice(0, 5).map(msg => (
                                    <div
                                        key={msg.id}
                                        onClick={() => !msg.isRead && markMessageAsRead(msg.id)}
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer relative group ${msg.isRead ? 'border-slate-50 hover:bg-slate-50' : 'border-blue-100 bg-blue-50/30'}`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${getCategoryStyle(msg.category)}`}>
                                                {getTeamLabel(msg.category)}
                                            </span>
                                            {!msg.isRead && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-sm shadow-blue-500/50"></div>}
                                        </div>
                                        <h5 className={`text-sm mb-1 line-clamp-1 ${msg.isRead ? 'font-bold text-slate-700' : 'font-black text-slate-900'}`}>{msg.subject}</h5>
                                        <p className="text-xs text-slate-600 font-bold line-clamp-2 leading-relaxed">{msg.content}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {view === 'new' && (
                    <div className="p-5 flex flex-col gap-5 animate-in slide-in-from-right-4 duration-300">
                        <div className="grid grid-cols-2 gap-3">
                            {teams.map(team => {
                                const Icon = team.icon;
                                return (
                                    <button
                                        key={team.id}
                                        onClick={() => setSelectedTeam(team.id)}
                                        className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${selectedTeam === team.id ? 'border-orange-500 bg-orange-50 shadow-lg shadow-orange-500/10' : 'border-slate-100 hover:border-slate-200 bg-white'}`}
                                    >
                                        <div className={`p-3 rounded-xl scale-110 ${selectedTeam === team.id ? 'bg-orange-500 text-white' : 'bg-slate-50 ' + team.color}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <span className={`text-[11px] font-black text-center whitespace-nowrap ${selectedTeam === team.id ? 'text-orange-600' : 'text-slate-600'}`}>
                                            {team.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {selectedTeam && (
                            <div className="animate-in fade-in slide-in-from-bottom-2">
                                <h4 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                                    اكتب رسالتك لـ {teams.find(t => t.id === selectedTeam)?.label}
                                </h4>
                                <textarea
                                    value={messageDraft}
                                    onChange={(e) => setMessageDraft(e.target.value)}
                                    placeholder="كيف يمكننا مساعدتك اليوم؟"
                                    className="w-full h-32 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none font-bold placeholder:text-slate-400 shadow-inner"
                                />
                                <button
                                    disabled={!messageDraft.trim() || sending}
                                    onClick={handleSendMessage}
                                    className="w-full mt-4 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 text-white p-4 rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-xl shadow-orange-500/20 active:scale-95"
                                >
                                    {sending ? 'جاري الإرسال...' : (
                                        <>
                                            إرسال الرسالة
                                            <Send className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50">
                <p className="text-[10px] text-center text-slate-400 font-black uppercase tracking-widest flex items-center justify-center gap-2">
                    متواجدون لخدمتكم 24/7
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                </p>
            </div>
        </div>
    );
};
