'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getRateUSDToIDR } from '@/lib/api';

/* ===== Enum sesuai Prisma ===== */
type Sector = 'OIL_GAS' | 'RENEWABLE_ENERGY' | 'UTILITIES' | 'ENGINEERING';
type Status = 'OPEN' | 'PREQUALIFICATION' | 'CLOSED';
type Contract = 'EPC' | 'SUPPLY' | 'CONSULTING' | 'MAINTENANCE';

/* ===== Wilayah dari Emsifa ===== */
type Province = { id: string; name: string };
type Regency  = { id: string; name: string };

type FormState = {
  title: string;
  buyer: string;
  sector: Sector;
  status: Status;
  contract: Contract;
  provinceId: string;     // id provinsi (wajib)
  regencyId: string;      // id kab/kota (wajib)
  budgetIDR: string;      // disimpan sebagai string biar bisa “1.000.000”
  deadline: string;       // yyyy-mm-dd
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
  budgetUSD: number;      // ⬅️ kolom DB; kita isi angka IDR apa adanya
  deadline: string;
  description: string;
  documents?: string[] | null;
  createdAt?: string | null;
  location: string;       // gabungan “Kab/Kota, Provinsi”
};

const PATH_ADMIN_TENDERS = '/admin/tenders';

/* ----------------- helpers kecil ----------------- */
const moneyFmtIDR = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

function unformatIDR(input: string): number {
  // hilangkan semua char non-digit
  const clean = (input || '').replace(/[^\d]/g, '');
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}
function fmtDate(iso?: string) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  } catch { return iso || '-'; }
}

/* ------------------- hooks wilayah ------------------- */
function useProvinces() {
  const [data, setData] = useState<Province[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        setError(null);
        setLoading(true);

        const cached = sessionStorage.getItem('emsifa_provinces_v1');
        if (cached) {
          const parsed: Province[] = JSON.parse(cached);
          if (!gone) setData(parsed);
          return;
        }
        const r = await fetch('https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json');
        if (!r.ok) throw new Error('Gagal memuat provinsi');
        const provinces: Province[] = await r.json();
        if (!gone) {
          setData(provinces);
          sessionStorage.setItem('emsifa_provinces_v1', JSON.stringify(provinces));
        }
      } catch (e: any) {
        if (!gone) setError(e?.message || 'Gagal memuat provinsi');
      } finally {
        if (!gone) setLoading(false);
      }
    })();
    return () => { gone = true; };
  }, []);

  return { data, loading, error };
}

function useRegencies(provinceId?: string) {
  const [data, setData] = useState<Regency[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    (async () => {
      if (!provinceId) {
        setData([]);
        return;
      }
      try {
        setError(null);
        setLoading(true);
        const key = `emsifa_regencies_${provinceId}_v1`;
        const cached = sessionStorage.getItem(key);
        if (cached) {
          const parsed: Regency[] = JSON.parse(cached);
          if (!gone) setData(parsed);
          return;
        }
        const r = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${provinceId}.json`);
        if (!r.ok) throw new Error('Gagal memuat kabupaten/kota');
        const regencies: Regency[] = await r.json();
        if (!gone) {
          setData(regencies);
          sessionStorage.setItem(key, JSON.stringify(regencies));
        }
      } catch (e: any) {
        if (!gone) setError(e?.message || 'Gagal memuat kabupaten/kota');
      } finally {
        if (!gone) setLoading(false);
      }
    })();
    return () => { gone = true; };
  }, [provinceId]);

  return { data, loading, error };
}

/* ================== PAGE ================== */
export default function AdminTendersPage() {
  /* --- kurs (untuk informasi saja) --- */
  const [rate, setRate] = useState<number | null>(null);
  const [rateErr, setRateErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        setRateErr(null);
        const r = await getRateUSDToIDR();
        if (!stop) setRate(r);
      } catch (e: any) {
        if (!stop) setRateErr(e?.message || 'Gagal memuat kurs');
      }
    })();
    return () => { stop = true; };
  }, []);

  /* --- form --- */
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [f, setF] = useState<FormState>({
    title: '',
    buyer: '',
    sector: 'OIL_GAS',
    status: 'OPEN',
    contract: 'EPC',
    provinceId: '',
    regencyId: '',
    budgetIDR: '',
    deadline: new Date().toISOString().slice(0, 10),
    description: '',
    documentsCsv: '',
  });
  const onChange = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF(s => ({ ...s, [k]: v }));

  /* --- wilayah --- */
  const { data: provinces } = useProvinces();
  const { data: regencies } = useRegencies(f.provinceId);

  useEffect(() => {
    // reset kab/kota ketika ganti provinsi
    setF(s => ({ ...s, regencyId: '' }));
  }, [f.provinceId]);

  /* --- list --- */
  const [list, setList] = useState<Tender[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);

  async function fetchList() {
    setLoadingList(true);
    setListErr(null);
    try {
      const res: any = await api(PATH_ADMIN_TENDERS);
      const rows: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.items) ? res.items
        : Array.isArray(res?.data) ? res.data
        : [];
      rows.sort((a, b) => +new Date(b?.createdAt || 0) - +new Date(a?.createdAt || 0));
      setList(rows as Tender[]);
    } catch (e: any) {
      setListErr(e?.message || 'Failed to load tenders');
    } finally {
      setLoadingList(false);
    }
  }
  useEffect(() => { fetchList(); }, []);

  /* --- submit --- */
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

    // nama prov/kab utk lokasi
    const provName = provinces.find(p => p.id === f.provinceId)?.name || '';
    const regName  = regencies.find(r => r.id === f.regencyId)?.name || '';
    const location = [regName, provName].filter(Boolean).join(', ');

    // parse Rupiah → number (disimpan apa adanya sebagai "budgetUSD")
    const idr = unformatIDR(f.budgetIDR);
    const budgetUSD = Math.max(0, Math.round(idr)); // ⬅️ TANPA konversi

    setSaving(true);
    try {
      const payload = {
        title: f.title.trim(),
        buyer: f.buyer.trim(),
        sector: f.sector,
        location,
        status: f.status,
        contract: f.contract,
        budgetUSD, // ⬅️ isinya IDR
        description: f.description.trim(),
        documents: f.documentsCsv.split(',').map(s => s.trim()).filter(Boolean),
        deadline: new Date(f.deadline + 'T00:00:00').toISOString(),
      };
      await api(PATH_ADMIN_TENDERS, { json: payload });
      alert('Tender created!');
      setF(s => ({
        ...s,
        title: '',
        buyer: '',
        budgetIDR: '',
        description: '',
        documentsCsv: '',
      }));
      fetchList();
    } catch (e: any) {
      setErr(e?.message || 'Failed to create tender');
    } finally {
      setSaving(false);
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

  return (
    <div className="space-y-8">
      {/* Header kecil kurs */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Tenders Management</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Buat tender, atur status, unggah dokumen (pisahkan dengan koma), dan lengkapi detail.
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 p-2 text-xs text-neutral-700">
            <div className="font-medium">Kurs aktif</div>
            {rateErr
              ? <div className="text-rose-600">Tidak tersedia • tampil IDR apa adanya</div>
              : <div>{rate ? <>1 USD ≈ {moneyFmtIDR.format(rate)}</> : 'Memuat…'}</div>}
          </div>
        </div>

        {/* form */}
        <form onSubmit={onSubmit} className="mt-6 grid gap-4 max-w-3xl">
          {err && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          )}

          <div className="grid gap-2">
            <label className="text-sm font-medium">Title</label>
            <input
              value={f.title}
              onChange={e => onChange('title', e.target.value)}
              className="rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Owner</label>
            <input
              value={f.buyer}
              onChange={e => onChange('buyer', e.target.value)}
              className="rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Sector</label>
              <select
                value={f.sector}
                onChange={e => onChange('sector', e.target.value as Sector)}
                className="rounded-xl border px-3 py-2"
              >
                <option value="OIL_GAS">OIL_GAS</option>
                <option value="RENEWABLE_ENERGY">RENEWABLE_ENERGY</option>
                <option value="UTILITIES">UTILITIES</option>
                <option value="ENGINEERING">ENGINEERING</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Provinsi</label>
              <select
                value={f.provinceId}
                onChange={e => onChange('provinceId', e.target.value)}
                className="rounded-xl border px-3 py-2"
              >
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

          {/* Nilai proyek */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nilai Proyek (IDR)</label>
              <input
                value={f.budgetIDR}
                onChange={e => onChange('budgetIDR', e.target.value)}
                placeholder="contoh: 1.000.000"
                className="rounded-xl border px-3 py-2"
              />
              <p className="text-xs text-neutral-500">
                Disimpan ke database **sebagai IDR** (tanpa konversi).
              </p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Deadline</label>
              <input
                type="date"
                value={f.deadline}
                onChange={e => onChange('deadline', e.target.value)}
                className="rounded-xl border px-3 py-2"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={f.description}
              onChange={e => onChange('description', e.target.value)}
              className="min-h-32 rounded-xl border px-3 py-2"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Documents (comma separated)</label>
            <input
              value={f.documentsCsv}
              onChange={e => onChange('documentsCsv', e.target.value)}
              className="rounded-xl border px-3 py-2"
              placeholder="RFP.pdf, BoQ.xlsx"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-neutral-900 px-4 py-2.5 text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Existing Tenders</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">
              {rate ? `Kurs aktif: 1 USD ≈ ${moneyFmtIDR.format(rate)} • Tampil IDR asli` : 'Memuat kurs…'}
            </span>
            <button
              onClick={fetchList}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {listErr && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {listErr}
          </div>
        )}

        {loadingList ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-600">
            Loading…
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-600">
            No tenders yet.
          </div>
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
                {list.map(r => {
                  const idr = Math.max(0, Number(r.budgetUSD || 0)); // ⬅️ tampilkan angka IDR apa adanya
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <Td className="font-medium">{r.title}</Td>
                      <Td>{r.buyer}</Td>
                      <Td>{r.sector}</Td>
                      <Td>{r.status}</Td>
                      <Td>{r.contract}</Td>
                      <Td>{moneyFmtIDR.format(idr)}</Td>
                      <Td>{fmtDate(r.deadline)}</Td>
                      <Td className="text-right">
                        <button
                          onClick={() => onDelete(r.id)}
                          className="rounded-lg border border-red-500 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                          title="Delete tender"
                        >
                          Delete
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- kecil2 ---- */
function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-xs uppercase tracking-wide text-neutral-500 ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}
