'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

/** ================== Types & Const ================== */
type BinMeta = { name: string; type: string; key: string } | null; // generic untuk cv/avatar
type CvMeta = BinMeta;
type AvatarMeta = BinMeta;

type StoredUser = {
  email: string;
  name?: string;
  profile?: {
    location?: string;
    phone?: string;
    skills?: string;
    cv?: CvMeta;
    photo?: AvatarMeta; // metadata avatar (blob di IndexedDB)
  };
  createdAt?: string;
  updatedAt?: string;
};

const LS_KEY = 'ark_users';
const NAV_AVATAR_KEY_PREFIX = 'ark_nav_avatar:'; // dataURL thumbnail utk navbar
const MAX_CV_MB = 2;
const MAX_AVATAR_MB = 2; // foto max 2MB

const ALLOWED_CV_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** ================== IndexedDB utils ================== */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ark_db', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cv_files')) db.createObjectStore('cv_files');
      if (!db.objectStoreNames.contains('avatar_files')) db.createObjectStore('avatar_files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(store: 'cv_files' | 'avatar_files', key: string, blob: Blob) {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(blob, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
async function idbGet(store: 'cv_files' | 'avatar_files', key: string): Promise<Blob | null> {
  const db = await openDB();
  const out = await new Promise<Blob | null>((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => res((r.result as Blob) ?? null);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return out;
}
async function idbDel(store: 'cv_files' | 'avatar_files', key: string) {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

/** ================== LocalStorage utils ================== */
const readUsers = (): StoredUser[] => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  } catch {
    return [];
  }
};
const writeUsers = (arr: StoredUser[]) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

/** ================== Small UI helpers ================== */
function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-neutral-800">{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 outline-none transition focus:border-neutral-900 ${className || ''}`}
    />
  );
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 outline-none transition focus:border-neutral-900 ${className || ''}`}
    />
  );
}
function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-neutral-900 px-2 py-1 text-xs text-white">{children}</span>;
}
type Toast = { type: 'success' | 'error' | 'info'; message: string } | null;
function ToastBanner({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  if (!toast) return null;
  const style =
    toast.type === 'success'
      ? 'bg-green-50 text-green-800 border-green-200'
      : toast.type === 'error'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-neutral-50 text-neutral-700 border-neutral-200';
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${style}`}>
      <div className="flex items-start justify-between gap-3">
        <span>{toast.message}</span>
        <button onClick={onClose} className="text-xs opacity-70 hover:opacity-100">✕</button>
      </div>
    </div>
  );
}

/** ================== Image helpers (thumbnail untuk navbar) ================== */
async function fileToThumbDataURL(file: File | Blob, maxSize = 160): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      res(im);
    };
    im.onerror = (e) => rej(e);
    im.src = url;
  });
  const canvas = document.createElement('canvas');
  const max = Math.max(img.width, img.height);
  const scale = maxSize / max;
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** ================== Page ================== */
export default function ProfilePage() {
  const t = useTranslations('profile');
  const { user } = useAuth();
  const router = useRouter();

  // Single source of truth untuk email — hindari “possibly null”
  const email = user?.email ?? null;
  const notSignedIn = !email;

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');

  const [cvMeta, setCvMeta] = useState<CvMeta>(null);
  const [cvUrl, setCvUrl] = useState<string | null>(null);

  const [avatarMeta, setAvatarMeta] = useState<AvatarMeta>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null); // preview besar

  const [busySave, setBusySave] = useState(false);
  const [busyUploadCV, setBusyUploadCV] = useState(false);
  const [busyUploadAvatar, setBusyUploadAvatar] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  // Redirect aman (tanpa mengubah urutan hooks)
  useEffect(() => {
    if (notSignedIn) {
      const id = setTimeout(() => router.replace('/auth/signin'), 50);
      return () => clearTimeout(id);
    }
  }, [notSignedIn, router]);

  // auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  // load biodata
  useEffect(() => {
    if (!email) return;
    const users = readUsers();
    const u = users.find((x) => x.email === email);
    setName(u?.name ?? '');
    setLocation(u?.profile?.location ?? '');
    setPhone(u?.profile?.phone ?? '');
    setSkills(u?.profile?.skills ?? '');
    setCvMeta(u?.profile?.cv ?? null);
    setAvatarMeta(u?.profile?.photo ?? null);
  }, [email]);

  // objectURL CV
  useEffect(() => {
    let currentUrl: string | null = null;
    let cancelled = false;
    (async () => {
      if (!cvMeta) { setCvUrl(null); return; }
      const blob = await idbGet('cv_files', cvMeta.key);
      if (!blob) { setCvUrl(null); return; }
      currentUrl = URL.createObjectURL(blob);
      if (!cancelled) setCvUrl(currentUrl);
    })();
    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [cvMeta?.key]);

  // objectURL Avatar
  useEffect(() => {
    let currentUrl: string | null = null;
    let canceled = false;
    (async () => {
      if (!avatarMeta) { setAvatarUrl(null); return; }
      const blob = await idbGet('avatar_files', avatarMeta.key);
      if (!blob) { setAvatarUrl(null); return; }
      currentUrl = URL.createObjectURL(blob);
      if (!canceled) setAvatarUrl(currentUrl);
    })();
    return () => {
      canceled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [avatarMeta?.key]);

  const tags = useMemo(() => skills.split(',').map((s) => s.trim()).filter(Boolean), [skills]);
  const isPdf = cvMeta?.type === 'application/pdf';

  /** ========== Actions ========== */
  async function onPickCv(file: File) {
    if (!email) return;
    if (!ALLOWED_CV_TYPES.includes(file.type)) {
      setToast({ type: 'error', message: t('toast.cvTypeNotAllowed') || 'File harus PDF/DOC/DOCX' });
      return;
    }
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_CV_MB) {
      setToast({ type: 'error', message: (t('toast.cvTooLarge') as any) || `Ukuran maksimum ${MAX_CV_MB}MB` });
      return;
    }
    setBusyUploadCV(true);
    try {
      const key = `cv:${email}`;
      await idbPut('cv_files', key, file);
      setCvMeta({ name: file.name, type: file.type, key });

      const buf = await file.arrayBuffer();
      const blob = new Blob([buf], { type: file.type });
      const url = URL.createObjectURL(blob);
      setCvUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      setToast({ type: 'success', message: t('toast.cvUploaded') || 'CV berhasil diunggah.' });
    } catch {
      setToast({ type: 'error', message: t('toast.failed') || 'Terjadi kesalahan.' });
    } finally {
      setBusyUploadCV(false);
    }
  }

  async function onPickAvatar(file: File) {
    if (!email) return;
    if (!file.type.startsWith('image/')) {
      setToast({ type: 'error', message: 'File harus gambar (PNG/JPG/SVG).' });
      return;
    }
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_AVATAR_MB) {
      setToast({ type: 'error', message: `Ukuran foto maksimum ${MAX_AVATAR_MB}MB` });
      return;
    }
    setBusyUploadAvatar(true);
    try {
      const key = `avatar:${email}`;
      await idbPut('avatar_files', key, file);
      setAvatarMeta({ name: file.name, type: file.type, key });

      const url = URL.createObjectURL(file);
      setAvatarUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });

      const thumbDataUrl = await fileToThumbDataURL(file, 160);
      localStorage.setItem(NAV_AVATAR_KEY_PREFIX + email, thumbDataUrl);
      window.dispatchEvent(new Event('ark:avatar-updated'));

      setToast({ type: 'success', message: 'Foto profil diperbarui.' });
    } catch {
      setToast({ type: 'error', message: 'Gagal mengunggah foto.' });
    } finally {
      setBusyUploadAvatar(false);
    }
  }

  async function removeAvatar() {
    if (!email) return;
    try {
      if (avatarMeta?.key) await idbDel('avatar_files', avatarMeta.key);
      setAvatarUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
      setAvatarMeta(null);
      localStorage.removeItem(NAV_AVATAR_KEY_PREFIX + email);

      const users = readUsers();
      const idx = users.findIndex((x) => x.email === email);
      if (idx >= 0) {
        users[idx].profile = { ...users[idx].profile, photo: null };
        users[idx].updatedAt = new Date().toISOString();
        writeUsers(users);
      }
      window.dispatchEvent(new Event('ark:avatar-updated'));
      setToast({ type: 'success', message: 'Foto profil dihapus.' });
    } catch {
      setToast({ type: 'error', message: 'Gagal menghapus foto.' });
    }
  }

  function save() {
    if (!email) return;
    setBusySave(true);
    try {
      const users = readUsers();
      const now = new Date().toISOString();
      const idx = users.findIndex((x) => x.email === email);
      const data: StoredUser = {
        email,
        name,
        profile: { location, phone, skills, cv: cvMeta, photo: avatarMeta },
        createdAt: idx >= 0 ? users[idx].createdAt : now,
        updatedAt: now,
      };
      if (idx >= 0) users[idx] = { ...users[idx], ...data };
      else users.push(data);
      writeUsers(users);
      setToast({ type: 'success', message: t('toast.saved') || 'Tersimpan.' });
    } catch {
      setToast({ type: 'error', message: t('toast.failed') || 'Gagal menyimpan.' });
    } finally {
      setBusySave(false);
    }
  }

  async function removeCv() {
    if (!email) return;
    try {
      if (cvMeta?.key) await idbDel('cv_files', cvMeta.key);
      setCvUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
      setCvMeta(null);

      const users = readUsers();
      const idx = users.findIndex((x) => x.email === email);
      if (idx >= 0) {
        users[idx].profile = { ...users[idx].profile, cv: null };
        users[idx].updatedAt = new Date().toISOString();
        writeUsers(users);
      }
      setToast({ type: 'success', message: t('toast.cvRemoved') || 'CV dihapus.' });
    } catch {
      setToast({ type: 'error', message: t('toast.failed') || 'Gagal menghapus CV.' });
    }
  }

  /** ========== UI ========== */

  // Fallback UI saat user belum login (tetap render — tidak mengubah jumlah hooks)
  if (notSignedIn) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <div className="text-center">
          <p className="text-sm text-neutral-600">Mengarahkan ke halaman masuk…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-10">
      <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {t('title') || 'Profil Saya'}
          </h1>
          <button
            onClick={save}
            disabled={busySave}
            className="rounded-xl bg-neutral-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busySave ? (t('actions.saving') || 'Menyimpan...') : (t('actions.save') || 'Simpan')}
          </button>
        </div>

        {/* Toast */}
        <ToastBanner toast={toast} onClose={() => setToast(null)} />

        {/* Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          {/* Header row dengan avatar */}
          <div className="mb-6 flex items-center gap-5">
            <div className="relative">
              <div className="h-20 w-20 overflow-hidden rounded-full border border-neutral-300 bg-neutral-100">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                    {(name?.[0] || email[0] || 'U').toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <span className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800">
                  {t('actions.changePhoto') || 'Ubah Foto'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    await onPickAvatar(f);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              {avatarMeta && (
                <button
                  onClick={removeAvatar}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
                >
                  {t('actions.remove') || 'Hapus'}
                </button>
              )}
              {busyUploadAvatar && (
                <span className="text-xs text-neutral-500">{t('actions.uploading') || 'Mengunggah...'}</span>
              )}
            </div>
          </div>

          {/* Basic */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <Label>{t('fields.name') || 'Nama Lengkap'}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ph.name') || 'Nama lengkap'} />
            </div>
            <div>
              <Label>{t('fields.email') || 'Email'}</Label>
              <Input readOnly value={email ?? ''} className="bg-neutral-100" />
            </div>
            <div>
              <Label>{t('fields.location') || 'Lokasi'}</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('ph.location') || 'Kota, Negara'} />
            </div>
            <div>
              <Label>{t('fields.phone') || 'Nomor HP'}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('ph.phone') || '08xxxx'} />
            </div>
            <div className="md:col-span-2">
              <Label>{t('fields.skills') || 'Keahlian (pisahkan koma)'}</Label>
              <Textarea
                rows={3}
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder={t('ph.skills') || 'React, Tailwind, PostgreSQL'}
              />
              {!!skills.trim() && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {tags.map((s, i) => (
                    <Pill key={i}>#{s}</Pill>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 h-px w-full bg-neutral-200" />

          {/* CV */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('fields.cv') || 'Unggah CV'}</Label>
              <span className="text-xs text-neutral-500">PDF/DOC/DOCX • Maks {MAX_CV_MB}MB • Disimpan lokal</span>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-3">
              <span className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
                {t('actions.chooseFile') || 'Pilih File'}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await onPickCv(f);
                  e.currentTarget.value = '';
                }}
              />
              {busyUploadCV && <span className="text-xs text-neutral-500">{t('actions.uploading') || 'Mengunggah...'}</span>}
            </label>

            {cvMeta && (
              <div className="rounded-xl border border-neutral-200">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-neutral-900" />
                    <span className="font-medium text-neutral-800">{cvMeta.name}</span>
                    <span className="text-neutral-400">•</span>
                    <span className="text-neutral-500">{cvMeta.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {cvUrl && (
                      <>
                        <a
                          href={cvUrl}
                          download={cvMeta.name}
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
                        >
                          {t('actions.download') || 'Unduh'}
                        </a>
                        <a
                          href={cvUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
                        >
                          {t('actions.view') || 'Lihat'}
                        </a>
                      </>
                    )}
                    <button
                      onClick={removeCv}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
                    >
                      {t('actions.remove') || 'Hapus'}
                    </button>
                  </div>
                </div>

                {cvUrl && isPdf && (
                  <div className="h-[420px] w-full overflow-hidden rounded-b-xl border-t border-neutral-200">
                    <iframe src={cvUrl} className="h-full w-full" title="CV Preview" />
                  </div>
                )}
                {cvUrl && !isPdf && (
                  <p className="px-4 pb-4 text-xs text-neutral-500">
                    {t('hints.docPreview') || 'Preview inline hanya untuk PDF. DOC/DOCX dibuka/diunduh di tab baru.'}
                  </p>
                )}
              </div>
            )}

            {!cvMeta && <p className="text-xs text-neutral-500">{t('hints.noCvYet') || 'Belum ada CV terunggah.'}</p>}
          </div>
        </div>

        <p className="text-center text-xs text-neutral-500">
          Biodata tersimpan di <strong>localStorage</strong>, Foto &amp; CV tersimpan di <strong>IndexedDB</strong>.
        </p>
      </div>
    </div>
  );
}
