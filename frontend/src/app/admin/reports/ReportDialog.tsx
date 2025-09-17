"use client";

import React, { useEffect, useMemo, useState } from "react";
import { API } from "@/lib/api";

/* ============================== Modal ============================== */
export type ReportDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmitted?: (payload: any) => void;
  defaultData?: { judul?: string; perusahaan?: string; alasan?: string; catatan?: string };
};

function ReportDialog({ open, onClose, onSubmitted, defaultData }: ReportDialogProps) {
  const [judul, setJudul] = useState(defaultData?.judul || "");
  const [perusahaan, setPerusahaan] = useState(defaultData?.perusahaan || "");
  const [alasan, setAlasan] = useState(defaultData?.alasan || "Spam / Penipuan");
  const [catatan, setCatatan] = useState(defaultData?.catatan || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setJudul(defaultData?.judul || "");
      setPerusahaan(defaultData?.perusahaan || "");
      setAlasan(defaultData?.alasan || "Spam / Penipuan");
      setCatatan(defaultData?.catatan || "");
    }
  }, [open, defaultData]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(API("/reports"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ judul, perusahaan, alasan, catatan }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Gagal mengirim laporan");
      }
      const created = await res.json();
      onSubmitted?.(created);
      onClose();
    } catch (err: any) {
      alert(err?.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-lg font-semibold">Laporkan Lowongan</h2>
          <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100" aria-label="Tutup">✕</button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-2 rounded-xl border p-3">
            <div className="text-sm text-gray-500">RINGKASAN LOWONGAN</div>
            <input required value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="Judul lowongan" className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
            <input required value={perusahaan} onChange={(e) => setPerusahaan(e.target.value)} placeholder="Nama perusahaan" className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Alasan</label>
            <select value={alasan} onChange={(e) => setAlasan(e.target.value)} className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring">
              <option>Spam / Penipuan</option>
              <option>Konten Tidak Pantas</option>
              <option>Informasi Palsu</option>
              <option>Duplikat</option>
              <option>Lainnya</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Catatan (opsional)</label>
            <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={4} className="w-full resize-y rounded-xl border px-3 py-2 focus:outline-none focus:ring" placeholder="Tambahkan detail…" />
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 hover:bg-gray-50">Batal</button>
            <button disabled={loading} type="submit" className="rounded-xl bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-60">
              {loading ? "Mengirim..." : "Kirim Laporan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ========================= Halaman Admin Reports ========================= */
export function AdminReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(API("/reports"), { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setReports(list);
    } catch (err) {
      console.error("Failed to load reports:", err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const items = Array.isArray(reports) ? reports : [];
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((r) =>
      [r.judul, r.perusahaan, r.alasan, r.catatan, r.status]
        .filter(Boolean)
        .some((v: any) => String(v).toLowerCase().includes(q))
    );
  }, [reports, query]);

  const updateStatus = async (id: string, status: string) => {
    await fetch(API(`/reports/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus laporan ini?")) return;
    await fetch(API(`/reports/${id}`), { method: "DELETE" });
    load();
  };

  const handleSubmitted = (payload: any) => {
    if (payload && payload.id) {
      setReports(prev => [payload, ...prev]);
    } else {
      load();
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Admin · Laporan Masuk</h1>

        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari laporan…" className="w-full max-w-xs rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
          <button onClick={load} className="rounded-xl border px-3 py-2 hover:bg-gray-50">{loading ? "Muat…" : "Muat ulang"}</button>
          <button onClick={() => setOpenModal(true)} className="rounded-xl bg-blue-600 px-3 py-2 text-white hover:bg-blue-700">Laporkan Lowongan</button>
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

            {filtered.map((r: any) => (
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
                <td className="p-3 text-gray-500">{r.dibuatPada ? new Date(r.dibuatPada).toLocaleString() : "—"}</td>
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

      <ReportDialog
        open={openModal}
        onClose={() => setOpenModal(false)}
        onSubmitted={handleSubmitted}
      />
    </main>
  );
}

/* ✅ Default export = komponen modal */
export default ReportDialog;
