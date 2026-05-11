/**
 * KycDocumentsUploader — post-signup checklist that asks users to upload
 * the documents they need so:
 *   - Buyers can bid (passport OR national ID required)
 *   - Sellers can receive payouts (passport + commercial register +
 *     activity license)
 *
 * Mounted at the top of the user / seller dashboards. Hides itself once
 * the user's kycStatus is 'approved'. Each required document has its own
 * row showing upload status (مطلوب → مرفوع → معتمد / مرفوض). On upload
 * we POST to /api/kyc/upload (multer endpoint, already exists) which
 * also bumps the user's kycStatus to 'pending' so the admin sees them
 * in the KYC center for review.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore, authFetch } from '../context/StoreContext';

interface DocRow {
  key: string;
  label: string;
  icon: string;
  hint?: string;
  oneOf?: string[]; // accept any of these docType values too
}

const BUYER_DOCS: DocRow[] = [
  {
    key: 'national_id',
    label: 'صورة بطاقة التعريف الوطنية',
    icon: '🪪',
    hint: 'الوجه الأمامي والخلفي في صورة واحدة، أو ملف PDF.',
    oneOf: ['national_id', 'passport'], // accept either
  },
  {
    key: 'passport',
    label: 'صورة جواز السفر (بديل عن البطاقة)',
    icon: '🛂',
    hint: 'إن لم يكن لديك بطاقة تعريف، يكفي رفع جواز السفر.',
    oneOf: ['national_id', 'passport'],
  },
];

const SELLER_DOCS: DocRow[] = [
  {
    key: 'passport',
    label: 'صورة جواز السفر',
    icon: '🛂',
    hint: 'مطلوبة لتأكيد الهوية الشخصية للتاجر.',
    oneOf: ['passport', 'national_id'],
  },
  {
    key: 'commercial_register',
    label: 'السجل التجاري',
    icon: '📜',
    hint: 'صورة من السجل التجاري لمؤسستك.',
  },
  {
    key: 'trade_license',
    label: 'رخصة ممارسة النشاط',
    icon: '🏢',
    hint: 'رخصة العمل / رخصة ممارسة النشاط التجاري.',
  },
];

type Status = 'pending' | 'approved' | 'rejected';

interface Doc {
  id: string;
  docType: string;
  filename: string;
  url: string;
  status: Status;
  uploadedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export default function KycDocumentsUploader() {
  const { currentUser } = useStore();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [kycStatus, setKycStatus] = useState<string>('pending');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const isSeller = String(currentUser?.role || '').toLowerCase() === 'seller';
  const requiredDocs = isSeller ? SELLER_DOCS : BUYER_DOCS;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function load() {
    if (!currentUser) return;
    try {
      const res = await authFetch('/api/kyc/my-documents');
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents || []);
        setKycStatus(data.kycStatus || 'pending');
      }
    } catch {}
    finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [currentUser?.id]);

  function findDocForRow(row: DocRow): Doc | null {
    const accepted = row.oneOf || [row.key];
    return docs.find((d) => accepted.includes(d.docType)) || null;
  }

  async function handleFileChange(row: DocRow, file: File | null) {
    if (!file || !currentUser) return;
    setUploading(row.key);
    try {
      const fd = new FormData();
      fd.append('document', file);
      fd.append('userId', currentUser.id);
      fd.append('docType', row.key);
      const res = await authFetch('/api/kyc/upload', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`✅ تم رفع ${row.label}`);
        await load();
      } else {
        showToast(data.error || 'فشل الرفع');
      }
    } catch {
      showToast('خطأ في الاتصال');
    } finally {
      setUploading(null);
      // Reset the input so re-uploading the same file fires onChange.
      const inp = fileInputsRef.current[row.key];
      if (inp) inp.value = '';
    }
  }

  // Hide for unauthenticated and for already-approved users.
  if (!currentUser) return null;
  if (kycStatus === 'approved') return null;
  if (loading) return null;

  // For buyers, only one of (national_id, passport) is required — if
  // either is present we consider the buyer checklist complete and hide.
  const buyerSatisfied = !isSeller && docs.some((d) => ['national_id', 'passport'].includes(d.docType));
  const sellerSatisfied = isSeller
    && docs.some((d) => ['national_id', 'passport'].includes(d.docType))
    && docs.some((d) => d.docType === 'commercial_register')
    && docs.some((d) => d.docType === 'trade_license');

  return (
    <div
      dir="rtl"
      className="mb-6 bg-gradient-to-br from-orange-50 via-white to-amber-50 border-2 border-orange-200 rounded-3xl p-6 shadow-lg shadow-orange-100/50"
    >
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="text-4xl">📋</div>
          <div>
            <h3 className="text-lg font-black text-slate-900">
              {isSeller
                ? 'أكمِل توثيق نشاطك التجاري لتحصيل أموالك'
                : 'ارفع وثائقك لتفعيل المزايدة'}
            </h3>
            <p className="text-xs text-slate-600 font-bold mt-1">
              {isSeller
                ? 'الإدارة تراجع الوثائق خلال 24 ساعة. لا يمكن تحصيل أي مبيعات قبل الاعتماد.'
                : 'الإدارة تراجع الوثائق خلال 24 ساعة. لا يمكن المزايدة قبل اعتماد الوثائق + دفع العربون.'}
            </p>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-xl text-xs font-black ${
          kycStatus === 'pending' && docs.length > 0
            ? 'bg-amber-100 text-amber-700 border border-amber-200'
            : kycStatus === 'rejected'
              ? 'bg-rose-100 text-rose-700 border border-rose-200'
              : 'bg-slate-100 text-slate-700 border border-slate-200'
        }`}>
          {kycStatus === 'pending' && docs.length > 0 ? '⏳ قيد المراجعة'
           : kycStatus === 'rejected' ? '❌ تم الرفض'
           : '🔓 يتطلب التوثيق'}
        </div>
      </div>

      {(buyerSatisfied || sellerSatisfied) && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold rounded-2xl p-4 mb-4 flex items-center gap-2">
          ✅ تم رفع جميع الوثائق المطلوبة. الإدارة ستراجعها قريباً.
        </div>
      )}

      <div className="space-y-3">
        {requiredDocs.map((row) => {
          const doc = findDocForRow(row);
          const isThisUploading = uploading === row.key;
          return (
            <div
              key={row.key}
              className={`bg-white rounded-2xl p-4 border-2 ${
                doc ? 'border-emerald-200' : 'border-slate-200'
              } transition-all`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                  <div className="text-3xl">{row.icon}</div>
                  <div>
                    <div className="text-sm font-black text-slate-800">{row.label}</div>
                    {row.hint && <div className="text-[11px] text-slate-500 font-bold mt-0.5">{row.hint}</div>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {doc && (
                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${
                      doc.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                       : doc.status === 'rejected' ? 'bg-rose-100 text-rose-700'
                       : 'bg-amber-100 text-amber-700'
                    }`}>
                      {doc.status === 'approved' ? '✅ معتمد'
                       : doc.status === 'rejected' ? '❌ مرفوض'
                       : '⏳ مرفوع — قيد المراجعة'}
                    </span>
                  )}

                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    ref={(el) => { fileInputsRef.current[row.key] = el; }}
                    onChange={(e) => handleFileChange(row, e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    disabled={isThisUploading || doc?.status === 'approved'}
                    onClick={() => fileInputsRef.current[row.key]?.click()}
                    className={`text-xs font-black px-4 py-2 rounded-xl transition-all ${
                      doc?.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed'
                        : doc
                          ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          : 'bg-orange-500 text-white hover:bg-orange-600 shadow-md shadow-orange-500/30'
                    } disabled:opacity-60`}
                  >
                    {isThisUploading ? '...جاري الرفع'
                     : doc?.status === 'approved' ? '✅ معتمد'
                     : doc ? '🔄 إعادة الرفع'
                     : '📤 رفع الوثيقة'}
                  </button>
                </div>
              </div>

              {doc?.status === 'rejected' && doc.reviewNote && (
                <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold p-3 rounded-xl">
                  ❌ سبب الرفض: {doc.reviewNote}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-100 rounded-2xl p-3 text-xs text-blue-800 font-bold flex items-start gap-2">
        🔒 <span>الوثائق آمنة ومحفوظة في خادمنا. لا يتم مشاركتها مع أيّ جهة خارجية، وتُستخدم فقط للتحقق من هويتك.</span>
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-2xl z-[10000]">
          {toast}
        </div>
      )}
    </div>
  );
}
