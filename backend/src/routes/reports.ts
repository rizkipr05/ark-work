// backend/src/routes/reports.ts
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";

const router = Router();

/**
 * POST /api/reports
 * Body: { judul: string, perusahaan: string, alasan?: string, catatan?: string }
 */
router.post("/", async (req, res) => {
  try {
    const { judul, perusahaan, alasan, catatan } = req.body ?? {};
    if (!judul || !perusahaan) {
      return res.status(400).json({ ok: false, error: "judul & perusahaan wajib diisi" });
    }

    const report = await prisma.report.create({
      data: {
        judul,
        perusahaan,
        alasan: alasan || "Lainnya",
        catatan: catatan || "",
        status: "baru",
      },
    });

    return res.status(201).json({ ok: true, data: report });
  } catch (e: any) {
    console.error("[POST /api/reports] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Server Error" });
  }
});

/**
 * GET /api/reports
 * Query: ?q=<string> (optional filter)
 */
router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();

    let where: Prisma.ReportWhereInput = {};
    if (q) {
      where = {
        OR: [
          { judul: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { perusahaan: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { alasan: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { catatan: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { status: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      };
    }

    const items = await prisma.report.findMany({
      where,
      orderBy: { dibuatPada: "desc" }, // pastikan kolom ini ada di schema
    });

    return res.json({ ok: true, data: items });
  } catch (e: any) {
    console.error("[GET /api/reports] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Server Error" });
  }
});

/**
 * PATCH /api/reports/:id
 * Body: { status?: string }
 */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};

    if (!status) return res.status(400).json({ ok: false, error: "status wajib diisi" });

    const updated = await prisma.report.update({
      where: { id },
      data: { status },
    });

    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error("[PATCH /api/reports/:id] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Server Error" });
  }
});

/**
 * DELETE /api/reports/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.report.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e: any) {
    console.error("[DELETE /api/reports/:id] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Server Error" });
  }
});

export default router;
