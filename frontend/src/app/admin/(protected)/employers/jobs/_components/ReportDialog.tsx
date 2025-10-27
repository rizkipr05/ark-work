"use client";
import React, { useState } from "react";

export type ReportDialogProps = {
  open: boolean;
  onClose: () => void;
  defaultData?: { judul?: string; perusahaan?: string; alasan?: string; catatan?: string; };
  onSubmitted?: () => void;
};

const API = (p: string) => `/api${p.startsWith("/") ? p : `/${p}`}`;

export default function ReportDialog({ open, onClose, defaultData, onSubmitted }: ReportDialogProps) {
  const [judul, setJudul] = useState(defaultData?.judul ?? "");
  const [perusahaan, setPerusahaan] = useState(defaultData?.perusahaan ?? "");
  const [alasan, setAlasan] = useState(defaultData?.alasan ?? "Spam / Penipuan");
  const [catatan, setCatatan] = useState(defaultData?.catatan ?? "");
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const submit = async () => {
    if (!judul.trim()) return alert("Judul wajib diisi");
    try {
      setBusy(true);
      const r = await fetch(API("/reports"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ judul, perusahaan, alasan, catatan }),
      });
      if (!r.ok) throw new Error(`Server ${r.status}`);
      onSubmitted?.();
      onClose();
    } catch (e: any) {
      alert(e?.message || "Gagal mengirim laporan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400]">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
          <div className="px-5 py-4 border-b">
            <h3 className="text-lg font-semibold">Laporkan Lowongan</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            {/* form fields sederhana */}
            <label className="block">
              <span className="text-sm">Judul</span>
              <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                     value={judul} onChange={e=>setJudul(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm">Perusahaan</span>
              <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                     value={perusahaan} onChange={e=>setPerusahaan(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm">Alasan</span>
              <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                      value={alasan} onChange={e=>setAlasan(e.target.value)}>
                <option>Spam / Penipuan</option>
                <option>Konten tidak pantas</option>
                <option>Duplikat</option>
                <option>Lainnya</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm">Catatan</span>
              <textarea className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" rows={4}
                        value={catatan} onChange={e=>setCatatan(e.target.value)} />
            </label>
          </div>
          <div className="px-5 py-4 border-t flex justify-end gap-2">
            <button onClick={onClose} disabled={busy} className="rounded-xl border px-4 py-2 text-sm">Batal</button>
            <button onClick={submit} disabled={busy}
                    className={`rounded-xl px-4 py-2 text-sm text-white ${busy ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"}`}>
              {busy ? "Mengirim…" : "Kirim"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
