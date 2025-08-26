import { Router, Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-1.5-flash";

if (!GEMINI_API_KEY) {
  console.warn("[ArkWork Agent] GEMINI_API_KEY belum di-set.");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");

type MsgIn = { role: string; content: string };
type Profile = {
  name?: string;
  role?: string;
  skills?: string;
  location?: string;
  experienceYears?: number;
  interests?: string;
};

function toGeminiHistory(messages: MsgIn[]) {
  return messages
    .filter((m) => m.content?.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
}

function buildSystemPrompt(intent: string, profile?: Profile) {
  const base = `
Kamu adalah **ArkWork Agent**, asisten situs ArkWork.
Jawablah dalam **Bahasa Indonesia** yang jelas, ringkas, dan ramah profesional.
Fokus: industri migas (oil & gas) Indonesia & global, LNG, utilities, dan karier terkait energi.

**Aturan umum (WAJIB):**
- Jawab dalam **Markdown** yang terstruktur (heading, bullet/numbered list, tabel bila cocok).
- Jika jawaban panjang, **mulai dengan TL;DR** (1–2 kalimat ringkas).
- Sertakan **langkah praktis** (step-by-step), checklist, dan contoh konkret.
- Jangan mengarang angka/fakta real-time jika tidak yakin.
- Untuk saran karier/konsultasi: berikan **alasan**, **alternatif**, dan **risiko** singkat.
- Hindari klaim medis/keuangan/hukum spesifik; beri disclaimer ringan & sarankan ahli bila perlu.
- Jika menyebut sumber, **jangan buat tautan palsu**; cukup tulis nama sumber/keyword yang bisa dicari.

**Profil pengguna (opsional):**
${profile ? JSON.stringify(profile, null, 2) : "(tidak ada profil)"}  
`;

  const modes: Record<string, string> = {
    news: `
Mode: **Berita**
- Ringkas padat + poin penting + konteks singkat.
- Boleh sarankan keyword yang bisa dicari di halaman O&G Monitor.
`,
    jobs: `
Mode: **Rekomendasi Kerja**
- Beri: role target, alasan cocok, skill gap, sertifikasi opsional, contoh keyword lowongan, rencana 30/60/90 hari (list).
- Jika profil minim, tanyakan 1–2 klarifikasi singkat.
`,
    consult: `
Mode: **Konsultasi**
- Struktur: *Masalah → Opsi & trade-off → Rencana aksi (bullet) → Risiko → Next steps (3–5 butir)*.
`,
  };

  const mode = modes[intent] || modes.news;
  return (
    base +
    "\n" +
    mode +
    "\nBalas dalam **Markdown**, ringkas, to the point, dan mudah dieksekusi."
  );
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const messages = (body.messages ?? []) as MsgIn[];
    const user = messages[messages.length - 1]?.content || "";
    const intent: string = body.intent || "news";
    const profile: Profile | undefined = body.profile;

    if (!user?.trim()) {
      return res.json({
        answer:
          "Halo! Saya ArkWork Agent. Saya bisa bantu ringkas berita migas, rekomendasi kerja, dan konsultasi langkah praktis. Coba: **Rekomendasikan role untuk operator kilang dengan pengalaman 2 tahun di Balikpapan.**",
      });
    }

    const system = buildSystemPrompt(intent, profile);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: system }] },
        { role: "model", parts: [{ text: "Siap." }] },
        ...toGeminiHistory(messages.slice(0, -1)),
      ],
    });

    const result = await chat.sendMessage(user);
    const text = result.response.text();

    return res.json({ answer: text?.trim() || "Maaf, saya tidak menemukan jawaban." });
  } catch (err) {
    console.error("[ArkWork Agent] Error:", err);
    return res.status(500).json({ answer: "Maaf, terjadi kesalahan di server." });
  }
});

export default router;
