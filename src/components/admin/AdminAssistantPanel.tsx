/**
 * AdminAssistantPanel — admin-only floating AI assistant (Claude Opus 4.8).
 *
 * Lets the admin run real platform tasks in plain Arabic via tool use:
 *   "أعطني نظرة عامة", "حرّر السيارات العالقة",
 *   "اعرض الإيداعات المعلقة", "راسل المستخدم X بأن..."
 *
 * Calls POST /api/admin/assistant. Shows the reply plus a log of the actual
 * actions the assistant executed. Self-hides if the AI brain isn't configured.
 */
import { useEffect, useRef, useState } from 'react';

async function authFetch(url: string, init?: RequestInit) {
  const token = localStorage.getItem('authToken') || '';
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}

type Msg = { role: 'user' | 'assistant'; text: string; actions?: any[] };

export default function AdminAssistantPanel() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', text: 'أنا مساعدك الإداري الذكي. جرّب: "أعطني نظرة عامة"، "حرّر السيارات العالقة"، أو "اعرض الإيداعات المعلقة".' },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    authFetch('/api/assistant/status').then((r) => r.json()).then((d) => setEnabled(!!d?.enabled)).catch(() => setEnabled(false));
  }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  if (!enabled) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const history = messages.filter((m) => m.text).slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      const res = await authFetch('/api/admin/assistant', {
        method: 'POST',
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessages((m) => [...m, { role: 'assistant', text: data.reply || '(تم)', actions: data.actions }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', text: '⚠️ ' + (data.error || 'فشل الطلب') }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: '⚠️ تعذّر الاتصال بالخادم.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="المساعد الإداري الذكي"
        aria-label="المساعد الإداري الذكي"
        style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
          left: 24,
          zIndex: 9990,
          background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          width: 58,
          height: 58,
          fontSize: 26,
          cursor: 'pointer',
          boxShadow: '0 8px 20px rgba(79,70,229,0.4)',
        }}
      >
        {open ? '×' : '🧠'}
      </button>

      {open && (
        <div
          dir="rtl"
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)',
            left: 24,
            zIndex: 9991,
            width: 'min(400px, calc(100vw - 32px))',
            height: 'min(540px, calc(100vh - 160px))',
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid #e0e7ff',
          }}
        >
          <div style={{ background: 'linear-gradient(135deg, #4f46e5, #4338ca)', color: '#fff', padding: '14px 16px', fontWeight: 800 }}>
            🧠 المساعد الإداري الذكي
            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>مدعوم بـ Claude Opus 4.8 — ينفّذ مهام حقيقية</div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end', maxWidth: '88%' }}>
                <div
                  style={{
                    background: m.role === 'user' ? '#4f46e5' : '#fff',
                    color: m.role === 'user' ? '#fff' : '#1e293b',
                    padding: '8px 12px',
                    borderRadius: 14,
                    fontSize: 13,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    border: m.role === 'user' ? 'none' : '1px solid #e2e8f0',
                  }}
                >
                  {m.text}
                </div>
                {Array.isArray(m.actions) && m.actions.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
                    {m.actions.map((a: any, j: number) => (
                      <div key={j} style={{ color: a.ok ? '#16a34a' : '#dc2626' }}>
                        {a.ok ? '✓' : '✗'} {a.tool}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sending && <div style={{ alignSelf: 'flex-end', color: '#4f46e5', fontSize: 12, fontWeight: 700 }}>...يعمل</div>}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid #e0e7ff', background: '#fff' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="اكتب أمرك..."
              style={{ flex: 1, border: '1px solid #ddd', borderRadius: 12, padding: '10px 12px', fontSize: 13, outline: 'none' }}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 12, padding: '0 16px', fontWeight: 800, cursor: 'pointer', opacity: sending || !input.trim() ? 0.5 : 1 }}
            >
              تنفيذ
            </button>
          </div>
        </div>
      )}
    </>
  );
}
