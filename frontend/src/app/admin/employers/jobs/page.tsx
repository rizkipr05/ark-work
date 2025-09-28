"use client";

import React, { useEffect, useMemo, useState } from "react";

/** Helper: gunakan proxy same-origin ke /api */
const API = (path: string) => {
  if (!path.startsWith("/")) path = `/${path}`;
  return `/api${path}`;
};

type Job = {
  id: string;
  employerId?: string | null;
  title: string;
  company?: string | null;
  location?: string | null;
  employment?: string | null;
  description?: string | null;
  postedAt: string;
  isActive: boolean;
  logoUrl?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  requirements?: string | null;
};

const fmtDate = (iso?: string) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat("id-ID", { year: "numeric", month: "short", day: "2-digit" }).format(d);
};

export default function AdminEmployersJobsPage() {
  const [rows, setRows] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [employerId, setEmployerId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      // Ambil dari DB (App Router API kita)
      const r = await fetch(API("/jobs"), { cache: "no-store", credentials: "include" });
      const j = await r.json().catch(() => null);
      const arr: Job[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      const filtered = employerId ? arr.filter((x) => (x.employerId ?? "") === employerId) : arr;
      setRows(filtered);
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
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      [r.title, r.company ?? "", r.location ?? "", r.employment ?? "", r.description ?? ""].some((v) =>
        v.toLowerCase().includes(s)
      )
    );
  }, [rows, q]);

  /** KIRIM event ke FE list jobs + payload (jobId, action) */
  const broadcastJobsUpdated = (detail?: { jobId?: string; action?: "delete" | "deactivate" }) => {
    try {
      window.dispatchEvent(new CustomEvent("ark:jobs-updated", { detail }));
    } catch {}
  };

  const deleteJob = async (job: Job) => {
    if (!confirm(`Tandai penipuan & hapus job "${job.title}"?`)) return;

    // (Opsional) Catat ke reports agar ada jejak moderasi:
    try {
      await fetch(API("/reports"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          judul: job.title,
          perusahaan: job.company ?? "Unknown",
          alasan: "Spam / Penipuan",
          catatan: `Ditandai penipuan & dihapus oleh admin${employerId ? ` (employerId=${employerId})` : ""}`,
        }),
      });
    } catch {}

    // Hapus permanen di DB:
    try {
      const res = await fetch(API(`/jobs/${job.id}`), { method: "DELETE", credentials: "include" });
      if (!res.ok && res.status !== 204) throw new Error(`Delete failed ${res.status}`);
      setRows((prev) => prev.filter((x) => x.id !== job.id));
      broadcastJobsUpdated({ jobId: job.id, action: "delete" }); // >>> payload
      alert("Job dihapus dari database.");
    } catch (e: any) {
      console.error("Gagal hapus:", e);
      alert("Gagal menghapus job di database.");
    }
  };

  const nonaktifkanJob = async (job: Job) => {
    if (!confirm(`Nonaktifkan job "${job.title}" (tanpa hapus)?`)) return;
    try {
      const res = await fetch(API(`/jobs/${job.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error(`Patch failed ${res.status}`);
      setRows((prev) => prev.map((x) => (x.id === job.id ? { ...x, isActive: false } : x)));
      broadcastJobsUpdated({ jobId: job.id, action: "deactivate" }); // >>> payload
      alert("Job dinonaktifkan.");
    } catch (e) {
      console.error(e);
      alert("Gagal menonaktifkan job.");
    }
  };

  return (
    <main className="mx-auto max-w-7xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Admin · Moderasi Job Employer</h1>
          <p className="text-sm text-neutral-600">Hapus job penipuan / nonaktifkan tanpa hapus.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul/perusahaan/lokasi…"
            className="w-full max-w-xs rounded-xl border px-3 py-2 focus:outline-none focus:ring"
          />
          <button onClick={load} className="rounded-xl border px-3 py-2 hover:bg-gray-50">
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
            <button onClick={load} className="h-10 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
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
                <td className="p-3">{j.company || "-"}</td>
                <td className="p-3">{j.location || "-"}</td>
                <td className="p-3">{j.employment || "-"}</td>
                <td className="p-3">{j.employerId || "-"}</td>
                <td className="p-3 text-gray-500">{fmtDate(j.postedAt)}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      j.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {j.isActive ? "aktif" : "nonaktif"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => nonaktifkanJob(j)}
                      className="rounded-xl border px-2 py-1 hover:bg-gray-50"
                      title="Nonaktifkan tanpa hapus"
                    >
                      Nonaktifkan
                    </button>
                    <button
                      onClick={() => deleteJob(j)}
                      className="rounded-xl border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                      title="Tandai penipuan & hapus"
                    >
                      Hapus (Penipuan)
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
