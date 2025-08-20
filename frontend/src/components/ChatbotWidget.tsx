'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/* ===================== Types ===================== */
type Msg = { id: string; role: 'user' | 'assistant'; text: string; ts: number };
type Profile = {
  name?: string;
  role?: string;
  skills?: string;
  location?: string;
  experienceYears?: number;
  interests?: string;
};

/* ===================== Consts ===================== */
const STORAGE_KEY = 'ogm-chat-history-v1';
const PROFILE_KEY = 'ogm-chat-profile-v1';

/**
 * By default we hit /api/chat (create it on your side).
 * You can override via prop <ChatbotWidget chatApi="/api/arkwork/agent" />
 */
const DEFAULT_CHAT_API = '/api/chat';

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
  const [intent, setIntent] = useState<'news' | 'jobs' | 'consult'>('news');
  const [profile, setProfile] = useState<Profile>({});
  const [showProfile, setShowProfile] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);

  /* ---------- load history & profile ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMsgs(JSON.parse(raw));
      const p = localStorage.getItem(PROFILE_KEY);
      if (p) setProfile(JSON.parse(p));
    } catch {
      // ignore
    }
  }, []);

  /* ---------- save history & profile ---------- */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
    } catch {}
  }, [msgs]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {}
  }, [profile]);

  /* ---------- auto scroll ---------- */
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, open, busy]);

  /* ---------- prompt suggestions ---------- */
  const suggestions = useMemo(() => {
    if (intent === 'jobs')
      return [
        'Rekomendasikan role migas untuk operator kilang 2 tahun di Balikpapan',
        'Skill apa agar masuk tim HSE di LNG?',
        'Sertifikasi wajib untuk field engineer?',
      ];
    if (intent === 'consult')
      return [
        'Saya ingin pindah dari operator ke planner—langkahnya?',
        'Bikin roadmap 90 hari belajar analytics produksi',
        'Bagaimana persiapan wawancara teknis kilang?',
      ];
    return ['Ringkas berita migas hari ini', 'Apa itu upstream & downstream?', 'Berita LNG Indonesia terbaru'];
  }, [intent]);

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
          intent,
          profile,
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
      } catch {
        // non-JSON response
      }

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

  /* ===================== UI ===================== */
  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Buka ArkWork Agent"
        className="fixed bottom-5 right-5 z-50 rounded-full h-14 w-14 shadow-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:scale-[1.03] transition grid place-items-center"
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
        <div className="fixed bottom-24 right-5 z-50 w-[min(92vw,380px)] rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 grid place-items-center">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-white">
                  <rect x="5" y="7" width="14" height="10" rx="3" fill="currentColor" />
                  <circle cx="10" cy="12" r="1" fill="#111" />
                  <circle cx="14" cy="12" r="1" fill="#111" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-neutral-900 dark:text-neutral-100">ArkWork Agent</div>
                <div className="text-xs text-neutral-500">Berita • Kerja • Konsultasi</div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowProfile(true)}
                className="px-2 py-1 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="Profil"
              >
                Profil
              </button>
              <button
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => setOpen(false)}
                aria-label="Tutup"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5">
                  <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Mode chips */}
          <div className="px-3 py-2 flex gap-2 border-b border-neutral-200 dark:border-neutral-800">
            {[
              { k: 'news', label: 'Berita' },
              { k: 'jobs', label: 'Kerja' },
              { k: 'consult', label: 'Konsultasi' },
            ].map((m) => {
              const active = intent === (m.k as any);
              return (
                <button
                  key={m.k}
                  onClick={() => setIntent(m.k as any)}
                  className={[
                    'px-3 py-1.5 rounded-full text-xs border transition',
                    active
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent'
                      : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                  ].join(' ')}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Messages */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto px-3 py-3 space-y-2">
            {msgs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-600 dark:text-neutral-400">
                Mulai percakapan. Contoh:
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-full border px-3 py-1 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800 border-neutral-300 dark:border-neutral-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              msgs.map((m) => (
                <div key={m.id} className={['flex items-end gap-2', m.role === 'user' ? 'justify-end' : 'justify-start'].join(' ')}>
                  {m.role === 'assistant' && (
                    <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500" />
                  )}
                  <div
                    className={[
                      'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                      m.role === 'user'
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100',
                    ].join(' ')}
                  >
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    <div className="mt-1 text-[10px] opacity-60 text-right">{formatTime(m.ts)}</div>
                  </div>
                </div>
              ))
            )}

            {busy && (
              <div className="flex items-end gap-2">
                <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500" />
                <div className="bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-2xl px-3 py-2 text-sm">
                  mengetik<span className="animate-pulse">…</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="border-t border-neutral-200 dark:border-neutral-800 p-3">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  intent === 'jobs'
                    ? 'Tanya role/skills/sertifikasi…'
                    : intent === 'consult'
                    ? 'Ceritakan situasi/tujuanmu…'
                    : 'Tanya berita/konteks migas…'
                }
                className="flex-1 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
              />
              <button
                disabled={!input.trim() || busy}
                className="rounded-xl px-3 py-2 text-sm font-medium bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-60"
              >
                Kirim
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profile Sheet */}
      {open && showProfile && (
        <ProfileSheet
          profile={profile}
          onClose={() => setShowProfile(false)}
          onSave={(p) => {
            setProfile(p);
            setShowProfile(false);
          }}
        />
      )}
    </>
  );
}

/* ===================== Profile Sheet ===================== */
function ProfileSheet({
  profile,
  onClose,
  onSave,
}: {
  profile: Profile;
  onClose: () => void;
  onSave: (p: Profile) => void;
}) {
  const [form, setForm] = useState<Profile>(profile || {});
  return (
    <div className="fixed inset-0 z-50 grid place-items-end pointer-events-none">
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={onClose} />
      <div className="relative m-4 w-[min(92vw,380px)] pointer-events-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Profil ArkWork</div>
          <button onClick={onClose} aria-label="Tutup" className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <svg viewBox="0 0 24 24" className="h-5 w-5">
              <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <Input label="Nama (opsional)" value={form.name || ''} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="Role saat ini" value={form.role || ''} onChange={(v) => setForm({ ...form, role: v })} />
          <Input label="Skills utama" value={form.skills || ''} onChange={(v) => setForm({ ...form, skills: v })} />
          <Input label="Lokasi" value={form.location || ''} onChange={(v) => setForm({ ...form, location: v })} />
          <Input
            label="Pengalaman (tahun)"
            value={String(form.experienceYears ?? '')}
            onChange={(v) => setForm({ ...form, experienceYears: v ? Number(v) : undefined })}
            type="number"
          />
          <Input label="Minat/target" value={form.interests || ''} onChange={(v) => setForm({ ...form, interests: v })} />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700">
            Batal
          </button>
          <button onClick={() => onSave(form)} className="px-3 py-2 text-sm rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== Small Input ===================== */
function Input({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
      />
    </label>
  );
}
