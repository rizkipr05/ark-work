'use client';

import { useEffect, useMemo, useState } from 'react';

/* ================= Config ================= */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';
const MIDTRANS_CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? '';

/* ================= Types (UI) ================= */
export type PackageId = string;
export type Package = {
  id: PackageId;            // disarankan = slug plan
  title: string;            // nama paket di UI
  price: number;            // IDR
  features: string[];
  interval?: 'month' | 'year';
  planId?: string;          // opsional: id plan di DB/Midtrans
};

/* ================= Ekstra types (respon backend employer step3) ================= */
type Step3Resp =
  | { ok: true; mode: 'trial'; trialEndsAt: string }
  | { ok: true; mode: 'free_active'; premiumUntil: string }
  | { ok: true; mode: 'needs_payment' };

/* ================= Utils ================= */
function classNames(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(' ');
}
function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

/* ================= Komponen ================= */
export default function Step2Package({
  packages, selected, setSelected, onBack, onNext,
  userId,
  employerId,
  customerEmail,
  customerName,
}: {
  packages: Package[];
  selected: PackageId;
  setSelected: (v: PackageId) => void;
  onBack: () => void;
  onNext: () => void;
  userId?: string;
  employerId?: string;      // jika ada employer flow → bisa auto trial/gratis
  customerEmail?: string;
  customerName?: string;
}) {
  const current = packages.find((p) => p.id === selected)!;

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRedirectUrl, setLastRedirectUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null); // banner info (trial/gratis)

  /* Muat Midtrans Snap sekali */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).snap || !MIDTRANS_CLIENT_KEY) return;
    const s = document.createElement('script');
    s.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
    s.setAttribute('data-client-key', MIDTRANS_CLIENT_KEY);
    s.async = true;
    document.body.appendChild(s);
    return () => { document.body.removeChild(s); };
  }, []);

  /* Ambil planId dari server jika perlu (fallback) */
  async function resolvePlanId(): Promise<{ planId: string, interval?: string } | null> {
    const pkg = packages.find(p => p.id === selected);
    if (pkg?.planId) return { planId: pkg.planId, interval: pkg.interval };

    const res = await fetch(`${API_BASE}/api/payments/plans`, { credentials: 'include' });
    if (!res.ok) throw new Error('Gagal memuat daftar plan');
    const plans = await res.json() as Array<{ id: string; slug: string; interval?: string }>;
    const found = plans.find(p => p.slug === selected);
    return found ? { planId: found.id, interval: found.interval } : null;
  }

  /* Klik Bayar / Subscribe */
  async function handlePay() {
    try {
      setError(null);
      setInfo(null);
      setPaying(true);
      setLastRedirectUrl(null);

      if (!selected) throw new Error('Silakan pilih paket.');
      if (!userId) throw new Error('User belum terautentikasi (userId tidak tersedia).');

      /* === 1) Jika ini flow employer dan server izinkan trial/gratis, lewati pembayaran === */
      if (employerId) {
        const step3 = await fetch(`${API_BASE}/api/employers/step3`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ employerId, planSlug: selected }),
        });
        const result = (await step3.json()) as Step3Resp;
        if (!step3.ok || !result?.ok) {
          const msg = (result as any)?.error || (result as any)?.message || 'Gagal menetapkan paket.';
          throw new Error(msg);
        }

        if (result.mode === 'trial') {
          setInfo(`Akun mulai masa uji coba. Berakhir: ${new Date(result.trialEndsAt).toLocaleString('id-ID')}.`);
          onNext();
          return;
        }
        if (result.mode === 'free_active') {
          setInfo('Paket gratis telah diaktifkan. Tidak perlu pembayaran.');
          onNext();
          return;
        }
        // mode === 'needs_payment' → lanjut ke 2)
      }

      /* === 2) Perlu pembayaran → buat transaksi Snap/redirect === */
      const resolved = await resolvePlanId();
      if (!resolved?.planId) throw new Error('Plan tidak ditemukan. Pastikan id paket = slug plan di backend.');
      const planId = resolved.planId;

      const resp = await fetch(`${API_BASE}/api/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          planId,
          userId,
          employerId: employerId || undefined,
          customer: {
            email: customerEmail || undefined,
            first_name: customerName || undefined,
          },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || data?.message || 'Gagal memulai pembayaran');

      const { token, redirect_url } = data as { token: string; redirect_url: string };
      setLastRedirectUrl(redirect_url);

      if (typeof window !== 'undefined' && (window as any).snap?.pay) {
        await new Promise<void>((resolve, reject) => {
          (window as any).snap.pay(token, {
            onSuccess: () => resolve(),
            onPending: () => resolve(),
            onError: (e: any) => reject(new Error(e?.message || 'Pembayaran gagal')),
            onClose: () => reject(new Error('Jendela pembayaran ditutup sebelum selesai')),
          });
        });
      } else {
        window.open(redirect_url, '_blank', 'noopener,noreferrer');
      }

      onNext();
    } catch (e: any) {
      setError(e?.message || 'Gagal memproses pembayaran.');
    } finally {
      setPaying(false);
    }
  }

  const summary = useMemo(() => {
    if (!current) return null;
    return {
      title: current.title,
      priceText: formatIDR(current.price),
      interval: current.interval ?? 'month',
    };
  }, [current]);

  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <h2 className="text-2xl font-semibold text-slate-900">Pilih Paket</h2>
      <p className="mt-1 text-sm text-slate-600">Pilih paket sesuai kebutuhan. Bisa upgrade kapan saja.</p>

      {/* Info Box (trial/gratis) */}
      {info && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {info}
        </div>
      )}

      {/* Error Box */}
      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Grid packages */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => {
          const active = p.id === selected;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              className={classNames(
                'text-left rounded-2xl border p-5 transition focus:outline-none',
                active ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
              )}
            >
              <div className="flex items-baseline justify-between">
                <h3 className={classNames('text-lg font-semibold', active ? 'text-blue-700' : 'text-slate-900')}>
                  {p.title}
                </h3>
                <div className={classNames('text-sm', active ? 'text-blue-600' : 'text-slate-500')}>
                  {formatIDR(p.price)}
                </div>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-[2px] h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              {p.interval && <div className="mt-2 text-xs text-slate-500">/{p.interval}</div>}
            </button>
          );
        })}
      </div>

      {/* Ringkasan & Aksi */}
      <div className="mt-6 rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Paket dipilih</span>
          <span className="font-semibold text-slate-900">{summary?.title ?? '-'}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-slate-600">Subtotal</span>
          <span className="font-semibold text-slate-900">{summary ? summary.priceText : '-'}</span>
        </div>

        {!MIDTRANS_CLIENT_KEY && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
            <b>Catatan:</b> <code>NEXT_PUBLIC_MIDTRANS_CLIENT_KEY</code> belum diset.
            Popup Snap tidak bisa dibuka — sistem akan membuka <em>redirect_url</em> di tab baru.
          </p>
        )}

        {lastRedirectUrl && (
          <div className="mt-3 text-xs">
            Link pembayaran:{' '}
            <a href={lastRedirectUrl} target="_blank" rel="noreferrer noopener" className="text-blue-700 underline">
              Buka kembali
            </a>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <button
          onClick={onBack}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-slate-50"
        >
          Kembali
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePay}
            disabled={paying || !selected}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            title={!userId ? 'Butuh userId (login) agar bisa checkout' : 'Bayar sekarang'}
          >
            {paying ? 'Memproses…' : 'Bayar / Subscribe'}
          </button>
        </div>
      </div>
    </div>
  );
}
