// src/routes/admin-tenders.ts
import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { adminRequired } from '../middleware/role';

const prisma = new PrismaClient();
const router = Router();

/* --------------------- helpers --------------------- */
/** convert bigint => string/number/null for JSON transport */
function bigIntToJson(v: unknown): string | number | null {
  if (typeof v === 'bigint') return v.toString(); // gunakan string untuk aman
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  // jika boolean/obj dll, ubah jadi string
  return String(v);
}

/** sanitize tender row (convert bigint/date -> safe types) */
function sanitizeTender(t: any) {
  if (!t) return t;
  return {
    ...t,
    budgetUSD:
      t.budgetUSD !== undefined && t.budgetUSD !== null
        ? bigIntToJson(t.budgetUSD)
        : null,
    deadline: t.deadline ? (t.deadline instanceof Date ? t.deadline.toISOString() : String(t.deadline)) : null,
    createdAt: t.createdAt ? (t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt)) : null,
    updatedAt: t.updatedAt ? (t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt)) : null,
  };
}

/* -----------------------------------------------------------
 * Utils
 * ---------------------------------------------------------*/
function toInt(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function toDocs(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof v === 'string') {
    return v
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

/* -----------------------------------------------------------
 * Create tender (ADMIN ONLY)
 * POST /admin/tenders
 * body: { title, buyer, sector, location, status, contract, budgetUSD, description, documents, deadline }
 * ---------------------------------------------------------*/
router.post('/', adminRequired, async (req: Request, res: Response) => {
  try {
    const {
      title,
      buyer,
      sector,     // enum Sector
      location,
      status,     // enum Status
      contract,   // enum Contract
      budgetUSD,
      description,
      documents,
      deadline,
    } = req.body ?? {};

    if (!title || !buyer || !sector || !status || !contract) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // normalize budget -> BigInt
    const idr = (() => {
      if (typeof budgetUSD === 'bigint') return budgetUSD;
      if (typeof budgetUSD === 'number') return BigInt(Math.max(0, Math.round(budgetUSD)));
      if (typeof budgetUSD === 'string') {
        const clean = budgetUSD.replace(/[^\d-]/g, '');
        const n = Number(clean || 0);
        return BigInt(Math.max(0, Math.round(isNaN(n) ? 0 : n)));
      }
      return BigInt(0);
    })();

    const created = await prisma.tender.create({
      data: {
        title: String(title),
        buyer: String(buyer),
        sector,
        location: String(location ?? ''),
        status,
        contract,
        // Provide BigInt to Prisma (column type BigInt)
        budgetUSD: idr as any,
        description: description !== undefined ? String(description ?? '') : undefined,
        documents: documents !== undefined ? toDocs(documents) : undefined,
        deadline: deadline ? new Date(deadline) : new Date(),
      },
    });

    return res.json(sanitizeTender(created));
  } catch (err: any) {
    console.error('Create tender error:', err);
    return res.status(500).json({ message: err?.message ?? 'Internal error' });
  }
});

/* -----------------------------------------------------------
 * List + filter (ADMIN ONLY)
 * GET /admin/tenders?q=&sector=&status=&contract=&loc=&sort=asc|desc&limit=&offset=
 * ---------------------------------------------------------*/
router.get('/', adminRequired, async (req: Request, res: Response) => {
  try {
    const { q, sector, status, contract, loc, sort } = req.query as Record<string, string | undefined>;
    const limit = toInt(req.query.limit, 100);
    const offset = toInt(req.query.offset, 0);

    const where: Prisma.TenderWhereInput = {
      AND: [
        q
          ? {
              OR: [
                { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
                { buyer: { contains: q, mode: Prisma.QueryMode.insensitive } },
              ],
            }
          : undefined,
        loc ? { location: { contains: loc, mode: Prisma.QueryMode.insensitive } } : undefined,
        sector ? { sector: sector as any } : undefined,
        status ? { status: status as any } : undefined,
        contract ? { contract: contract as any } : undefined,
      ].filter(Boolean) as Prisma.TenderWhereInput[],
    };

    const orderBy: Prisma.TenderOrderByWithRelationInput = {
      deadline: (sort === 'desc' ? 'desc' : 'asc') as Prisma.SortOrder,
    };

    const [items, total] = await Promise.all([
      prisma.tender.findMany({
        where,
        orderBy,
        take: Math.max(1, Math.min(1000, limit)),
        skip: Math.max(0, offset),
      }),
      prisma.tender.count({ where }),
    ]);

    const safeItems = items.map(sanitizeTender);

    return res.json({ items: safeItems, total, limit, offset });
  } catch (err: any) {
    console.error('List tenders error:', err);
    return res.status(500).json({ message: err?.message ?? 'Internal error' });
  }
});

/* -----------------------------------------------------------
 * Get detail (ADMIN ONLY)
 * GET /admin/tenders/:id
 * ---------------------------------------------------------*/
router.get('/:id', adminRequired, async (req: Request, res: Response) => {
  try {
    const id = toInt(req.params.id, NaN);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const item = await prisma.tender.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ message: 'Not found' });
    return res.json(sanitizeTender(item));
  } catch (err: any) {
    console.error('Get tender error:', err);
    return res.status(500).json({ message: err?.message ?? 'Internal error' });
  }
});

/* -----------------------------------------------------------
 * Update (ADMIN ONLY)
 * PATCH /admin/tenders/:id
 * ---------------------------------------------------------*/
router.patch('/:id', adminRequired, async (req: Request, res: Response) => {
  try {
    const id = toInt(req.params.id, NaN);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const {
      title,
      buyer,
      sector,
      location,
      status,
      contract,
      budgetUSD,
      description,
      documents,
      deadline,
    } = req.body ?? {};

    const data: any = {
      ...(title !== undefined ? { title: String(title) } : {}),
      ...(buyer !== undefined ? { buyer: String(buyer) } : {}),
      ...(sector !== undefined ? { sector } : {}),
      ...(location !== undefined ? { location: String(location) } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(contract !== undefined ? { contract } : {}),
      ...(description !== undefined ? { description: String(description ?? '') } : {}),
      ...(documents !== undefined ? { documents: toDocs(documents) } : {}),
      ...(deadline !== undefined ? { deadline: new Date(deadline) } : {}),
    };

    if (budgetUSD !== undefined) {
      let b: bigint;
      if (typeof budgetUSD === 'bigint') b = budgetUSD;
      else if (typeof budgetUSD === 'number') b = BigInt(Math.max(0, Math.round(budgetUSD)));
      else {
        const clean = String(budgetUSD).replace(/[^\d-]/g, '');
        const n = Number(clean || 0);
        b = BigInt(Math.max(0, Math.round(isNaN(n) ? 0 : n)));
      }
      data.budgetUSD = b as any;
    }

    const updated = await prisma.tender.update({
      where: { id },
      data,
    });

    return res.json(sanitizeTender(updated));
  } catch (err: any) {
    console.error('Update tender error:', err);
    if (err?.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    return res.status(500).json({ message: err?.message ?? 'Internal error' });
  }
});

/* -----------------------------------------------------------
 * Delete (ADMIN ONLY)
 * DELETE /admin/tenders/:id
 * ---------------------------------------------------------*/
router.delete('/:id', adminRequired, async (req: Request, res: Response) => {
  try {
    const id = toInt(req.params.id, NaN);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    await prisma.tender.delete({ where: { id } });
    return res.status(204).end();
  } catch (err: any) {
    console.error('Delete tender error:', err);
    if (err?.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    return res.status(500).json({ message: err?.message ?? 'Internal error' });
  }
});

export default router;
