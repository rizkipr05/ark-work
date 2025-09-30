const KEY = "__ark_jobs_updated__";

export function emitJobsUpdated() {
  // 1) Event di tab/halaman yang sama
  try { window.dispatchEvent(new Event("ark:jobs-updated")); } catch {}

  // 2) “Pulse” ke semua tab via localStorage (storage event)
  try {
    localStorage.setItem(KEY, String(Date.now()));
    // optionally bersihkan biar gak numpuk
    setTimeout(() => localStorage.removeItem(KEY), 250);
  } catch {}
}

export function listenJobsUpdated(handler: () => void) {
  const onCustom = () => handler();
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY && e.newValue) handler();
  };

  window.addEventListener("ark:jobs-updated", onCustom);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("ark:jobs-updated", onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
