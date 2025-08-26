'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';

/**
 * Employer Profile – Step 2 (Profil) + Job List (Modernized)
 * - Pure TailwindCSS (no external UI/icon libs)
 * - Cleaner layout, better spacing, modern card design
 * - Logo upload with preview
 * - Job list styled like modern dashboard
 */

type Job = {
  id: string | number;
  title: string;
  location: string;
  type: string;
  postedAt: string;
};

export default function ProfileEmployerPage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [about, setAbout] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');
  const [social, setSocial] = useState({
    website: '',
    instagram: '',
    linkedin: '',
    facebook: '',
    youtube: '',
    tiktok: ''
  });

  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    setJobs([
      {id: 1, title: 'Senior Frontend Engineer', location: 'Jakarta', type: 'Full-time', postedAt: new Date().toISOString()},
      {id: 2, title: 'Product Designer (UI/UX)', location: 'Remote (ID)', type: 'Full-time', postedAt: new Date(Date.now()-86400000*5).toISOString()},
      {id: 3, title: 'Recruiter / TA Specialist', location: 'Bandung', type: 'Contract', postedAt: new Date(Date.now()-86400000*12).toISOString()},
    ]);
  }, []);

  const dateFmt = useMemo(() => new Intl.DateTimeFormat('id-ID', {year: 'numeric', month: 'short', day: '2-digit'}), []);

  const fileRef = useRef<HTMLInputElement | null>(null);
  function onSelectLogo(file: File) {
    const url = URL.createObjectURL(file);
    setLogoUrl(url);
  }
  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) onSelectLogo(f);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    alert('Profil disimpan (contoh). Sambungkan ke API sesuai kebutuhan.');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <header className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Profil Perusahaan</h1>
        <p className="mb-8 max-w-2xl text-base text-slate-600 dark:text-slate-300">Lengkapi informasi perusahaan Anda agar terlihat lebih profesional bagi calon kandidat.</p>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left: Form */}
          <section className="lg:col-span-2 space-y-8">
            {/* Logo */}
            <Card title="Logo Perusahaan">
              <div className="flex items-center gap-6">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-500">No logo</span>
                  )}
                </div>
                <div className="flex-1">
                  <label
                    onDrop={onDrop}
                    onDragOver={(e)=>e.preventDefault()}
                    htmlFor="logo-input"
                    className="block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600 transition hover:bg-white dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300"
                  >
                    <span className="font-medium">Unggah Logo</span> atau drag & drop
                  </label>
                  <input id="logo-input" ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e)=>{
                    const f = e.target.files?.[0];
                    if (f && f.type.startsWith('image/')) onSelectLogo(f);
                  }} />
                  <p className="mt-2 text-xs text-slate-500">PNG/JPG, rasio 1:1, max ~2MB.</p>
                </div>
              </div>
            </Card>

            {/* Info */}
            <Card title="Informasi Utama">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama Perusahaan"><input value={companyName} onChange={(e)=>setCompanyName(e.target.value)} className="input" placeholder="e.g. ArkWork Indonesia, Inc." /></Field>
                <Field label="Email Perusahaan"><input value={companyEmail} onChange={(e)=>setCompanyEmail(e.target.value)} className="input" placeholder="hr@company.com" type="email" /></Field>
                <Field label="Website (opsional)"><input value={website} onChange={(e)=>setWebsite(e.target.value)} className="input" placeholder="company.com" /></Field>
                <Field className="sm:col-span-2" label="Tentang Perusahaan"><textarea value={about} onChange={(e)=>setAbout(e.target.value)} className="input min-h-[120px]" placeholder="Visi, misi, budaya kerja, dsb." /></Field>
              </div>
            </Card>

            {/* Address */}
            <Card title="Alamat Kantor">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Alamat"><textarea value={address} onChange={(e)=>setAddress(e.target.value)} className="input min-h-[80px]" placeholder="Jalan, nomor, dll." /></Field>
                <Field label="Kota / Kabupaten"><input value={city} onChange={(e)=>setCity(e.target.value)} className="input" placeholder="Jakarta Selatan" /></Field>
              </div>
            </Card>

            {/* Socials */}
            <Card title="Website & Sosial">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Website"><input value={social.website} onChange={(e)=>setSocial({...social, website:e.target.value})} className="input" placeholder="https://company.com" /></Field>
                <Field label="LinkedIn"><input value={social.linkedin} onChange={(e)=>setSocial({...social, linkedin:e.target.value})} className="input" placeholder="https://linkedin.com/company/..." /></Field>
                <Field label="Instagram"><input value={social.instagram} onChange={(e)=>setSocial({...social, instagram:e.target.value})} className="input" placeholder="https://instagram.com/..." /></Field>
                <Field label="Facebook"><input value={social.facebook} onChange={(e)=>setSocial({...social, facebook:e.target.value})} className="input" placeholder="https://facebook.com/..." /></Field>
                <Field label="Tiktok"><input value={social.tiktok} onChange={(e)=>setSocial({...social, tiktok:e.target.value})} className="input" placeholder="https://tiktok.com/@..." /></Field>
                <Field label="Youtube"><input value={social.youtube} onChange={(e)=>setSocial({...social, youtube:e.target.value})} className="input" placeholder="https://youtube.com/@..." /></Field>
              </div>
            </Card>

            {/* Actions */}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Link href="/auth/signup" className="btn-secondary">Kembali</Link>
              <div className="flex gap-3">
                <button type="button" className="btn-secondary">Simpan Draft</button>
                <button type="submit" className="btn-primary">Selanjutnya</button>
              </div>
            </div>
          </section>

          {/* Right: Job List */}
          <aside className="space-y-6">
            <Card title="Lowongan yang Diposting" action={<Link href="/jobs/new" className="btn-chip">+ Posting</Link>}>
              {jobs.length === 0 ? <Empty text="Belum ada lowongan diposting." /> : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {jobs.map((j)=> (
                    <li key={j.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{j.title}</p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{j.type} • {j.location} • {dateFmt.format(new Date(j.postedAt))}</p>
                        </div>
                        <Link href={`/jobs/${j.id}`} className="btn-link">Detail →</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <p className="text-sm text-slate-600 dark:text-slate-300">Tip: Anda bisa mengedit profil kapan pun dari menu <span className="font-medium">Pengaturan Perusahaan</span>.</p>
            </Card>
          </aside>
        </form>
      </main>
    </div>
  );
}

// ---- Small components ----
function Card({title, action, children}:{title?:string; action?:React.ReactNode; children:React.ReactNode}){
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

function Field({label, children, className}:{label:string; children:React.ReactNode; className?:string}){
  return (
    <label className={`block ${className ?? ''}`}>
      <div className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{label}</div>
      {children}
    </label>
  );
}

function Empty({text}:{text:string}){
  return <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-slate-500 dark:border-slate-700">{text}</div>;
}

/* Tailwind utility presets:
  .input => 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500'
  .btn-primary => 'inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none'
  .btn-secondary => 'inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
  .btn-link => 'text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400'
  .btn-chip => 'rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
*/
