import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { serialize, parse, CookieSerializeOptions } from 'cookie';

const router = Router();
const prisma = new PrismaClient();

/** ================== ENV & Const ================== **/
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Cookie behavior disesuaikan ENV agar cocok dengan index.ts (CORS/frontends multipel)
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax') as
  | 'lax'
  | 'none'
  | 'strict';
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === 'true' ||
  (process.env.NODE_ENV === 'production' && COOKIE_SAMESITE === 'none');

/** ================== Types (3 Roles) ================== **/
type Role = 'admin' | 'employer' | 'user';
type AuthPayload = { uid: string; role: Role; eid?: string | null; sid: string };

/** ================== JWT Helpers ================== **/
function signToken(p: AuthPayload) {
  return jwt.sign(p, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(t: string) {
  return jwt.verify(t, JWT_SECRET) as AuthPayload;
}
function cookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: COOKIE_SAMESITE,
    secure: COOKIE_SECURE,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 hari
  };
}
function setAuthCookie(res: Response, token: string) {
  res.setHeader('Set-Cookie', serialize('token', token, cookieOptions()));
}

/** ================== Helpers ================== **/
// Ambil employer dari slug (kalau ada). Jika tidak ada, fallback employer terbaru.
async function resolveEmployer(opts: { employerSlug?: string | null }) {
  const { employerSlug } = opts;

  if (employerSlug) {
    const bySlug = await prisma.employer.findUnique({
      where: { slug: employerSlug },
      select: { id: true, slug: true, displayName: true, legalName: true },
    });
    if (bySlug) return bySlug;
  }

  const first = await prisma.employer.findFirst({
    orderBy: { createdAt: 'desc' as any },
    select: { id: true, slug: true, displayName: true, legalName: true },
  });
  return first || null;
}

// Tentukan role final:
// - Admin list → 'admin'
// - Jika ada employer aktif → 'employer'
// - Selain itu → 'user'
function decideRole(params: {
  isAdmin: boolean;
  employer: {
    id: string;
    slug: string;
    displayName: string | null;
    legalName: string | null;
  } | null;
  userId: string;
}): Role {
  if (params.isAdmin) return 'admin';
  if (params.employer) return 'employer';
  return 'user';
}

// Helper IP/UA + validasi sesi
function getClientIp(req: Request) {
  const xf = (req.headers['x-forwarded-for'] as string) || '';
  return (xf.split(',')[0] || req.socket.remoteAddress || '').toString();
}
function getUA(req: Request) {
  return (req.headers['user-agent'] as string) || '';
}
async function assertSessionValid(sid: string) {
  const s = await prisma.session.findUnique({ where: { id: sid } });
  if (!s) return false;
  if (s.revokedAt) return false;
  if (s.expiresAt < new Date()) return false;
  return true;
}

/** ================== Validators ================== **/
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(50).optional(),
});

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  employerSlug: z.string().min(1).optional(),
});

const switchEmployerSchema = z.object({
  employerId: z.string().min(1).optional(),
  employerSlug: z.string().min(1).optional(),
});

/** ================== Routes ================== **/

// GET /auth
router.get('/', (_req, res) => {
  res.json({ message: 'Auth route works!' });
});

// POST /auth/signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const { email, password, name } = parsed.data;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ message: 'Email sudah terdaftar' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, name, passwordHash },
      select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true },
    });

    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
    const employer = await resolveEmployer({});
    const role: Role = decideRole({ isAdmin, employer, userId: user.id });

    // === Create session (auto login) ===
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        employerId: employer?.id ?? null,
        expiresAt,
        ip: getClientIp(req),
        userAgent: getUA(req),
      },
    });

    const token = signToken({ uid: user.id, role, eid: employer ? employer.id : null, sid: session.id });
    setAuthCookie(res, token);

    return res.status(201).json({ ...user, role, employer, sessionId: session.id });
  } catch (e) {
    console.error('SIGNUP ERROR:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/signin
router.post('/signin', async (req: Request, res: Response) => {
  try {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const { email, password, employerSlug } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Email atau password salah' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Email atau password salah' });

    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
    const employer = await resolveEmployer({ employerSlug });
    const role: Role = decideRole({ isAdmin, employer, userId: user.id });

    // === Create session ===
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        employerId: employer?.id ?? null,
        expiresAt,
        ip: getClientIp(req),
        userAgent: getUA(req),
      },
    });

    // === JWT with sid ===
    const token = signToken({
      uid: user.id,
      role,
      eid: employer ? employer.id : null,
      sid: session.id,
    });
    setAuthCookie(res, token);

    return res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      photoUrl: user.photoUrl,
      cvUrl: user.cvUrl,
      role,
      employer: employer
        ? { id: employer.id, slug: employer.slug, displayName: employer.displayName, legalName: employer.legalName }
        : null,
      sessionId: session.id,
    });
  } catch (e) {
    console.error('SIGNIN ERROR:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/signout
router.post('/signout', async (req: Request, res: Response) => {
  try {
    const raw = req.headers.cookie || '';
    seriouslyIgnore(raw); // no-op to satisfy TS "unused" in some setups
  } catch {}
  try {
    const raw = req.headers.cookie || '';
    const cookies = parse(raw);
    const token = cookies['token'];
    if (token) {
      try {
        const payload = verifyToken(token);
        await prisma.session.updateMany({
          where: { id: payload.sid, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      } catch {}
    }
  } catch {}
  res.setHeader('Set-Cookie', serialize('token', '', { ...cookieOptions(), maxAge: 0 }));
  return res.status(204).end();
});

// GET /auth/me
router.get('/me', async (req: Request, res: Response) => {
  try {
    const raw = req.headers.cookie || '';
    const cookies = parse(raw);
    const token = cookies['token'];
    if (!token) return res.status(401).json({ message: 'Unauthorized: missing token' });

    const payload = verifyToken(token); // { uid, role, eid, sid }
    if (!payload.sid) return res.status(401).json({ message: 'Unauthorized: missing session id, please sign in again' });

    const stillValid = await assertSessionValid(payload.sid);
    if (!stillValid) return res.status(401).json({ message: 'Session expired/revoked' });

    // heartbeat kecil: update lastSeenAt
    await prisma.session.update({
      where: { id: payload.sid },
      data: { lastSeenAt: new Date(), ip: getClientIp(req), userAgent: getUA(req) },
    });

    const user = await prisma.user.findUnique({
      where: { id: payload.uid },
      select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true },
    });
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    let employer:
      | { id: string; slug: string; displayName: string | null; legalName: string | null }
      | null = null;

    if (payload.eid) {
      employer =
        (await prisma.employer.findUnique({
          where: { id: payload.eid },
          select: { id: true, slug: true, displayName: true, legalName: true },
        })) || null;
    } else {
      employer = (await resolveEmployer({})) as any;
    }

    let role: Role = payload.role;
    if (payload.role !== 'admin') {
      role = decideRole({ isAdmin: false, employer, userId: user.id });
    }

    return res.json({
      ...user,
      role,
      employer: employer
        ? { id: employer.id, slug: employer.slug, displayName: employer.displayName, legalName: employer.legalName }
        : null,
      sessionId: payload.sid,
    });
  } catch (e) {
    console.error('ME ERROR:', e);
    return res.status(401).json({ message: 'Invalid token' });
  }
});

// POST /auth/switch-employer
router.post('/switch-employer', async (req: Request, res: Response) => {
  try {
    const raw = req.headers.cookie || '';
    const cookies = parse(raw);
    const token = cookies['token'];
    if (!token) return res.status(401).json({ message: 'Unauthorized: missing token' });

    const payload = verifyToken(token);
    if (!payload.sid) return res.status(401).json({ message: 'Unauthorized: missing session id, please sign in again' });

    const parsed = switchEmployerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const { employerId, employerSlug } = parsed.data;

    let employer:
      | { id: string; slug: string; displayName: string | null; legalName: string | null }
      | null = null;

    if (employerId) {
      employer = await prisma.employer.findUnique({
        where: { id: employerId },
        select: { id: true, slug: true, displayName: true, legalName: true },
      });
    } else if (employerSlug) {
      employer = await prisma.employer.findUnique({
        where: { slug: employerSlug },
        select: { id: true, slug: true, displayName: true, legalName: true },
      });
    } else {
      employer = await resolveEmployer({});
    }

    if (!employer) return res.status(404).json({ message: 'Employer tidak ditemukan' });

    const isAdmin = payload.role === 'admin';
    const role: Role = decideRole({ isAdmin, employer, userId: payload.uid });

    // Pertahankan sid yang sama saat switch employer
    const newToken = signToken({ uid: payload.uid, role, eid: employer.id, sid: payload.sid });
    setAuthCookie(res, newToken);

    return res.json({
      ok: true,
      role,
      employer: {
        id: employer.id,
        slug: employer.slug,
        displayName: employer.displayName,
        legalName: employer.legalName,
      },
    });
  } catch (e) {
    console.error('SWITCH EMPLOYER ERROR:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** ================== Admin Sessions APIs ================== **/
// Middleware kecil: require admin
async function requireAdmin(req: Request, res: Response) {
  const raw = req.headers.cookie || '';
  const cookies = parse(raw);
  const token = cookies['token'];
  if (!token) {
    res.status(401).json({ message: 'Unauthorized: missing token' });
    return null;
  }
  try {
    const payload = verifyToken(token);
    if (!payload.sid) {
      res.status(401).json({ message: 'Unauthorized: missing session id, please sign in again' });
      return null;
    }
    const valid = await assertSessionValid(payload.sid);
    if (!valid) {
      res.status(401).json({ message: 'Session expired/revoked' });
      return null;
    }
    if (payload.role !== 'admin') {
      res.status(403).json({ message: 'Forbidden: admin only' });
      return null;
    }
    return payload;
  } catch {
    res.status(401).json({ message: 'Invalid token' });
    return null;
  }
}

// GET /auth/sessions (admin) - daftar sesi
router.get('/sessions', async (req: Request, res: Response) => {
  const payload = await requireAdmin(req, res);
  if (!payload) return;

  const sessions = await prisma.session.findMany({
    orderBy: { lastSeenAt: 'desc' },
    include: {
      user: { select: { id: true, email: true, name: true, photoUrl: true } },
    },
  });

  // Tandai status
  const now = Date.now();
  const rows = sessions.map((s) => ({
    id: s.id,
    user: s.user,
    employerId: s.employerId,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    expiresAt: s.expiresAt,
    ip: s.ip,
    userAgent: s.userAgent,
    revokedAt: s.revokedAt,
    status: s.revokedAt ? 'revoked' : s.expiresAt.getTime() < now ? 'expired' : 'active',
  }));

  res.json({ sessions: rows });
});

// POST /auth/sessions/:sid/terminate (admin) - revoke satu sesi
router.post('/sessions/:sid/terminate', async (req: Request, res: Response) => {
  const payload = await requireAdmin(req, res);
  if (!payload) return;

  const { sid } = req.params;
  await prisma.session.updateMany({
    where: { id: sid, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  res.json({ ok: true });
});

// POST /auth/sessions/heartbeat - optional: dipanggil front-end tiap 30-60 detik
router.post('/sessions/heartbeat', async (req: Request, res: Response) => {
  try {
    const raw = req.headers.cookie || '';
    const cookies = parse(raw);
    const token = cookies['token'];
    if (!token) return res.status(401).json({ message: 'Unauthorized: missing token' });

    const payload = verifyToken(token);
    const valid = await assertSessionValid(payload.sid);
    if (!valid) return res.status(401).json({ message: 'Session expired/revoked' });

    await prisma.session.update({
      where: { id: payload.sid },
      data: { lastSeenAt: new Date(), ip: getClientIp(req), userAgent: getUA(req) },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('HEARTBEAT ERROR:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// kecil: helper untuk TS no-unused di signout try-catch awal (opsional)
function seriouslyIgnore<T>(_x: T) { /* no-op */ }

export default router;
