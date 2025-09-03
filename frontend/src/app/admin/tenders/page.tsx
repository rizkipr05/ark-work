'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

/* ===== Enum harus sama persis dengan backend (Prisma) ===== */
type Sector = 'OIL_GAS' | 'RENEWABLE_ENERGY' | 'UTILITIES';
type Status = 'OPEN' | 'PREQUALIFICATION' | 'CLOSED';
type Contract = 'EPC' | 'SUPPLY' | 'CONSULTING' | 'MAINTENANCE';

/* ---------- Regions ---------- */
const REGIONS = [
  'Sumatra',
  'Jawa',
  'Kalimantan',
  'Sulawesi',
  'Papua',
  'Maluku',
  'Bali & Nusa Tenggara',
  'Luar Negeri',
  'OTHER', // tampil sebagai "Other (ketik manual)"
] as const;
type RegionOption = (typeof REGIONS)[number];

type FormState = {
  title: string;
  buyer: string;
  sector: Sector;
  status: Status;
  contract: Contract;
  region: RegionOption;      // UI dropdown
  regionOther: string;       // diisi ketika region === 'OTHER'
  budgetUSD: number;         // label tampil "Project Value (USD)"
  deadline: string;          // yyyy-mm-dd
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
  budgetUSD: number;
  deadline: string; // ISO
  description: string;
  documents?: string[];
  createdAt?: string;
};

const PATH_ADMIN_TENDERS = '/admin/tenders';

export default function AdminTendersPage() {
  /* ---------- Create form state ---------- */
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [f, setF] = useState<FormState>({
    title: '',
    buyer: '',
    sector: 'OIL_GAS',
    status: 'OPEN',
    contract: 'EPC',
    region: 'Jawa',
    regionOther: '',
    budgetUSD: 0,
    deadline: new Date().toISOString().slice(0, 10),
    description: '',
    documentsCsv: '',
  });
  const onChange = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setF((s) => ({ ...s, [key]: val }));

  /* ---------- List & actions ---------- */
  const [list, setList] = useState<Tender[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);

  const moneyFmt = useMemo(
    () => new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
    []
  );

  async function fetchList() {
    setLoadingList(true);
    setListErr(null);
    try {
      const res: any = await api(PATH_ADMIN_TENDERS, { method: 'GET' });
      const rows: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.data)
        ? res.data
        : [];
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    // tentukan nilai "location" yang akan dikirim ke backend
    const effectiveLocation =
      f.region === 'OTHER' ? (f.regionOther || '').trim() : f.region;

    if (!effectiveLocation) {
      setErr('Mohon isi wilayah terlebih dahulu.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: f.title.trim(),
        buyer: f.buyer.trim(),
        sector: f.sector,
        location: effectiveLocation, // <— dikirim sebagai "location"
        status: f.status,
        contract: f.contract,
        budgetUSD: Number(f.budgetUSD) || 0,
        description: f.description.trim(),
        documents: f.documentsCsv.split(',').map((s) => s.trim()).filter(Boolean),
        deadline: new Date(f.deadline + 'T00:00:00').toISOString(),
      };

      await api(PATH_ADMIN_TENDERS, { json: payload });
      alert('Tender created!');
      setF((s) => ({
        ...s,
        title: '',
        buyer: '',
        description: '',
        documentsCsv: '',
        region: 'Jawa',
        regionOther: '',
        budgetUSD: 0,
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
      setList((rows) => rows.filter((r) => r.id !== id));
    } catch (e: any) {
      alert(e?.message || 'Failed to delete tender');
    }
  }

  const needOther = f.region === 'OTHER';

  return (
    <div className="space-y-8">
      {/* ======= Create Form ======= */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Tenders Management</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Create tender, set status, upload docs (comma separated), and assign details.
        </p>

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
              </select>
            </div>

            {/* Region (Wilayah) */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Region / Wilayah</label>
              <select
                value={f.region}
                onChange={(e) => onChange('region', e.target.value as RegionOption)}
                className="rounded-xl border px-3 py-2"
              >
                {REGIONS.map((r) =>
                  r === 'OTHER' ? (
                    <option key={r} value={r}>Other (ketik manual)</option>
                  ) : (
                    <option key={r} value={r}>{r}</option>
                  )
                )}
              </select>
            </div>
          </div>

          {/* Input manual untuk Other */}
          {needOther && (
            <div className="grid gap-2">
              <label className="text-sm font-medium">Wilayah (manual)</label>
              <input
                value={f.regionOther}
                onChange={(e) => onChange('regionOther', e.target.value)}
                placeholder="Contoh: Timur Tengah, Eropa, Amerika, dsb."
                className="rounded-xl border px-3 py-2"
                required
              />
              <p className="text-xs text-neutral-500">
                Isi jika memilih &ldquo;Other&rdquo; di atas.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="grid gap-2">
              <label className="text-sm font-medium">Contract</label>
              <select
                value={f.contract}
                onChange={(e) => onChange('contract', e.target.value as Contract)}
                className="rounded-xl border px-3 py-2"
              >
                <option value="EPC">EPC</option>
                <option value="SUPPLY">SUPPLY</option>
                <option value="CONSULTING">CONSULTING</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Project Value (USD)</label>
              <input
                type="number"
                value={f.budgetUSD}
                onChange={(e) => onChange('budgetUSD', Number(e.target.value))}
                className="rounded-xl border px-3 py-2"
                min={0}
              />
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

      {/* ======= List & Delete ======= */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Existing Tenders</h3>
          <button
            onClick={fetchList}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Refresh
          </button>
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
                  <Th>Project Value</Th>
                  <Th>Deadline</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <Td className="font-medium">{r.title}</Td>
                    <Td>{r.buyer}</Td>
                    <Td>{r.sector}</Td>
                    <Td>{r.status}</Td>
                    <Td>{r.contract}</Td>
                    <Td>{moneyFmt.format(r.budgetUSD || 0)}</Td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- small UI helpers ---------- */
function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-xs uppercase tracking-wide text-neutral-500 ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}
function fmtDate(iso?: string) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}
