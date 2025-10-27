'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getRateUSDToIDR } from '@/lib/api';

/* ===== Enum sesuai Prisma ===== */
type Sector = 'OIL_GAS' | 'RENEWABLE_ENERGY' | 'UTILITIES' | 'ENGINEERING';
type Status = 'OPEN' | 'PREQUALIFICATION' | 'CLOSED';
type Contract =
  | 'EPC'
  | 'SUPPLY'
  | 'CONSULTING'
  | 'MAINTENANCE'
  | 'PSC'
  | 'SERVICE'
  | 'JOC'
  | 'TURNKEY'
  | 'LOGISTICS'
  | 'DRILLING'
  | 'O_M';

/* ===== Wilayah Emsifa ===== */
type Province = { id: string; name: string };
type Regency = { id: string; name: string };

type FormState = {
  title: string;
  buyer: string;
  sector: Sector;
  status: Status;
  contract: Contract;
  provinceId: string;
  regencyId: string;
  budgetIDR: string;
  deadline: string; // yyyy-mm-dd
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
  budgetUSD: number; // disimpan angka IDR apa adanya
  deadline: string; // ISO
  description: string;
  documents?: string[] | null;
  createdAt?: string | null;
  location: string;
};

// ==========================================================
//  PERUBAHAN UTAMA DI SINI
//  Path API harus diawali /api/ agar tidak bentrok dengan halaman
// ==========================================================
const PATH_ADMIN_TENDERS = '/api/admin/tenders';
// ==========================================================


/* ----------------- helpers kecil ----------------- */
const moneyFmtIDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function unformatIDR(input: string): number {
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
  } catch {
    return iso || '-';
  }
}
function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
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
    return () => {
      gone = true;
    };
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
        const r = await fetch(
          `https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${provinceId}.json`,
        );
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
    return () => {
      gone = true;
    };
  }, [provinceId]);

  return { data, loading, error };
}

/* ================== PAGE ================== */
export default function AdminTendersPage() {
  /* --- kurs (informasi) --- */
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
    return () => {
      stop = true;
    };
  }, []);

  /* --- form create --- */
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
    deadline: ymdToday(),
    description: '',
    documentsCsv: '',
  });
  const onChange = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  /* --- wilayah --- */
  const { data: provinces } = useProvinces();
  const { data: regencies } = useRegencies(f.provinceId);

  useEffect(() => {
    // reset kab/kota ketika ganti provinsi
    setF((s) => ({ ...s, regencyId: '' }));
  }, [f.provinceId]);

  /* --- list & edit --- */
  const [list, setList] = useState<Tender[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Tender | null>(null);

  async function fetchList() {
    setLoadingList(true);
    setListErr(null);
    try {
      // Memanggil path API yang benar
      const res: any = await api(PATH_ADMIN_TENDERS);
      const rows: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.items) // Kompatibel jika backend kirim { items: [...] }
        ? res.items
        : Array.isArray(res?.data)
        ? res.data
        : [];
      
      // Backend (admin-tenders.ts) seharusnya sudah mengurutkan by createdAt desc
      // Tapi kita urutkan lagi di sini untuk jaga-jaga
      rows.sort((a, b) => +new Date(b?.createdAt || 0) - +new Date(a?.createdAt || 0));
      setList(rows as Tender[]);
    } catch (e: any) {
      setListErr(e?.message || 'Failed to load tenders');
    } finally {
      setLoadingList(false);
    }
  }
  useEffect(() => {
    fetchList();
  }, []);

  /* --- submit create --- */
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

    // lokasi
    const provName = provinces.find((p) => p.id === f.provinceId)?.name || '';
    const regName = regencies.find((r) => r.id === f.regencyId)?.name || '';
    const location = [regName, provName].filter(Boolean).join(', ');

    // budget: simpan IDR apa adanya ke kolom budgetUSD
    const idr = unformatIDR(f.budgetIDR);
    const budgetUSD = Math.max(0, Math.round(idr));

    setSaving(true);
    try {
      const payload = {
        title: f.title.trim(),
        buyer: f.buyer.trim(),
        sector: f.sector,
        location,
        status: f.status,
        contract: f.contract,
        budgetUSD, // isinya IDR (sebagai number)
        description: f.description.trim(),
        documents: f.documentsCsv.split(',').map((s) => s.trim()).filter(Boolean),
        deadline: new Date(f.deadline + 'T00:00:00').toISOString(),
      };
      
      // Memanggil path API yang benar
      await api(PATH_ADMIN_TENDERS, { json: payload }); // Method default adalah POST
      
      alert('Tender created!');
      setF((s) => ({
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
      // Memanggil path API yang benar
      await api(`${PATH_ADMIN_TENDERS}/${id}`, { method: 'DELETE', expectJson: false });
      setList((rows) => rows.filter((r) => r.id !== id));
    } catch (e: any) {
      alert(e?.message || 'Failed to delete tender');
    }
  }

  const contractOptions: Contract[] = useMemo(
    () => ['EPC', 'SUPPLY', 'CONSULTING', 'MAINTENANCE', 'PSC', 'SERVICE', 'JOC', 'TURNKEY', 'LOGISTICS', 'DRILLING', 'O_M'],
    [],
  );

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
            {rateErr ? (
              <div className="text-rose-600">Tidak tersedia • tampil IDR apa adanya</div>
            ) : (
              <div>{rate ? <>1 USD ≈ {moneyFmtIDR.format(rate)}</> : 'Memuat…'}</div>
            )}
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
              onChange={(e) => onChange('title', e.target.value)}
              className="rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Owner</label>
            <input
              value={f.buyer}
              onChange={(e) => onChange('buyer', e.target.value)}
              className="rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Sector</label>
              <select
                value={f.sector}
                onChange={(e) => onChange('sector', e.target.value as Sector)}
                className="rounded-xl border px-3 py-2"
              >
                <option value="OIL_GAS">OIL_GAS</option>
                <option value="RENEWABLE_ENERGY">RENEWABLE_ENERGY</option>
                <option value="UTILITIES">UTILITIES</option>
                <option value="ENGINEERING">ENGINEERING</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Status</label>
              <select
                value={f.status}
                onChange={(e) => onChange('status', e.target.value as Status)}
                className="rounded-xl border px-3 py-2"
              >
                <option value="OPEN">OPEN</option>
                <option value="PREQUALIFICATION">PREQUALIFICATION</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Contract</label>
              <select
                value={f.contract}
                onChange={(e) => onChange('contract', e.target.value as Contract)}
                className="rounded-xl border px-3 py-2"
              >
                {contractOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Provinsi</label>
              <select
                value={f.provinceId}
                onChange={(e) => onChange('provinceId', e.target.value)}
                className="rounded-xl border px-3 py-2"
              >
                <option value="" disabled>
                  Pilih provinsi…
                </option>
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Kabupaten / Kota</label>
            <select
              value={f.regencyId}
              onChange={(e) => onChange('regencyId', e.target.value)}
              className="rounded-xl border px-3 py-2"
              disabled={!f.provinceId}
              required
            >
              <option value="" disabled>
                {f.provinceId ? 'Pilih kabupaten/kota…' : 'Pilih provinsi dulu'}
              </option>
              {regencies.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-neutral-500">Pilih provinsi terlebih dahulu untuk memuat kabupaten/kota.</p>
          </div>

          {/* Nilai proyek */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nilai Proyek (IDR)</label>
              <input
                value={f.budgetIDR}
                onChange={(e) => onChange('budgetIDR', formatIDRLive(e.target.value))}
                placeholder="contoh: 1.000.000"
                className="rounded-xl border px-3 py-2"
                inputMode="numeric"
              />
              <p className="text-xs text-neutral-500">Disimpan ke database sebagai IDR (tanpa konversi).</p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Deadline</label>
              <input
                type="date"
                value={f.deadline}
                onChange={(e) => onChange('deadline', e.target.value)}
                className="rounded-xl border px-3 py-2"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={f.description}
              onChange={(e) => onChange('description', e.target.value)}
              className="min-h-32 rounded-xl border px-3 py-2"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Documents (comma separated)</label>
            <input
              value={f.documentsCsv}
              onChange={(e) => onChange('documentsCsv', e.target.value)}
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
                {list.map((r) => {
                  const idr = Math.max(0, Number(r.budgetUSD || 0)); // tampilkan IDR apa adanya
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <Td className="font-medium">{r.title}</Td>
                      <Td>{r.buyer}</Td>
                      <Td>{r.sector}</Td>
                      <Td>{r.status}</Td>
                      <Td>{r.contract}</Td>
                      <Td>{moneyFmtIDR.format(idr)}</Td>
                      <Td>{fmtDate(r.deadline)}</Td>
                      <Td className="text-right space-x-2">
                        <button
                          onClick={() => setEditing(r)}
                          className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50"
                          title="Edit"
                        >
                          Edit
                        </button>
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

      {/* Modal edit — hanya render saat editing ada */}
      {editing && (
        <EditTenderModal
          data={editing!}
          onClose={() => setEditing(null)}
          onUpdated={fetchList}
          contractOptions={contractOptions}
        />
      )}
    </div>
  );
}

/* ------------ Edit Modal (data: Tender NON-NULLABLE) ------------ */
function EditTenderModal({
  data,
  onClose,
  onUpdated,
  contractOptions,
}: {
  data: Tender; // <<— BUKAN nullable
  onClose: () => void;
  onUpdated: () => void;
  contractOptions: Contract[];
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState(data.title);
  const [buyer, setBuyer] = useState(data.buyer);
  const [sector, setSector] = useState<Sector>(data.sector);
  const [status, setStatus] = useState<Status>(data.status);
  const [contract, setContract] = useState<Contract>(data.contract);
  const [location, setLocation] = useState(data.location);
  const [budgetIDR, setBudgetIDR] = useState<string>(formatIDRLive(String(data.budgetUSD || '')));
  const [deadline, setDeadline] = useState<string>(toYMD(data.deadline));
  const [description, setDescription] = useState(data.description || '');
  const [documentsCsv, setDocumentsCsv] = useState((data.documents || []).join(', '));

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!title.trim() || !buyer.trim()) {
      setErr('Mohon isi Title dan Owner.');
      return;
    }
    const idr = unformatIDR(budgetIDR);
    const payload = {
      title: title.trim(),
      buyer: buyer.trim(),
      sector,
      status,
      contract,
      location: location.trim(),
      budgetUSD: Math.max(0, Math.round(idr)), // tetap IDR (sebagai number)
      deadline: new Date(deadline + 'T00:00:00').toISOString(),
      description: description.trim(),
      documents: documentsCsv.split(',').map((s) => s.trim()).filter(Boolean),
    };

    setSaving(true);
    try {
      // Memanggil path API yang benar dengan method: 'PUT'
      await api(`${PATH_ADMIN_TENDERS}/${data.id}`, { method: 'PUT', json: payload, expectJson: false });
      
      onClose();
      onUpdated();
    } catch (e: any) {
      setErr(e?.message || 'Failed to update tender');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* sheet */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl h-[90vh] rounded-2xl bg-white shadow-2xl flex flex-col">
          {/* header */}
          <div className="shrink-0 px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-neutral-900">Edit Tender</h3>
            <button
              onClick={onClose}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Close
            </button>
          </div>

          {/* body scrollable */}
          <form onSubmit={onSave} className="grow overflow-y-auto px-6 py-5 space-y-4">
            {err && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {err}
              </div>
            )}

            <div className="grid gap-2">
              <label className="text-sm font-medium">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl border px-3 py-2" />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Owner</label>
              <input value={buyer} onChange={(e) => setBuyer(e.target.value)} className="rounded-xl border px-3 py-2" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Sector</label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value as Sector)}
                  className="rounded-xl border px-3 py-2"
                >
                  <option value="OIL_GAS">OIL_GAS</option>
                  <option value="RENEWABLE_ENERGY">RENEWABLE_ENERGY</option>
                  <option value="UTILITIES">UTILITIES</option>
                  <option value="ENGINEERING">ENGINEERING</option>
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                  className="rounded-xl border px-3 py-2"
                >
                  <option value="OPEN">OPEN</option>
                  <option value="PREQUALIFICATION">PREQUALIFICATION</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Contract</label>
                <select
                  value={contract}
                  onChange={(e) => setContract(e.target.value as Contract)}
                  className="rounded-xl border px-3 py-2"
                >
                  {contractOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Deadline</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="rounded-xl border px-3 py-2"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="Kab/Kota, Provinsi"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Nilai Proyek (IDR)</label>
              <input
                value={budgetIDR}
                onChange={(e) => setBudgetIDR(formatIDRLive(e.target.value))}
                className="rounded-xl border px-3 py-2"
                inputMode="numeric"
              />
              <p className="text-xs text-neutral-500">Tersimpan sebagai IDR (tanpa konversi).</p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-32 rounded-xl border px-3 py-2"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Documents (comma separated)</label>
              <input
                value={documentsCsv}
                onChange={(e) => setDocumentsCsv(e.target.value)}
                className="rounded-xl border px-3 py-2"
              />
            </div>
          </form>

          {/* footer fixed */}
          <div className="shrink-0 px-6 py-4 border-t border-neutral-200 flex items-center justify-end gap-3">
            <button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50">
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
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

/* ---- util untuk modal ---- */
function toYMD(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return ymdToday();
  }
}
/** live formatter: "1000000" -> "1.000.000" (hanya digit) */
function formatIDRLive(input: string) {
  const digits = (input || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  const parts = [];
  for (let i = digits.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    parts.unshift(digits.slice(start, i));
  }
  return parts.join('.');
}