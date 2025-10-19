import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma, ReportReason, ReportStatus } from '@prisma/client';

const router = Router();

/* -------------------------- Helpers -------------------------- */

function mapStatusInput(s?: string): ReportStatus | undefined {
  if (!s) return undefined;
  const v = String(s).toLowerCase().trim();
  if (v === 'baru' || v === 'open') return ReportStatus.OPEN;
  if (v === 'proses' || v === 'under_review' || v === 'underreview' || v === 'review')
    return ReportStatus.UNDER_REVIEW;
  if (v === 'tutup' || v === 'selesai' || v === 'action_taken' || v === 'actiontaken')
    return ReportStatus.ACTION_TAKEN;
  if (v === 'abaikan' || v === 'dismissed') return ReportStatus.DISMISSED;
  return (v as unknown) as ReportStatus;
}

function mapReasonInput(r?: string): ReportReason {
  if (!r) return ReportReason.OTHER;
  const v = String(r).toUpperCase().replace(/\s+/g, '_') as keyof typeof ReportReason;
  return (ReportReason[v] ?? ReportReason.OTHER) as ReportReason;
}

/* -------------------------- CREATE -------------------------- */
/**
 * POST /api/reports
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      jobId: rawJobId,
      judul,
      perusahaan,
      alasan,
      catatan,
      evidenceUrl,
      reporterUserId,
      reporterEmail,
    } = (req.body ?? {}) as any;

    let jobId = (rawJobId || '').trim();

    if (!jobId && judul && perusahaan) {
      const found = await prisma.job.findFirst({
        where: {
          title: judul,
          employer: { displayName: perusahaan },
        },
        select: { id: true },
      });
      if (found) jobId = found.id;
    }

    if (!jobId) {
      return res.status(400).json({ ok: false, error: 'jobId (atau judul+perusahaan) diperlukan' });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!job) return res.status(404).json({ ok: false, error: 'Job tidak ditemukan' });

    const created = await prisma.jobReport.create({
      data: {
        jobId,
        reason: mapReasonInput(alasan),
        details: catatan ?? null,
        evidenceUrl: evidenceUrl ?? null,
        reporterUserId: reporterUserId ?? null,
        reporterEmail: reporterEmail ?? null,
      },
      include: {
        job: { select: { title: true, employer: { select: { displayName: true } } } },
      },
    });

    return res.status(201).json({
      ok: true,
      data: {
        id: created.id,
        judul: created.job?.title ?? '-',
        perusahaan: created.job?.employer?.displayName ?? '-',
        alasan: created.reason,
        catatan: created.details ?? '',
        status: created.status,
        dibuat: created.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    console.error('[reports] POST / error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* ---------------------------- LIST --------------------------- */
/**
 * GET /api/reports?q=
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();

    let where: Prisma.JobReportWhereInput = {};
    if (q) {
      where = {
        OR: [
          { details: { contains: q, mode: 'insensitive' } },
          { evidenceUrl: { contains: q, mode: 'insensitive' } },
          { job: { title: { contains: q, mode: 'insensitive' } } },
          {
            job: {
              employer: { displayName: { contains: q, mode: 'insensitive' } },
            },
          },
        ],
      };
    }

    const rows = await prisma.jobReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        job: { select: { title: true, employer: { select: { displayName: true } } } },
      },
    });

    const data = rows.map((r) => ({
      id: r.id,
      judul: r.job?.title ?? '-',
      perusahaan: r.job?.employer?.displayName ?? '-',
      alasan: r.reason,
      catatan: r.details ?? '',
      status: r.status,
      dibuat: r.createdAt?.toISOString?.() ?? new Date(r.createdAt).toISOString(),
      // optional fields for frontend deep-linking
      targetType: 'JOB',
      targetId: r.jobId,
      targetSlug: undefined,
      targetUrl: `/admin/employer-jobs/${r.jobId}`,
    }));

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error('[reports] GET / error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* --------------------------- UPDATE -------------------------- */
/**
 * PATCH /api/reports/:id
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const status = mapStatusInput(req.body?.status);
    const details = typeof req.body?.catatan === 'string' ? (req.body.catatan as string) : undefined;

    const updated = await prisma.jobReport.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(details !== undefined ? { details } : {}),
        updatedAt: new Date(),
      },
      include: {
        job: { select: { title: true, employer: { select: { displayName: true } } } },
      },
    });

    return res.json({
      ok: true,
      data: {
        id: updated.id,
        judul: updated.job?.title ?? '-',
        perusahaan: updated.job?.employer?.displayName ?? '-',
        alasan: updated.reason,
        catatan: updated.details ?? '',
        status: updated.status,
        dibuat: updated.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    console.error('[reports] PATCH /:id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* --------------------------- DELETE (single) -------------------------- */
/**
 * DELETE /api/reports/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    await prisma.jobReport.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[reports] DELETE /:id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* --------------------------- DELETE BY JOB -------------------------- */
/**
 * DELETE /api/admin/reports/by-job/:jobId
 * (frontend calls /api/admin/reports/by-job/:jobId)
 *
 * Hapus semua laporan yang menunjuk jobId tersebut.
 */
router.delete('/by-job/:jobId', async (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId ?? '').trim();
    if (!jobId) return res.status(400).json({ ok: false, error: 'jobId diperlukan' });

    // deleteMany agar aman walau tidak ada record
    const result = await prisma.jobReport.deleteMany({ where: { jobId } });

    return res.json({ ok: true, deleted: result.count });
  } catch (e: any) {
    console.error('[reports] DELETE /by-job/:jobId error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

export default router;
