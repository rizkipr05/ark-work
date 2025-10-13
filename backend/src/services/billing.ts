// src/services/billing.ts
import { PrismaClient, BillingStatus } from '@prisma/client';
import { addDays, addMonths, isAfter } from 'date-fns';

const prisma = new PrismaClient();

/**
 * Mulai trial untuk employer berdasarkan Plan.trialDays.
 * Jika plan.amount = 0, dianggap free tier.
 */
export async function startTrial(employerId: string, planId: string) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('Plan not found');

  const now = new Date();
  const trialEndsAt =
    plan.trialDays && plan.trialDays > 0 ? addDays(now, plan.trialDays) : null;

  return prisma.employer.update({
    where: { id: employerId },
    data: {
      currentPlanId: plan.id,
      billingStatus:
        plan.trialDays > 0
          ? BillingStatus.trial
          : plan.amount === BigInt(0)
          ? BillingStatus.active
          : BillingStatus.none,
      trialStartedAt: plan.trialDays > 0 ? now : null,
      trialEndsAt,
      premiumUntil:
        plan.amount === BigInt(0)
          ? null
          : plan.trialDays > 0
          ? trialEndsAt
          : addMonths(now, 1),
    },
  });
}

/**
 * Aktifkan masa langganan berbayar selama 1 periode (default 1 bulan).
 * Dipanggil oleh webhook Midtrans ketika pembayaran sukses.
 */
export async function activatePaidPeriod(
  employerId: string,
  planId: string,
  periodStart?: Date
) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  const start = periodStart ?? new Date();
  const months = plan?.interval === 'year' ? 12 : 1;
  const end = addMonths(start, months);

  return prisma.employer.update({
    where: { id: employerId },
    data: {
      currentPlanId: planId,
      billingStatus: BillingStatus.active,
      premiumUntil: end,
      trialEndsAt: null,
    },
  });
}

/**
 * Ubah employer ke status “past_due” atau nonaktif setelah langganan habis.
 * Dipanggil oleh cron harian atau ketika tidak diperpanjang.
 */
export async function expirePremium(employerId: string) {
  return prisma.employer.update({
    where: { id: employerId },
    data: {
      billingStatus: BillingStatus.past_due,
      premiumUntil: null,
    },
  });
}

/**
 * Helper untuk mengecek apakah employer masih memiliki akses premium/trial.
 * Bisa dipakai di middleware atau guard API.
 */
export function hasEmployerAccess(e: {
  billingStatus: BillingStatus;
  premiumUntil: Date | null;
  trialEndsAt: Date | null;
}): boolean {
  const now = new Date();
  if (e.billingStatus === 'active' && e.premiumUntil && isAfter(e.premiumUntil, now))
    return true;
  if (e.billingStatus === 'trial' && e.trialEndsAt && isAfter(e.trialEndsAt, now))
    return true;
  return false;
}
