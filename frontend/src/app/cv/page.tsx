// src/app/cv/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

/* =========================================================
   Types & Const
========================================================= */
type MonthKey =
  | 'Jan' | 'Feb' | 'Mar' | 'Apr' | 'Mei' | 'Jun' | 'Jul' | 'Agu' | 'Sep' | 'Okt' | 'Nov' | 'Des';

const MONTHS: { key: MonthKey; label: string }[] = [
  { key: 'Jan', label: 'Januari' },
  { key: 'Feb', label: 'Februari' },
  { key: 'Mar', label: 'Maret' },
  { key: 'Apr', label: 'April' },
  { key: 'Mei', label: 'Mei' },
  { key: 'Jun', label: 'Juni' },
  { key: 'Jul', label: 'Juli' },
  { key: 'Agu', label: 'Agustus' },
  { key: 'Sep', label: 'September' },
  { key: 'Okt', label: 'Oktober' },
  { key: 'Nov', label: 'November' },
  { key: 'Des', label: 'Desember' },
];

type ExpItem = {
  id: string;
  title: string;
  org?: string;
  tag?: string;
  startMonth?: MonthKey;
  startYear?: number;
  endMonth?: MonthKey;
  endYear?: number;
  present?: boolean;
  bullets?: string; // one per line
};

type EduItem = {
  id: string;
  school: string;
  degree?: string;
  gpa?: string;
  startYear?: number;
  endYear?: number;
  present?: boolean;
};

type CvDraft = {
  name: string;
  email: string;
  location?: string;
  phone?: string;
  about?: string;

  experiences: ExpItem[];
  educations: EduItem[];

  hardSkillsCsv?: string;
  softSkillsCsv?: string;

  // legacy fallback
  skills?: string[];
};

const LS_DRAFTS_KEY = 'ark_cv_drafts_struct_v2';
const LS_PROFILE_KEY = 'ark_users';

/** Oil & Gas skill suggestions */
const OG_HARD_SKILLS = [
  'Reservoir Engineering','Drilling Engineer','Completion Engineer','Well Intervention / Workover',
  'Production Engineer','Process Engineer (Upstream)','Process Engineer (Downstream)','Piping Engineer',
  'Pipeline Engineer','Mechanical (Static)','Mechanical (Rotating)','Electrical Engineer',
  'Instrumentation & Control','Automation / DCS / PLC','HSE / HSEQ','QA/QC','Construction',
  'Pre-commissioning / Commissioning','Operations','Maintenance','Reliability','Subsea',
  'Offshore','Onshore','Flow Assurance','SURF','FPSO','LNG','Gas Processing','Refinery',
  'Petrochemical','Corrosion / Cathodic Protection','Welding / NDT','Fabrication','Marine',
  'Procurement','Contracts','Supply Chain / Logistics','Planning / Scheduling (Primavera P6)',
  'Cost Control','Document Control','Project Management'
];

const OG_SOFT_SKILLS = [
  'Safety Mindset (HSE)','Teamwork (Offshore/Onshore)','Communication','Leadership',
  'Problem Solving','Decision Making','Risk Assessment','Time Management',
  'Adaptability (Remote/Shift)','Stakeholder Management'
];

/* =========================================================
   Small UI helpers
========================================================= */
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
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full appearance-none rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 pr-8 text-sm outline-none focus:border-neutral-900 ${className || ''}`}
    >
      {children}
    </select>
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

/* =========================================================
   Helpers
========================================================= */
function safeUUID() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function rangeToText(
  startMonth?: MonthKey, startYear?: number,
  endMonth?: MonthKey, endYear?: number, present?: boolean
) {
  const sm = startMonth ? MONTHS.find(m => m.key === startMonth)?.label : '';
  const em = endMonth ? MONTHS.find(m => m.key === endMonth)?.label : '';
  const s = [sm, startYear || ''].filter(Boolean).join(' ');
  const e = present ? 'Sekarang' : [em, endYear || ''].filter(Boolean).join(' ');
  if (!s && !e) return '';
  if (s && !e) return s;
  if (!s && e) return e;
  return `${s}–${e}`;
}

/* =========================================================
   Experience Editor (tahun ketik)
========================================================= */
function ExperienceEditor({
  items,
  onChange,
}: {
  items: ExpItem[];
  onChange: (v: ExpItem[]) => void;
}) {
  const empty: ExpItem = { id: safeUUID(), title: '', org: '', tag: '', bullets: '', present: false };

  const [draft, setDraft] = useState<ExpItem>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    setDraft({ ...empty, id: safeUUID() });
    setEditingId(null);
  }

  function addOrUpdate() {
    if (!draft.title.trim()) return;
    if (editingId) onChange(items.map(it => (it.id === editingId ? draft : it)));
    else onChange([...items, draft]);
    resetForm();
  }

  function edit(it: ExpItem) {
    setDraft({ ...it });
    setEditingId(it.id);
  }

  function remove(id: string) {
    onChange(items.filter(it => it.id !== id));
    if (editingId === id) resetForm();
  }

  return (
    <div className="space-y-4">
      {/* form */}
      <div className="rounded-xl border border-neutral-200 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Jabatan / Posisi</Label>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Production Engineer / Teknisi Software" />
          </div>
          <div>
            <Label>Organisasi / Perusahaan</Label>
            <Input value={draft.org} onChange={(e) => setDraft({ ...draft, org: e.target.value })} placeholder="PT Oilfield / UKM Robotik" />
          </div>
          <div>
            <Label>Label (opsional)</Label>
            <Input value={draft.tag || ''} onChange={(e) => setDraft({ ...draft, tag: e.target.value })} placeholder="Organisasi / Magang / Full-time" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tahun Mulai</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={draft.startMonth || ''} onChange={(e) => setDraft({ ...draft, startMonth: e.target.value as MonthKey || undefined })}>
                  <option value="">Bulan</option>
                  {MONTHS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </Select>
                <Input
                  inputMode="numeric"
                  pattern="\d{4}"
                  placeholder="2024"
                  value={draft.startYear ?? ''}
                  onChange={(e) => setDraft({ ...draft, startYear: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
            <div>
              <Label>Tahun Selesai</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={draft.present ? '' : (draft.endMonth || '')} onChange={(e) => setDraft({ ...draft, endMonth: (e.target.value as MonthKey) || undefined })} disabled={draft.present}>
                  <option value="">Bulan</option>
                  {MONTHS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </Select>
                <Input
                  inputMode="numeric"
                  pattern="\d{4}"
                  placeholder="2025"
                  value={draft.present ? '' : (draft.endYear ?? '')}
                  onChange={(e) => setDraft({ ...draft, endYear: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={draft.present}
                />
              </div>
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-neutral-700">
                <input type="checkbox" checked={draft.present || false} onChange={(e) => setDraft({ ...draft, present: e.target.checked })} />
                Sampai sekarang
              </label>
            </div>
          </div>

          <div className="md:col-span-2">
            <Label>Deskripsi (1 baris = 1 bullet)</Label>
            <Textarea value={draft.bullets || ''} onChange={(e) => setDraft({ ...draft, bullets: e.target.value })} placeholder={`Contoh:\nMonitoring produksi harian...\nKoordinasi dengan tim operasi offshore...`} rows={4} />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button onClick={addOrUpdate} className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
            {editingId ? 'Simpan Perubahan' : 'Tambah Pengalaman'}
          </button>
          {editingId && (
            <button onClick={resetForm} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50">Batal</button>
          )}
        </div>
      </div>

      {/* list */}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map(it => (
            <li key={it.id} className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">{it.title} {it.org ? <span className="text-neutral-700">· {it.org}</span> : null}</p>
                <p className="text-xs text-neutral-600">{rangeToText(it.startMonth, it.startYear, it.endMonth, it.endYear, it.present)}</p>
              </div>
              <div className="shrink-0 space-x-2">
                <button onClick={() => edit(it)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Edit</button>
                <button onClick={() => remove(it.id)} className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">Hapus</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =========================================================
   Education Editor (tahun ketik)
========================================================= */
function EducationEditor({
  items,
  onChange,
}: {
  items: EduItem[];
  onChange: (v: EduItem[]) => void;
}) {
  const empty: EduItem = { id: safeUUID(), school: '', degree: '', gpa: '', present: false };

  const [draft, setDraft] = useState<EduItem>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    setDraft({ ...empty, id: safeUUID() });
    setEditingId(null);
  }

  function addOrUpdate() {
    if (!draft.school.trim()) return;
    if (editingId) onChange(items.map(it => (it.id === editingId ? draft : it)));
    else onChange([...items, draft]);
    resetForm();
  }

  function edit(it: EduItem) {
    setDraft({ ...it });
    setEditingId(it.id);
  }

  function remove(id: string) {
    onChange(items.filter(it => it.id !== id));
    if (editingId === id) resetForm();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Institusi</Label>
            <Input value={draft.school} onChange={(e) => setDraft({ ...draft, school: e.target.value })} placeholder="Universitas / Politeknik" />
          </div>
          <div>
            <Label>Program / Gelar</Label>
            <Input value={draft.degree || ''} onChange={(e) => setDraft({ ...draft, degree: e.target.value })} placeholder="S1 Teknik Perminyakan" />
          </div>
          <div>
            <Label>IPK</Label>
            <Input value={draft.gpa || ''} onChange={(e) => setDraft({ ...draft, gpa: e.target.value })} placeholder="3.75" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tahun Mulai</Label>
              <Input
                inputMode="numeric"
                pattern="\d{4}"
                placeholder="2021"
                value={draft.startYear ?? ''}
                onChange={(e) => setDraft({ ...draft, startYear: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div>
              <Label>Tahun Selesai</Label>
              <Input
                inputMode="numeric"
                pattern="\d{4}"
                placeholder="2025"
                value={draft.present ? '' : (draft.endYear ?? '')}
                onChange={(e) => setDraft({ ...draft, endYear: e.target.value ? Number(e.target.value) : undefined })}
                disabled={draft.present}
              />
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-neutral-700">
                <input type="checkbox" checked={draft.present || false} onChange={(e) => setDraft({ ...draft, present: e.target.checked })} />
                Sampai sekarang
              </label>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button onClick={addOrUpdate} className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
            {editingId ? 'Simpan Perubahan' : 'Tambah Pendidikan'}
          </button>
          {editingId && (
            <button onClick={resetForm} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50">Batal</button>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map(it => (
            <li key={it.id} className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">{it.school} {it.degree ? <span className="text-neutral-700">· {it.degree}</span> : null}</p>
                <p className="text-xs text-neutral-600">
                  {it.gpa ? `IPK ${it.gpa} · ` : ''}{rangeToText(undefined, it.startYear, undefined, it.endYear, it.present)}
                </p>
              </div>
              <div className="shrink-0 space-x-2">
                <button onClick={() => edit(it)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Edit</button>
                <button onClick={() => remove(it.id)} className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">Hapus</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =========================================================
   PREVIEW building blocks (grid 1fr auto utk tanggal)
========================================================= */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[12.5px] font-semibold tracking-wide text-neutral-800 uppercase">
      {children}
    </h2>
  );
}

function ExpPreview({ items }: { items: ExpItem[] }) {
  if (!items.length) return <p className="text-[13px] text-neutral-700">—</p>;
  return (
    <div className="space-y-4">
      {items.map((it) => {
        const right = rangeToText(it.startMonth, it.startYear, it.endMonth, it.endYear, it.present);
        const bullets = (it.bullets || '').split('\n').map(s => s.trim()).filter(Boolean);
        return (
          <div key={it.id} className="break-inside-avoid">
            <div className="grid grid-cols-[1fr_auto] items-start gap-3">
              <p className="text-[13px] font-semibold text-neutral-900 min-w-0 break-words">
                {it.title}
              </p>
              {right ? (
                <p className="text-[12px] text-neutral-600 whitespace-nowrap tabular-nums justify-self-end">
                  {right}
                </p>
              ) : null}
            </div>
            {(it.org || it.tag) && (
              <p className="mt-0.5 text-[12.5px] text-neutral-700">
                {[it.org, it.tag].filter(Boolean).join(' · ')}
              </p>
            )}
            {bullets.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-[13px] leading-6 text-neutral-800">
                {bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EduPreview({ items }: { items: EduItem[] }) {
  if (!items.length) return <p className="text-[13px] text-neutral-700">—</p>;
  return (
    <div className="space-y-4">
      {items.map((it) => {
        const right = rangeToText(undefined, it.startYear, undefined, it.endYear, it.present);
        return (
          <div key={it.id} className="break-inside-avoid">
            <div className="grid grid-cols-[1fr_auto] items-start gap-3">
              <p className="text-[13px] font-semibold text-neutral-900 min-w-0 break-words">
                {it.school}
              </p>
              {right ? (
                <p className="text-[12px] text-neutral-600 whitespace-nowrap tabular-nums justify-self-end">
                  {right}
                </p>
              ) : null}
            </div>
            {(it.degree || it.gpa) && (
              <p className="mt-0.5 text-[12.5px] text-neutral-700">
                {[it.degree, it.gpa ? `IPK ${it.gpa}` : ''].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================
   Modal Preview + Download PDF (A4 fix & anti terpotong)
========================================================= */
function AtsCvModal({
  onClose,
  data,
}: {
  onClose: () => void;
  data: CvDraft;
}) {
  const hardSkills = (data.hardSkillsCsv || (data.skills?.length ? data.skills.join(', ') : '')).trim();
  const softSkills = (data.softSkillsCsv || '').trim();

  const downloadAsPDF = async () => {
    const el = document.querySelector('.cv-a4') as HTMLElement | null;
    if (!el) return;
    const html2pdf = (await import('html2pdf.js')).default;
    const filenameSafe = (data.name || 'CV_ATS').replace(/\s+/g, '_');

    await html2pdf()
      .set({
        margin: 0, // padding di .cv-a4 sudah jadi margin cetak
        filename: `${filenameSafe}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          scrollX: 0,
          scrollY: 0,
          windowWidth: el.scrollWidth,
          windowHeight: el.scrollHeight,
          letterRendering: true,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(el)
      .save();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 print:hidden" data-modal-chrome onClick={onClose} />
      <div className="relative m-3 w-[min(95vw,900px)] overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Modal chrome */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 print:hidden" data-modal-chrome>
          <div className="text-sm font-medium text-neutral-800">Preview CV</div>
          <div className="flex items-center gap-2">
            <button onClick={downloadAsPDF} className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
              Download PDF
            </button>
            <button onClick={onClose} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">
              Tutup
            </button>
          </div>
        </div>

        {/* A4 content */}
        <div className="cv-scroll max-h-[82vh] overflow-auto p-4 print:p-0">
          <div className="cv-a4 mx-auto bg-white shadow avoid-break">
            {/* HEADER */}
            <header className="px-9 pt-10 pb-4 border-b border-neutral-300">
              <h1 className="text-[18px] font-extrabold tracking-widest uppercase text-neutral-900">
                {data.name || 'Nama Lengkap'}
              </h1>
              <p className="mt-1 text-[12.5px] text-neutral-700">
                {data.location ? `${data.location} | ` : ''}{data.email}{data.phone ? ` | ${data.phone}` : ''}
              </p>
              {data.about && (
                <p className="mt-3 text-[13px] leading-6 text-neutral-800">
                  {data.about}
                </p>
              )}
            </header>

            {/* BODY */}
            <section className="px-9 py-6">
              <section className="mb-5 break-inside-avoid avoid-break">
                <SectionTitle>PENGALAMAN</SectionTitle>
                <ExpPreview items={data.experiences} />
              </section>

              <section className="mb-5 break-inside-avoid avoid-break">
                <SectionTitle>PENDIDIKAN</SectionTitle>
                <EduPreview items={data.educations} />
              </section>

              <section className="mb-5 break-inside-avoid avoid-break">
                <SectionTitle>KEAHLIAN</SectionTitle>
                <div className="space-y-1.5 text-[13px] leading-6 text-neutral-800">
                  <p><span className="font-semibold">Hard Skills</span> : {hardSkills || '—'}</p>
                  <p><span className="font-semibold">Soft Skills</span> : {softSkills || '—'}</p>
                </div>
              </section>
            </section>
          </div>
        </div>
      </div>

      {/* PRINT & A4 CSS */}
      <style jsx global>{`
        /* Box sizing konsisten agar lebar pas */
        .cv-a4, .cv-a4 * { box-sizing: border-box; }

        /* Ukuran A4 persis */
        .cv-a4{
          width: 210mm;
          min-height: 297mm;
          padding: 12mm 14mm; /* ini jadi margin cetak */
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,.06);
        }
        .avoid-break { page-break-inside: avoid; }

        @media print {
          .print\\:hidden,
          [data-modal-chrome],
          body > div[role="dialog"] > div:first-child { display: none !important; }
          .cv-scroll{ max-height: none !important; overflow: visible !important; padding: 0 !important; }
          .cv-a4{
            width: 210mm !important;
            min-height: 297mm !important;
            border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          @page { size: A4; margin: 0; } /* margin 0: pakai padding sebagai margin */
        }
      `}</style>
    </div>
  );
}

/* =========================================================
   MAIN PAGE EXPORT (Hydration Wrapper)
========================================================= */
export default function CreateCvPage() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  if (!hydrated) return null;
  return <CreateCvPageInner />;
}

/* =========================================================
   INNER PAGE (semua hooks di sini, konsisten tiap render)
========================================================= */
function CreateCvPageInner() {
  const { user } = useAuth();
  const router = useRouter();

  const email = user?.email ?? null;
  const notSignedIn = !email;

  // redirect setelah hydrated
  useEffect(() => {
    if (notSignedIn) {
      const id = setTimeout(() => router.replace('/auth/signin'), 50);
      return () => clearTimeout(id);
    }
  }, [notSignedIn, router]);

  // form state (basic)
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [about, setAbout] = useState('');

  // structured
  const [experiences, setExperiences] = useState<ExpItem[]>([]);
  const [educations, setEducations] = useState<EduItem[]>([]);

  // skills
  const [hardSkillsCsv, setHardSkillsCsv] = useState('');
  const [softSkillsCsv, setSoftSkillsCsv] = useState('');
  const [legacySkills, setLegacySkills] = useState<string[]>([]);

  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // auto dismiss toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  // Load draft / prefill
  useEffect(() => {
    if (!email) return;
    try {
      const obj = JSON.parse(localStorage.getItem(LS_DRAFTS_KEY) ?? '{}');
      const draft: CvDraft | undefined = obj[email];
      if (draft) {
        setName(draft.name || '');
        setPhone(draft.phone || '');
        setLocation(draft.location || '');
        setAbout(draft.about || '');
        setExperiences(draft.experiences || []);
        setEducations(draft.educations || []);
        setHardSkillsCsv(draft.hardSkillsCsv || '');
        setSoftSkillsCsv(draft.softSkillsCsv || '');
        setLegacySkills(draft.skills || []);
      } else {
        // Prefill minimal dari Profile lama
        const users = JSON.parse(localStorage.getItem(LS_PROFILE_KEY) ?? '[]') as any[];
        const u = users.find((x) => x.email === email);
        if (u) {
          setName((u.name as string) || '');
          setPhone(u?.profile?.phone ?? '');
          setLocation(u?.profile?.location ?? '');
          setAbout(u?.profile?.about ?? '');
          const arr = String(u?.profile?.skills ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
          setLegacySkills(arr);
          if (!hardSkillsCsv && arr.length) setHardSkillsCsv(arr.join(', '));
        }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  function saveDraft() {
    if (!email) return;
    setBusy(true);
    try {
      const existing = JSON.parse(localStorage.getItem(LS_DRAFTS_KEY) ?? '{}');
      const payload: CvDraft = {
        name,
        email,
        location,
        phone,
        about,
        experiences,
        educations,
        hardSkillsCsv,
        softSkillsCsv,
        skills: legacySkills,
      };
      existing[email] = payload;
      localStorage.setItem(LS_DRAFTS_KEY, JSON.stringify(existing));
      setToast({ type: 'success', message: 'Draft CV tersimpan.' });
    } catch {
      setToast({ type: 'error', message: 'Gagal menyimpan draft.' });
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {
    setName(''); setLocation(''); setPhone(''); setAbout('');
    setExperiences([]); setEducations([]);
    setHardSkillsCsv(''); setSoftSkillsCsv(''); setLegacySkills([]);
  }

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Buat CV (ATS)
          </h1>
        </div>

        {/* Toast */}
        <ToastBanner toast={toast} onClose={() => setToast(null)} />

        {/* Card Basic */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <Label>Nama Lengkap</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" />
            </div>
            <div>
              <Label>Email</Label>
              <Input readOnly value={email ?? ''} className="bg-neutral-100" />
            </div>

            <div className="md:col-span-2">
              <Label>Lokasi</Label>
              <WilayahSelect value={location} onChange={setLocation} />
            </div>

            <div>
              <Label>Nomor HP</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxx" />
            </div>

            <div className="md:col-span-2">
              <Label>Ringkasan (About)</Label>
              <Textarea value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Tuliskan ringkasan singkat (1–3 kalimat)." />
            </div>
          </div>
        </div>

        {/* Card Experience */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-neutral-900">Pengalaman</h3>
          </div>
          <ExperienceEditor items={experiences} onChange={setExperiences} />
        </div>

        {/* Card Education */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-neutral-900">Pendidikan</h3>
          </div>
          <EducationEditor items={educations} onChange={setEducations} />
        </div>

        {/* Card Skills (Oil & Gas) */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold text-neutral-900">Keahlian (Oil & Gas)</h3>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <Label>Hard Skills (CSV)</Label>
              <Input value={hardSkillsCsv} onChange={(e) => setHardSkillsCsv(e.target.value)} placeholder="Reservoir Engineering, Drilling Engineer,..." />
              <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-auto">
                {OG_HARD_SKILLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setHardSkillsCsv(v => {
                      const arr = v.split(',').map(t => t.trim()).filter(Boolean);
                      if (arr.includes(s)) return v;
                      return (v ? v + ', ' : '') + s;
                    })}
                    className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Soft Skills (CSV)</Label>
              <Input value={softSkillsCsv} onChange={(e) => setSoftSkillsCsv(e.target.value)} placeholder="Safety Mindset (HSE), Teamwork (Offshore/Onshore), ..." />
              <div className="mt-2 flex flex-wrap gap-2">
                {OG_SOFT_SKILLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSoftSkillsCsv(v => {
                      const arr = v.split(',').map(t => t.trim()).filter(Boolean);
                      if (arr.includes(s)) return v;
                      return (v ? v + ', ' : '') + s;
                    })}
                    className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview(true)} className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">Preview & Download</button>
          <button onClick={saveDraft} disabled={busy} className="rounded-xl bg-neutral-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Menyimpan…' : 'Simpan Draft'}</button>
          <button onClick={clearAll} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50">Kosongkan Semua</button>
        </div>
      </div>

      {/* Modal Preview */}
      {showPreview && (
        <AtsCvModal
          onClose={() => setShowPreview(false)}
          data={{
            name,
            email: email!,
            location,
            phone,
            about,
            experiences,
            educations,
            hardSkillsCsv,
            softSkillsCsv,
            skills: legacySkills,
          }}
        />
      )}
    </div>
  );
}

/* =========================================================
   Wilayah Select
========================================================= */
type Opt = { id: string; name: string };
function WilayahSelect({
  value,
  onChange,
  labelProv = 'Provinsi',
  labelKab = 'Kabupaten/Kota',
  labelKec = 'Kecamatan',
}: {
  value: string;
  onChange: (v: string) => void;
  labelProv?: string;
  labelKab?: string;
  labelKec?: string;
}) {
  const [provinces, setProvinces] = useState<Opt[]>([]);
  const [regencies, setRegencies] = useState<Opt[]>([]);
  const [districts, setDistricts] = useState<Opt[]>([]);

  const [prov, setProv] = useState<Opt | null>(null);
  const [kab, setKab] = useState<Opt | null>(null);
  const [kec, setKec] = useState<Opt | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/wilayah/provinces');
        const data = await r.json();
        setProvinces(data.items || []);
      } catch { setProvinces([]); }
    })();
  }, []);

  useEffect(() => {
    if (!prov) { setRegencies([]); setKab(null); setDistricts([]); setKec(null); return; }
    (async () => {
      try {
        const r = await fetch(`/api/wilayah/regencies/${prov.id}`);
        const data = await r.json();
        setRegencies(data.items || []); setKab(null); setDistricts([]); setKec(null);
      } catch { setRegencies([]); setKab(null); }
    })();
  }, [prov?.id]);

  useEffect(() => {
    if (!kab) { setDistricts([]); setKec(null); return; }
    (async () => {
      try {
        const r = await fetch(`/api/wilayah/districts/${kab.id}`);
        const data = await r.json();
        setDistricts(data.items || []); setKec(null);
      } catch { setDistricts([]); setKec(null); }
    })();
  }, [kab?.id]);

  useEffect(() => {
    const parts = [kec?.name, kab?.name, prov?.name].filter(Boolean);
    onChange(parts.join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prov, kab, kec]);

  const SelectBox = ({
    value, setValue, options, placeholder, disabled
  }: {
    value: Opt | null;
    setValue: (o: Opt | null) => void;
    options: Opt[];
    placeholder: string;
    disabled?: boolean;
  }) => (
    <div className="relative">
      <select
        value={value?.id || ''}
        onChange={(e) => {
          const val = e.target.value;
          const o = options.find((x) => x.id === val) || null;
          setValue(o);
        }}
        disabled={disabled}
        className="w-full appearance-none rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">▾</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <span className="mb-1 block text-sm text-neutral-700">{labelProv}</span>
          <SelectBox value={prov} setValue={setProv} options={provinces} placeholder="Pilih provinsi…" />
        </div>
        <div>
          <span className="mb-1 block text-sm text-neutral-700">{labelKab}</span>
          <SelectBox value={kab} setValue={setKab} options={regencies} placeholder="Pilih kab/kota…" disabled={!prov} />
        </div>
        <div>
          <span className="mb-1 block text-sm text-neutral-700">{labelKec}</span>
          <SelectBox value={kec} setValue={setKec} options={districts} placeholder="Pilih kecamatan…" disabled={!kab} />
        </div>
      </div>

      {value && (
        <div className="text-xs text-neutral-600">
          Dipilih: <span className="font-medium">{value}</span>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => { setProv(null); setKab(null); setKec(null); onChange('Remote'); }}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          Pilih “Remote”
        </button>
      </div>
    </div>
  );
}
