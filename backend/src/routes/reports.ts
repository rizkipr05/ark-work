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

/** UBAH path ini jika route admin kamu berbeda */
function buildTargetUrl(jobId: string | number | null | undefined): string | null {
  if (!jobId) return null;
  return `/admin/employer-jobs/${jobId}`;
}

/** Seragamkan shape response untuk FE */
function toDto(r: any) {
  const createdISO =
    r?.createdAt?.toISOString?.() ??
    (r?.createdAt ? new Date(r.createdAt).toISOString() : null);

  return {
    id: r.id,
    judul: r.job?.title ?? '-',
    perusahaan: r.job?.employer?.displayName ?? '-',
    alasan: r.reason,
    catatan: r.details ?? '',
    status: r.status as ReportStatus,

    // tanggal sesuai ekspektasi FE
    dibuatPada: createdISO,
    createdAt: createdISO,

    // info target untuk link
    targetType: 'JOB' as const,
    targetId: r.jobId ?? null,
    targetSlug: null as string | null, // tidak pakai slug
    targetUrl: buildTargetUrl(r.jobId),
  };
}

/* -------------------------- CREATE -------------------------- */
/**
 * POST /api/reports
 * Body (salah satu):
 *  - { jobId, alasan?, catatan?, evidenceUrl?, reporterUserId?, reporterEmail? }
 *  - { judul, perusahaan, alasan?, catatan? } -> backend lookup jobId
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
    } = (req.body ?? {}) as {
      jobId?: string;
      judul?: string;
      perusahaan?: string;
      alasan?: string;
      catatan?: string;
      evidenceUrl?: string;
      reporterUserId?: string;
      reporterEmail?: string;
    };

    let jobId = (rawJobId || '').trim();

    // fallback cari job dari judul + perusahaan
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

    return res.status(201).json({ ok: true, data: toDto(created) });
  } catch (e: any) {
    console.error('[reports] POST / error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* ---------------------------- LIST --------------------------- */
/**
 * GET /api/reports?q=
 * Return shape untuk tabel admin + link target
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

    const data = rows.map(toDto);
    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error('[reports] GET / error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* --------------------------- UPDATE -------------------------- */
/**
 * PATCH /api/reports/:id
 * Body: { status?: 'baru'|'proses'|'tutup'|'abaikan'|ReportStatus, catatan?: string }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const status = mapStatusInput(req.body?.status);
    const details =
      typeof req.body?.catatan === 'string' ? (req.body.catatan as string) : undefined;

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

    return res.json({ ok: true, data: toDto(updated) });
  } catch (e: any) {
    console.error('[reports] PATCH /:id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* --------------------------- DELETE -------------------------- */
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

export default router;
