"use client";

import React, { useEffect, useState } from "react";

// Base URL backend (fallback ke 4000)
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000";

export type ReportDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmitted?: (payload: any) => void;
  defaultData?: {
    judul?: string;
    perusahaan?: string;
    alasan?: string;
    catatan?: string;
  };
};

export default function ReportDialog({
  open,
  onClose,
  onSubmitted,
  defaultData,
}: ReportDialogProps) {
  const [judul, setJudul] = useState(defaultData?.judul || "");
  const [perusahaan, setPerusahaan] = useState(defaultData?.perusahaan || "");
  const [alasan, setAlasan] = useState(defaultData?.alasan || "Spam / Penipuan");
  const [catatan, setCatatan] = useState(defaultData?.catatan || "");
  const [loading, setLoading] = useState(false);

  // Reset field saat modal dibuka
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
      const url = `${API_BASE.replace(/\/+$/, "")}/api/reports`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ judul, perusahaan, alasan, catatan }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} @ ${url}\n${text}`);
      }

      const data = await res.json();

      // 1) Callback parent (kalau modal dipasang di halaman yang sama)
      onSubmitted?.(data);

      // 2) Broadcast ke route/komponen lain dalam tab yang sama
      try {
        window.dispatchEvent(new CustomEvent("ark:report-created", { detail: data }));
      } catch {}

      // 3) Ping via localStorage untuk memicu 'storage' event di tab/route lain
      try {
        localStorage.setItem("ark:report:ping", String(Date.now()));
      } catch {}

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
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-2 rounded-xl border p-3">
            <div className="text-sm text-gray-500">RINGKASAN LOWONGAN</div>
            <input
              required
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="Judul lowongan"
              className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring"
            />
            <input
              required
              value={perusahaan}
              onChange={(e) => setPerusahaan(e.target.value)}
              placeholder="Nama perusahaan"
              className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Alasan</label>
            <select
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring"
            >
              <option>Spam / Penipuan</option>
              <option>Konten Tidak Pantas</option>
              <option>Informasi Palsu</option>
              <option>Duplikat</option>
              <option>Lainnya</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Catatan (opsional)</label>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-xl border px-3 py-2 focus:outline-none focus:ring"
              placeholder="Tambahkan detail…"
            />
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 hover:bg-gray-50">
              Batal
            </button>
            <button
              disabled={loading}
              type="submit"
              className="rounded-xl bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {loading ? "Mengirim..." : "Kirim Laporan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
