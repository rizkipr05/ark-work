"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { listenJobsUpdated } from "@/lib/jobsSync"; // ⬅️ NEW: gunakan listener util
import type { ReportDialogProps } from "../admin/(protected)/reports/ReportDialog";

/* ---------------- Server base ---------------- */
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "");

/* -------- Report Dialog (dynamic supaya bukan RSC) -------- */
const ReportDialog = dynamic<ReportDialogProps>(
  () => import("../admin/(protected)/reports/ReportDialog"),
  { ssr: false }
);



/* ---------------- Types ---------------- */
type JobDTO = {
  id: string;
  title: string;
  location: string;
  employment: string;
  description: string;
  postedAt: string; // ISO
  company: string;
  logoUrl: string | null;
  isActive: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  requirements?: string | null;
};

type Job = {
  id: string;
  title: string;
  location: string;
  industry: "Oil & Gas" | "Renewable Energy" | "Mining";
  contract: "Full-time" | "Contract" | "Part-time";
  function: "Engineering" | "Operations" | "Management";
  remote: "On-site" | "Remote" | "Hybrid";
  posted: string; // ISO
  description: string;
  company?: string;
  logo?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  requirements?: string | null;
  experience?: "0-1" | "1-3" | "3-5" | "5+" | "Any";
  education?: "SMA/SMK" | "D3" | "S1" | "S2" | "S3" | "Any";
};

/* ---------- Helpers ---------- */
function isoStore(iso?: string): string {
  try { return new Date(iso ?? Date.now()).toISOString(); } catch { return iso || ""; }
}
function sortByPosted(a: Job, b: Job, newest = true) {
  const da = Date.parse(a.posted), db = Date.parse(b.posted);
  return newest ? db - da : da - db;
}
function mapContractFromServer(e: string): Job["contract"] {
  const v = (e || "").toLowerCase();
  if (v.includes("part")) return "Part-time";
  if (v.includes("contract")) return "Contract";
  return "Full-time";
}
function mapFunctionFromTextServer(j: JobDTO): Job["function"] {
  const txt = `${j.title} ${j.description ?? ""}`.toLowerCase();
  if (/\b(manager|lead|head|director|pm)\b/.test(txt)) return "Management";
  if (/\b(operator|technician|maintenance|operations?)\b/.test(txt)) return "Operations";
  return "Engineering";
}
function mapRemoteFromServer(location: string, title?: string, desc?: string): Job["remote"] {
  const lc = `${location} ${title ?? ""} ${desc ?? ""}`.toLowerCase();
  if (/\bremote\b/.test(lc)) return "Remote";
  if (/\bhybrid\b/.test(lc)) return "Hybrid";
  return "On-site";
}
function inferExpFromText(text?: string | null): Job["experience"] {
  const t = (text || "").toLowerCase();
  const range = t.match(/(\d+)\s*[-–]\s*(\d+)\s*(tahun|thn|year|years|yrs?)\b/);
  if (range) {
    const [min, max] = [+range[1], +range[2]];
    if (min <= 0 && max <= 1) return "0-1";
    if (min <= 1 && max <= 3) return "1-3";
    if (min <= 3 && max <= 5) return "3-5";
    return "5+";
  }
  const minOnly = t.match(/\b(min(?:imal)?|>=?)\s*(\d+)\s*(tahun|thn|years?|yrs?)\b/);
  if (minOnly) {
    const m = +minOnly[2];
    if (m <= 1) return "0-1";
    if (m <= 3) return "1-3";
    if (m <= 5) return "3-5";
    return "5+";
  }
  const plus = t.match(/(\d+)\s*\+\s*(tahun|thn|years?|yrs?)\b/);
  if (plus) {
    const m = +plus[1];
    if (m <= 1) return "0-1";
    if (m <= 3) return "1-3";
    if (m <= 5) return "3-5";
    return "5+";
  }
  if (/\b(fresh\s*grad|lulusan\s*baru|entry[-\s]*level)\b/.test(t)) return "0-1";
  return "Any";
}
function inferEduFromText(text?: string | null): Job["education"] {
  const t = (text || "").toLowerCase();
  if (/\b(s3|phd|doktor)\b/.test(t)) return "S3";
  if (/\b(s2|master|magister|m\.?sc|m\.?eng)\b/.test(t)) return "S2";
  if (/\b(s1|sarjana|bachelor|strata\s*1|b\.?sc|b\.?eng)\b/.test(t)) return "S1";
  if (/\b(d3|diploma\s*3)\b/.test(t)) return "D3";
  if (/\b(sma|smk|smu|slta|high\s*school)\b/.test(t)) return "SMA/SMK";
  return "Any";
}
function normalizeServer(arr: JobDTO[]): Job[] {
  return (arr || [])
    .filter((j) => j.isActive !== false)
    .map((j) => {
      const baseTxt = `${j.title} ${j.requirements ?? ""} ${j.description ?? ""}`;
      return {
        id: String(j.id),
        title: j.title,
        company: j.company,
        location: j.location || "Indonesia",
        industry: "Oil & Gas",
        contract: mapContractFromServer(j.employment),
        function: mapFunctionFromTextServer(j),
        remote: mapRemoteFromServer(j.location, j.title, j.description),
        posted: isoStore(j.postedAt),
        description: j.description || "",
        logo: j.logoUrl || null,
        salaryMin: j.salaryMin ?? null,
        salaryMax: j.salaryMax ?? null,
        currency: j.currency ?? null,
        requirements: j.requirements ?? null,
        experience: inferExpFromText(baseTxt),
        education: inferEduFromText(baseTxt),
      } as Job;
    });
}

/* ------------ Formatters ------------ */
function formatMoney(n?: number | null, curr: string = "IDR") {
  if (n == null || Number.isNaN(n)) return "";
  try {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: curr }).format(n);
  } catch {
    return `${curr} ${Number(n).toLocaleString("id-ID")}`;
  }
}
function formatSalary(min?: number | null, max?: number | null, curr?: string | null) {
  const c = curr || "IDR";
  if (min == null && max == null) return "";
  if (min != null && max != null) return `${formatMoney(min, c)} – ${formatMoney(max, c)}`;
  if (min != null) return `≥ ${formatMoney(min, c)}`;
  if (max != null) return `≤ ${formatMoney(max, c)}`;
  return "";
}

/* ---------------- Helpers: auth ---------------- */
async function getCurrentUserId(): Promise<string | null> {
  const base = (API_BASE || "").replace(/\/+$/, "");
  if (!base) return null;
  try {
    const r = await fetch(`${base}/auth/me`, { credentials: "include" });
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({} as any));
    const id: string | undefined = j?.user?.id || j?.data?.user?.id || j?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

/* ---------------- Page: JOBS ---------------- */
export default function JobsPage() {
  const t = useTranslations("jobs");
  const locale = useLocale();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [filters, setFilters] = useState({ q: "", loc: "", industry: "", contract: "", func: "", remote: "", exp: "", edu: "" });
  const [saved, setSaved] = useState<string[]>([]);
  const [applied, setApplied] = useState<string[]>([]);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [drawer, setDrawer] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<Job | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [jobToReport, setJobToReport] = useState<Job | null>(null); // Ganti reportDefaults
  
  // CV states
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // toast
  const [toast, setToast] = useState<{type:"ok"|"err"; msg:string}|null>(null);
  const hideToastRef = useRef<number | null>(null);
  const showToast = (type:"ok"|"err", msg:string) => {
    setToast({ type, msg });
    if (hideToastRef.current) window.clearTimeout(hideToastRef.current);
    hideToastRef.current = window.setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => () => { if (hideToastRef.current) window.clearTimeout(hideToastRef.current); }, []);

  // sinkron user id dari cookie server → localStorage
  useEffect(() => {
    (async () => {
      const userIdFromCookie = await getCurrentUserId();
      if (userIdFromCookie) {
        try {
          if (localStorage.getItem("ark_current") !== userIdFromCookie) {
            localStorage.setItem("ark_current", userIdFromCookie);
            window.dispatchEvent(new Event("storage"));
          }
        } catch {}
      }
    })();
  }, []);

  const refreshAppliedForCurrent = () => {
    try {
      const cur = localStorage.getItem("ark_current");
      if (!cur) return setApplied([]);
      const apps = JSON.parse(localStorage.getItem("ark_apps") ?? "{}");
      const arr: { jobId: string }[] = apps[cur] ?? [];
      setApplied(arr.map((a) => String(a.jobId)));
    } catch { setApplied([]); }
  };

  // ====== LOADER (mount/sort) ======
  useEffect(() => {
    const ac = new AbortController(); let alive = true;

    (async () => {
      try {
        setLoadErr(null);
        const base = (API_BASE || "").replace(/\/+$/, "");
        if (!base) {
          setLoadErr("API base tidak terkonfigurasi");
          setJobs([]);
          return;
        }
        const opts: RequestInit = { credentials: "include", signal: ac.signal };

        // ambil job aktif
        const r1 = await fetch(`${base}/api/jobs?active=1`, opts);
        if (!alive) return;

        if (r1.ok) {
          const j1 = await r1.json().catch(() => null);
          const serverList: JobDTO[] = Array.isArray(j1?.data) ? j1.data : [];
          const mapped = normalizeServer(serverList).sort((a, b) => sortByPosted(a, b, sort === "newest"));
          setJobs(mapped);
          return;
        }

        setJobs([]);
        setLoadErr(`Gagal memuat dari server (HTTP ${r1.status}).`);
      } catch (e: any) {
        if (!ac.signal.aborted) {
          console.error("[JobsPage] load error:", e);
          setLoadErr(e?.message || "Gagal memuat data");
          setJobs([]);
        }
      }
    })();

    try { setSaved(JSON.parse(localStorage.getItem("ark_saved_global") ?? "[]").map(String)); } catch {}
    refreshAppliedForCurrent();

    const onUpd = () => {
      refreshAppliedForCurrent();
      try { setSaved(JSON.parse(localStorage.getItem("ark_saved_global") ?? "[]").map(String)); } catch {}
    };
    window.addEventListener("storage", onUpd);

    return () => { alive = false; ac.abort(); window.removeEventListener("storage", onUpd); };
  }, [sort]);

  // ==== NEW: re-fetch ketika admin mengubah/hapus job (pakai listenJobsUpdated) ====
  useEffect(() => {
    const unsubscribe = listenJobsUpdated(() => {
      const ac = new AbortController();
      (async () => {
        try {
          setLoadErr(null);
          const base = (API_BASE || "").replace(/\/+$/, "");
          if (!base) return;
          const opts: RequestInit = { credentials: "include", signal: ac.signal };
          const r1 = await fetch(`${base}/api/jobs?active=1`, opts);
          if (r1.ok) {
            const j1 = await r1.json().catch(() => null);
            const serverList: JobDTO[] = Array.isArray(j1?.data) ? j1.data : [];
            const mapped = normalizeServer(serverList).sort((a, b) => sortByPosted(a, b, sort === "newest"));
            setJobs(mapped);
          }
        } catch {}
        setTimeout(() => ac.abort(), 15000);
      })();
    });

    return () => unsubscribe();
  }, [sort]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "2-digit" }),
    [locale]
  );

  const items = useMemo(() => {
    const k = filters.q.toLowerCase();
    const loc = filters.loc.toLowerCase();

    const arr = jobs.filter((j) => {
      const okQ = k === "" || j.title.toLowerCase().includes(k) || (j.company || "").toLowerCase().includes(k);
      const okLoc = loc === "" || j.location.toLowerCase().includes(loc);
      const okInd = filters.industry === "" || j.industry === filters.industry;
      const okCon = filters.contract === "" || j.contract === filters.contract;
      const okFun = filters.func === "" || j.function === filters.func;
      const okRem = filters.remote === "" || j.remote === filters.remote;
      const okExp = filters.exp === "" || (j.experience ?? "Any") === (filters.exp as Job["experience"]);
      const okEdu = filters.edu === "" || (j.education ?? "Any") === (filters.edu as Job["education"]);
      return okQ && okLoc && okInd && okCon && okFun && okRem && okExp && okEdu;
    });

    arr.sort((a, b) => sortByPosted(a, b, sort === "newest"));
    return arr;
  }, [jobs, filters, sort]);

  const toggleSave = (id: string | number) => {
    const key = String(id);
    const next = saved.includes(key) ? saved.filter((x) => x !== key) : [...saved, key];
    setSaved(next);
    localStorage.setItem("ark_saved_global", JSON.stringify(next));
  };
  const clearFilters = () =>
    setFilters({ q: "", loc: "", industry: "", contract: "", func: "", remote: "", exp: "", edu: "" });

  const formatPosted = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : dateFmt.format(d);
  };

  function openDetail(job: Job) {
    setDetailJob(job);
    setCvFile(null);
    setDetailOpen(true);
  }

  // ===== APPLY (FormData + CV PDF) =====
  async function applySelected(sel: Job | null, file: File | null) {
    if (!sel || isApplying) return;

    // Validasi CV
    if (!file) { showToast("err","Silakan pilih file CV (PDF)."); return; }
    if (file.type !== "application/pdf") { showToast("err","CV harus PDF."); return; }
    if (file.size > 2 * 1024 * 1024) { showToast("err","Ukuran CV maksimal 2 MB."); return; }

    // pastikan tau user siapa
    let cur = localStorage.getItem("ark_current");
    if (!cur) {
      cur = await getCurrentUserId();
      if (cur) { try { localStorage.setItem("ark_current", cur); } catch {} }
    }
    if (!cur) { showToast("err","Silakan login terlebih dahulu untuk melamar."); return; }

    const base = (API_BASE || "").replace(/\/+$/, "");
    setIsApplying(true);
    let sentToServer = false;

    if (base) {
      try {
        const fd = new FormData();
        fd.set("jobId", String(sel.id));
        fd.set("cv", file);

        const res = await fetch(`${base}/api/applications`, { method: "POST", credentials: "include", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({} as any));
          throw new Error(err?.error || `Server ${res.status}`);
        }
        sentToServer = true;
      } catch (e: any) {
        console.error("[apply] API gagal:", e);
        showToast("err", e?.message || "Gagal mengirim lamaran.");
        setIsApplying(false);
        return;
      }
    }

    // update cache lokal agar badge langsung berubah
    let apps: Record<string, { jobId: string; date: string }[]> = {};
    try {
      apps = JSON.parse(localStorage.getItem("ark_apps") ?? "{}");
      if (!apps || typeof apps !== "object") throw new Error("invalid ark_apps");
    } catch { apps = {}; }

    const jobId = String(sel.id);
    const userArr = Array.isArray(apps[cur]) ? apps[cur] : [];
    if (!userArr.some((a) => String(a.jobId) === jobId)) {
      const next = [...userArr, { jobId, date: new Date().toISOString().slice(0, 10) }];
      apps[cur] = next;
      localStorage.setItem("ark_apps", JSON.stringify(apps));
    }
    try { setApplied((s) => [...new Set([...s, jobId])]); } catch {}

    setIsApplying(false);
    setDetailOpen(false);
    showToast(sentToServer ? "ok" : "err", sentToServer ? "Lamaran terkirim!" : "Gagal kirim ke server.");
  }

  function onReport(job: Job) {
    setJobToReport(job);   // Simpan seluruh objek job ke state
    setReportOpen(true);   // Buka modal
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[300] rounded-xl px-4 py-2 text-sm shadow ${
            toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-neutral-900">{t("heading")}</h1>
              <p className="text-neutral-600">{t("subheading")}</p>
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
                  placeholder={t("search.placeholder")}
                  className="w-full sm:w-80 rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-neutral-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600">{t("sort.label")}</label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="newest">{t("sort.newest")}</option>
                  <option value="oldest">{t("sort.oldest")}</option>
                </select>
              </div>

              <button
                onClick={() => setDrawer(true)}
                className="sm:hidden inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <FilterIcon className="h-4 w-4" /> {t("filters.title")}
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
            <FilterInput label={t("filters.location")} value={filters.loc} onChange={(v) => setFilters((s) => ({ ...s, loc: v }))} icon={<PinIcon className="h-4 w-4" />} />
            <FilterSelect label={t("filters.industry")} value={filters.industry} onChange={(v) => setFilters((s) => ({ ...s, industry: v }))} options={["", "Oil & Gas", "Renewable Energy", "Mining"]} icon={<LayersIcon className="h-4 w-4" />} />
            <FilterSelect label={t("filters.contract")} value={filters.contract} onChange={(v) => setFilters((s) => ({ ...s, contract: v }))} options={["", "Full-time", "Contract", "Part-time"]} icon={<BriefcaseIcon className="h-4 w-4" />} />
            <FilterSelect label={t("filters.function")} value={filters.func} onChange={(v) => setFilters((s) => ({ ...s, func: v }))} options={["", "Engineering", "Operations", "Management"]} icon={<CogIcon className="h-4 w-4" />} />
            <FilterSelect label={t("filters.workmode")} value={filters.remote} onChange={(v) => setFilters((s) => ({ ...s, remote: v }))} options={["", "On-site", "Remote", "Hybrid"]} icon={<GlobeIcon className="h-4 w-4" />} />
            <FilterSelect label={"Pengalaman"} value={filters.exp} onChange={(v) => setFilters((s) => ({ ...s, exp: v }))} options={["", "0-1", "1-3", "3-5", "5+"]} icon={<LayersIcon className="h-4 w-4" />} />
            <FilterSelect label={"Pendidikan"} value={filters.edu} onChange={(v) => setFilters((s) => ({ ...s, edu: v }))} options={["", "SMA/SMK", "D3", "S1", "S2", "S3"]} icon={<LayersIcon className="h-4 w-4" />} />
            <div className="pt-3 flex items-center justify-between">
              <span className="text-sm text-neutral-500">{t("filters.results", { count: items.length })}</span>
              <button onClick={clearFilters} className="text-sm text-blue-700 hover:underline">{t("filters.clear")}</button>
            </div>
          </FilterCard>
        </aside>

        {/* List */}
        <section className="lg:col-span-9 space-y-4">
          {items.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            items.map((job) => {
              const isApplied = applied.includes(String(job.id));
              return (
                <article
                  key={job.id}
                  onClick={() => openDetail(job)}
                  className="group cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex gap-4">
                    <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-amber-400 grid place-items-center overflow-hidden text-white text-sm font-bold">
                      {job.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={job.company || "logo"} src={job.logo} className="h-full w-full object-cover" />
                      ) : (
                        initials(job.company || "AW")
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base md:text-lg font-semibold text-neutral-900">{job.title}</h3>
                          <p className="text-sm text-neutral-600 truncate">{job.company || t("common.company")}</p>
                        </div>
                        <span className={["rounded-lg border px-2 py-1 text-xs", isApplied ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-neutral-300 text-neutral-700"].join(" ")}>
                          {isApplied ? "Sudah dilamar" : t("common.view")}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-6 gap-2 text-[13px]">
                        <Meta icon={<PinIcon className="h-4 w-4" />} text={job.location} />
                        <Meta icon={<BriefcaseIcon className="h-4 w-4" />} text={job.contract} />
                        <Meta icon={<LayersIcon className="h-4 w-4" />} text={job.industry} />
                        <Meta icon={<GlobeIcon className="h-4 w-4" />} text={job.remote} />
                        {job.experience && job.experience !== "Any" ? <Meta icon={<CogIcon className="h-4 w-4" />} text={`${job.experience} thn`} /> : null}
                        {job.education && job.education !== "Any" ? <Meta icon={<LayersIcon className="h-4 w-4" />} text={job.education} /> : null}
                        {(job.salaryMin != null || job.salaryMax != null) && <Meta icon={<MoneyIcon className="h-4 w-4" />} text={formatSalary(job.salaryMin, job.salaryMax, job.currency)} />}
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm text-neutral-600">{job.description}</p>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-neutral-500">{t("common.posted", { date: formatPosted(job.posted) })}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSave(job.id); }}
                          className={["rounded-lg border px-2.5 py-1 text-xs transition", saved.includes(String(job.id)) ? "border-amber-500 bg-amber-50 text-amber-700" : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"].join(" ")}
                        >
                          {saved.includes(String(job.id)) ? t("common.saved") : t("common.save")}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>

      {/* Drawer (mobile filters) */}
      {drawer && (
        <Drawer onClose={() => setDrawer(false)} title={t("filters.title")}>
          <div className="space-y-3">
            <FilterInput label={t("filters.location")} value={filters.loc} onChange={(v) => setFilters((s) => ({ ...s, loc: v }))} icon={<PinIcon className="h-4 w-4" />} />
            <FilterSelect label={t("filters.industry")} value={filters.industry} onChange={(v) => setFilters((s) => ({ ...s, industry: v }))} options={["", "Oil & Gas", "Renewable Energy", "Mining"]} icon={<LayersIcon className="h-4 w-4" />} />
            <FilterSelect label={t("filters.contract")} value={filters.contract} onChange={(v) => setFilters((s) => ({ ...s, contract: v }))} options={["", "Full-time", "Contract", "Part-time"]} icon={<BriefcaseIcon className="h-4 w-4" />} />
            <FilterSelect label={t("filters.function")} value={filters.func} onChange={(v) => setFilters((s) => ({ ...s, func: v }))} options={["", "Engineering", "Operations", "Management"]} icon={<CogIcon className="h-4 w-4" />} />
            <FilterSelect label={t("filters.workmode")} value={filters.remote} onChange={(v) => setFilters((s) => ({ ...s, remote: v }))} options={["", "On-site", "Remote", "Hybrid"]} icon={<GlobeIcon className="h-4 w-4" />} />
            <FilterSelect label={"Pengalaman"} value={filters.exp} onChange={(v) => setFilters((s) => ({ ...s, exp: v }))} options={["", "0-1", "1-3", "3-5", "5+"]} icon={<LayersIcon className="h-4 w-4" />} />
            <FilterSelect label={"Pendidikan"} value={filters.edu} onChange={(v) => setFilters((s) => ({ ...s, edu: v }))} options={["", "SMA/SMK", "D3", "S1", "S2", "S3"]} icon={<LayersIcon className="h-4 w-4" />} />
            <div className="pt-2 flex items-center justify-between">
              <span className="text-sm text-neutral-500">{t("filters.results", { count: items.length })}</span>
              <button onClick={clearFilters} className="text-sm text-blue-700 hover:underline">{t("filters.clear")}</button>
            </div>
          </div>
        </Drawer>
      )}

      {/* Detail Modal */}
      {detailOpen && detailJob && (
        <DetailModal
          job={detailJob}
          onClose={() => setDetailOpen(false)}
          onApply={() => applySelected(detailJob, cvFile)}
          postedText={formatPosted(detailJob.posted)}
          onReport={() => onReport(detailJob)}
          disabled={reportOpen || isApplying}
          cvFile={cvFile}
          setCvFile={setCvFile}
          isApplying={isApplying}
        />
      )}

      {/* Report Dialog */}
      {jobToReport && ( // Render hanya jika jobToReport ada isinya
        <ReportDialog
          isOpen={reportOpen} // Ganti 'open' menjadi 'isOpen'
          onClose={() => {
            setReportOpen(false);
            setJobToReport(null); // Reset state saat ditutup
          }}
          onSubmitted={() => {
            setReportOpen(false);     // Langsung tutup modal
            setJobToReport(null);    // Langsung reset state
            // Tunda toast sebentar (misal 100ms)
            setTimeout(() => {
              showToast("ok","Terima kasih. Laporanmu telah kami terima.");
            }, 100); // Penundaan 100 milidetik
          }}
          
          // KIRIM PROPS YANG BENAR (BUKAN defaultData)
          jobId={jobToReport.id}
          jobTitle={jobToReport.title}
          employerName={jobToReport.company ?? "Perusahaan"}
        />
      )}
    </div>
  );
}

/* ---------------- UI helpers ---------------- */
function FilterCard({ children }: { children: React.ReactNode }) {
  const t = useTranslations("jobs");
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 sticky top-24">
      <div className="mb-2 text-sm font-semibold text-neutral-900">{t("filters.title")}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function FilterInput({ label, value, onChange, icon }: { label: string; value: string; onChange: (v: string) => void; icon?: React.ReactNode; }) {
  const t = useTranslations("jobs");
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">{icon}</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-neutral-400" placeholder={t("filters.placeholder", { label: label.toLowerCase() })} />
      </div>
    </label>
  );
}
function FilterSelect({ label, value, onChange, options, icon }: { label: string; value: string; onChange: (v: string) => void; options: string[]; icon?: React.ReactNode; }) {
  const t = useTranslations("jobs");
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">{icon}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-neutral-400">
          {options.map((o) => (
            <option key={o || "all"} value={o}>
              {o || t("filters.all", { label })}
            </option>
          ))}
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

/* --------- Detail Modal (dengan Upload CV) --------- */
function DetailModal({
  job,
  postedText,
  onClose,
  onApply,
  onReport,
  disabled = false,
  cvFile,
  setCvFile,
  isApplying = false,
}: {
  job: Job;
  postedText: string;
  onClose: () => void;
  onApply: () => void;
  onReport: () => void;
  disabled?: boolean;
  cvFile: File | null;
  setCvFile: (f: File | null) => void;
  isApplying?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.currentTarget.files?.[0] || null;
    if (!f) { setCvFile(null); return; }
    if (f.type !== "application/pdf") {
      alert("CV harus berformat PDF.");
      e.currentTarget.value = "";
      setCvFile(null);
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      alert("Ukuran CV maksimal 2 MB.");
      e.currentTarget.value = "";
      setCvFile(null);
      return;
    }
    setCvFile(f);
  };

  return (
    <div className={["fixed inset-0 z-[100]", disabled ? "pointer-events-none" : ""].join(" ")} aria-hidden={disabled ? true : undefined}>
      <div className="absolute inset-0 backdrop-blur-[2px] bg-black/50" onClick={disabled ? undefined : onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={["w-full max-w-2xl rounded-2xl bg-white shadow-[0_15px_70px_-15px_rgba(0,0,0,0.5)]", disabled ? "pointer-events-none" : ""].join(" ")} role="dialog" aria-modal>
          <div className="px-6 pt-6 pb-3 border-b border-slate-200">
            <div className="flex justify-center mb-3">
              <AvatarLogo name={job.company || job.title} src={job.logo || undefined} size={64} />
            </div>
            <h2 className="text-center text-lg font-semibold text-slate-900">Detail Lowongan</h2>
            <p className="mt-1 text-center text-sm text-slate-600">{postedText}</p>
          </div>

          <div className="max-h-[60vh] overflow-auto px-6 py-5 space-y-5">
            <div>
              <div className="text-xl font-bold text-slate-900">{job.title}</div>
              <div className="text-sm text-slate-600">{job.company}</div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <InfoRow label="Lokasi" value={job.location} />
              <InfoRow label="Kontrak" value={job.contract} />
              <InfoRow label="Mode Kerja" value={job.remote} />
              {(job.salaryMin != null || job.salaryMax != null) && <InfoRow label="Gaji" value={formatSalary(job.salaryMin, job.salaryMax, job.currency)} />}
              {job.experience && job.experience !== "Any" ? <InfoRow label="Pengalaman" value={`${job.experience} tahun`} /> : null}
              {job.education && job.education !== "Any" ? <InfoRow label="Pendidikan" value={job.education} /> : null}
            </div>

            <Section title="Deskripsi Pekerjaan">
              <RichText text={job.description || "-"} />
            </Section>

            {job.requirements ? (
              <Section title="Persyaratan">
                <RichText text={job.requirements} />
              </Section>
            ) : null}

            {/* ==== Upload CV ==== */}
            <Section title="Unggah CV (PDF, maks 2 MB)">
              <div className="flex items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  onChange={onPick}
                  className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold hover:file:bg-slate-50"
                />
              </div>
              {cvFile ? (
                <p className="mt-2 text-xs text-slate-600">
                  Dipilih: <span className="font-medium">{cvFile.name}</span> ({(cvFile.size / 1024).toFixed(0)} KB)
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Wajib unggah CV dalam format PDF.</p>
              )}
            </Section>
          </div>

          <div className="px-6 pb-6 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button onClick={onReport} className="rounded-xl border border-red-500 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Laporkan</button>
            <button onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Tutup</button>
            <button
              onClick={onApply}
              disabled={disabled || isApplying}
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${isApplying ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"}`}
            >
              {isApplying ? "Mengirim..." : "Lamar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Section / RichText / InfoRow ---------- */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800">{children}</div>
    </section>
  );
}
function RichText({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const isList = lines.length > 0 && lines.every((l) => /^[-•]\s+/.test(l));
  if (isList) {
    const items = lines.map((l) => l.replace(/^[-•]\s?/, "")).filter(Boolean);
    return <ul className="list-disc pl-5 space-y-1">{items.map((it, idx) => <li key={idx}>{it}</li>)}</ul>;
  }
  return <div className="space-y-2">{text.split("\n").map((p, i) => (<p key={i}>{p}</p>))}</div>;
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

/* ------------ Drawer & Empty ------------ */
function Drawer({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string; }) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-[85%] max-w-xs bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 h-12">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} aria-label="Tutup filter" className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-200"><CloseIcon className="h-5 w-5" /></button>
        </div>
        <div className="p-3 space-y-3">{children}</div>
      </div>
    </div>
  );
}
function EmptyState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-neutral-100 grid place-items-center"><SearchIcon className="h-6 w-6 text-neutral-600" /></div>
      <h3 className="font-semibold text-neutral-900">{t("empty.title")}</h3>
      <p className="mt-1 text-sm text-neutral-600">{t("empty.desc")}</p>
    </div>
  );
}

/* ------------ Icons ------------ */
function SearchIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>); }
function PinIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M12 22s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="2" /></svg>); }
function LayersIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M12 3l8 4-8 4-8-4 8-4z" stroke="currentColor" strokeWidth="2" /><path d="M4 11l8 4 8-4" stroke="currentColor" strokeWidth="2" /><path d="M4 15l8 4 8-4" stroke="currentColor" strokeWidth="2" /></svg>); }
function BriefcaseIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" /><path d="M3 12h18" stroke="currentColor" strokeWidth="2" /></svg>); }
function MoneyIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" /><path d="M7 9h0M17 15h0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>); }
function CogIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2" /><path d="M19.4 15a7.97 7.97 0 000-6l-2.1.5a6 6 0 00-1.5-1.5l.5-2.1a8 8 0 00-6 0l.5 2.1a6 6 0 001.5-1.5l-2.1-.5a7.97 7.97 0 000 6l2.1-.5z" stroke="currentColor" strokeWidth="2" /></svg>); }
function GlobeIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" stroke="currentColor" strokeWidth="2" /></svg>); }
function FilterIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M4 6h16M6 12h12M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>); }
function CloseIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" fill="none" {...props}><path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>); }

/* ------------ Utils ------------ */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* ------------ Small: Avatar Logo ------------ */
function AvatarLogo({ name, src, size = 64 }: { name?: string; src?: string | null; size?: number }) {
  return (
    <div className="grid place-items-center rounded-full overflow-hidden bg-gradient-to-tr from-blue-600 via-blue-500 to-amber-400 text-white font-bold" style={{ width: size, height: size }} aria-label="Company logo">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || "logo"} className="h-full w-full object-cover" />
      ) : (
        <span className="select-none text-xl">{initials(name || "AW")}</span>
      )}
    </div>
  );
}
