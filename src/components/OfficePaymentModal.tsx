/**
 * OfficePaymentModal — shown to users who pick "تحويل بنكي" or "نقداً
 * في المكتب" on the wallet-topup page. Reads /api/office-info (public)
 * and renders the bank accounts, branches, and contact info so the
 * user knows exactly HOW to pay offline.
 *
 * The user submits the topup request as before — but now they have all
 * the info needed to actually complete the transfer.
 *
 * Pure CSS-in-JS so it works regardless of host page styles.
 */
import { useEffect, useState } from 'react';

interface BankAccount {
  id: string;
  bankName: string;
  accountName?: string;
  accountNumber: string;
  iban?: string;
  currency?: string;
  qrCodeUrl?: string;
  notes?: string;
}

interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  hours?: string;
  city?: string;
  mapUrl?: string;
}

interface OfficeInfo {
  branches: Branch[];
  bankAccounts: BankAccount[];
  contact: {
    generalEmail?: string;
    generalPhone?: string;
    generalWhatsapp?: string;
    paymentInstructions?: string;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  method: 'bank_transfer' | 'cash' | string;
  amount?: number;
  referenceNo?: string;
}

export default function OfficePaymentModal({ open, onClose, method, amount, referenceNo }: Props) {
  const [data, setData] = useState<OfficeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    setError(null);
    fetch('/api/office-info')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => setError(e?.message || 'فشل تحميل بيانات المكتب'))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('✓ تم النسخ');
    } catch {
      showToast('فشل النسخ');
    }
  }

  if (!open) return null;

  const isBankTransfer = method === 'bank_transfer' || method === 'bank';
  const isCash = method === 'cash';

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflow: 'auto',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", "Cairo", sans-serif',
        }}
      >
        {/* Header */}
        <div style={{
          padding: 20,
          borderBottom: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: '#fff',
          zIndex: 1,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {isCash ? '🏢 الدفع نقداً في المكتب' : '🏦 الدفع عبر التحويل البنكي'}
            </h2>
            {amount ? (
              <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
                المبلغ المطلوب: <strong>{Number(amount).toLocaleString('en-US')}</strong>
              </div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="إغلاق"
            style={{
              background: 'transparent', border: 'none',
              fontSize: 28, cursor: 'pointer', lineHeight: 1, color: '#666',
            }}
          >×</button>
        </div>

        {/* Reference badge */}
        {referenceNo && (
          <div style={{ padding: '12px 20px', background: '#fff8e1', borderBottom: '1px solid #ffe082' }}>
            <div style={{ fontSize: 12, color: '#856404', fontWeight: 700 }}>📎 رقم الطلب المرجعي (اذكره عند التحويل):</div>
            <div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 800, color: '#000' }}>{referenceNo}</div>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: 20 }}>
          {loading && <div style={{ textAlign: 'center', padding: 30, color: '#666' }}>...جاري التحميل</div>}
          {error && (
            <div style={{ background: '#fee', color: '#900', padding: 12, borderRadius: 8 }}>{error}</div>
          )}

          {data && (
            <>
              {/* Payment instructions banner */}
              {data.contact?.paymentInstructions && (
                <div style={{
                  background: '#e8f4fd',
                  border: '1px solid #90caf9',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 20,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: '#0d47a1',
                }}>
                  ℹ️ {data.contact.paymentInstructions}
                </div>
              )}

              {/* Bank accounts (only for bank_transfer) */}
              {isBankTransfer && data.bankAccounts && data.bankAccounts.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>💳 الحسابات البنكية</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {data.bankAccounts.map((b) => (
                      <div key={b.id} style={{
                        border: '1px solid #ddd',
                        borderRadius: 12,
                        padding: 14,
                        background: '#fafafa',
                      }}>
                        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{b.bankName}</div>
                        {b.accountName && (
                          <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700 }}>اسم الحساب:</span> {b.accountName}
                          </div>
                        )}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 4,
                          flexWrap: 'wrap',
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>رقم الحساب:</span>
                          <code style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace' }}>{b.accountNumber}</code>
                          <button
                            onClick={() => copy(b.accountNumber)}
                            type="button"
                            style={{
                              padding: '4px 10px', fontSize: 12,
                              background: '#fff', border: '1px solid #999',
                              borderRadius: 6, cursor: 'pointer',
                            }}
                          >📋 نسخ</button>
                        </div>
                        {b.iban && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 4,
                            flexWrap: 'wrap',
                          }}>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>IBAN:</span>
                            <code style={{ fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all' }}>{b.iban}</code>
                            <button
                              onClick={() => copy(b.iban!)}
                              type="button"
                              style={{
                                padding: '4px 10px', fontSize: 12,
                                background: '#fff', border: '1px solid #999',
                                borderRadius: 6, cursor: 'pointer',
                              }}
                            >📋 نسخ</button>
                          </div>
                        )}
                        {b.currency && (
                          <div style={{ fontSize: 12, color: '#888' }}>العملة: {b.currency}</div>
                        )}
                        {b.notes && (
                          <div style={{ fontSize: 12, color: '#555', marginTop: 6, fontStyle: 'italic' }}>{b.notes}</div>
                        )}
                        {b.qrCodeUrl && (
                          <div style={{ marginTop: 10, textAlign: 'center' }}>
                            <img src={b.qrCodeUrl} alt="QR" style={{ maxWidth: 180, height: 'auto' }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Branches */}
              {data.branches && data.branches.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
                    📍 {isCash ? 'فروعنا (للدفع نقداً)' : 'فروعنا'}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.branches.map((br) => (
                      <div key={br.id} style={{
                        border: '1px solid #ddd',
                        borderRadius: 12,
                        padding: 12,
                      }}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>
                          {br.name}{br.city ? ` — ${br.city}` : ''}
                        </div>
                        {br.address && (
                          <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>📍 {br.address}</div>
                        )}
                        {br.hours && (
                          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>🕐 {br.hours}</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                          {br.phone && (
                            <a href={`tel:${br.phone}`} style={btnSm('#1976d2')}>📞 {br.phone}</a>
                          )}
                          {br.whatsapp && (
                            <a
                              href={`https://wa.me/${br.whatsapp.replace(/[^0-9]/g, '')}`}
                              target="_blank" rel="noopener noreferrer"
                              style={btnSm('#25D366')}
                            >💬 واتساب</a>
                          )}
                          {br.email && (
                            <a href={`mailto:${br.email}`} style={btnSm('#666')}>✉️ إيميل</a>
                          )}
                          {br.mapUrl && (
                            <a
                              href={br.mapUrl}
                              target="_blank" rel="noopener noreferrer"
                              style={btnSm('#ef6c00')}
                            >🗺️ خريطة</a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* General contact */}
              {(data.contact?.generalPhone || data.contact?.generalWhatsapp || data.contact?.generalEmail) && (
                <section style={{ marginBottom: 14 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>📞 للاستفسار</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {data.contact.generalPhone && (
                      <a href={`tel:${data.contact.generalPhone}`} style={btnLg('#1976d2')}>
                        📞 {data.contact.generalPhone}
                      </a>
                    )}
                    {data.contact.generalWhatsapp && (
                      <a
                        href={`https://wa.me/${data.contact.generalWhatsapp.replace(/[^0-9]/g, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        style={btnLg('#25D366')}
                      >💬 واتساب</a>
                    )}
                    {data.contact.generalEmail && (
                      <a href={`mailto:${data.contact.generalEmail}`} style={btnLg('#666')}>
                        ✉️ {data.contact.generalEmail}
                      </a>
                    )}
                  </div>
                </section>
              )}

              {/* Important notice */}
              <div style={{
                marginTop: 20,
                padding: 14,
                background: '#fff8e1',
                border: '1px solid #ffe082',
                borderRadius: 10,
                fontSize: 13,
                color: '#5d4037',
                lineHeight: 1.6,
              }}>
                ⚠️ <strong>تنبيه:</strong> سيُفعَّل العربون فقط بعد تحقق الإدارة من استلام المبلغ.
                يرجى مراسلتنا فور إتمام التحويل أو الدفع لتأكيد العملية.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: 16,
          borderTop: '1px solid #eee',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          background: '#fafafa',
        }}>
          <button
            onClick={onClose}
            type="button"
            style={{
              padding: '10px 20px',
              background: '#222',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >فهمت — إغلاق</button>
        </div>

        {toast && (
          <div style={{
            position: 'fixed', bottom: 32, left: '50%',
            transform: 'translateX(-50%)',
            background: '#222', color: '#fff',
            padding: '8px 16px', borderRadius: 999,
            fontWeight: 700, zIndex: 10000,
          }}>{toast}</div>
        )}
      </div>
    </div>
  );
}

const btnSm = (bg: string): React.CSSProperties => ({
  padding: '5px 10px',
  fontSize: 12,
  background: bg,
  color: '#fff',
  textDecoration: 'none',
  borderRadius: 6,
  fontWeight: 700,
});

const btnLg = (bg: string): React.CSSProperties => ({
  padding: '8px 14px',
  fontSize: 14,
  background: bg,
  color: '#fff',
  textDecoration: 'none',
  borderRadius: 8,
  fontWeight: 700,
});
