// src/app/admin/layout.tsx
import type { Metadata } from "next";
import React from "react";
import AdminSidebar from "./components/AdminSidebar";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

/**
 * Admin Root Layout (single-file solution)
 *
 * Behavior:
 *  - Detect incoming pathname (via Next headers if available).
 *  - If pathname is /admin/login (public login page) => SKIP auth check (prevent loop).
 *  - Otherwise forward cookies to backend /api/admin/me to verify admin session.
 *  - If backend returns 200 => render UI (sidebar + children).
 *  - If not authorized => redirect('/admin/login').
 *
 * Notes:
 *  - Set NEXT_PUBLIC_API_BASE or NEXT_PUBLIC_API_URL to your backend origin (e.g. http://localhost:4000).
 *  - Backend must expose /api/admin/me and set admin cookie (admin_token) from signin.
 *  - This is a pragmatic single-file fix; recommended long-term: move protected pages under route-group (protected).
 */

export const metadata: Metadata = {
  title: "Admin | ArkWork",
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000";

/** Helper: get the incoming pathname in server environment (best-effort) */
function getIncomingPathname(): string {
  try {
    const hs = headers();
    // Try commonly available header keys Next uses internally.
    // These headers are present in many Next server environments; if not found, fallback to empty string.
    const xInvoke = hs.get("x-invoke-pathname");
    if (xInvoke) return String(xInvoke);

    const xPathname = hs.get("x-pathname");
    if (xPathname) return String(xPathname);

    // Some setups use x-nextjs-data or referer info — last resort try referer (may be absent)
    const referer = hs.get("referer");
    if (referer) {
      try {
        const u = new URL(referer);
        return u.pathname || "";
      } catch {
        // ignore
      }
    }

    // If none available, return empty (we will assume protected and run check)
    return "";
  } catch (err) {
    // headers() can throw in odd contexts — return empty string to be safe
    return "";
  }
}

/** Server-side check: call backend /api/admin/me forwarding cookies */
async function verifyAdminServerSide(): Promise<boolean> {
  try {
    const ck = cookies().toString(); // incoming cookies string
    const res = await fetch(`${API_BASE}/api/admin/me`, {
      method: "GET",
      headers: {
        // forward cookie so backend can verify session token
        cookie: ck,
        accept: "application/json",
      },
      cache: "no-store",
    });
    return res.status === 200;
  } catch (err) {
    console.error("[admin/layout] verifyAdminServerSide error:", err);
    return false;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // determine incoming pathname (best-effort)
  const pathname = getIncomingPathname().replace(/\/+$/, "") || ""; // normalize (no trailing slash)

  // If the request pathname is /admin/login or /admin/login (with trailing slash), skip check to avoid redirect loop
  if (pathname === "/admin/login" || pathname === "/admin/login/") {
    // Render minimal wrapper for login page (login page itself is client component)
    return <>{children}</>;
  }

  // Also allow direct /admin (root) to be checked normally (we do verification)
  const ok = await verifyAdminServerSide();
  if (!ok) {
    // Not authenticated — redirect to login
    redirect("/admin/login");
    // redirect will throw NEXT_REDIRECT internally (expected)
  }

  // If we're here, admin is authenticated — render the admin layout including sidebar
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Sidebar kiri (client component) */}
      <AdminSidebar />

      {/* Konten utama geser 72 (lebar sidebar) saat md+ */}
      <div className="md:pl-72">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-neutral-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center">
            <h1 className="text-lg font-semibold text-neutral-900">Admin Dashboard</h1>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
