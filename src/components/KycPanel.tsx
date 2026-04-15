import React, { useState } from 'react';
import { FileCheck, Camera } from 'lucide-react';
import { CameraCapture } from './CameraCapture';

interface KycPanelProps {
    kycStatus?: string;
    userId: string;
    showAlert: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

type DocType = 'national_id' | 'passport' | 'driving_license';

const STATUS_MAP: Record<string, { label: string; color: string; icon: string; bg: string; border: string }> = {
    not_submitted: { label: 'لم يتم التوثيق بعد', color: 'text-slate-600', icon: '⚠️', bg: 'bg-slate-50', border: 'border-slate-200' },
    pending: { label: 'قيد المراجعة', color: 'text-yellow-700', icon: '⏳', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    approved: { label: 'موثّق ومعتمد', color: 'text-green-700', icon: '✅', bg: 'bg-green-50', border: 'border-green-200' },
    rejected: { label: 'مرفوض — أعد الرفع', color: 'text-red-700', icon: '❌', bg: 'bg-red-50', border: 'border-red-200' },
};

export const KycPanel: React.FC<KycPanelProps> = ({ kycStatus, userId, showAlert }) => {
    const status = kycStatus || 'not_submitted';
    const info = STATUS_MAP[status] || STATUS_MAP['not_submitted'];

    const [docType, setDocType] = useState<DocType>('national_id');
    const [frontFile, setFrontFile] = useState<File | null>(null);
    const [frontPreview, setFrontPreview] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [showCamera, setShowCamera] = useState(false);

    const handleCameraCapture = async (url: string) => {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const file = new File([blob], `kyc-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
            setFrontFile(file);
            setFrontPreview(url);
        } catch (e) {
            console.error('[KycPanel] camera capture conversion failed', e);
        }
        setShowCamera(false);
    };

    const handleFile = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const result = e.target?.result as string;
            setFrontFile(file);
            setFrontPreview(result);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        if (!frontFile) { showAlert('يرجى رفع صورة المستند أولاً', 'error'); return; }
        setSubmitting(true);
        const fd = new FormData();
        fd.append('userId', userId);
        fd.append('docType', docType);
        fd.append('front', frontFile);
        try {
            const res = await fetch('/api/kyc/upload', { method: 'POST', body: fd });
            if (res.ok) {
                setSubmitted(true);
                showAlert('تم إرسال طلب التوثيق بنجاح! سيتم مراجعته خلال 24 ساعة.', 'success');
            } else {
                showAlert('فشل الإرسال، حاول مرة أخرى', 'error');
            }
        } catch {
            showAlert('خطأ في الاتصال بالخادم', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:border-orange-500 transition-all';

    return (
        <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">

            {/* Header */}
            <div>
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                    <FileCheck className="w-7 h-7 text-orange-500" />
                    توثيق الهوية (KYC)
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                    التوثيق يتيح لك المزايدة بحدود أعلى والوصول لخدمات متقدمة
                </p>
            </div>

            {/* Status Badge */}
            <div className={`flex items-center gap-3 p-4 rounded-2xl border ${info.bg} ${info.border}`}>
                <span className="text-2xl">{info.icon}</span>
                <div>
                    <div className={`font-black ${info.color}`}>{info.label}</div>
                    {status === 'approved' && (
                        <div className="text-xs text-slate-400 font-bold mt-0.5">يمكنك المزايدة بحدود موسّعة</div>
                    )}
                    {status === 'pending' && (
                        <div className="text-xs text-slate-400 font-bold mt-0.5">سيتم إشعارك بنتيجة المراجعة خلال 24 ساعة</div>
                    )}
                    {status === 'rejected' && (
                        <div className="text-xs text-red-400 font-bold mt-0.5">يرجى رفع مستندات واضحة وصحيحة</div>
                    )}
                </div>
            </div>

            {/* Level Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { level: 'Guest', label: 'زائر', desc: 'تصفح فقط', active: true },
                    { level: 'Basic', label: 'أساسي', desc: 'مزايدة حتى $5,000', active: status !== 'not_submitted' },
                    { level: 'Verified', label: 'موثّق', desc: 'مزايدة حتى $50,000', active: status === 'approved' },
                    { level: 'Premium', label: 'وكيل مميز', desc: 'بلا حدود + دعم مخصص', active: false },
                ].map(l => (
                    <div
                        key={l.level}
                        className={`rounded-2xl p-4 border text-center transition-all ${l.active ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200 opacity-60'
                            }`}
                    >
                        <div className="text-lg mb-1">{l.active ? '🔓' : '🔒'}</div>
                        <div className="font-black text-sm text-slate-800">{l.label}</div>
                        <div className="text-[10px] text-slate-400 font-bold mt-1">{l.desc}</div>
                    </div>
                ))}
            </div>

            {/* Upload Form — hidden if already approved */}
            {status !== 'approved' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                    <h3 className="font-black text-slate-800">رفع المستندات</h3>

                    {/* Doc type */}
                    <div>
                        <label className="block text-[11px] font-black text-slate-400 uppercase mb-2">نوع المستند</label>
                        <select
                            className={inp}
                            value={docType}
                            onChange={e => setDocType(e.target.value as DocType)}
                            title="نوع المستند"
                            aria-label="نوع المستند"
                        >
                            <option value="national_id">🪪 الهوية الوطنية</option>
                            <option value="passport">📘 جواز السفر</option>
                            <option value="driving_license">🚗 رخصة القيادة</option>
                        </select>
                    </div>

                    {/* Single front image upload */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[11px] font-black text-slate-400 uppercase">صورة المستند *</label>
                            <button
                                type="button"
                                onClick={() => setShowCamera(true)}
                                className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1 transition-colors"
                            >
                                <Camera className="w-3.5 h-3.5" /> التقط بالكاميرا
                            </button>
                        </div>
                        {showCamera && (
                            <CameraCapture
                                overlayGuide="document"
                                allowMultiple={false}
                                onCapture={handleCameraCapture}
                                onCancel={() => setShowCamera(false)}
                            />
                        )}
                        <label className="block cursor-pointer">
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => handleFile(e.target.files?.[0] || null)}
                            />
                            {frontPreview
                                ? (
                                    <div className="relative">
                                        <img src={frontPreview} alt="doc" className="w-full h-52 object-cover rounded-2xl border-2 border-orange-400 shadow-md" />
                                        <div className="absolute bottom-3 left-3 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                                            ✓ تم الرفع
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full h-52 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-orange-400 hover:text-orange-400 hover:bg-orange-50 transition-all">
                                        <Camera className="w-10 h-10 mb-3" />
                                        <span className="text-sm font-bold">اضغط لرفع صورة المستند</span>
                                        <span className="text-xs text-slate-300 mt-1">JPG, PNG — حتى 5MB</span>
                                    </div>
                                )
                            }
                        </label>
                    </div>

                    {/* Privacy note */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs font-bold text-blue-700">
                        🔒 مستنداتك تُخزَّن بشكل آمن ومشفّر ولا تُشارك مع أي طرف ثالث
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || submitted}
                        className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white font-black rounded-2xl transition-all shadow-lg shadow-orange-500/20 disabled:opacity-60"
                    >
                        {submitting ? '⏳ جاري الإرسال...' : submitted ? '✅ تم الإرسال' : '📤 إرسال طلب التوثيق'}
                    </button>
                </div>
            )}
        </div>
    );
};
