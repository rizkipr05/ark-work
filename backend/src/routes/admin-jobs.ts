// backend/src/routes/admin-jobs.ts
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

/**
 * GET /api/admin/jobs
 * Query:
 *  - q=keyword
 *  - employerId=uuid
 *  - status=active|draft|hidden|deleted|all (default: active)
 *  - page=1&limit=20
 *
 * Tanpa kolom deletedAt:
 *  - "deleted" & "hidden": isActive=false && isDraft=false
 *  - "active":  isActive=true && isDraft=false
 *  - "draft":   isDraft=true
 */
router.get("/admin/jobs", requireAdmin, async (req, res) => {
  try {
    const { q, employerId, status = "active", page = "1", limit = "20" } =
      req.query as Record<string, string>;

    const take = Math.min(Number.parseInt(String(limit), 10) || 20, 100);
    const pageNum = Math.max(Number.parseInt(String(page), 10) || 1, 1);
    const skip = (pageNum - 1) * take;

    const where: any = {};

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
        // cari juga di nama employer (relasi)
        { employer: { is: { displayName: { contains: q, mode: "insensitive" } } } },
      ];
    }

    if (employerId) where.employerId = String(employerId);

    switch (String(status)) {
      case "active":
        Object.assign(where, { isActive: true, isDraft: false });
        break;
      case "draft":
        Object.assign(where, { isDraft: true });
        break;
      case "hidden":
      case "deleted":
        Object.assign(where, { isActive: false, isDraft: false });
        break;
      case "all":
      default:
        break;
    }

    const [items, total] = await Promise.all([
      prisma.job.findMany({
        where,
        // PAKAI createdAt karena postedAt tidak ada di schema kamu
        orderBy: { createdAt: "desc" },
        take,
        skip,
        select: {
          id: true,
          title: true,
          isActive: true,
          isDraft: true,
          createdAt: true,       // ← digunakan di tabel admin
          employerId: true,
          location: true,        // ← kolom yang ditampilkan di FE admin
          employment: true,
          description: true,
          employer: { select: { id: true, displayName: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    res.json({ items, total, page: pageNum, limit: take });
  } catch (e: any) {
    console.error("[/api/admin/jobs] error:", e);
    res.status(500).json({ message: e?.message || "Failed to fetch jobs" });
  }
});

/** SOFT DELETE = set isActive=false */
router.delete("/admin/jobs/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.job.update({ where: { id }, data: { isActive: false } });
    res.status(204).end();
  } catch (e: any) {
    console.error("[soft delete] error:", e);
    res.status(500).json({ message: e?.message || "Soft delete failed" });
  }
});

/** HARD DELETE = hapus permanen */
router.delete("/admin/jobs/:id/hard", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.$transaction(async (tx) => {
      // Hapus child kalau FK RESTRICT (uncomment kalau perlu)
      // await tx.application.deleteMany({ where: { jobId: id } });
      // await tx.savedJob.deleteMany({ where: { jobId: id } });
      // await tx.jobReport.deleteMany({ where: { jobId: id } });

      await tx.job.delete({ where: { id } });
    });
    res.status(204).end();
  } catch (e: any) {
    console.error("[hard delete] error:", e);
    res.status(400).json({ message: e?.message || "Hard delete failed" });
  }
});

export default router;
