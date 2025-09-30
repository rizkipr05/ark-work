"use client";

import React, { useEffect, useMemo, useState } from "react";
import { emitJobsUpdated } from "@/lib/jobsSync";

/* ---------------- Server base (+ helper api) ---------------- */
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "");

const api = (p: string) =>
  `${API_BASE.replace(/\/+$/, "")}/api${p.startsWith("/") ? p : `/${p}`}`;

/* ---------------- Types (Row) ---------------- */
type Row = {
  id: string;
  employerId: string;
  title: string;
  location: string | null;
  employment: string | null;
  description: string | null;
  isActive: boolean;
  isDraft: boolean;
  createdAt: string; // ISO (atau string kosong)
  employer: { id: string; displayName: string };
};

const fmtDate = (iso?: string) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "-"
    : new Intl.DateTimeFormat("id-ID", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(d);
};

/* -------- helper: ambil array dari berbagai bentuk payload -------- */
function pickArray(anyJson: any): any[] {
  if (Array.isArray(anyJson)) return anyJson;
  if (Array.isArray(anyJson?.items)) return anyJson.items;
  if (Array.isArray(anyJson?.data)) return anyJson.data;
  if (Array.isArray(anyJson?.results)) return anyJson.results;
  return [];
}

/* -------- helper: normalize tanggal aman -------- */
function safeDateString(input: unknown): string {
  // Kalau sudah string (biasanya ISO dari backend), pakai apa adanya
  if (typeof input === "string" && input.trim() !== "") return input.trim();
  if (!input) return "";
  try {
    const d = new Date(input as any);
    const t = d.getTime();
    if (Number.isNaN(t)) return "";
    // Kembalikan ISO agar konsisten; fmtDate akan handle dengan aman
    return new Date(t).toISOString();
  } catch {
    return "";
  }
}

/* -------- helper: map objek apapun → Row -------- */
function toRow(x: any): Row {
  return {
    id: String(x.id ?? x.jobId ?? ""),
    employerId: String(x.employerId ?? x.employer?.id ?? ""),
    title: String(x.title ?? x.judul ?? "-"),
    location: x.location ?? null,
    employment: x.employment ?? x.contract ?? null,
    description: x.description ?? null,
    isActive: x.isActive ?? (x.status === "active"),
    isDraft: x.isDraft ?? (x.status === "draft"),
    // ⬇️ AMAN: tidak memaksa toISOString pada nilai invalid
    createdAt: safeDateString(x.createdAt ?? x.postedAt),
    employer: {
      id: String(x.employer?.id ?? x.employerId ?? ""),
      displayName: String(
        x.employer?.displayName ??
          x.employer?.name ??
          x.company ??
          "-"
      ),
    },
  };
}

/* -------- helper: pukul endpoint admin, fallback ke publik bila 404 -------- */
async function fetchAdminThenPublic(input: RequestInfo | URL, init?: RequestInit) {
  const res1 = await fetch(input, { credentials: "include", ...init });
  if (res1.status !== 404) return res1;

  // fallback ke versi publik
  const u = new URL(typeof input === "string" ? input : input.toString());
  // ganti /api/admin/jobs/... -> /api/jobs/...
  u.pathname = u.pathname.replace(/\/api\/admin\/jobs\//, "/api/jobs/");
  return fetch(u.toString(), { credentials: "include", ...init });
}

export default function AdminEmployersJobsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [employerId, setEmployerId] = useState("");
  const [status, setStatus] = useState<"active" | "draft" | "hidden" | "all">("active");

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (employerId.trim()) p.set("employerId", employerId.trim());
    p.set("status", status);
    p.set("page", "1");
    p.set("limit", "50");
    return api(`/admin/jobs?${p.toString()}`);
  }, [q, employerId, status]);

  /* -------- load dengan fallback (admin → publik) -------- */
  const load = async () => {
    setLoading(true);
    try {
      const opts: RequestInit = { credentials: "include", cache: "no-store" };

      // 1) coba endpoint admin
      let r = await fetch(url, opts);

      // 2) kalau 404 (route admin belum ada), fallback ke jobs publik
      if (r.status === 404) {
        const p = new URL(url);
        const qsp = new URLSearchParams();
        if (p.searchParams.get("q")) qsp.set("q", p.searchParams.get("q")!);
        if (p.searchParams.get("employerId"))
          qsp.set("employerId", p.searchParams.get("employerId")!);
        if (p.searchParams.get("status"))
          qsp.set("status", p.searchParams.get("status")!);
        qsp.set("page", p.searchParams.get("page") ?? "1");
        qsp.set("limit", p.searchParams.get("limit") ?? "50");

        r = await fetch(api(`/jobs?${qsp.toString()}`), opts);
      }

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const j = await r.json().catch(() => null);
      const raw = pickArray(j);
      const arr: Row[] = raw.map(toRow);
      setRows(arr);
    } catch (e) {
      console.error("[admin/employers/jobs] load error:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  /* ---------------- Actions ---------------- */
  async function sendReport(payload: {
    judul: string;
    perusahaan?: string;
    alasan: string;
    catatan?: string;
  }) {
    try {
      await fetch(api("/reports"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn("Gagal kirim report (opsional):", e);
    }
  }

  const softDelete = async (job: Row) => {
    if (!confirm(`Hapus (soft) job "${job.title}"?`)) return;
    try {
      const res = await fetchAdminThenPublic(api(`/admin/jobs/${job.id}`), {
        method: "DELETE",
      });
      if (!(res.ok || res.status === 204)) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Gagal hapus (HTTP ${res.status})`);
      }
      await load();
      emitJobsUpdated();
      alert("Job dihapus (soft).");
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Gagal menghapus job.");
    }
  };

  const nonaktifkan = async (job: Row) => {
    if (!confirm(`Nonaktifkan job "${job.title}"?`)) return;
    try {
      const res = await fetchAdminThenPublic(api(`/admin/jobs/${job.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Gagal nonaktifkan (HTTP ${res.status})`);
      }
      await load();
      emitJobsUpdated();
      alert("Job dinonaktifkan.");
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Gagal menonaktifkan job.");
    }
  };

  const hardDelete = async (job: Row) => {
    if (!confirm(`Hard delete PERMANEN job "${job.title}"?`)) return;
    try {
      // admin path… kalau 404 fallback ke /api/jobs/:id/hard (jika ada)
      let res = await fetch(api(`/admin/jobs/${job.id}/hard`), {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 404) {
        res = await fetch(api(`/jobs/${job.id}/hard`), {
          method: "DELETE",
          credentials: "include",
        });
      }
      if (!(res.ok || res.status === 204)) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Gagal hard delete (HTTP ${res.status})`);
      }
      await load();
      emitJobsUpdated();
      alert("Job terhapus permanen.");
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Gagal hard delete.");
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      [r.title, r.employer.displayName, r.location ?? "", r.employment ?? "", r.description ?? ""].some(
        (v) => (v || "").toLowerCase().includes(s)
      )
    );
  }, [rows, q]);

  return (
    <main className="mx-auto max-w-7xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Admin · Moderasi Job Employer</h1>
          <p className="text-sm text-neutral-600">
            Hapus job penipuan / nonaktifkan tanpa hapus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul/perusahaan/lokasi…"
            className="w-full max-w-xs rounded-xl border px-3 py-2 focus:outline-none focus:ring"
          />
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="hidden">Hidden</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={load}
            className="rounded-xl border px-3 py-2 hover:bg-gray-50"
          >
            {loading ? "Memuat…" : "Muat ulang"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">
              Filter Employer ID (opsional)
            </span>
            <input
              value={employerId}
              onChange={(e) => setEmployerId(e.target.value)}
              placeholder="contoh: emp_123"
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={load}
              className="h-10 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Terapkan
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3">Judul</th>
              <th className="p-3">Perusahaan</th>
              <th className="p-3">Lokasi</th>
              <th className="p-3">Tipe</th>
              <th className="p-3">Employer ID</th>
              <th className="p-3">Dipost</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  Belum ada data
                </td>
              </tr>
            )}

            {filtered.map((j) => (
              <tr key={j.id} className="border-t align-top">
                <td className="p-3 font-medium">{j.title}</td>
                <td className="p-3">{j.employer.displayName}</td>
                <td className="p-3">{j.location || "-"}</td>
                <td className="p-3">{j.employment || "-"}</td>
                <td className="p-3">{j.employerId || "-"}</td>
                <td className="p-3 text-gray-500">{fmtDate(j.createdAt)}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      j.isDraft
                        ? "bg-gray-100 text-gray-700"
                        : j.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {j.isDraft ? "draft" : j.isActive ? "aktif" : "hidden"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => nonaktifkan(j)}
                      className="rounded-xl border px-2 py-1 hover:bg-gray-50"
                      title="Nonaktifkan tanpa hapus"
                    >
                      Nonaktifkan
                    </button>
                    <button
                      onClick={() => softDelete(j)}
                      className="rounded-xl border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                      title="Hapus (Soft) — hilang dari publik"
                    >
                      Hapus (Soft)
                    </button>
                    <button
                      onClick={() => hardDelete(j)}
                      className="rounded-xl border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50"
                      title="Hard delete permanen"
                    >
                      Hard Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
