import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const jobsRouter = Router();

/* =================== Helpers =================== */
function toJobDTO(x: any) {
  return {
    id: x.id,
    title: x.title,
    location: x.location ?? '',
    employment: x.employment ?? '',
    description: x.description ?? '',
    postedAt: x.createdAt?.toISOString?.() ?? new Date(x.createdAt).toISOString(),
    company: x.employer?.displayName ?? 'Company',
    logoUrl: x.employer?.profile?.logoUrl ?? null,
    isActive: typeof x.isActive === 'boolean' ? x.isActive : null,
    isDraft: typeof x.isDraft === 'boolean' ? x.isDraft : null,
    // tidak ada kolom "status" di schema -> jangan expose
  };
}

/* =========================================================
   LIST
   - GET /api/jobs?active=1
   - GET /api/employer/jobs?employerId=...
   - GET /api/employer-jobs
========================================================= */

jobsRouter.get('/jobs', async (req, res) => {
  try {
    const onlyActive = String(req.query.active ?? '') === '1';

    const rows = await prisma.job.findMany({
      where: onlyActive ? { isActive: true, isDraft: false } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        isActive: true,
        isDraft: true,
        location: true,
        employment: true,
        employer: { select: { displayName: true, profile: { select: { logoUrl: true } } } },
      },
    });

    return res.json({ ok: true, data: rows.map(toJobDTO) });
  } catch (e: any) {
    console.error('GET /api/jobs error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

jobsRouter.get('/employer/jobs', async (req, res) => {
  try {
    const employerId = (req.query.employerId as string) || process.env.DEV_EMPLOYER_ID;
    if (!employerId) {
      return res.status(401).json({ ok: false, error: 'employerId tidak tersedia' });
    }

    const rows = await prisma.job.findMany({
      where: { employerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        isActive: true,
        isDraft: true,
        location: true,
        employment: true,
        employer: { select: { displayName: true, profile: { select: { logoUrl: true } } } },
      },
    });

    return res.json({ ok: true, data: rows.map(toJobDTO) });
  } catch (e: any) {
    console.error('GET /api/employer/jobs error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// alias list sederhana untuk admin/FE
jobsRouter.get('/employer-jobs', async (_req, res) => {
  try {
    const rows = await prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        isActive: true,
        isDraft: true,
        location: true,
        employment: true,
        employer: { select: { id: true, displayName: true } },
      },
    });

    return res.json({ ok: true, data: rows.map(toJobDTO) });
  } catch (e: any) {
    console.error('GET /api/employer-jobs error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* =========================================================
   CREATE
   - POST /api/employer/jobs
========================================================= */

jobsRouter.post('/employer/jobs', async (req, res) => {
  try {
    const {
      title,
      location,
      employment,
      description,
      isDraft,
      employerId: bodyEmployerId,
      logoDataUrl,
    } = req.body || {};

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ ok: false, error: 'title wajib diisi' });
    }

    const employerId = bodyEmployerId || process.env.DEV_EMPLOYER_ID;
    if (!employerId) {
      return res.status(401).json({ ok: false, error: 'Tidak ada employerId (login dulu)' });
    }

    if (logoDataUrl && typeof logoDataUrl === 'string') {
      await prisma.employer.update({
        where: { id: employerId },
        data: {
          profile: {
            upsert: {
              create: { logoUrl: logoDataUrl },
              update: { logoUrl: logoDataUrl },
            },
          },
        },
      });
    }

    const employer = await prisma.employer.findUnique({
      where: { id: employerId },
      select: { displayName: true, profile: { select: { logoUrl: true } } },
    });

    const job = await prisma.job.create({
      data: {
        employerId,
        title,
        description: description ?? null,
        location: (location ?? null) as any,
        employment: (employment ?? null) as any,
        isDraft: !!isDraft,
        isActive: !isDraft,
      } as any,
      select: {
        id: true,
        title: true,
        createdAt: true,
        description: true,
        isActive: true,
        location: true,
        employment: true,
      },
    });

    return res.json({
      ok: true,
      data: {
        id: job.id,
        title: job.title,
        location: job.location,
        employment: job.employment,
        description: job.description,
        postedAt: job.createdAt.toISOString(),
        company: employer?.displayName ?? 'Company',
        logoUrl: employer?.profile?.logoUrl ?? null,
        isActive: job.isActive,
      },
    });
  } catch (e: any) {
    console.error('POST /api/employer/jobs error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* =========================================================
   UPDATE / NONAKTIFKAN
   - PATCH /api/employer-jobs/:id
   - POST  /api/employer-jobs/:id/deactivate
   - PATCH /api/jobs/:id   (alias)
========================================================= */

jobsRouter.patch('/employer-jobs/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const raw = String(req.body?.status ?? '').toUpperCase();

    const data: any = {};
    if (raw === 'INACTIVE') data.isActive = false;
    if (raw === 'ACTIVE') data.isActive = true;
    // jika tidak ada status yang dikenali, tetap OK (no-op) agar tidak 400

    const updated = await prisma.job.update({
      where: { id },
      data,
      select: { id: true, isActive: true, isDraft: true },
    });

    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error('PATCH /api/employer-jobs/:id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// alias: PATCH /api/jobs/:id
jobsRouter.patch('/jobs/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const raw = String(req.body?.status ?? '').toUpperCase();

    const data: any = {};
    if (raw === 'INACTIVE') data.isActive = false;
    if (raw === 'ACTIVE') data.isActive = true;

    const updated = await prisma.job.update({
      where: { id },
      data,
      select: { id: true, isActive: true, isDraft: true },
    });

    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error('PATCH /api/jobs/:id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// POST /api/employer-jobs/:id/deactivate
jobsRouter.post('/employer-jobs/:id/deactivate', async (req, res) => {
  try {
    const id = String(req.params.id);
    const updated = await prisma.job.update({
      where: { id },
      data: { isActive: false } as any,
      select: { id: true, isActive: true, isDraft: true },
    });
    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error('POST /api/employer-jobs/:id/deactivate error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* =========================================================
   DELETE
   - DELETE /api/employer-jobs/:id            (soft)
   - DELETE /api/employer-jobs/:id?mode=hard  (hard)
   - POST   /api/employer-jobs/:id/hard-delete
   - DELETE /api/jobs/:id                     (alias; soft jika ?soft=1)
========================================================= */

jobsRouter.delete('/employer-jobs/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const isHard = String(req.query.mode || '').toLowerCase() === 'hard';

    if (isHard) {
      await prisma.job.delete({ where: { id } });
      return res.json({ ok: true, hard: true });
    }

    // Soft delete: prefer deletedAt, fallback ke isDraft+isActive
    try {
      const updated = await prisma.job.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false } as any,
        select: { id: true },
      });
      return res.json({ ok: true, soft: true, data: updated });
    } catch {
      const updated = await prisma.job.update({
        where: { id },
        data: { isDraft: true, isActive: false } as any,
        select: { id: true },
      });
      return res.json({ ok: true, soft: true, data: updated });
    }
  } catch (e: any) {
    console.error('DELETE /api/employer-jobs/:id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

jobsRouter.post('/employer-jobs/:id/hard-delete', async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.job.delete({ where: { id } });
    return res.json({ ok: true, hard: true });
  } catch (e: any) {
    console.error('POST /api/employer-jobs/:id/hard-delete error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// alias: DELETE /api/jobs/:id   (soft jika ?soft=1)
jobsRouter.delete('/jobs/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const soft = String(req.query.soft ?? '') === '1';

    if (soft) {
      try {
        const updated = await prisma.job.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false } as any,
          select: { id: true },
        });
        return res.json({ ok: true, soft: true, data: updated });
      } catch {
        const updated = await prisma.job.update({
          where: { id },
          data: { isDraft: true, isActive: false } as any,
          select: { id: true },
        });
        return res.json({ ok: true, soft: true, data: updated });
      }
    }

    await prisma.job.delete({ where: { id } });
    return res.json({ ok: true, hard: true });
  } catch (e: any) {
    console.error('DELETE /api/jobs/:id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});
