// backend/src/routes/payments.ts
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { createSnapForPlan, handleMidtransNotification } from '../services/midtrans';
import {
  startTrial,                 // startTrial({ employerId, planId, trialDays })
  activatePremium,            // activatePremium({ employerId, planId, interval, baseFrom? })
  recomputeBillingStatus,     // recomputeBillingStatus(employerId)
} from '../services/billing';
import { sendEmail } from '../lib/mailer';

/* ================= Auth placeholder (sesuaikan dengan sistemmu) ================= */
function requireAuth(_req: any, _res: Response, next: NextFunction) {
  // contoh: req.user = { id: 'user-123', employerId: 'emp-456' }
  return next();
}
function getMaybeUserId(req: Request): string | undefined {
  const anyReq = req as any;
  return anyReq?.user?.id ?? anyReq?.session?.user?.id ?? (req.body as any)?.userId;
}

const r = Router();

/* ================= Utils ================= */
function toNumberSafe(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof (v as any)?.toNumber === 'function') return (v as any).toNumber(); // Prisma Decimal
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return Number(v);
  return Number(v);
}
function looksEmail(s?: string | null) {
  return !!s && /^\S+@\S+\.\S+$/.test(String(s).trim());
}

/* ================= LIST (admin/inbox) ================= */
r.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const take = Math.min(Math.max(Number(req.query.take ?? 20), 1), 100);
    const cursor = (req.query.cursor as string | undefined) ?? undefined;
    const status = (req.query.status as string | undefined)?.trim();

    const where = status ? { status } : undefined;

    const rows = await prisma.payment.findMany({
      where,
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderId: true,
        status: true,            // settlement | pending | capture | cancel | expire | deny | refund | failure
        method: true,
        grossAmount: true,       // BigInt
        currency: true,
        createdAt: true,
        transactionId: true,
        plan: { select: { id: true, slug: true, name: true, interval: true } },
        employer: { select: { id: true, displayName: true, legalName: true, slug: true } },
      },
    });

    const items = rows.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      status: p.status,
      method: p.method ?? null,
      grossAmount: toNumberSafe(p.grossAmount) ?? 0,
      currency: p.currency ?? 'IDR',
      createdAt: p.createdAt?.toISOString?.() ?? new Date(p.createdAt as any).toISOString(),
      transactionId: p.transactionId ?? null,
      plan: p.plan
        ? { id: p.plan.id, slug: p.plan.slug, name: p.plan.name, interval: p.plan.interval }
        : null,
      employer: p.employer
        ? { id: p.employer.id, displayName: p.employer.displayName, legalName: p.employer.legalName, slug: p.employer.slug }
        : null,
    }));

    const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
    res.json({ items, nextCursor });
  } catch (e) {
    next(e);
  }
});

/* ================= PUBLIC PLANS (signup step) ================= */
r.get('/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: [{ amount: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        amount: true,
        currency: true,
        interval: true,
        active: true,
        priceId: true,
        trialDays: true,
      },
    });

    const serialized = plans.map((p) => ({
      ...p,
      amount: toNumberSafe(p.amount) ?? 0,
    }));
    res.json(serialized);
  } catch (e) {
    next(e);
  }
});

/**
 * ================= STEP 3: pilih paket (tangani trial/gratis) =================
 * Body: {
 *   employerId, planSlug,
 *   contact?: { email?: string; name?: string }   // <-- fallback penerima pertama
 * }
 * Hasil:
 * - { ok: true, mode: 'trial', trialEndsAt }
 * - { ok: true, mode: 'free_active', premiumUntil }
 * - { ok: true, mode: 'needs_payment' }
 */
r.post('/employers/step3', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employerId, planSlug, contact } = req.body as {
      employerId: string;
      planSlug: string;
      contact?: { email?: string; name?: string };
    };

    console.log('[payments/step3] in →', { employerId, planSlug, contact });

    if (!employerId || !planSlug) {
      return res.status(400).json({ error: 'employerId & planSlug required' });
    }

    const employer = await prisma.employer.findUnique({
      where: { id: employerId },
      select: { id: true, displayName: true, slug: true },
    });
    if (!employer) return res.status(404).json({ error: 'Employer not found' });

    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan || !plan.active) return res.status(400).json({ error: 'Plan not available' });

    // helper → pastikan ada minimal 1 admin. Kalau belum ada dan contact.email valid, buat.
    async function ensureAtLeastOneAdmin(): Promise<string[]> {
      const admins = await prisma.employerAdminUser.findMany({
        where: { employerId },
        select: { email: true },
      });
      let emails = admins.map(a => a.email).filter(looksEmail) as string[];

      if (emails.length === 0 && looksEmail(contact?.email)) {
        try {
          await prisma.employerAdminUser.create({
            data: {
              employerId,
              email: contact!.email!.trim().toLowerCase(),
              // kolom opsional lain: name/role dsb. Cast as any agar aman
              name: contact?.name || 'Admin',
              role: (undefined as any),
            } as any,
          });
          emails = [contact!.email!.trim().toLowerCase()];
          console.log('[payments/step3] created fallback admin:', emails[0]);
        } catch (err) {
          console.warn('[payments/step3] create fallback admin failed:', err);
        }
      }
      return Array.from(new Set(emails));
    }

    // quick HTML builders
    const htmlTrial = (until: Date) => `
      <div style="font-family:Inter,Arial,sans-serif">
        <h2>Trial aktif ✅</h2>
        <p>Halo tim <b>${employer.displayName}</b>,</p>
        <p>Paket <b>trial</b> aktif sampai <b>${until.toLocaleDateString('id-ID')}</b>.</p>
        <p>Selamat mencoba fitur ArkWork! 🎉</p>
      </div>`;
    const htmlPremium = (until: Date) => `
      <div style="font-family:Inter,Arial,sans-serif">
        <h2>Premium aktif ✅</h2>
        <p>Halo tim <b>${employer.displayName}</b>,</p>
        <p>Langganan <b>premium</b> aktif sampai <b>${until.toLocaleDateString('id-ID')}</b>.</p>
        <p>Terima kasih telah berlangganan ArkWork 🙌</p>
      </div>`;

    // ====== TRIAL
    if ((plan.trialDays ?? 0) > 0) {
      const { trialEndsAt } = await startTrial({
        employerId,
        planId: plan.id,
        trialDays: plan.trialDays,
      });

      await prisma.employer.update({
        where: { id: employerId },
        data: { onboardingStep: 'VERIFY' },
      });

      // pastikan ada penerima untuk email-email berikutnya
      const recipients = await ensureAtLeastOneAdmin();

      // fallback: kalau baru saja dibuat (belum sempat terkirim dari service),
      // kirim langsung ke email fallback
      if (recipients.length === 1 && contact?.email === recipients[0]) {
        try {
          await sendEmail(recipients, 'Trial ArkWork Anda aktif', htmlTrial(new Date(trialEndsAt)));
          console.log('[payments/step3] sent trial mail (fallback) →', recipients[0]);
        } catch (e) {
          console.warn('[payments/step3] fallback trial mail error:', e);
        }
      }

      console.log('[payments/step3] result → TRIAL', { trialEndsAt });
      return res.json({ ok: true, mode: 'trial', trialEndsAt: new Date(trialEndsAt).toISOString() });
    }

    // ====== GRATIS (amount == 0) → langsung premium aktif
    const amount = toNumberSafe(plan.amount) ?? 0;
    if (amount <= 0) {
      const { premiumUntil } = await activatePremium({
        employerId,
        planId: plan.id,
        interval: (plan.interval as 'month' | 'year') || 'month',
      });

      await prisma.employer.update({
        where: { id: employerId },
        data: { onboardingStep: 'VERIFY' },
      });

      const recipients = await ensureAtLeastOneAdmin();
      if (recipients.length === 1 && contact?.email === recipients[0]) {
        try {
          await sendEmail(recipients, 'Pembayaran berhasil — Premium aktif', htmlPremium(new Date(premiumUntil)));
          console.log('[payments/step3] sent premium mail (fallback) →', recipients[0]);
        } catch (e) {
          console.warn('[payments/step3] fallback premium mail error:', e);
        }
      }

      console.log('[payments/step3] result → FREE_ACTIVE', { premiumUntil });
      return res.json({ ok: true, mode: 'free_active', premiumUntil: new Date(premiumUntil).toISOString() });
    }

    // ====== BERBAYAR & tanpa trial → perlu checkout
    await prisma.employer.update({
      where: { id: employerId },
      data: { currentPlanId: plan.id, onboardingStep: 'VERIFY' },
    });
    await ensureAtLeastOneAdmin(); // siapkan penerima untuk email webhook nanti
    console.log('[payments/step3] result → NEEDS_PAYMENT');
    res.json({ ok: true, mode: 'needs_payment' });
  } catch (e) {
    next(e);
  }
});

/* ================= CHECKOUT (buat transaksi Snap) ================= */
r.post('/checkout', requireAuth, async (req: Request, res: Response) => {
  try {
    const { planId, employerId, customer, enabledPayments } = (req.body ?? {}) as any;
    if (!planId) return res.status(400).json({ error: 'Invalid params: planId required' });

    const plan = await prisma.plan.findFirst({
      where: { OR: [{ id: planId }, { slug: planId }], active: true },
      select: { id: true, slug: true, name: true, amount: true, currency: true, interval: true, trialDays: true },
    });
    if (!plan) return res.status(400).json({ error: 'Plan not available' });

    // Tolak checkout untuk plan gratis
    if ((toNumberSafe(plan.amount) ?? 0) === 0) {
      return res.status(400).json({ error: 'Free plan does not require checkout' });
    }

    const maybeUserId = getMaybeUserId(req);

    const tx = await createSnapForPlan({
      planId: plan.id,
      userId: maybeUserId ?? null,
      employerId,
      customer,
      enabledPayments,
    });

    res.json({
      token: (tx as any).token,
      redirect_url: (tx as any).redirect_url,
      orderId: (tx as any).order_id,
      amount: toNumberSafe((plan as any).amount) ?? undefined,
      currency: plan?.currency ?? 'IDR',
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/* ================= Webhook Midtrans ================= */
r.post('/midtrans/notify', async (req: Request, res: Response) => {
  try {
    const result = await handleMidtransNotification(req.body);

    // Sesudah update payment, recompute status employer terkait (jika ada).
    const orderId = (req.body?.order_id ?? '') as string;
    if (orderId) {
      const pay = await prisma.payment.findUnique({
        where: { orderId },
        select: { employerId: true },
      });
      const employerId = pay?.employerId ?? undefined;
      if (employerId) {
        await recomputeBillingStatus(employerId);
      }
    }

    if ((result as any)?.ok === false) {
      console.warn('Midtrans notify rejected:', result);
    }
  } catch (e) {
    console.error('Midtrans notify error:', e);
  }
  // selalu 200 agar Midtrans tidak spam retry
  res.status(200).json({ ok: true });
});

/* ================= Detail by orderId (polling) ================= */
r.get('/:orderId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const p = await prisma.payment.findUnique({
      where: { orderId: req.params.orderId },
      select: {
        orderId: true,
        status: true,
        method: true,
        grossAmount: true,
        currency: true,
        createdAt: true,
        transactionId: true,
      },
    });
    if (!p) return res.status(404).json({ error: 'Not found' });

    res.json({
      orderId: p.orderId,
      status: p.status,
      method: p.method ?? null,
      grossAmount: toNumberSafe(p.grossAmount) ?? 0,
      currency: p.currency ?? 'IDR',
      createdAt: p.createdAt?.toISOString?.() ?? new Date(p.createdAt as any).toISOString(),
      transactionId: p.transactionId ?? null,
    });
  } catch (e) {
    next(e);
  }
});

export default r;
