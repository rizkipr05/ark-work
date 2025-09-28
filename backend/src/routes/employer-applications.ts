import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { withEmployerSession } from '../middleware/employer-session';
import { ApplicationStatus } from '@prisma/client';

const router = Router();

/**
 * GET /api/employers/applications?jobId=<optional>&page=1&pageSize=20
 * employerId diambil dari cookie session (withEmployerSession)
 */
router.get('/', withEmployerSession, async (req: Request, res: Response) => {
  try {
    const employerId = (req as any).employerId as string | undefined;
    if (!employerId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const jobId = (req.query.jobId as string | undefined) || undefined;

    // pagination optional
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const offset = (page - 1) * pageSize;

    // simple UUID check agar error DB lebih jelas
    const isUuid = (s?: string) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
    if (jobId && !isUuid(jobId)) {
      return res.status(400).json({ ok: false, error: 'jobId harus UUID' });
    }

    /* ================= Rows ================= */
    const paramsRows: any[] = [employerId];
    let filterJob = '';
    if (jobId) {
      paramsRows.push(jobId);
      filterJob = ` AND ja."jobId" = $2::uuid`;
    }
    paramsRows.push(pageSize, offset); // $n-1 pageSize, $n offset

    const rowsRaw = await prisma.$queryRawUnsafe<Array<{
      id: string;
      candidateName: string | null;
      candidateEmail: string | null;
      jobTitle: string;
      status: string;
      createdAt: Date;
      cv_url: string | null;
      cv_file_name: string | null;
      cv_file_type: string | null;
      cv_file_size: number | null;
    }>>(
      `
      SELECT
        ja.id,
        u.name             AS "candidateName",
        u.email            AS "candidateEmail",
        j.title            AS "jobTitle",
        ja.status          AS "status",
        ja."createdAt"     AS "createdAt",
        ja.cv_url,
        ja.cv_file_name,
        ja.cv_file_type,
        ja.cv_file_size
      FROM job_applications ja
      JOIN jobs j        ON j.id = ja."jobId"
      LEFT JOIN "User" u ON u.id = ja."applicantId"
      WHERE j.employer_id = $1::uuid
      ${filterJob}
      ORDER BY ja."createdAt" DESC
      LIMIT $${paramsRows.length - 1} OFFSET $${paramsRows.length}
      `,
      ...paramsRows
    );

    const rows = rowsRaw.map((r) => ({
      id: r.id,
      candidateName: r.candidateName ?? '-',
      candidateEmail: r.candidateEmail ?? null,
      jobTitle: r.jobTitle,
      status: r.status,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      cv: r.cv_url
        ? { url: r.cv_url, name: r.cv_file_name, type: r.cv_file_type, size: r.cv_file_size }
        : null,
    }));

    /* ================= Counters ================= */
    const paramsCnt: any[] = [employerId];
    let filterCnt = '';
    if (jobId) {
      paramsCnt.push(jobId);
      filterCnt = ` AND ja."jobId" = $2::uuid`;
    }

    const countersRaw = await prisma.$queryRawUnsafe<Array<{ status: string; total: bigint }>>(
      `
      SELECT ja.status, COUNT(*)::bigint AS total
      FROM job_applications ja
      JOIN jobs j ON j.id = ja."jobId"
      WHERE j.employer_id = $1::uuid
      ${filterCnt}
      GROUP BY ja.status
      `,
      ...paramsCnt
    );

    const counters = { submitted: 0, review: 0, shortlist: 0, rejected: 0, hired: 0 };
    for (const c of countersRaw) {
      const key = c.status as keyof typeof counters;
      if (key in counters) counters[key] = Number(c.total);
    }

    return res.json({ ok: true, data: { rows, counters, page, pageSize } });
  } catch (e: any) {
    console.error('[GET /api/employers/applications] error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/**
 * PATCH /api/employers/applications/:id
 * Body: { status: 'submitted' | 'review' | 'shortlist' | 'rejected' | 'hired' }
 * Hanya boleh untuk aplikasi yang job-nya milik employer yang login.
 */
router.patch('/:id', withEmployerSession, async (req: Request, res: Response) => {
  try {
    const employerId = (req as any).employerId as string | undefined;
    if (!employerId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const id = req.params.id;
    const statusRaw: string = (req.body?.status || '').toString().toLowerCase();

    const allowed: ApplicationStatus[] = ['submitted', 'review', 'shortlist', 'rejected', 'hired'];
    if (!allowed.includes(statusRaw as ApplicationStatus)) {
      return res.status(400).json({ ok: false, error: 'Invalid status' });
    }

    // Cek kepemilikan
    const app = await prisma.jobApplication.findUnique({
      where: { id },
      select: { id: true, job: { select: { employerId: true } } },
    });
    if (!app || app.job.employerId !== employerId) {
      return res.status(404).json({ ok: false, error: 'Application not found' });
    }

    const updated = await prisma.jobApplication.update({
      where: { id },
      data: { status: statusRaw as ApplicationStatus },
      select: { id: true, status: true, updatedAt: true },
    });

    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error('[PATCH /api/employers/applications/:id] error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

export default router;
