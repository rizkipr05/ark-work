// backend/src/routes/tenders.ts
import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * helper: aman convert BigInt ke JSON-able value
 * - kalau nilai muat ke Number.safe -> kembalikan number
 * - kalau lebih besar -> kembalikan string (frontend harus handle)
 */
function bigIntToSafe(v: unknown): number | string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') {
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    if (v <= maxSafe && v >= -maxSafe) return Number(v);
    return v.toString();
  }
  if (typeof v === 'number' || typeof v === 'string') return v as number | string;
  return String(v);
}

function sanitizeTenderRow(row: any) {
  if (!row) return row;
  return {
    ...row,
    budgetUSD: row.budgetUSD !== undefined && row.budgetUSD !== null ? bigIntToSafe(row.budgetUSD) : null,
    deadline: row.deadline ? (row.deadline instanceof Date ? row.deadline.toISOString() : String(row.deadline)) : null,
    createdAt: row.createdAt ? (row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)) : null,
    updatedAt: row.updatedAt ? (row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt)) : null,
  };
}

/**
 * GET /api/tenders
 * query: q, loc, sector, status, contract, sort (nearest|farthest), page, perPage
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const loc = (req.query.loc as string | undefined)?.trim();

    const sectorStr   = (req.query.sector   as string | undefined)?.toUpperCase();
    const statusStr   = (req.query.status   as string | undefined)?.toUpperCase();
    const contractStr = (req.query.contract as string | undefined)?.toUpperCase();

    const sortParam = ((req.query.sort as string | undefined) || 'nearest').toLowerCase();
    const order = (sortParam === 'farthest' ? 'desc' : 'asc') as Prisma.SortOrder;
    const orderBy: Prisma.TenderOrderByWithRelationInput = { deadline: order };

    // pagination
    const page = Math.max(1, Number(req.query.page ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(req.query.perPage ?? 20)));
    const takeOverride = req.query.take !== undefined ? Number(req.query.take) : undefined;
    const skipOverride = req.query.skip !== undefined ? Number(req.query.skip) : undefined;
    const take = Number.isFinite(takeOverride as number) ? Number(takeOverride) : perPage;
    const skip = Number.isFinite(skipOverride as number) ? Number(skipOverride) : (page - 1) * perPage;

    const where: Prisma.TenderWhereInput = {};

    if (q) {
      where.OR = [
        { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { buyer: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    if (loc) {
      where.location = { contains: loc, mode: Prisma.QueryMode.insensitive };
    }

    // safe enum mapping (only set when valid)
    if (sectorStr && (Prisma as any).Sector?.[sectorStr]) {
      where.sector = (Prisma as any).Sector[sectorStr];
    }
    if (statusStr && (Prisma as any).Status?.[statusStr]) {
      where.status = (Prisma as any).Status[statusStr];
    }
    if (contractStr && (Prisma as any).Contract?.[contractStr]) {
      where.contract = (Prisma as any).Contract[contractStr];
    }

    const [itemsRaw, total] = await Promise.all([
      prisma.tender.findMany({
        where,
        orderBy,
        take,
        skip,
      }),
      prisma.tender.count({ where }),
    ]);

    const items = itemsRaw.map(sanitizeTenderRow);

    res.json({
      ok: true,
      items,
      total,
      page,
      perPage: take,
    });
  } catch (err) {
    console.error('/api/tenders GET error:', err);
    next(err);
  }
});

/** GET /api/tenders/:id */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) return res.status(400).json({ ok: false, error: 'Invalid id' });

    const itemRaw = await prisma.tender.findUnique({ where: { id: idNum } });
    if (!itemRaw) return res.status(404).json({ ok: false, error: 'Not found' });

    const item = sanitizeTenderRow(itemRaw);
    return res.json({ ok: true, item });
  } catch (err) {
    console.error('/api/tenders/:id GET error:', err);
    next(err);
  }
});

export default router;
