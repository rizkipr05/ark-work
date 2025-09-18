// src/app/layout.tsx
import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Nav from "@/components/nav";
import Footer from "@/components/Footer";
import ClientShell from "./ClientShell";
import { AuthProvider } from "@/hooks/useAuth";
import { NextIntlClientProvider } from "next-intl";

// 👇 import bridge nya
import AuthBridge from "@/components/AuthBridge";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "ArkWork - Build Your Career in Energy & Oil & Gas",
  description: "Find the latest jobs, tenders, and trainings only on ArkWork",
  icons: { icon: "/logo", shortcut: "/logo", apple: "/logo" },
  openGraph: {
    title: "ArkWork - Build Your Career in Energy & Oil & Gas",
    description: "Find the latest jobs, tenders, and trainings only on ArkWork",
    images: [{ url: "/logo", width: 2000, height: 2000, alt: "ArkWork Logo" }],
  },
};

// Server helpers
async function resolveLocale(): Promise<"en" | "id"> {
  const ck = cookies().get("NEXT_LOCALE")?.value;
  if (ck === "en" || ck === "id") return ck;
  const accept = headers().get("accept-language") || "";
  return accept.startsWith("id") ? "id" : "en";
}
async function loadMessages(locale: "en" | "id") {
  switch (locale) {
    case "id":
      return (await import("../messages/id.json")).default;
    case "en":
    default:
      return (await import("../messages/en.json")).default;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveLocale();
  const messages = await loadMessages(locale);

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
          rel="stylesheet"
        />
      </head>
      <body className="bg-gray-50">
        {/* JANGAN pakai key dinamis di provider di bawah ini */}
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            {/* Bridge: sinkronkan useAuth().user -> localStorage.ark_current */}
            <AuthBridge />

            {/* Nav berada di dalam AuthProvider agar dapat snapshot user */}
            <Nav />

            {/* Pastikan ClientShell tidak remount pakai key dinamis */}
            <ClientShell>
              <main className="pt-16">{children}</main>
              <Footer />
            </ClientShell>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
