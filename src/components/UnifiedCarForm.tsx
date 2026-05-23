import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2, X, Info, Car as CarIcon, DollarSign, MapPin, Image as ImageIcon, Video, FileText, List, Save, ChevronDown, Search, RefreshCw, Camera } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { CameraCapture } from './CameraCapture';

interface UnifiedCarFormProps {
    initialData?: any;
    onSubmit: (data: any, images: File[], engineSound: File | null, inspectionReport: File | null) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
}

const MAKES = ['Toyota', 'Hyundai', 'Kia', 'Mercedes-Benz', 'BMW', 'Ford', 'Chevrolet', 'Nissan', 'Honda'];
const FUEL_TYPES = ['غاز (Gasoline)', 'ديزل (Diesel)', 'كهربائي (Electric)', 'هجين (Hybrid)'];
const TRANSMISSIONS = ['أوتوماتيكي (Automatic)', 'عادي (Manual)'];
const DRIVETRAINS = ['دفع أمامي (FWD)', 'دفع خلفي (RWD)', 'دفع رباعي (AWD/4WD)'];
const SALE_STATUSES = ['البائع وضع حد أدنى للقبول (Minimum Bid)', 'بيع خالص (Pure Sale)', 'بناء على موافقة البائع (On Approval)'];
const BOOLEANS = [{ label: 'نعم (Yes)', value: 'yes' }, { label: 'لا (No)', value: 'no' }];
const ACCEPTED_OFFER_OPTIONS = ['مفتوح (أي عرض)', 'أقل بـ 0% من السعر الاحتياطي', 'أقل بـ 10% من السعر الاحتياطي'];
const BODY_TYPES = ['سيدان (Sedan)', 'دفع رباعي (SUV)', 'شاحنة (Truck)', 'كوبيه (Coupe)', 'فان (Van)', 'هاتشباك (Hatchback)', 'مكشوفة (Convertible)', 'أخرى (Other)'];
const AUCTION_LIGHTS = ['أخضر (يعمل ويسير)', 'أخضر/أصفر (يعمل ويسير مع ملاحظات)', 'أزرق (تحتاج إصلاحات)', 'أحمر (لا تعمل)'];
const CONDITION_REPORT_TYPES = ['فحص داخلي (In-Network)', 'فحص خارجي (External)', 'بدون فحص (None)'];

const ComboSelect = ({ label, icon: Icon, value, options, onChange, required = false }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [customVal, setCustomVal] = useState(value || '');

    React.useEffect(() => {
        setCustomVal(value || '');
    }, [value]);

    return (
        <div className="relative">
            <label className="block text-xs font-black text-orange-500 mb-2 flex items-center gap-1">
                {Icon && <Icon className="w-3 h-3" />}
                {label} {required && '*'}
            </label>
            <div className="relative flex items-center">
                <input
                    type="text"
                    value={customVal}
                    onChange={(e) => {
                        setCustomVal(e.target.value);
                        onChange(e.target.value);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                    className="w-full bg-slate-900 border border-slate-700/50 text-white p-3 rounded-lg text-sm font-bold placeholder-slate-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all outline-none"
                    placeholder={`اختر أو اكتب ${label}...`}
                />
                <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            </div>
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                    {options.map((opt: string) => (
                        <div
                            key={opt}
                            onClick={() => {
                                setCustomVal(opt);
                                onChange(opt);
                                setIsOpen(false);
                            }}
                            className="p-3 text-sm font-bold text-slate-300 hover:bg-orange-500/10 hover:text-orange-500 cursor-pointer border-b border-slate-700/50 last:border-b-0"
                        >
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// [auction-sessions] Match the categories list used everywhere else
// (admin sessions panel + server) so the same key flows end-to-end.
const VEHICLE_CATEGORIES: { key: string; label: string; icon: string }[] = [
    { key: '',                label: '— غير محدد (يدخل النظام العادي) —', icon: '' },
    { key: 'cars',            label: 'سيارات ركوبة', icon: '🚗' },
    { key: 'trucks',          label: 'شاحنات', icon: '🚚' },
    { key: 'heavy_equipment', label: 'معدات ثقيلة', icon: '🏗️' },
    { key: 'motorcycles',     label: 'دراجات نارية', icon: '🏍️' },
    { key: 'jet_skis',        label: 'دراجات بحرية', icon: '🌊' },
    { key: 'boats',           label: 'قوارب', icon: '🚤' },
];

export const UnifiedCarForm: React.FC<UnifiedCarFormProps> = ({ initialData, onSubmit, onCancel, isSubmitting }) => {
    const { showAlert } = useStore();
    const [formData, setFormData] = useState<any>({
        vin: '', make: '', model: '', year: new Date().getFullYear(), trim: '',
        odometer: '', actualOdometer: 'yes', engine: '', cylinders: '',
        transmission: TRANSMISSIONS[0], drive: DRIVETRAINS[0], fuelType: FUEL_TYPES[0],
        auctionLane: '', showroomName: '', startingBid: '', reservePrice: '',
        saleStatus: SALE_STATUSES[0], locationDetails: '', exchangeRate: '1', minPrice: '',
        specialNote: '', buyNowPrice: '', acceptedOfferPercentage: ACCEPTED_OFFER_OPTIONS[0],
        bodyType: BODY_TYPES[0], interiorColor: '', exteriorColor: '', auctionLights: AUCTION_LIGHTS[0], conditionReportType: CONDITION_REPORT_TYPES[0],
        youtubeVideoUrl: '', isRecommended: false, primaryDamage: 'بدون ضرر', location: '', titleType: 'الولايات المتحدة us',
        // [auction-sessions] New optional fields. '' means "no category /
        // no session" — the legacy continuous scheduler picks the car up.
        category: '',
        sessionId: '',
        ...(initialData || {}),
        // [price-fields] Map DB columns → form field names so EDIT pre-fills
        // the opening price and buy-now correctly. The car row stores the
        // opening price in `currentBid` and the instant-buy price in
        // `buyItNow`, but this form's inputs are bound to `startingBid` and
        // `buyNowPrice`. Without this remap, editing showed both fields
        // empty and a save wiped the values. These overrides run AFTER the
        // initialData spread so they win.
        startingBid: initialData?.startingBid ?? initialData?.currentBid ?? '',
        buyNowPrice: initialData?.buyNowPrice ?? initialData?.buyItNow ?? '',
    });

    // [auction-sessions] Load available scheduled sessions so the user can
    // optionally route this car straight into one. Done in a separate effect
    // so the rest of the form keeps working even if the request fails.
    const [availableSessions, setAvailableSessions] = useState<Array<{ id: string; name: string; category: string; scheduledStart: string }>>([]);
    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const token = localStorage.getItem('authToken') || '';
                const res = await fetch('/api/admin/auction-sessions', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (!res.ok) return;
                const data = await res.json();
                if (!alive) return;
                const list = Array.isArray(data?.sessions) ? data.sessions : [];
                // Only sessions still scheduled (not live / closed / cancelled)
                setAvailableSessions(list
                    .filter((s: any) => s.status === 'scheduled')
                    .map((s: any) => ({
                        id: s.id, name: s.name, category: s.category, scheduledStart: s.scheduledStart,
                    })));
            } catch {
                // Silent — sessions are optional
            }
        })();
        return () => { alive = false; };
    }, []);

    const [isDecodingVin, setIsDecodingVin] = useState(false);

    const handleDecodeVin = async () => {
        if (!formData.vin || (formData.vin?.length || 0) < 11) {
            showAlert('يرجى إدخال رقم شاصي (VIN) صحيح قبل البحث', 'error');
            return;
        }
        setIsDecodingVin(true);
        try {
            const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${formData.vin}?format=json`);
            const data = await res.json();

            if (data && data.Results && data.Results.length > 0) {
                const result = data.Results[0];
                const make = result.Make || '';
                const model = result.Model || '';
                const year = result.ModelYear || '';

                if (!make && !model) {
                    showAlert('لم يتم العثور على بيانات لهذه السيارة (تأكد من الرقم)', 'error');
                    return;
                }

                setFormData((prev: any) => {
                    let newMake = prev.make;
                    if (make) {
                        const searchMake = make.trim().toLowerCase();
                        // Search in MAKES array defined above/in scope to find exact case match
                        const match = ['Toyota', 'Hyundai', 'Kia', 'Mercedes-Benz', 'BMW', 'Ford', 'Chevrolet', 'Nissan', 'Honda'].find(m => m.toLowerCase() === searchMake);
                        newMake = match || (make.trim().charAt(0).toUpperCase() + make.trim().slice(1).toLowerCase());
                    }

                    let transmission = prev.transmission;
                    if (result.TransmissionStyle) {
                        const trans = result.TransmissionStyle.toLowerCase();
                        if (trans.includes('manual')) transmission = 'عادي (Manual)';
                        else if (trans.includes('auto')) transmission = 'أوتوماتيكي (Automatic)';
                    }

                    let drive = prev.drive;
                    if (result.DriveType) {
                        const dt = result.DriveType.toLowerCase();
                        if (dt.includes('fwd') || dt.includes('front')) drive = 'دفع أمامي (FWD)';
                        else if (dt.includes('rwd') || dt.includes('rear')) drive = 'دفع خلفي (RWD)';
                        else if (dt.includes('awd') || dt.includes('4wd') || dt.includes('4x4') || dt.includes('all')) drive = 'دفع رباعي (AWD/4WD)';
                    }

                    let fuelType = prev.fuelType;
                    if (result.FuelTypePrimary) {
                        const ft = result.FuelTypePrimary.toLowerCase();
                        if (ft.includes('diesel')) fuelType = 'ديزل (Diesel)';
                        else if (ft.includes('electric')) fuelType = 'كهربائي (Electric)';
                        else if (ft.includes('hybrid')) fuelType = 'هجين (Hybrid)';
                        else if (ft.includes('gasoline')) fuelType = 'غاز (Gasoline)';
                    }

                    return {
                        ...prev,
                        make: newMake,
                        model: model ? model.trim().charAt(0).toUpperCase() + model.trim().slice(1).toLowerCase() : prev.model,
                        year: year ? parseInt(year) : prev.year,
                        trim: result.Trim || prev.trim,
                        engine: result.DisplacementL ? `${result.DisplacementL}L` : prev.engine,
                        cylinders: result.EngineCylinders || prev.cylinders,
                        transmission,
                        drive,
                        fuelType
                    };
                });
                showAlert('تم جلب جميع بيانات السيارة المتوفرة بنجاح', 'success');
            } else {
                showAlert('خطأ في استرجاع البيانات', 'error');
            }
        } catch (error) {
            showAlert('حدث خطأ أثناء الاتصال بقاعدة البيانات', 'error');
        } finally {
            setIsDecodingVin(false);
        }
    };

    const [mainImage, setMainImage] = useState<File | null>(null);
    // Parse images safely — could be JSON string or array
    const parsedImages = (() => {
        if (!initialData?.images) return [];
        if (Array.isArray(initialData.images)) return initialData.images;
        if (typeof initialData.images === 'string') {
            try { return JSON.parse(initialData.images); } catch { return []; }
        }
        return [];
    })();
    const [mainImagePreview, setMainImagePreview] = useState<string>(parsedImages[0] || '');

    const [extraImages, setExtraImages] = useState<File[]>([]);
    const [extraImagePreviews, setExtraImagePreviews] = useState<string[]>(parsedImages.slice(1) || []);

    const [engineSoundMedia, setEngineSoundMedia] = useState<File | null>(null);
    const [engineSoundMediaName, setEngineSoundMediaName] = useState<string>(initialData?.engineSoundUrl || '');

    const [inspectionReportMedia, setInspectionReportMedia] = useState<File | null>(null);
    const [inspectionReportMediaName, setInspectionReportMediaName] = useState<string>(initialData?.inspectionReportUrl || '');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const extraInputRef = useRef<HTMLInputElement>(null);
    const soundInputRef = useRef<HTMLInputElement>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);
    const [showCameraMain, setShowCameraMain] = useState(false);
    const [showCameraExtra, setShowCameraExtra] = useState(false);

    // Convert an uploaded image URL back to a File so it slots into the existing
    // File-based submission pipeline.
    const urlToFile = async (url: string): Promise<File | null> => {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const name = url.split('/').pop() || `camera-${Date.now()}.jpg`;
            return new File([blob], name, { type: blob.type || 'image/jpeg' });
        } catch (e) {
            console.error('[UnifiedCarForm] urlToFile failed', e);
            return null;
        }
    };

    const handleFieldChange = (field: string, val: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: val }));
    };

    const handleMainImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setMainImage(file);
            setMainImagePreview(URL.createObjectURL(file));
        }
    };

    const handleExtraImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const newPreviews = files.map(f => URL.createObjectURL(f));
            setExtraImages(prev => [...prev, ...files]);
            setExtraImagePreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removeExtraImage = (idx: number) => {
        setExtraImages(prev => prev.filter((_, i) => i !== idx));
        setExtraImagePreviews(prev => prev.filter((_, i) => i !== idx));
    };

    const handleEngineSoundSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showAlert('حجم الملف كبير جداً. الحد الأقصى للملف الصوتي هو 5MB', 'error');
                return;
            }
            setEngineSoundMedia(file);
            setEngineSoundMediaName(file.name);
        }
    };

    const handleInspectionReportSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 20 * 1024 * 1024) {
                showAlert('حجم الملف كبير جداً. الحد الأقصى لتقرير الفحص هو 20MB', 'error');
                return;
            }
            setInspectionReportMedia(file);
            setInspectionReportMediaName(file.name);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.vin || !formData.make || !formData.model) {
            showAlert('يرجى تعبئة الحقول الأساسية (VIN، الماركة، الموديل)', 'error');
            return;
        }

        const allImages = mainImage ? [mainImage, ...extraImages] : extraImages;
        await onSubmit(formData, allImages, engineSoundMedia, inspectionReportMedia);
    };

    const iptClass = "w-full bg-slate-900 border border-slate-700/50 text-white p-3 rounded-lg text-sm font-bold placeholder-slate-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all";

    return (
        <div className="bg-slate-950 min-h-screen p-4 pb-24 md:p-8 md:pb-8 text-slate-300 font-cairo" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-black text-orange-500 flex items-center gap-3">
                        <CarIcon className="w-8 h-8" />
                        تعديل بيانات السيارة اليدوية
                    </h1>
                </div>

                <form
                    onSubmit={handleSubmit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                            e.preventDefault();
                        }
                    }}
                    className="grid lg:grid-cols-12 gap-6"
                >

                    {/* Right Column: Main Form */}
                    <div className="lg:col-span-8 space-y-6">

                        {/* Box 1: Vehicle Info */}
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl">
                            <h2 className="text-lg font-black text-orange-500 flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
                                <CarIcon className="w-5 h-5" /> معلومات أساسية
                            </h2>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="md:col-span-2 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                                    <label className="block text-xs font-black text-orange-500 mb-2">رقم الشاصي (VIN) *</label>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <input
                                            type="text"
                                            aria-label="رقم الشاصي"
                                            title="رقم الشاصي"
                                            value={formData.vin}
                                            onChange={e => handleFieldChange('vin', e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleDecodeVin();
                                                }
                                            }}
                                            className={`flex-1 ${iptClass}`}
                                            placeholder="أدخل رقم الشاصي المكون من 17 حرفاً ورقم..."
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={handleDecodeVin}
                                            disabled={isDecodingVin || (formData.vin?.length || 0) < 11}
                                            className="bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white px-6 py-3 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap shadow-md"
                                        >
                                            {isDecodingVin ? <RefreshCw className="w-5 h-5 text-orange-400 animate-spin" /> : <Search className="w-5 h-5 text-orange-400" />}
                                            {isDecodingVin ? 'جاري البحث...' : 'بحث وجلب البيانات'}
                                        </button>
                                    </div>
                                    <p className="text-[11px] font-medium text-slate-400 mt-2 flex items-center gap-1">
                                        <Info className="w-3 h-3 text-orange-500" />
                                        أدخل رقم الشاصي (VIN) واضغط بحث لجلب بيانات (الماركة، الموديل، السنة) تلقائياً من قواعد البيانات.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">رقم اللوت (لوجود مزاد)</label>
                                    <input type="text" aria-label="رقم اللوت" title="رقم اللوت" value={formData.lotNumber} onChange={e => handleFieldChange('lotNumber', e.target.value)} className={iptClass} disabled placeholder="يتم توليده آلياً..." />
                                </div>

                                <ComboSelect label="الماركة" value={formData.make} options={MAKES} onChange={(v: string) => handleFieldChange('make', v)} required />
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">الموديل *</label>
                                    <input type="text" aria-label="الموديل" title="الموديل" value={formData.model} onChange={e => handleFieldChange('model', e.target.value)} className={iptClass} placeholder="Tucson, C-Class..." required />
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">السنة *</label>
                                    <input title="سنة الصنع" aria-label="سنة الصنع" placeholder="مثال: 2024" type="number" value={formData.year} onChange={e => handleFieldChange('year', e.target.value)} className={iptClass} required />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">الفئة (Trim)</label>
                                    <input type="text" aria-label="الفئة" title="الفئة" value={formData.trim} onChange={e => handleFieldChange('trim', e.target.value)} className={iptClass} placeholder="GLS, AMG..." />
                                </div>
                            </div>

                            <h2 className="text-lg font-black text-orange-500 flex items-center gap-2 mt-8 mb-6 border-b border-slate-800 pb-4">
                                <List className="w-5 h-5" /> تفاصيل المحرك وناقل الحركة
                            </h2>
                            <div className="grid md:grid-cols-2 gap-4">
                                <ComboSelect label="ناقل الحركة" value={formData.transmission} options={TRANSMISSIONS} onChange={(v: string) => handleFieldChange('transmission', v)} />
                                <ComboSelect label="نوع الدفع" value={formData.drive} options={DRIVETRAINS} onChange={(v: string) => handleFieldChange('drive', v)} />
                                <ComboSelect label="نوع الوقود" value={formData.fuelType} options={FUEL_TYPES} onChange={(v: string) => handleFieldChange('fuelType', v)} />
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">سعة المحرك</label>
                                    <input type="text" aria-label="سعة المحرك" title="سعة المحرك" value={formData.engine} onChange={e => handleFieldChange('engine', e.target.value)} className={iptClass} placeholder="2.4L 4-Cyl..." />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">عدد الأسطوانات</label>
                                    <input type="number" aria-label="عدد الأسطوانات" title="عدد الأسطوانات" value={formData.cylinders} onChange={e => handleFieldChange('cylinders', e.target.value)} className={iptClass} placeholder="4, 6, 8..." />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">اللون الخارجي</label>
                                    <input type="text" aria-label="اللون الخارجي" title="اللون الخارجي" value={formData.exteriorColor || ''} onChange={e => handleFieldChange('exteriorColor', e.target.value)} className={iptClass} placeholder="أسود، أبيض، فضي..." />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">اللون الداخلي</label>
                                    <input type="text" aria-label="اللون الداخلي" title="اللون الداخلي" value={formData.interiorColor || ''} onChange={e => handleFieldChange('interiorColor', e.target.value)} className={iptClass} placeholder="بيج، أسود، أحمر..." />
                                </div>
                                <ComboSelect label="شكل الهيكل" value={formData.bodyType} options={BODY_TYPES} onChange={(v: string) => handleFieldChange('bodyType', v)} />
                                <ComboSelect label="نوع الضرر الأساسي" value={formData.primaryDamage} options={['بدون ضرر', 'أمامي', 'خلفي', 'جانبي', 'سقف', 'غرق', 'حريق', 'تلف بيئي', 'سرقة مسترجعة', 'ميكانيكي', 'كهربائي', 'أخرى']} onChange={(v: string) => handleFieldChange('primaryDamage', v)} />
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">موقع السيارة (Location)</label>
                                    <input type="text" value={formData.location || formData.locationDetails || ''} onChange={e => { handleFieldChange('location', e.target.value); handleFieldChange('locationDetails', e.target.value); }} className={iptClass} placeholder="مثال: GA - ATLANTA, USA" />
                                </div>
                                <ComboSelect label="بلد الاستيراد" value={formData.titleType} options={['الولايات المتحدة us', 'كندا ca', 'كوريا kr', 'الإمارات ae', 'أوروبا eu', 'أخرى']} onChange={(v: string) => handleFieldChange('titleType', v)} />
                                <ComboSelect label="إضاءة المزاد (حالة عامة)" value={formData.auctionLights} options={AUCTION_LIGHTS} onChange={(v: string) => handleFieldChange('auctionLights', v)} />
                                <ComboSelect label="نوع تقرير الفحص" value={formData.conditionReportType} options={CONDITION_REPORT_TYPES} onChange={(v: string) => handleFieldChange('conditionReportType', v)} />
                                <ComboSelect label="حالة السيارة" value={formData.runsDrives || 'تعمل وتسير'} options={['تعمل وتسير', 'المحرك يعمل فقط', 'لا تعمل ولا تسير']} onChange={(v: string) => handleFieldChange('runsDrives', v)} />
                            </div>
                        </div>

                        {/* [auction-sessions] Box 1.5: Category + Session routing */}
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl">
                            <h2 className="text-lg font-black text-orange-500 flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
                                📅 تصنيف المركبة وجدولة المزاد
                            </h2>
                            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 mb-4 text-[11px] text-slate-300 font-bold leading-relaxed">
                                💡 اختر تصنيف المركبة لتظهر في الجلسة المناسبة. لو تركت "الجدولة" فارغة، السيارة تدخل النظام العادي مباشرة (المزاد المستمر الحالي). لو اخترت جلسة، السيارة تنتظر بدء وقت الجلسة فقط.
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">تصنيف المركبة (Category)</label>
                                    <select
                                        value={formData.category || ''}
                                        onChange={e => handleFieldChange('category', e.target.value)}
                                        aria-label="تصنيف المركبة"
                                        title="تصنيف المركبة"
                                        className={iptClass}
                                    >
                                        {VEHICLE_CATEGORIES.map(c => (
                                            <option key={c.key || 'none'} value={c.key}>
                                                {c.icon ? `${c.icon} ` : ''}{c.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">
                                        جدولة المزاد (اختياري)
                                        {availableSessions.length === 0 && (
                                            <span className="text-[10px] text-slate-500 font-normal mr-2">— لا توجد جلسات مجدولة حالياً</span>
                                        )}
                                    </label>
                                    <select
                                        value={formData.sessionId || ''}
                                        onChange={e => handleFieldChange('sessionId', e.target.value)}
                                        disabled={availableSessions.length === 0}
                                        aria-label="جدولة المزاد"
                                        title="جدولة المزاد"
                                        className={iptClass}
                                    >
                                        <option value="">— بدون جلسة (نظام المزاد العادي) —</option>
                                        {availableSessions.map(s => {
                                            const when = (() => {
                                                try {
                                                    return new Date(s.scheduledStart).toLocaleString('en-US', {
                                                        month: 'short', day: '2-digit',
                                                        hour: '2-digit', minute: '2-digit',
                                                    });
                                                } catch { return s.scheduledStart; }
                                            })();
                                            return (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} — {when}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Box 2: Auction Details */}
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl">
                            <h2 className="text-lg font-black text-orange-500 flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
                                <DollarSign className="w-5 h-5" /> تفاصيل المزاد والسعر
                            </h2>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">رقم خط المزايدة (Lane)</label>
                                    <input type="text" aria-label="رقم خط المزايدة" title="رقم خط المزايدة" value={formData.auctionLane} onChange={e => handleFieldChange('auctionLane', e.target.value)} className={iptClass} placeholder="Lane A..." />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">اسم المعرض (اختياري)</label>
                                    <input title="اسم المعرض" aria-label="اسم المعرض" placeholder="اسم المعرض..." type="text" value={formData.showroomName} onChange={e => handleFieldChange('showroomName', e.target.value)} className={iptClass} />
                                </div>

                                <div className="col-span-2 grid md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black text-orange-500 mb-2">عداد المسافات (Odometer)</label>
                                        <input title="عداد المسافات" aria-label="عداد المسافات" placeholder="مثال: 50000" type="number" value={formData.odometer} onChange={e => handleFieldChange('odometer', e.target.value)} className={iptClass} />
                                    </div>
                                    <ComboSelect label="هل العداد حقيقي؟" value={formData.actualOdometer} options={['حقيقي', 'غير حقيقي']} onChange={(v: string) => handleFieldChange('actualOdometer', v)} />
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">أول سعر يبدأ به المزاد ($)</label>
                                    <input title="سعر بداية المزاد" aria-label="سعر بداية المزاد" placeholder="1000" type="number" value={formData.startingBid} onChange={e => handleFieldChange('startingBid', e.target.value)} className={iptClass} />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">أقل سعر يتم قبوله Reserve ($) *</label>
                                    <input title="السعر الاحتياطي" aria-label="السعر الاحتياطي" placeholder="5000" type="number" value={formData.reservePrice} onChange={e => handleFieldChange('reservePrice', e.target.value)} className={iptClass} required />
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">سعر البيع الفوري (Buy Now) ($) اختياري</label>
                                    <input title="سعر البيع الفوري" aria-label="سعر البيع الفوري" placeholder="مثال: 8000" type="number" value={formData.buyNowPrice || ''} onChange={e => handleFieldChange('buyNowPrice', e.target.value)} className={iptClass} />
                                </div>
                                <ComboSelect label="نسبة العرض المقبولة" value={formData.acceptedOfferPercentage} options={ACCEPTED_OFFER_OPTIONS} onChange={(v: string) => handleFieldChange('acceptedOfferPercentage', v)} />

                                <div className="col-span-2 bg-slate-800/20 p-4 rounded-xl border border-slate-800/50 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <label className="text-sm font-black text-orange-500 mb-1 leading-none">تمييز السيارة (Recommended Badge)</label>
                                        <p className="text-[10px] text-slate-500 font-bold">هذه الميزة تظهر السيارة في النتائج الأولى كسيارة موصى بها</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer group">
                                        <input 
                                            type="checkbox" 
                                            title="إضافة توصية"
                                            aria-label="إضافة توصية للسيارة"
                                            checked={formData.isRecommended} 
                                            onChange={e => handleFieldChange('isRecommended', e.target.checked)}
                                            className="sr-only peer" 
                                        />
                                        <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-orange-600 group-hover:shadow-[0_0_15px_rgba(234,88,12,0.3)] transition-all"></div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Box 3: Engine Media and Reports */}
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl border-dashed">
                            <h2 className="text-lg font-black text-orange-500 flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
                                <Video className="w-5 h-5" /> تفاصيل الفحص والوسائط (روابط وملفات)
                            </h2>

                            <div className="grid md:grid-cols-1 gap-6 mb-6">
                                <div>
                                    <label className="block text-xs font-black text-orange-500 mb-2">رابط فيديو يوتيوب (تشغيل السيارة / جولة حولها)</label>
                                    <input type="url" aria-label="رابط فيديو السيارة" title="رابط فيديو السيارة" value={formData.youtubeVideoUrl} onChange={e => handleFieldChange('youtubeVideoUrl', e.target.value)} className={iptClass} placeholder="https://www.youtube.com/watch?v=..." dir="ltr" />
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Engine Sound Upload */}
                                <div
                                    className="border-2 border-dashed border-slate-700/50 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group"
                                    onClick={() => soundInputRef.current?.click()}
                                >
                                    <input title="إرفاق صوت المحرك" aria-label="إرفاق صوت المحرك" placeholder="صوت المحرك" type="file" ref={soundInputRef} accept="audio/*" className="hidden" onChange={handleEngineSoundSelect} />
                                    <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <Video className="w-6 h-6 text-orange-500" />
                                    </div>
                                    <div className="text-sm font-black text-slate-300 mb-1">رفع صوت المحرك (MP3/WAV)</div>
                                    <div className="text-xs font-bold text-orange-500/70">انقر هنا لاختيار الملف (أقصى حجم 5MB)</div>
                                    {engineSoundMediaName && (
                                        <div className="mt-4 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg text-xs font-bold flex items-center gap-2 border border-emerald-500/20 max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                                            <CheckCircle2 className="w-4 h-4 shrink-0" /> {engineSoundMediaName}
                                        </div>
                                    )}
                                </div>

                                {/* PDF Report Upload */}
                                <div
                                    className="border-2 border-dashed border-slate-700/50 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group"
                                    onClick={() => pdfInputRef.current?.click()}
                                >
                                    <input title="إرفاق تقرير الفحص" aria-label="إرفاق تقرير الفحص" placeholder="تقرير الفحص" type="file" ref={pdfInputRef} accept="application/pdf" className="hidden" onChange={handleInspectionReportSelect} />
                                    <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <FileText className="w-6 h-6 text-orange-500" />
                                    </div>
                                    <div className="text-sm font-black text-slate-300 mb-1">رفع تقرير الفحص (PDF)</div>
                                    <div className="text-xs font-bold text-orange-500/70">انقر هنا لاختيار الملف (أقصى حجم 20MB)</div>
                                    {inspectionReportMediaName && (
                                        <div className="mt-4 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg text-xs font-bold flex items-center gap-2 border border-emerald-500/20 max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                                            <CheckCircle2 className="w-4 h-4 shrink-0" /> {inspectionReportMediaName}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-6">
                                <label className="block text-xs font-black text-orange-500 mb-2 flex items-center gap-2">
                                    <FileText className="w-4 h-4" /> ملاحظات إضافية (اختياري)
                                </label>
                                <textarea
                                    rows={4}
                                    value={formData.specialNote}
                                    onChange={e => handleFieldChange('specialNote', e.target.value)}
                                    className={iptClass}
                                    placeholder="ملاحظات حول المحرك أو السيارة تظهر للإدارة فقط..."
                                ></textarea>
                            </div>

                            {/* Submit Buttons */}
                            <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-slate-800">
                                <button type="button" aria-label="إلغاء التعديلات" title="إلغاء" onClick={onCancel} className="px-6 py-3 font-black text-sm text-slate-400 hover:text-white transition-colors">
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="bg-orange-600 hover:bg-orange-500 text-slate-900 px-8 py-3 rounded-xl font-black text-sm flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? <span className="animate-pulse">جاري الحفظ...</span> : <><Save className="w-5 h-5" /> حفظ البيانات</>}
                                </button>
                            </div>
                        </div>

                    </div>

                    {/* Left Column: Media & Visuals */}
                    <div className="lg:col-span-4 space-y-6">

                        {/* Main Image */}
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl relative overflow-hidden group">
                            <div className="flex items-center justify-between mb-4 gap-2">
                                <h2 className="text-lg font-black text-orange-500 flex items-center gap-2"><ImageIcon className="w-5 h-5" /> صورة السيارة الرئيسية</h2>
                                <button
                                    type="button"
                                    onClick={() => setShowCameraMain(true)}
                                    className="bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1 transition-colors"
                                >
                                    <Camera className="w-3.5 h-3.5" /> التقط صورة
                                </button>
                            </div>
                            <input title="الصورة الرئيسية" aria-label="الصورة الرئيسية" placeholder="رفع الصورة الرئيسية" type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleMainImageSelect} />
                            {showCameraMain && (
                                <CameraCapture
                                    overlayGuide="vehicle-front"
                                    allowMultiple={false}
                                    onCapture={async (url) => {
                                        const file = await urlToFile(url);
                                        if (file) {
                                            setMainImage(file);
                                            setMainImagePreview(url);
                                        }
                                        setShowCameraMain(false);
                                    }}
                                    onCancel={() => setShowCameraMain(false)}
                                />
                            )}

                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="aspect-[4/3] bg-slate-900 rounded-xl border-2 border-slate-700/50 border-dashed overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-orange-500/50 transition-all relative"
                            >
                                {mainImagePreview ? (
                                    <>
                                        <img src={mainImagePreview} alt="Main" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white font-bold text-sm">
                                            تغيير الصورة
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud className="w-10 h-10 text-slate-600 mb-2" />
                                        <div className="text-xs text-slate-500 font-bold">انقر لرفع الصورة الرئيسية</div>
                                    </>
                                )}
                                <div className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg pointer-events-none">
                                    <div className="text-lg font-black leading-none">+</div>
                                </div>
                            </div>
                            <div className="text-center mt-3 text-[10px] text-slate-500 font-bold">الحجم الموصى به 1024 × 768 بكسل</div>
                        </div>

                        {/* Extra Images */}
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl">
                            <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
                                <h2 className="text-lg font-black text-orange-500 flex items-center gap-2"><List className="w-5 h-5" /> صور إضافية</h2>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowCameraExtra(true)}
                                        className="bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1 transition-colors"
                                    >
                                        <Camera className="w-3.5 h-3.5" /> التقط بالكاميرا
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setExtraImages([]); setExtraImagePreviews([]); }}
                                        className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1 transition-colors"
                                    >
                                        حذف الكل <X className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                            <input title="صور إضافية" aria-label="صور إضافية" placeholder="رفع صور إضافية" type="file" ref={extraInputRef} accept="image/*" multiple className="hidden" onChange={handleExtraImagesSelect} />
                            {showCameraExtra && (
                                <CameraCapture
                                    overlayGuide="vehicle-side"
                                    allowMultiple={true}
                                    maxPhotos={15}
                                    onCapture={async (url) => {
                                        const file = await urlToFile(url);
                                        if (file) {
                                            setExtraImages(prev => [...prev, file]);
                                            setExtraImagePreviews(prev => [...prev, url]);
                                        }
                                    }}
                                    onCancel={() => setShowCameraExtra(false)}
                                />
                            )}

                            <div className="grid grid-cols-2 gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                                {extraImagePreviews.map((preview, idx) => (
                                    <div key={idx} className="aspect-[4/3] bg-slate-900 rounded-lg border border-slate-700/50 overflow-hidden relative group">
                                        <img src={preview} alt={`Extra ${idx}`} className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            title="حذف الصورة"
                                            aria-label="حذف الصورة"
                                            onClick={() => removeExtraImage(idx)}
                                            className="absolute top-2 left-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}

                                <div
                                    onClick={() => extraInputRef.current?.click()}
                                    className="aspect-[4/3] bg-slate-900 rounded-lg border-2 border-slate-700/50 border-dashed flex flex-col items-center justify-center cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
                                >
                                    <div className="w-8 h-8 rounded-full border border-orange-500/50 flex items-center justify-center mb-2">
                                        <span className="text-orange-500 font-black text-lg leading-none">+</span>
                                    </div>
                                    <div className="text-[10px] text-orange-500 font-bold uppercase">إضافة ملفات</div>
                                </div>
                            </div>
                        </div>

                    </div>
                </form>
            </div>
        </div>
    );
};
