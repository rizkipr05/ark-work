import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authRequired } from "../middleware/role";

const router = Router();

/**
 * POST /api/applications
 * body: { jobId: string }
 * guard: USER login (cookie user_token)
 */
router.post("/", authRequired, async (req, res) => {
  try {
    const { jobId } = (req.body || {}) as { jobId?: string };
    if (!jobId) {
      return res.status(400).json({ ok: false, error: "jobId required" });
    }

    // user id dari middleware (cookie user_token)
    const user = (req as any).auth as { uid: string };
    const userId = user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
    }

    // pastikan job ada & aktif
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, isActive: true },
    });

    if (!job || !job.isActive) {
      return res.status(404).json({ ok: false, error: "Job not found/active" });
    }

    // upsert (unik per user x job)
    const created = await prisma.jobApplication.upsert({
      where: { jobId_applicantId: { jobId, applicantId: userId } },
      create: { jobId, applicantId: userId },
      update: {}, // sudah ada → tidak apa-apa
      include: {
        job: { select: { id: true, title: true } },
      },
    });

    return res.json({
      ok: true,
      data: {
        id: created.id,
        jobTitle: created.job.title,
        status: created.status,
        createdAt: created.createdAt,
      },
    });
  } catch (e: any) {
    console.error("[POST /api/applications] error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

export default router;
