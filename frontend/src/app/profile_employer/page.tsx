'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, apiForm, API_BASE } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

type Job = {
  id: string | number;
  title: string;
  location: string;
  type: string;
  postedAt: string;
};

type MeResp = {
  ok: boolean;
  role: 'employer';
  admin: { id: string; email: string | null; fullName?: string | null; isOwner?: boolean };
  employer: {
    id: string;
    slug: string;
    displayName?: string | null;
    legalName?: string | null;
    website?: string | null;
  } | null;
};

type ProfileResp = {
  about?: string | null;
  hqCity?: string | null;
  hqCountry?: string | null;
  logoUrl?: string | null;
  linkedin?: string | null;
  instagram?: string | null;
  twitter?: string | null;
  bannerUrl?: string | null;
  industry?: string | null;
  size?: string | null;
  foundedYear?: number | null;
};

/* Helpers */
function normalizeUrl(input?: string | null): string | '' {
  const v = (input ?? '').trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) return `https://${v}`;
  return v;
}
function toAbs(u?: string | null) {
  if (!u) return '';
  try { return new URL(u).toString(); } catch { return `${API_BASE}${u.startsWith('/') ? '' : '/'}${u}`; }
}

export default function ProfileEmployerPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [employerId, setEmployerId] = useState<string>('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');

  const [about, setAbout] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);

  const [social, setSocial] = useState({
    instagram: '',
    linkedin: '',
    twitter: '',
    websitePublic: '',
    facebook: '',
    youtube: '',
  });

  const [jobs, setJobs] = useState<Job[]>([]);

  // ====== Load data: me -> profile
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<MeResp>('/api/employers/auth/me');
        if (!alive) return;

        const emp = me.employer;
        const eid = emp?.id || '';
        setEmployerId(eid);
        setCompanyEmail(me.admin?.email || '');
        setCompanyName((emp?.displayName || emp?.legalName || '').trim());
        setWebsite(emp?.website || '');

        // ambil profile (include logoUrl)
        if (eid) {
          const prof = await api<ProfileResp>(`/api/employers/profile?employerId=${encodeURIComponent(eid)}`);
          if (!alive) return;
          setAbout(prof?.about || '');
          setCity(prof?.hqCity || '');
          setLogoUrl(prof?.logoUrl || undefined);
          setSocial((prev) => ({
            ...prev,
            instagram: prof?.instagram || '',
            linkedin: prof?.linkedin || '',
            twitter: prof?.twitter || '',
          }));
        }

        // dummy jobs
        setJobs([
          { id: 1, title: 'Senior Frontend Engineer', location: 'Jakarta', type: 'Full-time', postedAt: new Date().toISOString() },
          { id: 2, title: 'Product Designer (UI/UX)', location: 'Remote (ID)', type: 'Full-time', postedAt: new Date(Date.now() - 86400000 * 5).toISOString() },
          { id: 3, title: 'Recruiter / TA Specialist', location: 'Bandung', type: 'Contract', postedAt: new Date(Date.now() - 86400000 * 12).toISOString() },
        ]);
      } catch (e) {
        console.error('[profile] load failed:', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat('id-ID', { year: 'numeric', month: 'short', day: '2-digit' }),
    []
  );

  const fileRef = useRef<HTMLInputElement | null>(null);

  // ====== Upload logo: langsung ketika user pilih file
  async function handleSelectFile(file: File) {
    if (!file || !file.type.startsWith('image/')) return;
    if (!employerId) {
      // preview dulu, upload akan coba lagi setelah me load
      const url = URL.createObjectURL(file);
      setLogoUrl(url);
      return;
    }
    // preview instan
    setLogoUrl(URL.createObjectURL(file));

    try {
      const fd = new FormData();
      fd.append('employerId', employerId);
      fd.append('file', file);
      const resp = await apiForm<{ ok: boolean; url: string }>('/api/employers/profile/logo', fd);
      if (resp?.url) {
        setLogoUrl(resp.url);

        // update avatar nav (jika Nav-mu membaca key ini)
        try {
          if (user?.email) {
            localStorage.setItem(`ark_nav_avatar:${user.email}`, toAbs(resp.url));
            window.dispatchEvent(new Event('ark:avatar-updated'));
          }
        } catch {}
      }
    } catch (err) {
      console.error('upload logo error:', err);
      alert('Gagal upload logo');
    }
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void handleSelectFile(f);
  }

  // ====== Simpan field lain
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      if (!employerId) throw new Error('Missing employerId');

      // Step2: profile
      await api('/api/employers/step2', {
        method: 'POST',
        json: {
          employerId,
          about: about || undefined,
          hqCity: city || undefined,
          linkedin: normalizeUrl(social.linkedin) || undefined,
          instagram: normalizeUrl(social.instagram) || undefined,
          twitter: normalizeUrl(social.twitter) || undefined,
        } as any,
      });

      // Update basic
      const normalizedSite = normalizeUrl(website);
      await api('/api/employers/update-basic', {
        method: 'POST',
        json: {
          employerId,
          displayName: companyName?.trim() || undefined,
          website: normalizedSite || null,
        } as any,
      });

      alert('Profil disimpan.');
    } catch (err) {
      console.error('save profile error:', err);
      alert('Validation error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8">
          <div className="h-6 w-56 rounded bg-slate-200 animate-pulse dark:bg-slate-800" />
          <div className="mt-2 h-4 w-96 rounded bg-slate-200 animate-pulse dark:bg-slate-800" />
        </div>
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="h-40 rounded-2xl border border-slate-200 bg-white shadow-sm animate-pulse dark:border-slate-800 dark:bg-slate-900" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <header className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Profil Perusahaan</h1>
        <p className="mb-8 max-w-2xl text-base text-slate-600 dark:text-slate-300">
          Lengkapi informasi perusahaan Anda agar terlihat lebih profesional bagi calon kandidat.
        </p>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* LEFT */}
          <section className="lg:col-span-2 space-y-8">
            <Card title="Logo Perusahaan">
              <div className="flex items-center gap-6">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  {logoUrl ? (
                    <img src={toAbs(logoUrl)} alt="Logo" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-500">No logo</span>
                  )}
                </div>
                <div className="flex-1">
                  <label
                    htmlFor="logo-input"
                    onDrop={onDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600 transition hover:bg-white dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300"
                  >
                    <span className="font-medium">Unggah Logo</span> atau drag & drop
                  </label>
                  <input
                    id="logo-input"
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleSelectFile(f);
                    }}
                  />
                  <p className="mt-2 text-xs text-slate-500">PNG/JPG, rasio 1:1, max ~2MB.</p>
                </div>
              </div>
            </Card>

            <Card title="Informasi Utama">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama Perusahaan">
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="input"
                    placeholder="e.g. ArkWork Indonesia, Inc."
                  />
                </Field>
                <Field label="Email Perusahaan (admin)">
                  <input
                    value={companyEmail}
                    readOnly
                    className="input bg-slate-50 dark:bg-slate-800/40"
                    placeholder="hr@company.com"
                  />
                </Field>
                <Field label="Website (opsional)">
                  <input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="input"
                    placeholder="company.com"
                  />
                </Field>
                <Field className="sm:col-span-2" label="Tentang Perusahaan">
                  <textarea
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    className="input min-h-[120px]"
                    placeholder="Visi, misi, budaya kerja, dsb."
                  />
                </Field>
              </div>
            </Card>

            <Card title="Alamat Kantor">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Alamat">
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="input min-h-[80px]"
                    placeholder="Jalan, nomor, dll."
                  />
                </Field>
                <Field label="Kota / Kabupaten">
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="input"
                    placeholder="Jakarta Selatan"
                  />
                </Field>
              </div>
            </Card>

            <Card title="Sosial Media">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="LinkedIn">
                  <input
                    value={social.linkedin}
                    onChange={(e) => setSocial({ ...social, linkedin: e.target.value })}
                    className="input"
                    placeholder="linkedin.com/company/..."
                  />
                </Field>
                <Field label="Instagram">
                  <input
                    value={social.instagram}
                    onChange={(e) => setSocial({ ...social, instagram: e.target.value })}
                    className="input"
                    placeholder="instagram.com/..."
                  />
                </Field>
                <Field label="Twitter/X">
                  <input
                    value={social.twitter}
                    onChange={(e) => setSocial({ ...social, twitter: e.target.value })}
                    className="input"
                    placeholder="x.com/..."
                  />
                </Field>
                {/* UI tambahan, tidak dikirim ke backend */}
                <Field label="Website (Publik)">
                  <input
                    value={social.websitePublic}
                    onChange={(e) => setSocial({ ...social, websitePublic: e.target.value })}
                    className="input"
                    placeholder="https://company.com"
                  />
                </Field>
                <Field label="Facebook">
                  <input
                    value={social.facebook}
                    onChange={(e) => setSocial({ ...social, facebook: e.target.value })}
                    className="input"
                    placeholder="facebook.com/..."
                  />
                </Field>
                <Field label="Youtube">
                  <input
                    value={social.youtube}
                    onChange={(e) => setSocial({ ...social, youtube: e.target.value })}
                    className="input"
                    placeholder="youtube.com/@..."
                  />
                </Field>
              </div>
            </Card>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Link href="/auth/signup" className="btn-secondary">Kembali</Link>
              <div className="flex gap-3">
                <button type="button" className="btn-secondary">Simpan Draft</button>
                <button type="submit" className={`btn-primary ${saving ? 'opacity-80 cursor-not-allowed' : ''}`} disabled={saving}>
                  {saving ? 'Menyimpan…' : 'Simpan Profil'}
                </button>
              </div>
            </div>
          </section>

          {/* RIGHT */}
          <aside className="space-y-6">
            <Card title="Lowongan yang Diposting" action={<Link href="/jobs/new" className="btn-chip">+ Posting</Link>}>
              {jobs.length === 0 ? (
                <Empty text="Belum ada lowongan diposting." />
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {jobs.map((j) => (
                    <li key={j.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{j.title}</p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {j.type} • {j.location} • {dateFmt.format(new Date(j.postedAt))}
                          </p>
                        </div>
                        <Link href={`/jobs/${j.id}`} className="btn-link">Detail →</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Tip: Email admin bersifat khusus akun dan tidak bisa diubah dari halaman ini.
                Hubungi dukungan atau menu Pengaturan Akun untuk mengganti email.
              </p>
            </Card>
          </aside>
        </form>
      </main>
    </div>
  );
}

/* ==== small comps ==== */
function Card({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-slate-800/60 dark:bg-slate-900/60">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <div className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{label}</div>
      {children}
    </label>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-slate-500 dark:border-slate-700">{text}</div>;
}
