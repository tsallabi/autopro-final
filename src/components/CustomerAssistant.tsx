/**
 * Customer AI assistant — a floating chat widget powered by Claude Opus 4.8.
 *
 * Public (no login needed). Answers buyer questions about deposits, bidding,
 * the daily 6 PM auction, KYC, and fees via POST /api/assistant/chat.
 *
 * Self-hides on dashboard/admin views and when the AI brain isn't configured
 * (GET /api/assistant/status → enabled:false), so it never shows a dead button.
 * Sits just above the support widget (which is bottom-right).
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

type Msg = { role: 'user' | 'assistant'; text: string };

export const CustomerAssistant = () => {
  const location = useLocation();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', text: 'مرحباً! أنا مساعد AutoPro الذكي 🤖 اسألني عن المزاد، العربون، المزايدة، أو أي شيء.' },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/assistant/status')
      .then((r) => r.json())
      .then((d) => setEnabled(!!d?.enabled))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Hide on dashboard/admin views — those have their own tools.
  const path = location.pathname;
  if (!enabled || path.startsWith('/dashboard') || path.startsWith('/admin')) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const history = messages.slice(-10);
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = res.ok
        ? (data.reply || 'عذراً، لم أفهم. تواصل مع الدعم عبر واتساب +1 312 910 5416.')
        : (data.error || 'تعذّر الرد حالياً.');
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: 'تعذّر الاتصال. حاول لاحقاً.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Toggle button — above the support widget */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="المساعد الذكي"
        aria-label="المساعد الذكي"
        style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
          right: 24,
          zIndex: 9990,
          background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          width: 60,
          height: 60,
          fontSize: 28,
          cursor: 'pointer',
          boxShadow: '0 8px 20px rgba(124,58,237,0.4)',
        }}
      >
        {open ? '×' : '🤖'}
      </button>

      {open && (
        <div
          dir="rtl"
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 168px)',
            right: 24,
            zIndex: 9991,
            width: 'min(360px, calc(100vw - 32px))',
            height: 'min(480px, calc(100vh - 220px))',
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid #ede9fe',
          }}
        >
          <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', padding: '14px 16px', fontWeight: 800 }}>
            🤖 المساعد الذكي — AutoPro
            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>إجابات فورية عن المزاد والعربون والمزايدة</div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, background: '#faf5ff', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end',
                  maxWidth: '85%',
                  background: m.role === 'user' ? '#7c3aed' : '#fff',
                  color: m.role === 'user' ? '#fff' : '#1e293b',
                  padding: '8px 12px',
                  borderRadius: 14,
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  border: m.role === 'user' ? 'none' : '1px solid #e9d5ff',
                }}
              >
                {m.text}
              </div>
            ))}
            {sending && (
              <div style={{ alignSelf: 'flex-end', color: '#7c3aed', fontSize: 12, fontWeight: 700 }}>...يكتب</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid #ede9fe', background: '#fff' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="اكتب سؤالك..."
              style={{ flex: 1, border: '1px solid #ddd', borderRadius: 12, padding: '10px 12px', fontSize: 13, outline: 'none' }}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 12, padding: '0 16px', fontWeight: 800, cursor: 'pointer', opacity: sending || !input.trim() ? 0.5 : 1 }}
            >
              إرسال
            </button>
          </div>
        </div>
      )}
    </>
  );
};
