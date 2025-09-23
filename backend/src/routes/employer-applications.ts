// src/routes/employer-applications.ts
import { Router, Request, Response } from 'express';
import prisma from '../utils/prisma'; // atau { prisma } from '../lib/prisma'
import { withEmployerSession } from '../middleware/employer-session';

const router = Router();

/**
 * GET /api/employers/applications?jobId=<optional>
 * Sumber employerId: dari cookie session (withEmployerSession)
 */
router.get('/', withEmployerSession, async (req: Request, res: Response) => {
  try {
    const employerId = req.employerId as string | undefined;
    if (!employerId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const jobId = (req.query.jobId as string) || undefined;

    const paramsRows: any[] = [employerId];
    let filterJob = '';
    if (jobId) {
      paramsRows.push(jobId);
      filterJob = ` AND ja."jobId" = $2::uuid`;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      candidateName: string | null;
      candidateEmail: string | null;
      jobTitle: string;
      status: string;
      createdAt: Date;
    }>>(
      `
      SELECT
        ja.id,
        u.name  AS "candidateName",
        u.email AS "candidateEmail",
        j.title AS "jobTitle",
        ja.status,
        ja."createdAt" AS "createdAt"
      FROM job_applications ja
      JOIN jobs j       ON j.id = ja."jobId"
      LEFT JOIN "User" u ON u.id = ja."applicantId"
      WHERE j.employer_id = $1::uuid
      ${filterJob}
      ORDER BY ja."createdAt" DESC
      `,
      ...paramsRows
    );

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
      ORDER BY ja.status
      `,
      ...paramsCnt
    );

    const counters = { submitted: 0, review: 0, shortlist: 0, rejected: 0, hired: 0 };
    for (const c of countersRaw) {
      const k = c.status as keyof typeof counters;
      if (k in counters) counters[k] = Number(c.total);
    }

    res.json({ ok: true, data: { rows, counters } });
  } catch (e: any) {
    console.error('[GET /api/employers/applications] error:', e);
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

export default router;
