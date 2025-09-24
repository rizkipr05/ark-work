import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { withEmployerSession } from "../middleware/employer-session";

const router = Router();

/**
 * GET /api/employers/applications?jobId=<optional>
 * employerId diambil dari cookie session (withEmployerSession)
 */
router.get("/", withEmployerSession, async (req: Request, res: Response) => {
  try {
    const employerId = (req as any).employerId as string | undefined;
    if (!employerId) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const jobId = (req.query.jobId as string | undefined) || undefined;

    // ------- Rows (list aplikasi) -------
    const paramsRows: any[] = [employerId];
    let filterJob = "";
    if (jobId) {
      paramsRows.push(jobId);
      filterJob = ` AND ja."jobId" = $2::uuid`;
    }

    const rowsRaw = await prisma.$queryRawUnsafe<Array<{
      id: string;
      candidateName: string | null;
      candidateEmail: string | null;
      jobTitle: string;
      status: string;
      createdAt: Date;         // <- penting: "createdAt" (camelCase)
      cv_url: string | null;
      cv_file_name: string | null;
      cv_file_type: string | null;
      cv_file_size: number | null;
    }>>(
      `
      SELECT
        ja.id,
        u.name               AS "candidateName",
        u.email              AS "candidateEmail",
        j.title              AS "jobTitle",
        ja.status            AS "status",
        ja."createdAt"       AS "createdAt",     -- <- gunakan "createdAt"
        ja.cv_url,
        ja.cv_file_name,
        ja.cv_file_type,
        ja.cv_file_size
      FROM job_applications ja
      JOIN jobs j          ON j.id = ja."jobId"
      LEFT JOIN "User" u   ON u.id = ja."applicantId"
      WHERE j.employer_id = $1::uuid
      ${filterJob}
      ORDER BY ja."createdAt" DESC
      `,
      ...paramsRows
    );

    // Normalisasi supaya FE enak pakai
    const rows = rowsRaw.map(r => ({
      id: r.id,
      candidateName: r.candidateName ?? "-",
      candidateEmail: r.candidateEmail ?? null,
      jobTitle: r.jobTitle,
      status: r.status,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      cv: r.cv_url
        ? { url: r.cv_url, name: r.cv_file_name, type: r.cv_file_type, size: r.cv_file_size }
        : null,
    }));

    // ------- Counters (ringkasan per status) -------
    const paramsCnt: any[] = [employerId];
    let filterCnt = "";
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

    return res.json({ ok: true, data: { rows, counters } });
  } catch (e: any) {
    console.error("[GET /api/employers/applications] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal error" });
  }
});

export default router;
