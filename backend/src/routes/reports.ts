// backend/src/routes/reports.ts
import { Router } from "express";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

/** CREATE report */
router.post("/", async (req, res) => {
  try {
    const { judul, perusahaan, alasan, catatan } = (req.body ?? {}) as {
      judul?: string;
      perusahaan?: string;
      alasan?: string;
      catatan?: string;
    };

    if (!judul || !perusahaan) {
      return res.status(400).json({ error: "judul & perusahaan wajib" });
    }

    const created = await prisma.report.create({
      data: {
        judul,
        perusahaan,
        alasan: alasan || "Lainnya",
        catatan: catatan || "",
        status: "baru",
      },
    });

    res.status(201).json(created);
  } catch (e: any) {
    console.error("[reports] POST / error:", e);
    res.status(500).json({ error: e?.message || "Internal error" });
  }
});

/** LIST reports (optional: ?q=) */
router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();

    // ⬇️ ketik eksplisit sebagai Prisma.ReportWhereInput
    let where: Prisma.ReportWhereInput = {};

    if (q) {
      where = {
        OR: [
          { judul:      { contains: q, mode: Prisma.QueryMode.insensitive } },
          { perusahaan: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { alasan:     { contains: q, mode: Prisma.QueryMode.insensitive } },
          { catatan:    { contains: q, mode: Prisma.QueryMode.insensitive } },
          { status:     { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      };
    }

    const items = await prisma.report.findMany({
      where,
      orderBy: { dibuatPada: "desc" }, // pastikan kolom ini ada di schema
    });

    res.json(items);
  } catch (e: any) {
    console.error("[reports] GET / error:", e);
    res.status(500).json({ error: e?.message || "Internal error" });
  }
});

/** UPDATE status */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const { status } = (req.body ?? {}) as { status?: string };

    const updated = await prisma.report.update({
      where: { id },
      data: { status },
    });

    res.json(updated);
  } catch (e: any) {
    console.error("[reports] PATCH /:id error:", e);
    res.status(500).json({ error: e?.message || "Internal error" });
  }
});

/** DELETE report */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    await prisma.report.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[reports] DELETE /:id error:", e);
    res.status(500).json({ error: e?.message || "Internal error" });
  }
});

export default router;
