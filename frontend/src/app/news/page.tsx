'use client';

import { useEffect, useMemo, useState } from 'react';

/* ================= Types & simple client ================= */
type EnergyNewsItem = {
  title?: string;
  link?: string;
  pubDate?: string | null;
  source?: string | null;
  image?: string | null;
  description?: string | null;
  summary?: string | null;
};

type EnergyNewsResponse = {
  scope: string;
  country: string;
  when: string;
  count: number;
  items: EnergyNewsItem[];
};

async function fetchEnergyNews(params: {
  scope: 'id' | 'global' | 'both';
  limit: number;
  country: string;
  when: string;
  keywords?: string;
}): Promise<EnergyNewsResponse> {
  const q = new URLSearchParams();
  q.set('scope', params.scope);
  q.set('limit', String(params.limit));
  q.set('country', params.country);
  q.set('when', params.when);
  if (params.keywords?.trim()) q.set('keywords', params.keywords.trim());
  const r = await fetch(`/api/news/energy?${q.toString()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ================= Page ================= */
export default function NewsPage() {
  const [items, setItems] = useState<EnergyNewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [scope, setScope] = useState<'id' | 'global' | 'both'>('id');
  const [limit, setLimit] = useState(15);
  const [country, setCountry] = useState<string>('ID');
  const [when, setWhen] = useState<'7d' | '14d' | '30d' | '48h'>('14d');
  const [keywords, setKeywords] = useState('');
  const [quick, setQuick] = useState('');

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat('id-ID', { year: 'numeric', month: 'short', day: '2-digit' }),
    []
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEnergyNews({ scope, limit, country, when, keywords });
      setItems(data.items);
    } catch (e: any) {
      setError(e?.message ?? 'Gagal memuat berita.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const k = quick.trim().toLowerCase();
    if (!k) return items;
    return items.filter((it) =>
      (it.title ?? '').toLowerCase().includes(k) ||
      (it.source ?? '').toLowerCase().includes(k) ||
      (it.description ?? '').toLowerCase().includes(k) ||
      (it.summary ?? '').toLowerCase().includes(k)
    );
  }, [items, quick]);

  const getDomain = (url?: string) => {
    try {
      if (!url) return '';
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const summarize = (it: EnergyNewsItem) =>
    (it.summary || it.description || '').replace(/\s+/g, ' ').trim();

  const fmtDate = (s?: string | null) => {
    if (!s) return '';
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : dateFmt.format(d);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">Energy News (Oil &amp; Gas)</h1>

        {/* Controls */}
        <div className="mb-6 grid gap-3 rounded-lg bg-white p-4 shadow md:grid-cols-7 md:gap-4 md:p-6">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Scope</span>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-gray-800 focus:outline-none"
              value={scope}
              onChange={(e) => setScope(e.target.value as any)}
            >
              <option value="id">Indonesia</option>
              <option value="global">Global (Situs Intl)</option>
              <option value="both">Keduanya</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Negara</span>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-gray-800 focus:outline-none"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              title="Pilih ALL untuk lintas negara"
            >
              <option value="ALL">ALL (Global CEID)</option>
              <option value="ID">Indonesia (ID)</option>
              <option value="US">United States (US)</option>
              <option value="GB">United Kingdom (GB)</option>
              <option value="AE">United Arab Emirates (AE)</option>
              <option value="SG">Singapore (SG)</option>
              <option value="AU">Australia (AU)</option>
              <option value="CA">Canada (CA)</option>
              <option value="DE">Germany (DE)</option>
              <option value="FR">France (FR)</option>
              <option value="JP">Japan (JP)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Periode</span>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-gray-800 focus:outline-none"
              value={when}
              onChange={(e) => setWhen(e.target.value as any)}
            >
              <option value="7d">7 hari</option>
              <option value="14d">14 hari</option>
              <option value="30d">30 hari</option>
              <option value="48h">48 jam</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Limit</span>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-gray-800 focus:outline-none"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[10, 15, 20, 30, 50].map((n) => (
                <option key={n} value={n}>
                  {n} item
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Kata Kunci</span>
            <input
              placeholder="Opsional; contoh: refinery OR LNG"
              className="rounded-lg border px-3 py-2 text-sm focus:border-gray-800 focus:outline-none"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] opacity-0 select-none">Ambil</span>
            <button
              onClick={load}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Memuat…' : 'Ambil Berita'}
            </button>
          </div>

          <div className="md:col-span-3 flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Pencarian Cepat</span>
            <input
              placeholder="Cari cepat di hasil (judul/sumber)…"
              className="rounded-lg border px-3 py-2 text-sm focus:border-gray-800 focus:outline-none"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}

        {/* List */}
        <section className="rounded-xl bg-white shadow">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-gray-900" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M14 3v2h3.59L7 15.59 8.41 17 19 6.41V10h2V3zM5 5h6V3H3v8h2z" />
                <path d="M19 19H5V8H3v13h18V10h-2z" />
              </svg>
              <span className="font-semibold">Berita Terbaru</span>
            </div>
            {quick && (
              <button onClick={() => setQuick('')} className="text-sm text-gray-900 hover:underline">
                Hapus filter cepat
              </button>
            )}
          </div>

          {loading && (
            <div className="space-y-3 p-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse space-y-2 border-b pb-4 last:border-none">
                  <div className="h-4 w-2/3 rounded bg-gray-200" />
                  <div className="h-3 w-1/3 rounded bg-gray-200" />
                  <div className="h-3 w-full rounded bg-gray-100" />
                </div>
              ))}
            </div>
          )}

          {!loading &&
            filtered.map((it, i) => (
              <article
                key={`${it.link}-${i}`}
                className="border-b px-5 py-5 last:border-none md:px-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <a href={it.link} target="_blank" rel="noreferrer" className="hover:underline">
                    <h3 className="text-base font-semibold text-gray-900 md:text-lg">
                      {it.title}
                    </h3>
                  </a>
                  <span className="inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs text-gray-700">
                    {it.source || getDomain(it.link) || 'Sumber'}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                  {summarize(it) || '…'}
                </p>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <time className="text-gray-500">{fmtDate(it.pubDate || undefined)}</time>
                  <a
                    href={it.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-gray-900 hover:underline"
                  >
                    Buka Artikel
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z" />
                      <path d="M5 5h6V3H3v8h2z" />
                    </svg>
                  </a>
                </div>
              </article>
            ))}
        </section>

        {!loading && !error && filtered.length === 0 && (
          <p className="mt-10 text-center text-gray-500">Tidak ada berita yang cocok.</p>
        )}
      </div>
    </div>
  );
}
