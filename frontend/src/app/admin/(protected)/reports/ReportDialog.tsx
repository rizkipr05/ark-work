/*
 * LOKASI FILE:
 * ../admin/(protected)/employers/jobs/_components/ReportDialog.tsx
 *
 * GANTI SELURUH ISI FILE DENGAN KODE INI
 */

"use client";

import React, { useState, useEffect, FormEvent } from "react";

/* ======================= CONFIG ======================= */
// Pastikan URL ini benar
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "");

const api = (p: string) => `${API_BASE.replace(/\/+$/, '')}${p}`;

/* ======================= TYPES ======================= */
// Tipe props ini SEKARANG COCOK dengan 'page.tsx'
export type ReportDialogProps = {
  isOpen: boolean;        // <-- INI PERBAIKANNYA (dari 'open')
  onClose: () => void;
  onSubmitted: () => void;
  jobId: string;        // <-- INI PERBAIKANNYA (prop baru)
  jobTitle: string;
  employerName: string;
};

// Definisikan ENUM secara manual di frontend
const reasonLabels = {
  SCAM: "Spam / Penipuan",
  PHISHING: "Phishing / Mencuri data",
  DUPLICATE: "Lowongan Duplikat",
  MISLEADING: "Informasi Menyesatkan / Palsu",
  OTHER: "Lainnya",
} as const;

type ReportReason = keyof typeof reasonLabels;
const DEFAULT_REASON: ReportReason = "SCAM";


/* ======================= KOMPONEN UTAMA ======================= */
export default function ReportDialog({
  isOpen, // <-- Menggunakan 'isOpen'
  onClose,
  onSubmitted,
  jobId, 
  jobTitle,
  employerName,
  // 'defaultData' tidak lagi digunakan
}: ReportDialogProps) {
  
  const [reason, setReason] = useState<ReportReason>(DEFAULT_REASON);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Reset form setiap kali modal dibuka
  useEffect(() => {
    if (isOpen) {
      setReason(DEFAULT_REASON);
      setDetails("");
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]); // <-- Menggunakan 'isOpen'

  // Handler untuk submit form
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const payload = {
      jobId: jobId, // <-- Mengirim 'jobId'
      reason: reason,
      details: details || null,
    };
    
    // Cek cepat di frontend
    if (!jobId || typeof jobId !== 'string' || jobId.length < 10) {
        setError("Error: Job ID tidak valid atau tidak ada. Coba refresh halaman.");
        setIsLoading(false);
        return;
    }

    try {
      const res = await fetch(api('/api/reports'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", 
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 400 && data.errors) {
          const flatErrors = Object.values(data.errors).flat().join(", ");
          setError(`Data tidak valid: ${flatErrors}`);
        } else {
          setError(data.message || "Gagal mengirim laporan. Coba lagi nanti.");
        }
        setIsLoading(false);
        return;
      }

      // === SUKSES ===
      setIsLoading(false);
      onSubmitted(); 
      
    } catch (err: any) {
      console.error("[ReportDialog] Fetch error:", err);
      setIsLoading(false);
      setError("Tidak dapat terhubung ke server.");
    }
  };

  // Render null jika 'isOpen' adalah false
  if (!isOpen) return null; // <-- Menggunakan 'isOpen'

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()} 
      >
        {/* Tombol Close */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 rounded-full p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
        
        <h2 className="text-xl font-semibold text-neutral-900">
          Laporkan Lowongan
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Bantu kami menjaga komunitas tetap aman.
        </p>

        {/* Info Lowongan (Read-only) */}
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="truncate text-sm font-medium text-neutral-800">
            {jobTitle || "Memuat..."}
          </p>
          <p className="truncate text-sm text-neutral-600">
            {employerName || "Memuat..."}
          </p>
        </div>

        {/* Form Laporan */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Alasan (Dropdown) */}
          <div>
            <label
              htmlFor="reason"
              className="mb-1 block text-sm font-medium text-neutral-700"
            >
              Alasan Pelaporan
            </label>
            <select
              id="reason"
              name="reason"
              value={reason} 
              onChange={(e) => setReason(e.target.value as ReportReason)}
              className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              {(Object.keys(reasonLabels) as ReportReason[]).map((key) => (
                <option key={key} value={key}> {/* value="SCAM" */}
                  {reasonLabels[key]} {/* teks="Spam / Penipuan" */}
                </option>
              ))}
            </select>
          </div>

          {/* Catatan (Textarea) */}
          <div>
            <label
              htmlFor="details"
              className="mb-1 block text-sm font-neutral-700"
            >
              Catatan Tambahan (Opsional)
            </label>
            <textarea
              id="details"
              name="details"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Berikan detail lebih lanjut..."
              className="block w-full rounded-lg border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div
              className="rounded-md bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading || !jobId}
              className="rounded-lg border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:bg-blue-400"
            >
              {isLoading ? "Mengirim..." : "Kirim Laporan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Icon sederhana
function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}