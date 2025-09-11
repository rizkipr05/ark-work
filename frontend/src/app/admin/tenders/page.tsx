'use client';

import { useEffect, useState } from 'react';
import { api, getRateUSDToIDR as getRate } from '@/lib/api'; // sesuaikan import jika beda path

/* ===== Enum sesuai Prisma ===== */
type Sector = 'OIL_GAS' | 'RENEWABLE_ENERGY' | 'UTILITIES' | 'ENGINEERING';
type Status = 'OPEN' | 'PREQUALIFICATION' | 'CLOSED';
type Contract =
  | 'EPC'
  | 'PSC'
  | 'SERVICE'
  | 'JOC'
  | 'TURNKEY'
  | 'MAINTENANCE'
  | 'SUPPLY'
  | 'LOGISTICS'
  | 'CONSULTING'
  | 'DRILLING'
  | 'O_M';

type Province = { id: string; name: string };
type Regency  = { id: string; name: string };

type FormState = {
  title: string;
  buyer: string;
  sector: Sector;
  status: Status;
  contract: Contract;
  provinceId: string;
  regencyId: string;
  budgetIDR: string; // formatted input (with separators)
  deadline: string;
  description: string;
  documentsCsv: string;
};

type Tender = {
  id: number;
  title: string;
  buyer: string;
  sector: Sector;
  status: Status;
  contract: Contract;
  budgetUSD: number | string | null; // server may return string for bigints
  deadline: string | null;
  description: string;
  documents?: string[] | null;
  createdAt?: string | null;
  location: string;
};

const PATH_ADMIN_TENDERS = '/admin/tenders';

/* ---------- utilities ---------- */
const moneyIDR = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

function unformatDigits(s: string) {
  return (s || '').replace(/[^\d-]/g, '');
}

function formatWithSeparator(numStr: string) {
  // numStr: digits only
  const n = numStr.replace(/^0+/, '') || '0';
  // insert dots every 3 from right
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatInputIDRDisplay(raw: string) {
  const clean = unformatDigits(raw);
  if (clean === '') return '';
  return formatWithSeparator(clean);
}

function formatServerBudget(val: number | string | null): string {
  if (val == null) return moneyIDR.format(0);
  if (typeof val === 'number') return moneyIDR.format(val);
  // string (bigint-as-string or digits)
  const digits = val.replace(/[^\d-]/g, '');
  // if too large to Number safely, format manually
  try {
    const n = Number(digits);
    if (Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) return moneyIDR.format(n);
  } catch {}
  // fallback: manual thousand separator, prefix Rp
  return 'Rp ' + formatWithSeparator(digits);
}

/* Contract label mapping */
const CONTRACT_OPTIONS: Array<{ value: Contract; label: string }> = [
  { value: 'EPC', label: 'EPC' },
  { value: 'PSC', label: 'PSC (Production Sharing Contract)' },
  { value: 'SERVICE', label: 'Service Contract' },
  { value: 'JOC', label: 'Joint Operating Contract (JOC)' },
  { value: 'TURNKEY', label: 'Turnkey' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'SUPPLY', label: 'Supply' },
  { value: 'LOGISTICS', label: 'Logistics' },
  { value: 'CONSULTING', label: 'Consulting / Technical Assistance' },
  { value: 'DRILLING', label: 'Drilling' },
  { value: 'O_M', label: 'O&M (Operation & Maintenance)' },
];

/* ---------------- hooks wilayah (sama seperti Anda) ---------------- */
function useProvinces() {
  const [data, setData] = useState<Province[]>([]);
  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const cached = sessionStorage.getItem('emsifa_provinces_v1');
        if (cached) {
          const parsed: Province[] = JSON.parse(cached);
          if (!gone) setData(parsed);
          return;
        }
        const r = await fetch('https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json');
        const provinces: Province[] = await r.json();
        if (!gone) {
          setData(provinces);
          sessionStorage.setItem('emsifa_provinces_v1', JSON.stringify(provinces));
        }
      } catch {}
    })();
    return () => { gone = true; };
  }, []);
  return { data };
}
function useRegencies(provinceId?: string) {
  const [data, setData] = useState<Regency[]>([]);
  useEffect(() => {
    let gone = false;
    (async () => {
      if (!provinceId) { setData([]); return; }
      try {
        const key = `emsifa_regencies_${provinceId}_v1`;
        const cached = sessionStorage.getItem(key);
        if (cached) {
          const parsed: Regency[] = JSON.parse(cached);
          if (!gone) setData(parsed);
          return;
        }
        const r = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${provinceId}.json`);
        const regencies: Regency[] = await r.json();
        if (!gone) {
          setData(regencies);
          sessionStorage.setItem(key, JSON.stringify(regencies));
        }
      } catch {}
    })();
    return () => { gone = true; };
  }, [provinceId]);
  return { data };
}

/* ---------------- PAGE ---------------- */
export default function AdminTendersPage() {
  const [rate, setRate] = useState<number | null>(null);
  const [rateErr, setRateErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        setRateErr(null);
        const r = await getRate();
        if (!stop) setRate(r);
      } catch (e: any) {
        if (!stop) setRateErr(e?.message || 'Gagal memuat kurs');
      }
    })();
    return () => { stop = true; };
  }, []);

  /* form */
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [f, setF] = useState<FormState>({
    title: '',
    buyer: '',
    sector: 'OIL_GAS',
    status: 'OPEN',
    contract: 'EPC',
    provinceId: '',
    regencyId: '',
    budgetIDR: '',
    deadline: new Date().toISOString().slice(0,10),
    description: '',
    documentsCsv: '',
  });
  const onChange = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(s => ({ ...s, [k]: v }));

  /* wilayah */
  const { data: provinces } = useProvinces();
  const { data: regencies } = useRegencies(f.provinceId);
  useEffect(() => { setF(s => ({ ...s, regencyId: '' })); }, [f.provinceId]);

  /* list */
  const [list, setList] = useState<Tender[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);

  async function fetchList() {
    setLoadingList(true);
    setListErr(null);
    try {
      const res: any = await api(PATH_ADMIN_TENDERS);
      const rows: any[] = Array.isArray(res) ? res
        : Array.isArray(res?.items) ? res.items
        : Array.isArray(res?.data) ? res.data
        : [];
      rows.sort((a,b) => +new Date(b?.createdAt||0) - +new Date(a?.createdAt||0));
      setList(rows as Tender[]);
    } catch (e: any) {
      setListErr(e?.message || 'Failed to load tenders');
    } finally {
      setLoadingList(false);
    }
  }
  useEffect(() => { fetchList(); }, []);

  /* Submit (create or update) */
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!f.title.trim() || !f.buyer.trim()) {
      setErr('Mohon isi Title dan Owner.');
      return;
    }
    if (!f.provinceId || !f.regencyId) {
      setErr('Mohon pilih Provinsi dan Kabupaten/Kota.');
      return;
    }

    const provName = provinces.find(p => p.id === f.provinceId)?.name || '';
    const regName  = regencies.find(r => r.id === f.regencyId)?.name || '';
    const location = [regName, provName].filter(Boolean).join(', ');

    // ambil angka dari formatted input
    const digits = unformatDigits(f.budgetIDR);
    const budgetUSDpayload = digits === '' ? 0 : Number(digits); // backend akan ubah ke BigInt

    setSaving(true);
    try {
      const payload = {
        title: f.title.trim(),
        buyer: f.buyer.trim(),
        sector: f.sector,
        status: f.status,
        contract: f.contract,
        location,
        budgetUSD: budgetUSDpayload, // number or 0
        deadline: new Date(f.deadline + 'T00:00:00').toISOString(),
        description: f.description.trim(),
        documents: f.documentsCsv.split(',').map(s => s.trim()).filter(Boolean),
      };

      if (editingId) {
        await api(`${PATH_ADMIN_TENDERS}/${editingId}`, { method: 'PATCH', json: payload });
        setEditingId(null);
        alert('Tender updated!');
      } else {
        await api(PATH_ADMIN_TENDERS, { json: payload });
        alert('Tender created!');
      }

      setF(s => ({ ...s, title: '', buyer: '', budgetIDR: '', description: '', documentsCsv: '' }));
      fetchList();
    } catch (e: any) {
      setErr(e?.message || 'Failed to save tender');
    } finally {
      setSaving(false);
    }
  }

  async function onEditLoad(id: number) {
    try {
      const res: any = await api(`${PATH_ADMIN_TENDERS}/${id}`);
      // res is sanitized: budgetUSD maybe string or number, deadline iso string
      setEditingId(id);
      setF(s => ({
        ...s,
        title: res.title || '',
        buyer: res.buyer || '',
        sector: res.sector || 'OIL_GAS',
        status: res.status || 'OPEN',
        contract: res.contract || 'EPC',
        provinceId: '', // cannot infer province/regency from location easily; keep blank
        regencyId: '',
        budgetIDR: res.budgetUSD ? formatServerBudget(res.budgetUSD).replace(/[^\d]/g,'') && (() => {
          // We want input with separators: if server returns string digits -> format
          const digits = String(res.budgetUSD).replace(/[^\d]/g,'');
          return formatWithSeparator(digits);
        })() : '',
        deadline: res.deadline ? res.deadline.slice(0,10) : new Date().toISOString().slice(0,10),
        description: res.description || '',
        documentsCsv: Array.isArray(res.documents) ? res.documents.join(', ') : (res.documents || '').toString(),
      }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e:any) {
      alert('Failed to load tender for edit');
    }
  }

  async function onDelete(id: number) {
    const ok = confirm('Delete this tender? This action cannot be undone.');
    if (!ok) return;
    try {
      await api(`${PATH_ADMIN_TENDERS}/${id}`, { method: 'DELETE', expectJson: false });
      setList(rows => rows.filter(r => r.id !== id));
    } catch (e: any) {
      alert(e?.message || 'Failed to delete tender');
    }
  }

  /* input handler untuk budget supaya ada separator saat mengetik */
  function onBudgetInputChange(v: string) {
    const formatted = formatInputIDRDisplay(v);
    onChange('budgetIDR', formatted);
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Tenders Management</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Buat atau edit tender — pilih kontrak, upload link PDF (comma separated), dan simpan.
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 p-2 text-xs text-neutral-700">
            <div className="font-medium">Kurs aktif</div>
            {rateErr ? <div className="text-rose-600">Tidak tersedia • tampil IDR apa adanya</div>
              : <div>{rate ? <>1 USD ≈ {moneyIDR.format(rate)}</> : 'Memuat…'}</div>}
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-6 grid gap-4 max-w-3xl">
          {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

          <div className="grid gap-2">
            <label className="text-sm font-medium">Title</label>
            <input value={f.title} onChange={e => onChange('title', e.target.value)} className="rounded-xl border px-3 py-2" required />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Owner</label>
            <input value={f.buyer} onChange={e => onChange('buyer', e.target.value)} className="rounded-xl border px-3 py-2" required />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Sector</label>
              <select value={f.sector} onChange={e => onChange('sector', e.target.value as Sector)} className="rounded-xl border px-3 py-2">
                <option value="OIL_GAS">OIL_GAS</option>
                <option value="RENEWABLE_ENERGY">RENEWABLE_ENERGY</option>
                <option value="UTILITIES">UTILITIES</option>
                <option value="ENGINEERING">ENGINEERING</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Provinsi</label>
              <select value={f.provinceId} onChange={e => onChange('provinceId', e.target.value)} className="rounded-xl border px-3 py-2">
                <option value="" disabled>Pilih provinsi…</option>
                {provinces.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Kabupaten / Kota</label>
            <select
              value={f.regencyId}
              onChange={e => onChange('regencyId', e.target.value)}
              className="rounded-xl border px-3 py-2"
              disabled={!f.provinceId}
              required
            >
              <option value="" disabled>{f.provinceId ? 'Pilih kabupaten/kota…' : 'Pilih provinsi dulu'}</option>
              {regencies.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <p className="text-xs text-neutral-500">Pilih provinsi terlebih dahulu untuk memuat kabupaten/kota.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Status</label>
              <select value={f.status} onChange={e => onChange('status', e.target.value as Status)} className="rounded-xl border px-3 py-2">
                <option value="OPEN">OPEN</option>
                <option value="PREQUALIFICATION">PREQUALIFICATION</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Contract</label>
              <select value={f.contract} onChange={e => onChange('contract', e.target.value as Contract)} className="rounded-xl border px-3 py-2">
                {CONTRACT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nilai Proyek (IDR)</label>
              <input
                value={f.budgetIDR}
                onChange={e => onBudgetInputChange(e.target.value)}
                placeholder="contoh: 1.000.000"
                className="rounded-xl border px-3 py-2"
              />
              <p className="text-xs text-neutral-500">Disimpan ke database <b>sebagai IDR</b> (tanpa konversi).</p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Deadline</label>
              <input type="date" value={f.deadline} onChange={e => onChange('deadline', e.target.value)} className="rounded-xl border px-3 py-2" />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Description</label>
            <textarea value={f.description} onChange={e => onChange('description', e.target.value)} className="min-h-32 rounded-xl border px-3 py-2" />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Documents (comma separated URLs)</label>
            <input
              value={f.documentsCsv}
              onChange={e => onChange('documentsCsv', e.target.value)}
              className="rounded-xl border px-3 py-2"
              placeholder="https://.../RFP.pdf, https://.../BoQ.xlsx"
            />
            <p className="text-xs text-neutral-500">Masukkan link PDF/URL dipisah koma. Pada tampilan user akan muncul link yang bisa diklik.</p>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-neutral-900 px-4 py-2.5 text-white hover:opacity-90 disabled:opacity-60">
              {saving ? (editingId ? 'Updating…' : 'Creating…') : (editingId ? 'Update' : 'Create')}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setF(s => ({ ...s, title:'', buyer:'', budgetIDR:'', description:'', documentsCsv:'' })); }} className="ml-3 rounded-xl border px-4 py-2 text-sm">
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Existing Tenders</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">
              {rate ? `Kurs aktif: 1 USD ≈ ${moneyIDR.format(rate)} • Tampil IDR asli` : 'Memuat kurs…'}
            </span>
            <button onClick={fetchList} className="rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">Refresh</button>
          </div>
        </div>

        {listErr && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{listErr}</div>}

        {loadingList ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-600">Loading…</div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-600">No tenders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-neutral-50 text-left">
                  <Th>Title</Th>
                  <Th>Buyer</Th>
                  <Th>Sector</Th>
                  <Th>Status</Th>
                  <Th>Contract</Th>
                  <Th>Project Value (IDR)</Th>
                  <Th>Deadline</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <Td className="font-medium">{r.title}</Td>
                    <Td>{r.buyer}</Td>
                    <Td>{r.sector}</Td>
                    <Td>{r.status}</Td>
                    <Td>{CONTRACT_OPTIONS.find(c => c.value === r.contract)?.label || r.contract}</Td>
                    <Td>{formatServerBudget(r.budgetUSD ?? 0)}</Td>
                    <Td>{r.deadline ? new Date(r.deadline).toLocaleDateString() : '-'}</Td>
                    <Td className="text-right">
                      <button onClick={() => onEditLoad(r.id)} className="mr-2 rounded-lg border px-2.5 py-1 text-xs">Edit</button>
                      <button onClick={() => onDelete(r.id)} className="rounded-lg border border-red-500 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* small UI helpers */
function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-xs uppercase tracking-wide text-neutral-500 ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}
