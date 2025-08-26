// backend/src/routes/employer-auth.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { serialize, parse as parseCookie } from 'cookie';

const router = Router();

/* ======================= ENV & Helpers ======================= */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax') as
  | 'lax'
  | 'none'
  | 'strict';
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === 'true' ||
  (process.env.NODE_ENV === 'production' && COOKIE_SAMESITE === 'none');

type JWTPayload = { uid: string; role: 'employer'; eid: string };

const sign = (p: JWTPayload, days = 7) =>
  jwt.sign(p, JWT_SECRET, { expiresIn: `${days}d` });

const setEmpCookie = (res: Response, token: string, maxAgeDays = 7) => {
  res.setHeader(
    'Set-Cookie',
    serialize('emp_token', token, {
      httpOnly: true,
      sameSite: COOKIE_SAMESITE,
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 24 * maxAgeDays, // days
    })
  );
};

const readEmpCookie = (req: Request) => {
  const token = parseCookie(req.headers.cookie || '')['emp_token'];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = slugify(base) || 'company';
  let suffix = 0;
  // try up to N variations
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exist = await prisma.employer.findUnique({ where: { slug } });
    if (!exist) return slug;
    suffix += 1;
    slug = `${slugify(base)}-${suffix}`;
  }
}

/* ======================= Schemas ======================= */
const signinSchema = z.object({
  usernameOrEmail: z.string().trim().min(3, 'username/email terlalu pendek'),
  password: z.string().min(6, 'password terlalu pendek'),
  rememberMe: z.boolean().optional(),
});

const websiteCoerce = z.preprocess((v) => {
  const s = (typeof v === 'string' ? v : '').trim();
  if (!s || s === '-' || s === '—') return undefined;
  return s;
}, z.string().url().optional());

const signupSchema = z.object({
  companyName: z.string().min(2, 'nama perusahaan minimal 2 karakter'),
  email: z.string().email('email tidak valid'),
  password: z.string().min(8, 'password minimal 8 karakter'),
  website: websiteCoerce.optional(),
  rememberMe: z.boolean().optional(),
});

/* ======================= Routes ======================= */
/**
 * POST /api/employers/auth/signup
 * Buat Employer + EmployerAdminUser + set emp_token
 */
router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.format(), message: 'Validation error' });
  }

  const { companyName, email, password, website, rememberMe } = parsed.data;
  const emailNorm = email.toLowerCase();

  try {
    const exist = await prisma.employerAdminUser.findUnique({
      where: { email: emailNorm },
      select: { id: true },
    });
    if (exist) return res.status(409).json({ message: 'Email sudah terpakai' });

    const slug = await ensureUniqueSlug(companyName);
    const passwordHash = await bcrypt.hash(password, 10);

    const { employer, admin } = await prisma.$transaction(async (tx) => {
      const employer = await tx.employer.create({
        data: {
          slug,
          displayName: companyName,
          legalName: companyName,
          website: website ?? null,
        },
        select: { id: true, slug: true, displayName: true },
      });

      const admin = await tx.employerAdminUser.create({
        data: {
          employerId: employer.id,
          email: emailNorm,
          passwordHash,
          fullName: companyName,
          isOwner: true,
          agreedTosAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          employerId: true,
          isOwner: true,
        },
      });

      return { employer, admin };
    });

    const cookieDays = rememberMe ? 30 : 7;
    const token = sign({ uid: admin.id, role: 'employer', eid: employer.id }, cookieDays);
    setEmpCookie(res, token, cookieDays);

    return res.status(201).json({ ok: true, admin, employer });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ message: 'Email atau slug sudah terpakai' });
    }
    console.error('employer signup error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/employers/auth/signin
 * Login employer-admin
 * Body: { usernameOrEmail, password, rememberMe? }
 */
router.post('/signin', async (req, res) => {
  const parsed = signinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.format(), message: 'Validation error' });
  }

  const { usernameOrEmail, password, rememberMe } = parsed.data;
  const login = usernameOrEmail.trim().toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login);

  try {
    // skema saat ini hanya memiliki 'email' → lookup by email
    const admin = await prisma.employerAdminUser.findUnique({
      where: { email: isEmail ? login : login },
    });

    if (!admin) return res.status(401).json({ message: 'Email atau password salah' });

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Email atau password salah' });

    const employer = await prisma.employer.findUnique({
      where: { id: admin.employerId },
      select: { id: true, slug: true, displayName: true, legalName: true },
    });
    if (!employer) return res.status(404).json({ message: 'Employer tidak ditemukan' });

    const cookieDays = rememberMe ? 30 : 7;
    const token = sign({ uid: admin.id, role: 'employer', eid: employer.id }, cookieDays);
    setEmpCookie(res, token, cookieDays);

    return res.json({
      ok: true,
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        isOwner: !!admin.isOwner,
      },
      employer,
    });
  } catch (err) {
    console.error('employer signin error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/employers/auth/signout
 */
router.post('/signout', (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    serialize('emp_token', '', {
      httpOnly: true,
      sameSite: COOKIE_SAMESITE,
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 0,
    })
  );
  res.status(204).end();
});

/**
 * GET /api/employers/auth/me
 */
router.get('/me', async (req, res) => {
  try {
    const p = readEmpCookie(req);
    if (!p) return res.status(401).json({ message: 'Unauthorized' });

    const admin = await prisma.employerAdminUser.findUnique({
      where: { id: p.uid },
      select: { id: true, email: true, fullName: true, employerId: true, isOwner: true },
    });
    if (!admin) return res.status(401).json({ message: 'Unauthorized' });

    const employer = await prisma.employer.findUnique({
      where: { id: p.eid },
      select: { id: true, slug: true, displayName: true, legalName: true, website: true },
    });

    return res.json({ ok: true, admin, employer, role: 'employer' });
  } catch (err) {
    console.error('employer me error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
