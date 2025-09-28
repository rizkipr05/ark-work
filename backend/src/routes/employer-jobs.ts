// backend/src/routes/employer-jobs.ts
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { mapJobToDTO } from "../utils/job-dto";

const router = Router();

/**
 * GET /api/employer/jobs?employerId=uuid
 * Mengembalikan SEMUA job milik employer tsb (aktif/nonaktif) agar admin bisa moderasi.
 */
router.get("/jobs", async (req, res) => {
  try {
    const employerId = String(req.query.employerId || "").trim();
    if (!employerId) {
      return res.status(400).json({ error: "employerId is required" });
    }

    const rows = await prisma.job.findMany({
      where: { employerId },
      orderBy: { createdAt: "desc" },
      include: { employer: { include: { profile: true } } },
    });

    return res.json({ data: rows.map(mapJobToDTO) });
  } catch (e) {
    console.error("[GET /api/employer/jobs] error:", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
