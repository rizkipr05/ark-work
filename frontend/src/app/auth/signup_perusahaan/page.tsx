'use client';

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  useEffect,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Logo from '@/app/Images/Ungu__1_-removebg-preview.png';
import { useAuth } from '@/hooks/useAuth';

/* --------------------------------- Config --------------------------------- */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';
const MIDTRANS_CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? '';
const MIDTRANS_PAYMENT_LINK_BASE =
  process.env.NEXT_PUBLIC_MIDTRANS_PAYMENT_LINK_BASE ?? '';
const FORCE_SNAP = (process.env.NEXT_PUBLIC_FORCE_SNAP ?? 'true') === 'true';
const MIDTRANS_PRODUCTION =
  (process.env.NEXT_PUBLIC_MIDTRANS_PRODUCTION ?? 'false') === 'true';

/* --------------------------------- Types --------------------------------- */
type Mode = 'signin' | 'signup';
type Step = 1 | 2 | 3 | 4;

type Plan = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  amount: number;
  currency: string;
  interval: string;
  active: boolean;
  paymentLinkUrl?: string | null;
  priceId?: string | null;
};

type CompanyProfile = {
  logo?: string;
  name: string;
  email: string;
  website?: string;
  industry?: string;
  size?: string;
  about?: string;
  address?: string;
  city?: string;
  socials: Partial<
    Record<'website' | 'linkedin' | 'instagram' | 'facebook' | 'tiktok' | 'youtube', string>
  >;
};

type SignupCompanyPayload = {
  companyName: string;
  email: string;
  password: string;
  website?: string;
};

/* ---------- Admin Payments (local) ---------- */
type PaymentRecord = {
  id: string;
  createdAt: string;
  employerId: string;
  company: string;
  email: string;
  planId: string;
  planSlug: string;
  planName: string;
  amount: number;
  currency: string;
  interval: string;
  status: 'success' | 'pending' | 'error' | 'initiated';
  channel?: string;
  raw?: any;
};

/* ------------------------------- Globals -------------------------------- */
declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        callbacks?: {
          onSuccess?: (result?: any) => void;
          onPending?: (result?: any) => void;
          onError?: (result?: any) => void;
          onClose?: () => void;
        }
      ) => void;
    };
  }
}

/* ------------------------------- Utilities -------------------------------- */
function cx(...s: (string | false | null | undefined)[]) {
  return s.filter(Boolean).join(' ');
}
function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}
function normalizeUrl(u?: string) {
  const v = (u ?? '').trim();
  if (!v) return undefined;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Mapper untuk UI -> enum Prisma CompanySize */
function mapSizeToEnum(ui?: string): string | undefined {
  switch ((ui ?? '').trim()) {
    case '1-10':
      return 'S1_10';
    case '11-50':
      return 'S11_50';
    case '51-200':
      return 'S51_200';
    case '201-500':
      return 'S201_500';
    case '501-1000':
      return 'S501_1000';
    case '1001-5000':
      return 'S1001_5000';
    case '5001-10000':
      return 'S5001_10000';
    case '10000+':
      return 'S10000_PLUS';
    default:
      return undefined;
  }
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = 'Request failed';
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}
function getPaymentLink(plan?: Plan | null): string | null {
  if (!plan) return null;
  if (plan.paymentLinkUrl && /^https?:\/\//i.test(plan.paymentLinkUrl)) return plan.paymentLinkUrl;
  if (plan.priceId && /^https?:\/\//i.test(plan.priceId)) return plan.priceId;
  if (plan.priceId && MIDTRANS_PAYMENT_LINK_BASE)
    return MIDTRANS_PAYMENT_LINK_BASE.replace(/\/+$/, '') + '/' + plan.priceId.replace(/^\/+/, '');
  return null;
}
function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ------ Simpan Pembayaran ke localStorage + broadcast agar dibaca Admin ------ */
const LS_PAYMENTS_KEY = 'ark_admin_payments';

function readPayments(): PaymentRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LS_PAYMENTS_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function writePayments(arr: PaymentRecord[]) {
  localStorage.setItem(LS_PAYMENTS_KEY, JSON.stringify(arr));
  try {
    new BroadcastChannel('ark_payments').postMessage({ type: 'payment:new' });
  } catch {}
  localStorage.setItem('ark:payment:ping', JSON.stringify({ ts: Date.now() }));
  window.dispatchEvent(new CustomEvent('ark:payment'));
}
function savePaymentRecord(rec: PaymentRecord) {
  const arr = readPayments();
  arr.unshift(rec);
  writePayments(arr);
}

/* --------------------------------- Page ---------------------------------- */
export default function Page() {
  const t = useTranslations('companySignup');
  const router = useRouter();
  const { signinEmployer } = useAuth(); // dipakai untuk auto-login Step akhir

  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState<string | null>(null);

  /* ------------- SIGNIN (perusahaan) ------------- */
  const [siEmail, setSiEmail] = useState('');
  const [siPw, setSiPw] = useState('');
  const [siShowPw, setSiShowPw] = useState(false);
  const [siBusy, setSiBusy] = useState(false);

  async function onSignin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (siBusy) return;
    try {
      setSiBusy(true);
      setError(null);
      await signinEmployer(siEmail.trim(), siPw);
      router.replace('/employer');
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Email atau password salah');
    } finally {
      setSiBusy(false);
    }
  }

  /* ------------- SIGNUP (wizard) ------------- */
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [employerId, setEmployerId] = useState<string | null>(null);

  useEffect(() => {
    if (employerId) {
      localStorage.setItem('ark_employer_id', employerId);
    }
  }, [employerId]);

  const [paid, setPaid] = useState(false);

  /* ------------------------------ Step 1 form ----------------------------- */
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [website, setWebsite] = useState('');

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agree, setAgree] = useState(true);

  const strong = pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);

  async function onCreateCompany(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    if (!agree) return setError(t('error.agree'));
    if (pw !== confirm) return setError(t('error.mismatch'));
    if (company.trim().length < 2) return setError(t('error.company'));

    try {
      setBusy(true);
      setError(null);

      const payload: SignupCompanyPayload = {
        companyName: company.trim(),
        email: email.trim(),
        password: pw,
        website: normalizeUrl(website),
      };

      const resp = await apiPost<{ ok: true; employerId: string; slug: string }>(
        '/api/employers/step1',
        {
          companyName: payload.companyName,
          displayName: payload.companyName,
          email: payload.email,
          website: payload.website,
          password: payload.password,
          confirmPassword: confirm,
          agree: true,
        }
      );

      setEmployerId(resp.employerId);
      localStorage.setItem('ark_employer_id', resp.employerId);

      setStep(2);
      setMode('signup');
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? t('error.default'));
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------ Step 2: Profil ------------------------------ */
  const [profile, setProfile] = useState<CompanyProfile>({
    name: '',
    email: '',
    website: '',
    industry: '',
    size: '',
    about: '',
    address: '',
    city: '',
    socials: {},
  });

  const fileRef = useRef<HTMLInputElement | null>(null);

  function validateStep2() {
    if (profile.name.trim().length < 2) return 'Nama perusahaan wajib diisi.';
    if (!/^\S+@\S+\.\S+$/.test(profile.email)) return 'Email perusahaan tidak valid.';
    return null;
  }

  async function submitStep2() {
    const emsg = validateStep2();
    if (emsg) throw new Error(emsg);
    if (!employerId) throw new Error('EmployerId belum tersedia.');

    await apiPost('/api/employers/step2', {
      employerId,
      industry: profile.industry || undefined,
      size: mapSizeToEnum(profile.size),
      foundedYear: undefined,
      about: profile.about || undefined,
      hqCity: profile.city || undefined,
      hqCountry: undefined,
      logoUrl: undefined,
      bannerUrl: undefined,
    });
  }

  /* ------------------------------ Step 3: Paket ------------------------------ */
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string>('');

  useEffect(() => {
    if (mode !== 'signup' || step !== 3) return;
    (async () => {
      try {
        setPlansLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/api/payments/plans`, { credentials: 'include' });
        if (!res.ok) throw new Error('Gagal memuat paket');
        const data = (await res.json()) as Plan[];
        const active = (data || []).filter((p) => p.active);
        setPlans(active);
        if (!selectedSlug && active.length > 0) setSelectedSlug(active[0].slug);
      } catch (e: any) {
        setError(e?.message || 'Gagal memuat paket');
      } finally {
        setPlansLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step]);

  useEffect(() => {
    if (mode !== 'signup' || step !== 3) return;
    if (typeof window === 'undefined') return;
    if (window.snap || !MIDTRANS_CLIENT_KEY) return;
    const s = document.createElement('script');
    s.src = MIDTRANS_PRODUCTION
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js';
    s.setAttribute('data-client-key', MIDTRANS_CLIENT_KEY);
    s.async = true;
    document.body.appendChild(s);
    return () => {
      document.body.removeChild(s);
    };
  }, [mode, step]);

  const currentPlan = useMemo(() => plans.find((p) => p.slug === selectedSlug), [plans, selectedSlug]);

  // ⬇️ REPLACE seluruh fungsi ini
async function submitStep3() {
  if (!employerId) throw new Error('EmployerId belum tersedia.');
  if (!selectedSlug) throw new Error('Silakan pilih paket.');

  // simpan pilihan paket di backend dulu
  await apiPost('/api/employers/step3', { employerId, planSlug: selectedSlug });

  const plan = plans.find((p) => p.slug === selectedSlug);
  if (!plan) throw new Error('Paket tidak ditemukan.');

  // ✅ Jika paket FREE (Rp 0) —> anggap sudah paid, tanpa checkout
  if ((plan.amount ?? 0) <= 0) {
    setPaid(true);
    savePaymentRecord({
      id: uuid(),
      createdAt: new Date().toISOString(),
      employerId,
      company: profile.name || company,
      email: profile.email || email,
      planId: plan.id,
      planSlug: plan.slug,
      planName: plan.name,
      amount: plan.amount,
      currency: plan.currency,
      interval: plan.interval,
      status: 'success',            // langsung sukses
      channel: 'free_plan',         // penanda lokal
      raw: { note: 'Free plan does not require checkout' },
    });
    return; // <-- selesai; handler tombol akan lanjut ke Step 4
  }

  // ====== Paket berbayar (lanjut Midtrans) ======
  const link = !FORCE_SNAP ? getPaymentLink(plan) : null;
  if (link) {
    savePaymentRecord({
      id: uuid(),
      createdAt: new Date().toISOString(),
      employerId,
      company: profile.name || company,
      email: profile.email || email,
      planId: plan.id,
      planSlug: plan.slug,
      planName: plan.name,
      amount: plan.amount,
      currency: plan.currency,
      interval: plan.interval,
      status: 'initiated',
      channel: 'payment_link',
    });
    window.open(link, '_blank', 'noopener,noreferrer');
    return;
  }

  const res = await fetch(`${API_BASE}/api/payments/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      planId: plan.id,
      employerId,
      customer: { email: profile.email || email, first_name: profile.name || company },
    }),
  });
  if (!res.ok) {
    let msg = 'Gagal memulai pembayaran';
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const { token, redirect_url } = await res.json();

  if (window.snap?.pay) {
    await new Promise<void>((resolve, reject) => {
      window.snap!.pay(token, {
        onSuccess: async (result) => {
          setPaid(true);
          savePaymentRecord({
            id: (result?.order_id || result?.transaction_id || token || uuid()) as string,
            createdAt: new Date().toISOString(),
            employerId,
            company: profile.name || company,
            email: profile.email || email,
            planId: plan.id,
            planSlug: plan.slug,
            planName: plan.name,
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            status: 'success',
            channel: 'snap',
            raw: result,
          });
          resolve();
        },
        onPending: async (result) => {
          setPaid(true);
          savePaymentRecord({
            id: (result?.order_id || result?.transaction_id || token || uuid()) as string,
            createdAt: new Date().toISOString(),
            employerId,
            company: profile.name || company,
            email: profile.email || email,
            planId: plan.id,
            planSlug: plan.slug,
            planName: plan.name,
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            status: 'pending',
            channel: 'snap',
            raw: result,
          });
          resolve();
        },
        onError: (e: any) => {
          savePaymentRecord({
            id: (e?.order_id || token || uuid()) as string,
            createdAt: new Date().toISOString(),
            employerId,
            company: profile.name || company,
            email: profile.email || email,
            planId: plan.id,
            planSlug: plan.slug,
            planName: plan.name,
            amount: plan.amount,
            currency: plan.currency,
            interval: plan.interval,
            status: 'error',
            channel: 'snap',
            raw: e,
          });
          reject(e);
        },
        onClose: () => reject(new Error('Pembayaran ditutup sebelum selesai')),
      });
    });
  } else {
    savePaymentRecord({
      id: token,
      createdAt: new Date().toISOString(),
      employerId,
      company: profile.name || company,
      email: profile.email || email,
      planId: plan.id,
      planSlug: plan.slug,
      planName: plan.name,
      amount: plan.amount,
      currency: plan.currency,
      interval: plan.interval,
      status: 'initiated',
      channel: 'snap_redirect',
    });
    window.open(redirect_url, '_blank', 'noopener,noreferrer');
  }
}


  /* -------------------------------- Submit final ------------------------------- */
  async function onFinish(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      if (!employerId) throw new Error('EmployerId belum tersedia.');
      if (step <= 2) await submitStep2();
      if (!paid) throw new Error('Selesaikan pembayaran terlebih dahulu.');

      await apiPost('/api/employers/step5', {
        employerId,
        note: `Verifikasi otomatis dari UI. Company: ${profile.name}`,
        files: [],
      });

      // Auto login
      const loginEmail = (profile.email || email).trim();
      if (!loginEmail) throw new Error('Email tidak tersedia untuk login otomatis.');
      await signinEmployer(loginEmail, pw);
      localStorage.setItem('ark_employer_id', employerId);

      router.replace('/employer');
      router.refresh();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Gagal mengirim.');
      return;
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------ Stepper UI ------------------------------ */
  const steps = [
    { n: 1, label: 'Buat Akun' },
    { n: 2, label: 'Profil' },
    { n: 3, label: 'Pilih Paket' },
    { n: 4, label: 'Verifikasi' },
  ];

  /* --------------------------------- Render --------------------------------- */
  return (
    <div className="min-h-[100svh] bg-gradient-to-br from-slate-50 via-white to-slate-100 px-3 py-6 sm:px-4 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mx-auto w-full max-w-4xl rounded-[20px] sm:rounded-[28px] border border-slate-200/70 bg-white p-4 sm:p-6 shadow-xl">
          {/* Header */}
          <div className="mb-6 text-center">
            <Image
              src={Logo}
              alt="ArkWork Logo"
              width={72}
              height={72}
              className="mx-auto mb-4 h-12 w-12 sm:h-14 sm:w-14 object-contain"
              priority
            />
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              {mode === 'signin' ? 'Masuk Perusahaan' : step === 1 ? t('title') : 'Create Company Account'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {mode === 'signin'
                ? 'Masuk untuk mengelola lowongan & kandidat.'
                : step === 1
                ? t('subtitle')
                : 'Kelola lowongan & rekrut talenta terbaik di ArkWork.'}
            </p>

            {/* Tabs */}
            <div className="mt-5 inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1 text-sm">
              <button
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
                className={cx(
                  'px-4 py-1.5 rounded-xl transition',
                  mode === 'signin' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Masuk
              </button>
              <button
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={cx(
                  'px-4 py-1.5 rounded-xl transition',
                  mode === 'signup' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Buat Akun Perusahaan
              </button>
            </div>
          </div>

          {/* Error (global) */}
          {error && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {error}
            </div>
          )}

          {/* ============================ SIGNIN ============================ */}
          {mode === 'signin' && (
            <form onSubmit={onSignin} noValidate className="mx-auto grid max-w-md gap-4">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-600">Email Perusahaan / Username</span>
                <input
                  type="text"
                  value={siEmail}
                  onChange={(e) => setSiEmail(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="hr@company.com / username"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-600">Kata sandi</span>
                <div className="relative">
                  <input
                    type={siShowPw ? 'text' : 'password'}
                    value={siPw}
                    onChange={(e) => setSiPw(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setSiShowPw((v) => !v)}
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500 hover:text-slate-700"
                    tabIndex={-1}
                    aria-label="Tampilkan/Sembunyikan password"
                  >
                    {siShowPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={siBusy}
                className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
              >
                {siBusy ? (
                  <>
                    <span className="mr-2 inline-block animate-spin">⏳</span>Masuk…
                  </>
                ) : (
                  'Masuk'
                )}
              </button>

              <p className="mt-2 text-center text-sm text-slate-600">
                Belum punya akun?{' '}
                <button type="button" onClick={() => setMode('signup')} className="font-medium text-blue-700 hover:underline">
                  Daftar perusahaan
                </button>
              </p>
            </form>
          )}

          {/* ============================ SIGNUP (wizard) ============================ */}
          {mode === 'signup' && (
            <>
              {/* Stepper */}
              <div className="mb-8 mt-2 flex items-center justify-between gap-2 sm:gap-0">
                {steps.map(({ n, label }) => (
                  <div key={n} className="flex flex-1 items-center min-w-0">
                    <div
                      className={cx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        n <= step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                      )}
                    >
                      {n}
                    </div>
                    <div
                      className={cx(
                        'ml-2 sm:ml-3 text-[11px] sm:text-sm truncate',
                        n <= step ? 'text-slate-900 font-medium' : 'text-slate-500'
                      )}
                      title={label}
                    >
                      {label}
                    </div>
                    {n !== steps[steps.length - 1].n && <div className="mx-2 sm:mx-4 h-[2px] flex-1 rounded bg-slate-200" />}
                  </div>
                ))}
              </div>

              {/* ------------------------------- STEP 1 ------------------------------- */}
              {step === 1 && (
                <form onSubmit={onCreateCompany} noValidate className="grid grid-cols-1 gap-4">
                  {/* Company */}
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-600">{t('form.company')}</span>
                    <input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      required
                      placeholder={t('placeholder.company')}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      autoComplete="organization"
                    />
                  </label>

                  {/* Email */}
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-600">{t('form.email')}</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder={t('placeholder.email')}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      inputMode="email"
                    />
                  </label>

                  {/* Website */}
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-600">{t('form.website')}</span>
                    <input
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder={t('placeholder.website')}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      inputMode="url"
                      autoComplete="url"
                    />
                  </label>

                  {/* Password */}
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-600">{t('form.password')}</span>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        required
                        minLength={8}
                        placeholder={t('placeholder.password')}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pr-10 text-sm"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500 hover:text-slate-700"
                        tabIndex={-1}
                        aria-label={t('form.togglePw')}
                      >
                        {showPw ? '🙈' : '👁️'}
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-2" aria-hidden="true">
                      <div className={`h-1 w-1/3 rounded ${pw.length >= 6 ? 'bg-amber-400' : 'bg-slate-200'}`} />
                      <div className={`h-1 w-1/3 rounded ${pw.length >= 8 ? 'bg-amber-500' : 'bg-slate-200'}`} />
                      <div className={`h-1 w-1/3 rounded ${strong ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    </div>
                  </label>

                  {/* Confirm */}
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-600">{t('form.confirm')}</span>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        placeholder={t('placeholder.confirm')}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pr-10 text-sm"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500 hover:text-slate-700"
                        tabIndex={-1}
                        aria-label={t('form.toggleConfirm')}
                      >
                        {showConfirm ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {confirm.length > 0 && (
                      <p
                        className={`mt-1 text-xs ${pw === confirm ? 'text-emerald-600' : 'text-rose-600'}`}
                        role="status"
                        aria-live="polite"
                      >
                        {pw === confirm ? t('match.ok') : t('match.no')}
                      </p>
                    )}
                  </label>

                  {/* Agree (✅ sudah benar) */}
                  <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>
                      I agree to the{' '}
                      <Link href="/terms" className="text-blue-700 hover:underline">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link href="/privacy" className="text-blue-700 hover:underline">
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
                  >
                    {busy ? (
                      <>
                        <span className="mr-2 inline-block animate-spin">⏳</span>
                        {t('creating')}
                      </>
                    ) : (
                      t('createBtn')
                    )}
                  </button>
                </form>
              )}

              {/* ------------------------------- STEP 2 ------------------------------- */}
              {step === 2 && (
                <Step2 profile={profile} setProfile={setProfile} fileRef={fileRef} onBack={() => setStep(1)} onNext={async () => {
                  try {
                    setBusy(true);
                    setError(null);
                    await submitStep2();
                    setStep(3);
                  } catch (e: any) {
                    setError(e?.message || 'Gagal menyimpan profil.');
                  } finally {
                    setBusy(false);
                  }
                }} />
              )}

              {/* ------------------------------- STEP 3 ------------------------------- */}
              {step === 3 && (
                <Step3
                  plans={plans}
                  loading={plansLoading}
                  selectedSlug={selectedSlug}
                  setSelectedSlug={setSelectedSlug}
                  currentPlan={currentPlan}
                  busy={busy}
                  onBack={() => setStep(2)}
                  onNext={async () => {
                    try {
                      setBusy(true);
                      setError(null);
                      await submitStep3();
                      setStep(4);
                    } catch (e: any) {
                      setError(e?.message || 'Gagal memulai pembayaran.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              )}

              {/* ------------------------------- STEP 4 (VERIFIKASI) ------------------------------- */}
              {step === 4 && (
                <VerifySummary
                  profile={profile}
                  currentPlan={currentPlan}
                  paid={paid}
                  setPaid={setPaid}
                  busy={busy}
                  onBack={() => setStep(3)}
                  onSubmit={onFinish}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Subcomponents ------------------------------ */
function Step2({
  profile,
  setProfile,
  fileRef,
  onBack,
  onNext,
}: {
  profile: CompanyProfile;
  setProfile: (u: (p: CompanyProfile) => CompanyProfile) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          {profile.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.logo} alt="Logo preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400 text-xs">No logo</div>
          )}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = (ev) =>
                setProfile((p) => ({
                  ...p,
                  logo: String(ev.target?.result || ''),
                }));
              reader.readAsDataURL(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Unggah Logo
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Nama Perusahaan</span>
          <input
            value={profile.name}
            onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. ArkWork Indonesia, Inc."
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Email Perusahaan</span>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="hr@company.com"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Industri</span>
          <select
            value={profile.industry}
            onChange={(e) => setProfile((p) => ({ ...p, industry: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Pilih industri</option>
            <option>E-Commerce</option>
            <option>Energy</option>
            <option>Manufacturing</option>
            <option>Financial Services</option>
            <option>Technology</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Ukuran</span>
          <select
            value={profile.size}
            onChange={(e) => setProfile((p) => ({ ...p, size: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Pilih ukuran</option>
            <option>1-10</option>
            <option>11-50</option>
            <option>51-200</option>
            <option>201-500</option>
            <option>501-1000</option>
            <option>1001-5000</option>
            <option>5001-10000</option>
            <option>10000+</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm text-slate-600">Tentang perusahaan</span>
        <textarea
          value={profile.about}
          onChange={(e) => setProfile((p) => ({ ...p, about: e.target.value }))}
          rows={4}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          placeholder="Visi, misi, budaya kerja, dsb."
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Alamat kantor</span>
          <textarea
            value={profile.address}
            onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
            rows={3}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Jalan, nomor, dll."
          />
        </label>
        <div className="grid gap-4">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">Kota / Kabupaten</span>
            <input
              value={profile.city}
              onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Jakarta Selatan"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">Website (opsional)</span>
            <input
              value={profile.website}
              onChange={(e) => setProfile((p) => ({ ...p, website: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="company.com"
            />
          </label>
        </div>
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-slate-700">Website & Sosial</span>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['website', 'linkedin', 'instagram', 'facebook', 'tiktok', 'youtube'] as const).map((key) => (
            <input
              key={key}
              value={profile.socials[key] || ''}
              onChange={(e) => setProfile((p) => ({ ...p, socials: { ...p.socials, [key]: e.target.value } }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder={key[0].toUpperCase() + key.slice(1)}
            />
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-slate-50"
        >
          Kembali
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Selanjutnya
        </button>
      </div>
    </div>
  );
}

function Step3({
  plans,
  loading,
  selectedSlug,
  setSelectedSlug,
  currentPlan,
  busy,
  onBack,
  onNext,
}: {
  plans: Plan[];
  loading: boolean;
  selectedSlug: string;
  setSelectedSlug: (s: string) => void;
  currentPlan?: Plan;
  busy: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900">Pilih Paket</h2>
      <p className="mt-1 text-sm text-slate-600">Paket di bawah berasal dari konfigurasi admin (Monetisasi).</p>

      {loading ? (
        <div className="mt-6 text-slate-500">Memuat paket…</div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => {
            const active = p.slug === selectedSlug;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedSlug(p.slug)}
                className={cx(
                  'text-left rounded-2xl border p-5 transition focus:outline-none',
                  active ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={cx('text-base sm:text-lg font-semibold', active ? 'text-blue-700' : 'text-slate-900')}>
                    {p.name}
                  </h3>
                  <div className={cx('text-sm', active ? 'text-blue-600' : 'text-slate-500')}>
                    {formatIDR(p.amount)}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">/{p.interval}</div>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {(p.description || '')
                    .split('\n')
                    .filter(Boolean)
                    .slice(0, 4)
                    .map((line, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span>{line}</span>
                      </li>
                    ))}
                  {!p.description && <li className="text-slate-500/80">—</li>}
                </ul>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Paket dipilih</span>
          <span className="font-semibold text-slate-900">{currentPlan?.name ?? '-'}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-slate-600">Subtotal</span>
          <span className="font-semibold text-slate-900">
            {currentPlan ? formatIDR(currentPlan.amount) : '-'}
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-slate-50"
        >
          Kembali
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          disabled={busy || !selectedSlug}
        >
          {busy ? 'Memproses…' : 'Selanjutnya'}
        </button>
      </div>
    </div>
  );
}

function VerifySummary({
  profile,
  currentPlan,
  paid,
  setPaid,
  busy,
  onBack,
  onSubmit,
}: {
  profile: CompanyProfile;
  currentPlan?: Plan;
  paid: boolean;
  setPaid: (v: boolean) => void;
  busy: boolean;
  onBack: () => void;
  onSubmit: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="grid gap-6">
      <h2 className="text-xl font-semibold text-slate-900">Verifikasi & Ringkasan</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">Profil Perusahaan</div>
          <dl className="space-y-2 text-sm">
            <Row label="Nama">{profile.name || '-'}</Row>
            <Row label="Email">{profile.email || '-'}</Row>
            <Row label="Industri">{profile.industry || '-'}</Row>
            <Row label="Ukuran">{profile.size || '-'}</Row>
            <Row label="Kota">{profile.city || '-'}</Row>
            <Row label="Website">{profile.website ? normalizeUrl(profile.website) : '-'}</Row>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">Paket</div>
          <dl className="space-y-2 text-sm">
            <Row label="Nama Paket">{currentPlan?.name ?? '-'}</Row>
            <Row label="Harga">{currentPlan ? formatIDR(currentPlan.amount) : '-'}</Row>
            <Row label="Interval">{currentPlan?.interval ?? '-'}</Row>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">Status Pembayaran</div>
          <dl className="space-y-2 text-sm">
            <Row label="Status">{paid ? 'Lunas / Pending (diterima)' : 'Belum dibayar'}</Row>
          </dl>
          {/* kalau perlu tombol simulasi paid */}
          {/* <button className="mt-3 text-xs underline" onClick={() => setPaid(true)}>Set Paid (simulate)</button> */}
        </div>

        <div className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
          <div className="mb-3 text-sm font-semibold text-slate-900">Catatan</div>
          <p className="text-sm text-slate-700">
            Setelah verifikasi selesai akun perusahaan akan aktif dan dapat mengelola lowongan.
          </p>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-slate-50"
        >
          Kembali
        </button>
        <button
          type="button"
          disabled={busy || !paid}
          onClick={onSubmit}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          title={!paid ? 'Selesaikan pembayaran terlebih dahulu' : undefined}
        >
          {busy ? 'Mengirim…' : 'Kirim'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ Small helper ------------------------------ */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="col-span-1 text-slate-500">{label}</div>
      <div className="col-span-2 font-medium text-slate-800">{children}</div>
    </div>
  );
}
