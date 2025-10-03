'use client';

import Nav from '@/components/nav';
import { useEffect, useMemo, useState } from 'react';

/* ------------------- Helpers ------------------- */
const API =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

function pickCompanyName(payload: any): string | null {
  // coba berbagai kemungkinan bentuk payload BE
  const e =
    payload?.employer ||
    payload?.data?.employer ||
    payload?.data ||
    payload ||
    null;

  const name =
    e?.displayName ??
    e?.display_name ??
    e?.company ??
    e?.legalName ??
    e?.legal_name ??
    null;

  return name ? String(name) : null;
}

/* ------- Mini Chart (SVG, tanpa lib) ------- */
function AreaChart({
  data,
  height = 140,
  strokeWidth = 2,
  color = '#2563eb', // blue-600
  fill = 'rgba(37, 99, 235, .12)',
  padding = 12,
}: {
  data: number[];
  height?: number;
  strokeWidth?: number;
  color?: string;
  fill?: string;
  padding?: number;
}) {
  const width = 520;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const h = height - padding * 2;
  const w = width - padding * 2;
  const step = w / Math.max(data.length - 1, 1);

  const points = data.map((v, i) => {
    const x = padding + i * step;
    const norm = (v - min) / (max - min || 1);
    const y = padding + (1 - norm) * h;
    return [x, y];
  });

  const path = points
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(' ');

  const area = `${path} L ${padding + (data.length - 1) * step} ${height - padding} L ${padding} ${
    height - padding
  } Z`;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        {/* grid halus */}
        <g opacity=".4">
          {[0, 1, 2, 3].map((i) => {
            const y = padding + (i / 3) * h;
            return (
              <line
                key={i}
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
            );
          })}
        </g>

        {/* area fill */}
        <path d={area} fill={fill} />

        {/* line */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* titik */}
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill={color} />
        ))}
      </svg>
    </div>
  );
}

export default function EmployerHome() {
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // fetch identitas employer (harus include cookie)
  useEffect(() => {
    (async () => {
      try {
        const base = API.replace(/\/+$/, '');
        const r = await fetch(`${base}/api/employers/auth/me`, {
          credentials: 'include',
        });
        const j = await r.json().catch(() => ({} as any));
        // console.log('[auth/me] =>', j);
        const name = pickCompanyName(j);
        if (name) setCompanyName(name);
      } catch (e) {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // headline stats (dummy)
  const stats = [
    { label: 'Active Jobs', value: 3 },
    { label: 'Total Applicants', value: 47 },
    { label: 'Interviews Scheduled', value: 6 },
  ];

  // time series dummy (7 titik = 7 hari/minggu)
  const series = useMemo(
    () => ({
      jobs: [1, 1, 2, 1, 1, 1, 1],
      apps: [12, 16, 18, 14, 19, 22, 23],
      views: [280, 320, 330, 310, 360, 390, 440],
    }),
    []
  );

  return (
    <>
      <Nav />
      <main className="min-h-[60vh] bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <header className="mb-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Employer Overview</h1>
                <p className="text-sm text-slate-600">
                  Ringkasan akun perusahaan dan performa lowongan.
                </p>
              </div>

              {/* Badge nama perusahaan */}
              <div className="inline-flex max-w-xs items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="text-xs text-slate-500">Company</span>
                <span className="truncate text-sm font-medium text-slate-900">
                  {loading ? '...' : companyName || '—'}
                </span>
              </div>
            </div>

            {!companyName && !loading && (
              <p className="mt-2 text-xs text-amber-600">
                Nama perusahaan belum terbaca—pastikan sudah login sebagai employer.
              </p>
            )}
          </header>

          {/* Stats ringkas */}
          <section className="grid gap-4 sm:grid-cols-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{s.value}</p>
              </div>
            ))}
          </section>

          {/* Performance Chart */}
          <section className="mt-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Performance (Last 7)</h3>
                <span className="text-xs text-slate-500">Auto-updated</span>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-3">
                  <AreaChart data={series.apps} />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Applications</p>
                  <p className="mt-1 text-xl font-semibold text-blue-600">
                    {series.apps.reduce((a, b) => a + b, 0).toLocaleString('id-ID')}
                  </p>
                  <div className="mt-2">
                    <AreaChart data={series.apps} height={90} />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Job Views</p>
                  <p className="mt-1 text-xl font-semibold text-amber-600">
                    {series.views.reduce((a, b) => a + b, 0).toLocaleString('id-ID')}
                  </p>
                  <div className="mt-2">
                    <AreaChart data={series.views} height={90} color="#d97706" fill="rgba(217,119,6,.12)" />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Jobs Posted</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-600">
                    {series.jobs.reduce((a, b) => a + b, 0).toLocaleString('id-ID')}
                  </p>
                  <div className="mt-2">
                    <AreaChart data={series.jobs} height={90} color="#059669" fill="rgba(5,150,105,.12)" />
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-slate-500">
                *Angka di atas contoh. Hubungkan ke endpoint metrik Anda untuk data real-time.
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
