/**
 * IntegrationsPanel — read-only status + test-ping for env-based integrations
 * (MyPay payment gateway and AgentCollab events pipeline).
 *
 * Both integrations read credentials from process.env at runtime, so they
 * cannot be configured from the UI — only from Render's environment
 * variables. This panel surfaces:
 *   - which env vars are set (without leaking secrets)
 *   - the configured webhook host
 *   - a "test connectivity" button that fires a real ping
 *
 * Mounted inline inside the payment_gateways view in AdminDashboard.tsx.
 */
import React, { useEffect, useState } from 'react';
import { authFetch } from '../../context/StoreContext';

interface MyPayStatus {
  configured: boolean;
  hasWebhookSecret: boolean;
}
interface AgentCollabStatus {
  enabled: boolean;
  hasWebhookUrl: boolean;
  hasApiKey: boolean;
  hasHmacSecret: boolean;
  hasOutboundToken?: boolean;
  slug?: string;
  webhookHost: string | null;
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-400'}`}
        style={{ boxShadow: ok ? '0 0 8px rgba(16,185,129,0.5)' : 'none' }}
      />
      <span className={`text-xs font-bold ${ok ? 'text-emerald-700' : 'text-rose-600'}`}>{label}</span>
    </div>
  );
}

export default function IntegrationsPanel() {
  const [mypay, setMypay] = useState<MyPayStatus | null>(null);
  const [agentcollab, setAgentcollab] = useState<AgentCollabStatus | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function load() {
    try {
      const [mRes, aRes] = await Promise.all([
        authFetch('/api/payments/mypay/status'),
        authFetch('/api/admin/agentcollab/status'),
      ]);
      if (mRes.ok) setMypay(await mRes.json());
      if (aRes.ok) setAgentcollab(await aRes.json());
    } catch (e) {
      console.error('[IntegrationsPanel] load failed', e);
    }
  }
  useEffect(() => { load(); }, []);

  async function pingAgentCollab() {
    setPinging(true);
    setPingResult(null);
    try {
      const res = await authFetch('/api/admin/agentcollab/ping', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPingResult('✅ ' + (data.sent || 'تم إرسال حدث تجريبي'));
      else setPingResult('❌ ' + (data.error || 'فشل الإرسال'));
    } catch (e: any) {
      setPingResult('❌ ' + (e?.message || 'خطأ في الاتصال'));
    } finally {
      setPinging(false);
      setTimeout(() => setPingResult(null), 6000);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await authFetch('/api/admin/agentcollab/sync-now', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const c = data.counts || {};
        setSyncResult(`✅ تمت المزامنة — عملاء: ${c.customers ?? 0} · موظفون: ${c.employees ?? 0} · منتجات: ${c.products ?? 0} · طلبات: ${c.orders ?? 0}`);
      } else {
        setSyncResult('❌ ' + (data.error || 'فشلت المزامنة'));
      }
    } catch (e: any) {
      setSyncResult('❌ ' + (e?.message || 'خطأ في الاتصال'));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 12000);
    }
  }

  const allMypayOk = !!mypay?.configured && !!mypay?.hasWebhookSecret;
  const allAcOk = !!agentcollab?.enabled
    && !!agentcollab?.hasWebhookUrl
    && !!agentcollab?.hasApiKey
    && !!agentcollab?.hasHmacSecret;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10" dir="rtl">
      {/* ── MyPay ── */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center text-white font-black text-lg">
              ل.د
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-800">بوابة الدفع MyPay (mypay.ly)</h3>
              <p className="text-[11px] text-slate-500 font-bold mt-0.5">دفع بالدينار الليبي عبر البنوك الليبية</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${allMypayOk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {allMypayOk ? '● مُفعّل' : '○ غير مُفعّل'}
          </span>
        </div>

        <div className="space-y-3 bg-slate-50 rounded-2xl p-4 mb-4">
          <StatusDot ok={!!mypay?.configured} label={mypay?.configured ? 'CLIENT_ID + CLIENT_SECRET مُعيَّنان' : 'CLIENT_ID أو CLIENT_SECRET مفقودان'} />
          <StatusDot ok={!!mypay?.hasWebhookSecret} label={mypay?.hasWebhookSecret ? 'WEBHOOK_SECRET مُعيَّن' : 'WEBHOOK_SECRET مفقود'} />
        </div>

        <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4">
          <p className="text-[11px] text-slate-600 font-bold leading-relaxed mb-3">
            🔧 لتفعيل البوابة، أضف على Render → Environment:
          </p>
          <ul className="text-[11px] text-slate-700 font-mono space-y-1 mb-3">
            <li>• <span className="font-bold">MYPAY_CLIENT_ID</span> = ...</li>
            <li>• <span className="font-bold">MYPAY_CLIENT_SECRET</span> = ...</li>
            <li>• <span className="font-bold">MYPAY_WEBHOOK_SECRET</span> = ...</li>
            <li className="text-slate-500">• <span className="font-bold">MYPAY_API_BASE</span> (اختياري — افتراضي https://mypay.ly/...)</li>
            <li className="text-slate-500">• <span className="font-bold">MYPAY_REDIRECT_URL</span> (اختياري — افتراضي autopro.ac/wallet?paid=1)</li>
          </ul>
          <p className="text-[10px] text-blue-700 font-bold">
            بعد إضافة المتغيرات، Render سيُعيد التشغيل تلقائياً وستتفعّل بوابة الدفع.
          </p>
        </div>
      </div>

      {/* ── AgentCollab ── */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-700 rounded-xl flex items-center justify-center text-white font-black text-2xl">
              🤝
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-800">تكامل AgentCollab</h3>
              <p className="text-[11px] text-slate-500 font-bold mt-0.5">إرسال أحداث المنصة (signup / login / payment) عبر webhook موقّع HMAC</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${allAcOk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {allAcOk ? '● مُفعّل' : '○ غير مُفعّل'}
          </span>
        </div>

        <div className="space-y-3 bg-slate-50 rounded-2xl p-4 mb-4">
          <StatusDot ok={!!agentcollab?.enabled} label={agentcollab?.enabled ? 'ENABLED=true' : 'ENABLED ≠ true'} />
          <StatusDot ok={!!agentcollab?.hasWebhookUrl} label={agentcollab?.hasWebhookUrl ? 'WEBHOOK_URL مُعيَّن' : 'WEBHOOK_URL مفقود'} />
          <StatusDot ok={!!agentcollab?.hasApiKey} label={agentcollab?.hasApiKey ? 'API_KEY مُعيَّن' : 'API_KEY مفقود'} />
          <StatusDot ok={!!agentcollab?.hasHmacSecret} label={agentcollab?.hasHmacSecret ? 'HMAC_SECRET مُعيَّن' : 'HMAC_SECRET مفقود'} />
          {agentcollab?.hasOutboundToken !== undefined && (
            <StatusDot ok={!!agentcollab?.hasOutboundToken} label={agentcollab?.hasOutboundToken ? 'OUTBOUND_TOKEN مُعيَّن (تحكم ثنائي)' : 'OUTBOUND_TOKEN مفقود'} />
          )}
          <div className="text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-200 space-y-1">
            {agentcollab?.slug && (
              <div>الموقع (slug): <span className="text-slate-700 font-bold">{agentcollab.slug}</span></div>
            )}
            {agentcollab?.webhookHost && (
              <div>host: <span className="text-slate-700 font-bold">{agentcollab.webhookHost}</span></div>
            )}
          </div>
        </div>

        {/* [sync-now] Force-push everything to AgentCollab on demand */}
        <button
          onClick={syncNow}
          disabled={syncing || !allAcOk}
          className={`w-full font-black py-3 rounded-2xl transition-all mb-3 ${
            allAcOk
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          } disabled:opacity-50`}
        >
          {syncing ? '...جاري مزامنة كل البيانات' : '🔄 مزامنة كل البيانات الآن (عملاء + منتجات + طلبات + موظفون)'}
        </button>
        {syncResult && (
          <p className={`text-xs font-bold mb-3 text-center ${syncResult.startsWith('✅') ? 'text-emerald-600' : 'text-rose-600'}`}>
            {syncResult}
          </p>
        )}

        <button
          onClick={pingAgentCollab}
          disabled={pinging || !allAcOk}
          className={`w-full font-black py-3 rounded-2xl transition-all ${
            allAcOk
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          } disabled:opacity-50`}
        >
          {pinging ? '...جاري الإرسال' : '🚀 اختبار الاتصال — إرسال حدث تجريبي'}
        </button>
        {pingResult && (
          <p className={`text-xs font-bold mt-3 text-center ${pingResult.startsWith('✅') ? 'text-emerald-600' : 'text-rose-600'}`}>
            {pingResult}
          </p>
        )}

        <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-4 mt-4">
          <p className="text-[11px] text-slate-600 font-bold leading-relaxed mb-2">
            🔧 المتغيرات المطلوبة على Render → Environment:
          </p>
          <ul className="text-[11px] text-slate-700 font-mono space-y-0.5 mb-2">
            <li>• AGENTCOLLAB_ENABLED = true</li>
            <li>• AGENTCOLLAB_WEBHOOK_URL = https://...</li>
            <li>• AGENTCOLLAB_API_KEY = ...</li>
            <li>• AGENTCOLLAB_HMAC_SECRET = ...</li>
          </ul>
          <p className="text-[10px] text-purple-700 font-bold leading-relaxed">
            الأحداث المُسجَّلة تلقائياً: user.signup · user.login · payment.received
          </p>
        </div>
      </div>
    </div>
  );
}
