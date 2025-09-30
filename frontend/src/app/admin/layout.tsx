// src/app/admin/layout.tsx
import type { Metadata } from "next";
import AdminSidebar from "./components/AdminSidebar";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

export const metadata: Metadata = {
  title: "Admin | ArkWork",
};

// Basis API (fallback ke localhost saat dev)
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000";

/**
 * Cek login admin di server-side.
 * Penting: teruskan cookie + UA agar backend bisa baca sesi.
 */
async function requireAdmin() {
  const ck = cookies(); // cookie dari incoming request
  const hs = headers();

  try {
    const r = await fetch(`${API_BASE}/api/admin/me`, {
      method: "GET",
      // credentials tidak berpengaruh di server; kirim cookie manual
      headers: {
        cookie: ck.toString(),
        "user-agent": hs.get("user-agent") ?? "",
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!r.ok) redirect("/admin/login");

    const j = (await r.json().catch(() => null)) as any;
    if (!j?.user) redirect("/admin/login");

    return j.user as { id: string; role: string; name?: string };
  } catch (e) {
    console.error("[admin/layout] fetch /api/admin/me error:", e);
    redirect("/admin/login");
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pastikan user adalah admin sebelum render UI
  await requireAdmin();

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Sidebar kiri (client component) */}
      <AdminSidebar />

      {/* Konten utama geser 72 (lebar sidebar) saat md+ */}
      <div className="md:pl-72">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-neutral-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center">
            <h1 className="text-lg font-semibold text-neutral-900">
              Admin Dashboard
            </h1>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
