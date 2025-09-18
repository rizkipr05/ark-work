import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authRequired } from '../middleware/role';

const router = Router();

// POST /api/applications  -> buat lamaran
router.post('/', authRequired, async (req, res) => {
  const Body = z.object({ jobId: z.string().uuid('jobId must be UUID') });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { jobId } = parsed.data;
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: 'UNAUTHENTICATED' });

  // pastikan job ada
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  try {
    const appRow = await prisma.jobApplication.create({
      data: { jobId, applicantId: userId },
      select: { id: true }
    });
    return res.status(201).json({ data: appRow });
  } catch (e: any) {
    if (e?.code === 'P2002' || /duplicate key/i.test(String(e?.message))) {
      return res.status(409).json({ error: 'Already applied' });
    }
    return res.status(500).json({ error: 'Failed to apply' });
  }
});

// GET /api/applications  -> daftar lamaran saya
router.get('/', authRequired, async (req, res) => {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: 'UNAUTHENTICATED' });

  const list = await prisma.jobApplication.findMany({
    where: { applicantId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, jobId: true, status: true, createdAt: true, updatedAt: true,
      job: { select: { id: true, title: true, location: true, employment: true, createdAt: true } }
    }
  });
  return res.json({ data: list });
});

// DELETE /api/applications/:id  -> batalkan lamaran milik sendiri
router.delete('/:id', authRequired, async (req, res) => {
  const userId = (req as any).auth?.userId as string | undefined;
  const id = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'UNAUTHENTICATED' });

  const found = await prisma.jobApplication.findUnique({ where: { id } });
  if (!found || found.applicantId !== userId) {
    return res.status(404).json({ error: 'Not found' });
  }
  await prisma.jobApplication.delete({ where: { id } });
  return res.status(204).send();
});

export default router;
