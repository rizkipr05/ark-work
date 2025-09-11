"use client";

import React, { useEffect, useMemo, useState } from "react";
import { API } from "@/lib/api";

export default function AdminReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(API("/reports"), { cache: "no-store" });
      const data = await res.json();
      setReports(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!query) return reports;
    const q = query.toLowerCase();
    return reports.filter((r) =>
      [r.judul, r.perusahaan, r.alasan, r.catatan, r.status]
        .filter(Boolean)
        .some((v: any) => String(v).toLowerCase().includes(q))
    );
  }, [reports, query]);

  const updateStatus = async (id: string, status: string) => {
    await fetch(API(`/reports/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus laporan ini?")) return;
    await fetch(API(`/reports/${id}`), { method: "DELETE" });
    load();
  };

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Admin · Laporan Masuk</h1>
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari laporan…" className="w-full max-w-xs rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
          <button onClick={load} className="rounded-xl border px-3 py-2 hover:bg-gray-50">{loading ? "Muat…" : "Muat ulang"}</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3">Judul</th>
              <th className="p-3">Perusahaan</th>
              <th className="p-3">Alasan</th>
              <th className="p-3">Catatan</th>
              <th className="p-3">Status</th>
              <th className="p-3">Dibuat</th>
              <th className="p-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500">Belum ada data</td></tr>
            )}

            {filtered.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-3 font-medium">{r.judul}</td>
                <td className="p-3">{r.perusahaan}</td>
                <td className="p-3">{r.alasan}</td>
                <td className="p-3 max-w-[24rem]"><div className="line-clamp-3">{r.catatan || "—"}</div></td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${
                    r.status === "baru" ? "bg-amber-100 text-amber-700" :
                    r.status === "diproses" ? "bg-blue-100 text-blue-700" :
                    r.status === "selesai" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
                  }`}>{r.status}</span>
                </td>
                <td className="p-3 text-gray-500">{new Date(r.dibuatPada).toLocaleString()}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)} className="rounded-xl border px-2 py-1">
                      <option value="baru">baru</option>
                      <option value="diproses">diproses</option>
                      <option value="selesai">selesai</option>
                    </select>
                    <button onClick={() => remove(r.id)} className="rounded-xl border px-2 py-1 hover:bg-gray-50">Hapus</button>
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
