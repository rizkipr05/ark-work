'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ===================== Types ===================== */
type Msg = { id: string; role: 'user' | 'assistant'; text: string; ts: number };

/* ===================== Consts ===================== */
const STORAGE_KEY = 'ogm-chat-history-v1';
const DEFAULT_CHAT_API =
  (process.env.NEXT_PUBLIC_API_BASE
    ? `${process.env.NEXT_PUBLIC_API_BASE}/api/chat`
    : '/api/chat');

/* ===================== Utils ===================== */
function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
function rid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ==================================================
   Component
   ================================================== */
export default function ChatbotWidget({ chatApi = DEFAULT_CHAT_API }: { chatApi?: string }) {
  const pathname = usePathname();

  // --- HIDE ON /admin ---
  const hideOnThisPage = useMemo(() => {
    if (!pathname) return false;
    const segs = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean);
    return segs.includes('admin');
  }, [pathname]);
  if (hideOnThisPage) return null;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);

  // ===== Resize state =====
  const MIN_W = 320;
  const MIN_H = 360;
  const MAX_W_VW = 0.92;  // 92vw
  const MAX_H_VH = 0.8;   // 80vh
  const [size, setSize] = useState<{w: number; h: number}>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      w: Math.min(Math.max(380, MIN_W), Math.floor(vw * MAX_W_VW)),
      h: Math.min(Math.max(520, MIN_H), Math.floor(vh * MAX_H_VH)),
    };
  });
  const resizingRef = useRef<{
    startX: number; startY: number; startW: number; startH: number; active: boolean;
  } | null>(null);

  // compute max on window resize
  useEffect(() => {
    const onResize = () => {
      const maxW = Math.floor(window.innerWidth * MAX_W_VW);
      const maxH = Math.floor(window.innerHeight * MAX_H_VH);
      setSize(s => ({ w: Math.min(s.w, maxW), h: Math.min(s.h, maxH) }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function startResize(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    resizingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.w,
      startH: size.h,
      active: true,
    };
    window.addEventListener('mousemove', onResizing);
    window.addEventListener('mouseup', stopResize);
  }
  function onResizing(e: MouseEvent) {
    const r = resizingRef.current;
    if (!r?.active) return;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    const maxW = Math.floor(window.innerWidth * MAX_W_VW);
    const maxH = Math.floor(window.innerHeight * MAX_H_VH);
    setSize({
      w: Math.min(Math.max(r.startW + dx, MIN_W), maxW),
      h: Math.min(Math.max(r.startH + dy, MIN_H), maxH),
    });
  }
  function stopResize() {
    const r = resizingRef.current;
    if (r) r.active = false;
    window.removeEventListener('mousemove', onResizing);
    window.removeEventListener('mouseup', stopResize);
  }
  function toggleExpand() {
    const maxW = Math.floor(window.innerWidth * MAX_W_VW);
    const maxH = Math.floor(window.innerHeight * MAX_H_VH);
    const expanded = size.w < maxW * 0.9 || size.h < maxH * 0.9;
    setSize(expanded ? { w: maxW, h: maxH } : {
      w: Math.min(Math.max(420, MIN_W), maxW),
      h: Math.min(Math.max(560, MIN_H), maxH),
    });
  }

  const listRef = useRef<HTMLDivElement>(null);

  /* ---------- load/save history ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMsgs(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
    } catch {}
  }, [msgs]);

  /* ---------- auto scroll ---------- */
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, open, busy, size]);

  /* ---------- prompt suggestions ---------- */
  const suggestions = useMemo(
    () => [
      // News
      'Ringkas berita migas hari ini',
      'Berita LNG Indonesia terbaru',
      // Jobs (jobseeker)
      'Rekomendasikan role migas untuk operator kilang 2 tahun di Balikpapan',
      'Skill apa agar masuk tim HSE di LNG?',
      // Consult
      'Saya ingin pindah dari operator ke planner—langkahnya?',
      'Bikin roadmap 90 hari belajar analytics produksi',
      // Employer
      'Bikinkan JD Production Engineer (mid, Jakarta) + scorecard',
      'Susun alur rekrutmen 3 tahap + SLA & email template',
    ],
    []
  );

  /* ---------- ask API ---------- */
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    const u: Msg = { id: rid(), role: 'user', text: text.trim(), ts: Date.now() };
    setMsgs((m) => [...m, u]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch(chatApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Tanpa profile (sudah dihapus)
          messages: [
            ...msgs.map(({ role, text }) => ({ role, content: text })),
            { role: 'user', content: text.trim() },
          ],
        }),
      });

      let reply = '⚠️ Server tidak mengembalikan jawaban.';
      try {
        const data = await res.json();
        reply = (res.ok && (data.answer || data.message)) || reply;
      } catch {}

      const a: Msg = { id: rid(), role: 'assistant', text: reply, ts: Date.now() };
      setMsgs((m) => [...m, a]);
    } catch {
      const a: Msg = {
        id: rid(),
        role: 'assistant',
        text: '⚠️ Gagal terhubung ke ArkWork Agent.',
        ts: Date.now(),
      };
      setMsgs((m) => [...m, a]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(input);
  }

  function resetChat() {
    setMsgs([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  /* ===================== UI ===================== */
  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Buka ArkWork Agent"
        className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full border border-neutral-200 bg-black text-white shadow-lg transition hover:scale-105"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7">
          <path d="M12 2v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="4" y="6" width="16" height="12" rx="4" ry="4" stroke="currentColor" strokeWidth="2" fill="none" />
          <circle cx="9" cy="12" r="1.5" fill="currentColor" />
          <circle cx="15" cy="12" r="1.5" fill="currentColor" />
          <path d="M8 16h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed right-5 z-50 overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl"
          style={{
            bottom: 24,
            width: size.w,
            height: size.h,
            maxWidth: `min(${Math.floor(MAX_W_VW*100)}vw, 740px)`,
            maxHeight: `${Math.floor(MAX_H_VH*100)}vh`,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-black text-xs font-bold text-white">AW</div>
              <div className="font-semibold text-neutral-900">ArkWork Agent</div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={toggleExpand}
                className="rounded-lg border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-200"
                title="Expand/Restore"
              >
                ⤢
              </button>
              <button
                onClick={resetChat}
                className="rounded-lg border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-200"
              >
                Reset
              </button>
              <button
                className="rounded-lg p-2 hover:bg-neutral-200"
                onClick={() => setOpen(false)}
                aria-label="Tutup"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5">
                  <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages + Suggestions */}
          <div ref={listRef} className="h-[calc(100%-106px)] space-y-2 overflow-y-auto px-3 py-3">
            {msgs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
                Mulai percakapan. Contoh:
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              msgs.map((m) => (
                <div
                  key={m.id}
                  className={[
                    'flex items-end gap-2',
                    m.role === 'user' ? 'justify-end' : 'justify-start',
                  ].join(' ')}
                >
                  {m.role === 'assistant' && (
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black text-xs text-white">AW</div>
                  )}

                  <div
                    className={[
                      'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                      m.role === 'user'
                        ? 'bg-black text-white'
                        : 'bg-neutral-100 text-neutral-900',
                    ].join(' ')}
                  >
                    {m.role === 'assistant' ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: (p) => <h1 className="mb-1 text-base font-semibold" {...p} />,
                          h2: (p) => <h2 className="mb-1 mt-2 text-sm font-semibold" {...p} />,
                          h3: (p) => <h3 className="mb-1 mt-2 text-sm font-semibold" {...p} />,
                          ul: (p) => <ul className="my-1 list-disc space-y-1 pl-5" {...p} />,
                          ol: (p) => <ol className="my-1 list-decimal space-y-1 pl-5" {...p} />,
                          li: (p) => <li className="leading-5" {...p} />,
                          p:  (p) => <p className="my-1 leading-6" {...p} />,
                          code: (p) => <code className="rounded bg-neutral-200 px-1 py-[1px] text-[0.85em]" {...p} />,
                          pre: (p) => (
                            <pre className="my-2 max-w-full overflow-x-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100" {...p} />
                          ),
                          a: (p) => <a className="text-blue-600 underline" target="_blank" rel="noreferrer" {...p} />,
                        }}
                      >
                        {m.text}
                      </ReactMarkdown>
                    ) : (
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    )}

                    <div className="mt-1 text-right text-[10px] opacity-60">{formatTime(m.ts)}</div>
                  </div>
                </div>
              ))
            )}

            {busy && (
              <div className="flex items-end gap-2">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black text-xs text-white">AW</div>
                <div className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-900">
                  mengetik<span className="animate-pulse">…</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="border-t border-neutral-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tanya berita migas, minta JD, rekomendasi kerja, atau konsultasi…"
                className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              />
              <button
                disabled={!input.trim() || busy}
                className="rounded-xl bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Kirim
              </button>
            </div>
          </form>

          {/* Resize handle (pojok kanan bawah) */}
          <div
            onMouseDown={startResize}
            title="Geser untuk mengubah ukuran"
            className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-sm bg-neutral-200"
          />
        </div>
      )}
    </>
  );
}
