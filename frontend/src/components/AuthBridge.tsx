"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

/** Ambil ID user tanpa menyentuh properti yang tak ada di tipe */
function pickUserId(u: unknown): string | null {
  if (!u || typeof u !== "object") return null;
  const anyUser = u as Record<string, unknown>;
  // Daftar kandidat yang aman dan umum
  const keys = ["id", "email", "userId", "uuid", "identifier"];
  for (const k of keys) {
    const v = anyUser[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/**
 * Bridge AuthContext -> localStorage.ark_current
 * - Jika user ada => set ark_current
 * - Jika user null  => hapus ark_current
 */
export default function AuthBridge() {
  const { user } = useAuth?.() || ({} as any);

  useEffect(() => {
    try {
      const nextId = pickUserId(user);
      const cur = typeof window !== "undefined" ? localStorage.getItem("ark_current") : null;

      if (nextId) {
        if (cur !== nextId) {
          localStorage.setItem("ark_current", nextId);
          window.dispatchEvent(new Event("storage"));
        }
      } else if (cur) {
        localStorage.removeItem("ark_current");
        window.dispatchEvent(new Event("storage"));
      }
    } catch {
      /* no-op */
    }
  }, [user]);

  return null;
}
