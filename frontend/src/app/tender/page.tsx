'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';

/* ---------------- Server base ---------------- */
const API =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

/* ---------------- Kurs & formatter ---------------- */
type DisplayCurrency = 'IDR' | 'USD';
const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtIDR = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

async function getRateUSDToIDR(): Promise<number> {
  const base = API.replace(/\/+$/, '');
  const r = await fetch(`${base}/api/rates?base=USD&symbols=IDR`, { cache: 'no-store', credentials: 'include' });
  if (!r.ok) throw new Error('Rate API error');
  const j = await r.json();
  const rate = Number(j?.rate);
  if (!Number.isFinite(rate)) throw new Error('Invalid rate');
  return rate;
}

/* ---------------- Contracts map (labeling + filter options) ---------------- */
const CONTRACT_LABELS: Record<string, string> = {
  EPC: 'EPC',
  PSC: 'PSC (Production Sharing Contract)',
  SERVICE_CONTRACT: 'Service Contract',
  SERVICE: 'Service Contract',
  JOC: 'Joint Operating Contract (JOC)',
  TURNKEY: 'Turnkey',
  MAINTENANCE: 'Maintenance',
  SUPPLY: 'Supply',
  LOGISTICS: 'Logistics',
  CONSULTING: 'Consulting / Technical Assistance',
  DRILLING: 'Drilling',
  O_M: 'O&M (Operation & Maintenance)',
  // add more if backend adds new enum keys
};

const CONTRACT_OPTIONS = ['', ...Object.values(CONTRACT_LABELS)];

/* ---------------- Types (DTO dari backend) ---------------- */
type TenderDTO = {
  id: number | string;
  title: string;
  buyer: string;
  sector: 'OIL_GAS' | 'RENEWABLE_ENERGY' | 'UTILITIES' | 'ENGINEERING';
  location: string;
  status: 'OPEN' | 'PREQUALIFICATION' | 'CLOSED';
  contract: string;                 // fleksibel
  budgetUSD: number | string | null; // backend may send bigint as string
  deadline: string | null;          // ISO or null
  description: string | null;
  documents?: string[] | null;
  createdAt?: string | null;
};

/* ---------------- Types (UI) ---------------- */
type SectorUI = 'Oil & Gas' | 'Renewable Energy' | 'Utilities' | 'Engineering';
type StatusUI = 'Open' | 'Prequalification' | 'Closed';
type ContractUI = string;

type Tender = {
  id: number | string;
  title: string;
  company: string;
  location: string;
  sector: SectorUI;
  status: StatusUI;
  contract: ContractUI;    // label-friendly
  budgetIDR: string;       // normalized as string of integer (no formatting) — safe for large ints
  deadline: string;        // YYYY-MM-DD or ''
  description: string;
  documents: string[];
  created: string;         // YYYY-MM-DD or ''
};

/* ---------------- Helpers ---------------- */
function toYmd(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch { return ''; }
}
function adaptSector(s: TenderDTO['sector']): SectorUI {
  switch (s) {
    case 'OIL_GAS': return 'Oil & Gas';
    case 'RENEWABLE_ENERGY': return 'Renewable Energy';
    case 'UTILITIES': return 'Utilities';
    case 'ENGINEERING': return 'Engineering';
    default: return 'Engineering';
  }
}
function adaptStatus(s: TenderDTO['status']): StatusUI {
  switch (s) {
    case 'OPEN': return 'Open';
    case 'PREQUALIFICATION': return 'Prequalification';
    case 'CLOSED': return 'Closed';
    default: return 'Open';
  }
}
function adaptContract(raw: string | undefined | null): ContractUI {
  if (!raw) return '';
  if (CONTRACT_LABELS[raw]) return CONTRACT_LABELS[raw];
  // fallback: prettify
  return raw.replace(/[_\-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
}

/** Normalize whatever backend sends for budget into a digits-only string (no decimals) */
function normalizeBudgetToString(b: number | string | null | undefined): string {
  if (b === null || b === undefined) return '0';
  if (typeof b === 'number') {
    // safe if within Number range
    return String(Math.max(0, Math.round(b)));
  }
  // string (could be "12345" or "9007199254740993" from DB)
  const s = String(b).trim();
  // if it contains non-digit, strip non-digits
  const cleaned = s.replace(/[^\d\-]/g, '') || '0';
  // ensure positive
  const pos = cleaned.startsWith('-') ? cleaned.slice(1) : cleaned;
  return pos || '0';
}

/** format numeric string with thousands separator (dot) and prefix Rp */
function formatIdrFromStringDigits(digits: string): string {
  const s = digits.replace(/^0+/, '') || '0';
  // insert dots every 3 from right
  const negative = s.startsWith('-');
  const num = negative ? s.slice(1) : s;
  const parts: string[] = [];
  for (let i = num.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    parts.unshift(num.slice(start, i));
  }
  return `Rp ${parts.join('.')}`;
}

/* ---------------- Normalizers ---------------- */
function normalizeServer(list: TenderDTO[]): Tender[] {
  return (list || []).map((r) => {
    const budgetStr = normalizeBudgetToString(r.budgetUSD);
    return {
      id: r.id,
      title: r.title,
      company: r.buyer,
      location: r.location || 'Indonesia',
      sector: adaptSector(r.sector),
      status: adaptStatus(r.status),
      contract: adaptContract(r.contract),
      budgetIDR: budgetStr,
      deadline: toYmd(r.deadline || undefined),
      description: r.description || '',
      documents: Array.isArray(r.documents) ? r.documents : [],
      created: toYmd(r.createdAt || r.deadline || undefined),
    };
  });
}

/* ---------------- Page ---------------- */
export default function TendersLikeJobsPage() {
  const locale = useLocale?.() ?? 'en';

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  // filters
  const [filters, setFilters] = useState({
    q: '',
    loc: '',
    sector: '',
    status: '',
    contract: '',
  });

  // saved
  const [saved, setSaved] = useState<Array<string | number>>([]);

  // drawer + detail
  const [drawer, setDrawer] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTender, setDetailTender] = useState<Tender | null>(null);

  // currency
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('IDR');
  const [rateUSDtoIDR, setRateUSDtoIDR] = useState<number | null>(null);
  const [rateErr, setRateErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        setRateErr(null);
        const r = await getRateUSDToIDR();
        if (!stop) setRateUSDtoIDR(r);
      } catch (e: any) {
        if (!stop) setRateErr(e?.message || 'Failed to load rate');
      }
    })();
    return () => { stop = true; };
  }, []);

  // load dari server
  useEffect(() => {
    (async () => {
      try {
        setLoadErr(null);
        const base = API.replace(/\/+$/, '');
        const res = await fetch(`${base}/api/tenders`, { credentials: 'include' });
        if (!res.ok) {
          // try parse body message
          let msg = `HTTP ${res.status}`;
          try {
            const j = await res.json();
            if (j?.message) msg += ` • ${j.message}`;
            else if (j?.error) msg += ` • ${j.error}`;
          } catch {}
          throw new Error(msg);
        }
        const j = await res.json().catch(() => null);
        const arr: TenderDTO[] = Array.isArray(j) ? j
          : Array.isArray(j?.data) ? j.data
          : Array.isArray(j?.items) ? j.items
          : [];
        const mapped = normalizeServer(arr);
        const sorted = mapped.sort((a, b) =>
          sort === 'newest'
            ? (new Date(b.created || '1970-01-01').getTime() - new Date(a.created || '1970-01-01').getTime())
            : (new Date(a.created || '1970-01-01').getTime() - new Date(b.created || '1970-01-01').getTime())
        );
        setTenders(sorted);
      } catch (e: any) {
        console.error('[Tenders] load error:', e);
        setLoadErr(e?.message || 'Gagal memuat data');
        setTenders([]);
      }

      // load saved
      try {
        setSaved(JSON.parse(localStorage.getItem('ark_saved_tenders') ?? '[]'));
      } catch {}
    })();
  }, [sort]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: '2-digit' }),
    [locale]
  );

  const items = useMemo(() => {
    const k = filters.q.toLowerCase();
    const loc = filters.loc.toLowerCase();

    const arr = tenders.filter((t) => {
      const okQ = k === '' || t.title.toLowerCase().includes(k) || (t.company || '').toLowerCase().includes(k);
      const okLoc = loc === '' || t.location.toLowerCase().includes(loc);
      const okSector = filters.sector === '' || t.sector === (filters.sector as SectorUI);
      const okStatus = filters.status === '' || t.status === (filters.status as StatusUI);
      const okContract = filters.contract === '' || t.contract === filters.contract;
      return okQ && okLoc && okSector && okStatus && okContract;
    });

    arr.sort((a, b) =>
      sort === 'newest'
        ? new Date(b.created || '1970-01-01').getTime() - new Date(a.created || '1970-01-01').getTime()
        : new Date(a.created || '1970-01-01').getTime() - new Date(b.created || '1970-01-01').getTime()
    );

    return arr;
  }, [tenders, filters, sort]);

  const fmtDate = (ymd: string) => {
    try {
      if (!ymd) return '-';
      const d = new Date(ymd);
      return isNaN(d.getTime()) ? ymd : dateFmt.format(d);
    } catch {
      return ymd || '-';
    }
  };

  // treat nilai server as IDR (string digits)
  const fmtMoney = (budgetDigits: string) => {
    const digits = budgetDigits || '0';
    if (displayCurrency === 'USD') {
      const rate = rateUSDtoIDR ?? 15000;
      // convert approximate: use Number if safe, otherwise divide using BigInt fallback (approx)
      const n = Number(digits);
      if (Number.isFinite(n)) return fmtUSD.format(Math.round(n / rate));
      // fallback: show huge value as IDR if cannot convert
      return formatIdrFromStringDigits(digits);
    }
    // IDR display
    // If digits length is small enough, use Intl; else use manual formatting
    if (digits.length <= 15) {
      const n = Number(digits);
      if (!Number.isNaN(n)) return fmtIDR.format(n);
    }
    return formatIdrFromStringDigits(digits);
  };

  const toggleSave = (id: number | string) => {
    const next = saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id];
    setSaved(next);
    localStorage.setItem('ark_saved_tenders', JSON.stringify(next));
  };

  const clearFilters = () =>
    setFilters({ q: '', loc: '', sector: '', status: '', contract: '' });

  function openDetail(t: Tender) {
    setDetailTender(t);
    setDetailOpen(true);
  }

  function participateSelected(sel: Tender | null) {
    if (!sel) return;
    alert(`Anda berminat mengikuti: ${sel.title}`);
    setDetailOpen(false);
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-neutral-900">Public Tenders</h1>
              <p className="text-neutral-600">Cari tender terbaru dan ikuti sesuai bidangmu.</p>
              {loadErr && (
                <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {loadErr}
                </div>
              )}
            </div>

            {/* Search + Sort + Mobile filter */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <input
                  value={filters.q}
                  onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))}
                  placeholder="Cari judul atau pemilik tender…"
                  className="w-full sm:w-80 rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-neutral-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600">Urutkan</label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="newest">Terbaru</option>
                  <option value="oldest">Terlama</option>
                </select>
              </div>

              <button
                onClick={() => setDrawer(true)}
                className="sm:hidden inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <FilterIcon className="h-4 w-4" /> Filter
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-8 grid lg:grid-cols-12 gap-6">
        {/* Sidebar filters (desktop) */}
        <aside className="hidden lg:col-span-3 lg:block">
          <FilterCard>
            {/* Currency switch */}
            <div className="mb-1 flex items-center justify-between rounded-xl border border-neutral-200 p-2">
              <div className="text-sm">
                <div className="font-medium text-neutral-800">Currency</div>
                <div className="text-xs text-neutral-500">
                  {rateErr
                    ? 'Rate unavailable'
                    : displayCurrency === 'IDR'
                      ? `Kurs aktif: 1 USD ≈ ${rateUSDtoIDR ? fmtIDR.format(rateUSDtoIDR) : '…'}`
                      : 'Tampilan USD'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDisplayCurrency('IDR')}
                  className={`px-2 py-1 rounded-lg text-xs ${displayCurrency === 'IDR' ? 'bg-neutral-900 text-white' : 'bg-neutral-100'}`}
                >
                  IDR
                </button>
                <button
                  onClick={() => setDisplayCurrency('USD')}
                  className={`px-2 py-1 rounded-lg text-xs ${displayCurrency === 'USD' ? 'bg-neutral-900 text-white' : 'bg-neutral-100'}`}
                >
                  USD
                </button>
              </div>
            </div>

            <FilterInput
              label="Lokasi"
              value={filters.loc}
              onChange={(v) => setFilters((s) => ({ ...s, loc: v }))}
              icon={<PinIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label="Sektor"
              value={filters.sector}
              onChange={(v) => setFilters((s) => ({ ...s, sector: v }))}
              options={['', 'Oil & Gas', 'Renewable Energy', 'Utilities', 'Engineering']}
              icon={<LayersIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => setFilters((s) => ({ ...s, status: v }))}
              options={['', 'Open', 'Prequalification', 'Closed']}
              icon={<FlagIcon className="h-4 w-4" />}
            />
            <FilterSelect
              label="Kontrak"
              value={filters.contract}
              onChange={(v) => setFilters((s) => ({ ...s, contract: v }))}
              options={CONTRACT_OPTIONS}
              icon={<BriefcaseIcon className="h-4 w-4" />}
            />

            <div className="pt-3 flex items-center justify-between">
              <span className="text-sm text-neutral-500">
                {items.length} hasil
              </span>
              <button onClick={clearFilters} className="text-sm text-blue-700 hover:underline">
                Reset
              </button>
            </div>
          </FilterCard>
        </aside>

        {/* List */}
        <section className="lg:col-span-9 space-y-4">
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            items.map((t) => (
              <article
                key={t.id}
                onClick={() => openDetail(t)}
                className="group cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex gap-4">
                  <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-amber-400 grid place-items-center overflow-hidden text-white text-sm font-bold">
                    {initials(t.company || 'AW')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base md:text-lg font-semibold text-neutral-900">
                          {t.title}
                        </h3>
                        <p className="text-sm text-neutral-600 truncate">{t.company}</p>
                      </div>
                      <span className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
                        Detail
                      </span>
                    </div>

                    {/* meta row */}
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-6 gap-2 text-[13px]">
                      <Meta icon={<PinIcon className="h-4 w-4" />} text={t.location} />
                      <Meta icon={<LayersIcon className="h-4 w-4" />} text={t.sector} />
                      <Meta icon={<BriefcaseIcon className="h-4 w-4" />} text={t.contract} />
                      <Meta icon={<FlagIcon className="h-4 w-4" />} text={t.status} />
                      <Meta icon={<CalendarIcon className="h-4 w-4" />} text={`Deadline ${fmtDate(t.deadline)}`} />
                      <Meta icon={<MoneyIcon className="h-4 w-4" />} text={fmtMoney(t.budgetIDR)} />
                    </div>

                    <p className="mt-3 line-clamp-2 text-sm text-neutral-600">{t.description}</p>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-neutral-500">
                        Diposting: {fmtDate(t.created)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSave(t.id);
                        }}
                        className={[
                          'rounded-lg border px-2.5 py-1 text-xs transition',
                          saved.includes(t.id)
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50',
                        ].join(' ')}
                      >
                        {saved.includes(t.id) ? 'Tersimpan' : 'Simpan'}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      {/* Drawer (mobile filters) */}
      {drawer && (
        <Drawer onClose={() => setDrawer(false)} title="Filter">
          <div className="space-y-3">
            {/* Currency switch (mobile) */}
            <div className="mb-1 flex items-center justify-between rounded-xl border border-neutral-200 p-2">
              <div className="text-sm">
                <div className="font-medium text-neutral-800">Currency</div>
                <div className="text-xs text-neutral-500">
                  {rateErr
                    ? 'Rate unavailable'
                    : displayCurrency === 'IDR'
                      ? `Kurs aktif: 1 USD ≈ ${rateUSDtoIDR ? fmtIDR.format(rateUSDtoIDR) : '…'}`
                      : 'Tampilan USD'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setDisplayCurrency('IDR')} className={`px-2 py-1 rounded-lg text-xs ${displayCurrency==='IDR' ? 'bg-neutral-900 text-white' : 'bg-neutral-100'}`}>IDR</button>
                <button onClick={() => setDisplayCurrency('USD')} className={`px-2 py-1 rounded-lg text-xs ${displayCurrency==='USD' ? 'bg-neutral-900 text-white' : 'bg-neutral-100'}`}>USD</button>
              </div>
            </div>

            <FilterInput label="Lokasi" value={filters.loc} onChange={(v)=>setFilters(s=>({...s,loc:v}))} icon={<PinIcon className="h-4 w-4"/>}/>
            <FilterSelect label="Sektor" value={filters.sector} onChange={(v)=>setFilters(s=>({...s,sector:v}))} options={['','Oil & Gas','Renewable Energy','Utilities','Engineering']} icon={<LayersIcon className="h-4 w-4"/>}/>
            <FilterSelect label="Status" value={filters.status} onChange={(v)=>setFilters(s=>({...s,status:v}))} options={['','Open','Prequalification','Closed']} icon={<FlagIcon className="h-4 w-4"/>}/>
            <FilterSelect label="Kontrak" value={filters.contract} onChange={(v)=>setFilters(s=>({...s,contract:v}))} options={CONTRACT_OPTIONS} icon={<BriefcaseIcon className="h-4 w-4"/>}/>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-sm text-neutral-500">{items.length} hasil</span>
              <button onClick={clearFilters} className="text-sm text-blue-700 hover:underline">Reset</button>
            </div>
          </div>
        </Drawer>
      )}

      {/* Detail Modal */}
      {detailOpen && detailTender && (
        <DetailModal
          tender={detailTender}
          onClose={() => setDetailOpen(false)}
          onParticipate={() => participateSelected(detailTender)}
          postedText={fmtDate(detailTender.created)}
          money={(n) => fmtMoney(n)}
          dateFmt={(ymd) => fmtDate(ymd)}
        />
      )}
    </div>
  );
}

/* ---------------- UI helpers & small components ---------------- */
function FilterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 sticky top-24">
      <div className="mb-2 text-sm font-semibold text-neutral-900">Filter</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function FilterInput({ label, value, onChange, icon }: { label: string; value: string; onChange: (v: string) => void; icon?: React.ReactNode; }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">{icon}</span>
        <input value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-neutral-400" placeholder={`Cari ${label.toLowerCase()}…`} />
      </div>
    </label>
  );
}
function FilterSelect({ label, value, onChange, options, icon }: { label: string; value: string; onChange: (v: string) => void; options: string[]; icon?: React.ReactNode; }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">{icon}</span>
        <select value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-neutral-400">
          {options.map(o => (<option key={o || 'all'} value={o}>{o || `Semua ${label}`}</option>))}
        </select>
      </div>
    </label>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1">
      <span className="text-neutral-600">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

/* --------- Detail Modal --------- */
function DetailModal({ tender, onClose, onParticipate, money, dateFmt, postedText }: { tender: Tender; onClose: ()=>void; onParticipate: ()=>void; money: (n: string)=>string; dateFmt: (ymd: string)=>string; postedText: string; }) {
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 backdrop-blur-[2px] bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-[0_15px_70px_-15px_rgba(0,0,0,0.5)]">
          {/* Header */}
          <div className="px-6 pt-6 pb-3 border-b border-slate-200">
            <div className="flex justify-center mb-3">
              <AvatarLogo name={tender.company} size={64} />
            </div>
            <h2 className="text-center text-lg font-semibold text-slate-900">Detail Tender</h2>
            <p className="mt-1 text-center text-sm text-slate-600">Diposting: {postedText}</p>
          </div>

          {/* Body */}
          <div className="max-h-[65vh] overflow-auto px-6 py-5 space-y-5">
            <div>
              <div className="text-xl font-bold text-slate-900">{tender.title}</div>
              <div className="text-sm text-slate-600">{tender.company}</div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <InfoRow label="Lokasi" value={tender.location} />
              <InfoRow label="Sektor" value={tender.sector} />
              <InfoRow label="Kontrak" value={tender.contract} />
              <InfoRow label="Status" value={tender.status} />
              <InfoRow label="Deadline" value={dateFmt(tender.deadline)} />
              <InfoRow label="Nilai Proyek" value={money(tender.budgetIDR)} />
            </div>

            <Section title="Deskripsi">
              <RichText text={tender.description || '-'} />
            </Section>

            <Section title="Dokumen">
              {tender.documents.length === 0 ? (
                <div className="text-sm text-slate-600">Tidak ada dokumen.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tender.documents.map((d) => {
                    const isUrl = /^https?:\/\//i.test(d);
                    return isUrl ? (
                      <a key={d} href={d} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-blue-700 underline" title={d}>
                        PDF / Link
                      </a>
                    ) : (
                      <span key={d} className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs" title={d}>
                        {d}
                      </span>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Tutup</button>
            <button onClick={onParticipate} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Ikuti Tender</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Small building blocks ---------- */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800">{children}</div>
    </section>
  );
}
function RichText({ text }: { text: string }) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const isList = lines.some(l => l.startsWith('- ') || l.startsWith('• '));
  if (isList) {
    const items = lines.map(l => l.replace(/^[-•]\s?/, '')).filter(Boolean);
    return (<ul className="list-disc pl-5 space-y-1">{items.map((it, idx) => <li key={idx}>{it}</li>)}</ul>);
  }
  return (<div className="space-y-2">{text.split('\n').map((p,i)=>(<p key={i}>{p}</p>))}</div>);
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

/* Drawer & Empty */
function Drawer({ children, onClose, title }: { children: React.ReactNode; onClose: ()=>void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-[85%] max-w-xs bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 h-12">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-200"><CloseIcon className="h-5 w-5"/></button>
        </div>
        <div className="p-3 space-y-3">{children}</div>
      </div>
    </div>
  );
}
function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-neutral-100 grid place-items-center">
        <SearchIcon className="h-6 w-6 text-neutral-600" />
      </div>
      <h3 className="font-semibold text-neutral-900">Tidak ada tender</h3>
      <p className="mt-1 text-sm text-neutral-600">Coba ubah filter atau kata kunci.</p>
    </div>
  );
}

/* Icons (local, no external libs) */
function SearchIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
function PinIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M12 22s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="2"/></svg>); }
function LayersIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M12 3l8 4-8 4-8-4 8-4z" stroke="currentColor" strokeWidth="2"/><path d="M4 11l8 4 8-4" stroke="currentColor" strokeWidth="2"/><path d="M4 15l8 4 8-4" stroke="currentColor" strokeWidth="2"/></svg>); }
function BriefcaseIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2"/><path d="M3 12h18" stroke="currentColor" strokeWidth="2"/></svg>); }
function MoneyIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M7 9h0M17 15h0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
function CalendarIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
function FlagIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M5 4v16M6 4h11l-2 4h-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
function PaperIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V7l-5-5Z" stroke="currentColor" strokeWidth="2"/><path d="M14 2v5h5M9 13h6M9 17h4M9 9h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
function FilterIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M4 6h16M6 12h12M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
function CloseIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }

/* Utils */
function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length <= 1) return (parts[0] || 'AW').slice(0,2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function AvatarLogo({ name, size = 64 }: { name?: string; size?: number }) {
  return (
    <div className="grid place-items-center rounded-full overflow-hidden bg-gradient-to-tr from-blue-600 via-blue-500 to-amber-400 text-white font-bold"
      style={{ width: size, height: size }} aria-label="Company logo">
      <span className="select-none text-xl">{initials(name || 'AW')}</span>
    </div>
  );
}
