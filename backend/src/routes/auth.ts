import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parse } from 'cookie';
import { ADMIN_COOKIE, EMP_COOKIE, USER_COOKIE } from '../middleware/role';

const router = Router();

/* ===== env & cookie flags ===== */
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const JWT_SECRET = process.env.JWT_SECRET || (IS_PROD ? undefined : 'dev-secret-change-me');
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || JWT_SECRET;

if (IS_PROD && !JWT_SECRET) console.error('[FATAL] JWT_SECRET is required in production');
if (IS_PROD && !process.env.JWT_ADMIN_SECRET) console.error('[FATAL] JWT_ADMIN_SECRET is recommended (should differ from JWT_SECRET)');

/**
 * Cookie defaults:
 * - In production: prefer SameSite=none + secure=true for cross-site cookies under HTTPS.
 * - In development: sameSite=lax + secure=false to allow http://localhost usage.
 */
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE as 'lax' | 'none' | 'strict') || (IS_PROD ? 'none' : 'lax');
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || (IS_PROD && COOKIE_SAMESITE === 'none');

if (!IS_PROD) {
  console.log(`[AUTH] Running in dev mode. Cookie defaults: sameSite=${COOKIE_SAMESITE}, secure=${COOKIE_SECURE}`);
}

/* ===== JWT options ===== */
const JWT_USER_ISSUER = process.env.JWT_USER_ISSUER || 'arkwork';
const JWT_USER_AUDIENCE = process.env.JWT_USER_AUDIENCE || 'arkwork-users';
const JWT_ADMIN_ISSUER = process.env.JWT_ADMIN_ISSUER || 'arkwork-admin';
const JWT_ADMIN_AUDIENCE = process.env.JWT_ADMIN_AUDIENCE || 'arkwork-admins';

/* ===== helpers ===== */
type JWTPayload = { uid: string; role: 'user' | 'admin' | 'employer'; eid?: string | null };

function signUserToken(payload: { uid: string; role?: string }) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.sign({ uid: payload.uid, role: payload.role ?? 'user' }, JWT_SECRET, {
    expiresIn: '30d',
    issuer: JWT_USER_ISSUER,
    audience: JWT_USER_AUDIENCE,
  });
}

function signAdminToken(payload: { uid: string; role?: string }) {
  if (!JWT_ADMIN_SECRET) throw new Error('JWT_ADMIN_SECRET not set');
  return jwt.sign({ uid: payload.uid, role: payload.role ?? 'admin' }, JWT_ADMIN_SECRET, {
    expiresIn: '7d',
    issuer: JWT_ADMIN_ISSUER,
    audience: JWT_ADMIN_AUDIENCE,
  });
}

function verifyUserToken(token: string) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.verify(token, JWT_SECRET, { issuer: JWT_USER_ISSUER, audience: JWT_USER_AUDIENCE }) as any;
}

function verifyAdminToken(token: string) {
  if (!JWT_ADMIN_SECRET) throw new Error('JWT_ADMIN_SECRET not set');
  return jwt.verify(token, JWT_ADMIN_SECRET, { issuer: JWT_ADMIN_ISSUER, audience: JWT_ADMIN_AUDIENCE }) as any;
}

/**
 * Use Express res.cookie so Express will set full Set-Cookie header properly.
 * maxAge in res.cookie is milliseconds.
 */
function setCookie(res: Response, name: string, token: string, maxAgeSec = 7 * 24 * 60 * 60) {
  const opts: any = {
    httpOnly: true,
    sameSite: COOKIE_SAMESITE,
    secure: COOKIE_SECURE,
    path: '/',
    maxAge: maxAgeSec * 1000,
  };
  res.cookie(name, token, opts);
}

function clearCookie(res: Response, name: string) {
  res.clearCookie(name, {
    httpOnly: true,
    sameSite: COOKIE_SAMESITE,
    secure: COOKIE_SECURE,
    path: '/',
    maxAge: 0,
  });
}

/* ===== validators ===== */
const userSignupSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const userSigninSchema = z.object({
  usernameOrEmail: z.string().min(3),
  password: z.string().min(1),
});

const adminSigninSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(1),
});

/* ===== routes ===== */

// ping
router.get('/', (_req, res) => res.json({ message: 'Auth route works!' }));

/* ----- USER SIGNUP ----- */
router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = userSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Data tidak valid", errors: parsed.error.flatten().fieldErrors });
    }

    const { name, email, password } = parsed.data;
    const lowerEmail = email.toLowerCase().trim();

    const exists = await prisma.user.findUnique({ where: { email: lowerEmail } });
    if (exists) return res.status(409).json({ message: 'Email already used' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name: name.trim(), email: lowerEmail, passwordHash },
      select: { id: true, name: true, email: true, photoUrl: true, cvUrl: true, createdAt: true },
    });

    const token = signUserToken({ uid: user.id, role: 'user' });
    setCookie(res, USER_COOKIE, token, 30 * 24 * 60 * 60); // 30 hari

    // DEBUG: log Set-Cookie header
    try {
      const sc = res.getHeader('Set-Cookie');
      console.log('[AUTH][SIGNUP] Set-Cookie header ->', sc);
    } catch (err) {
      console.warn('[AUTH][SIGNUP] Could not read Set-Cookie header:', err);
    }

    return res.status(201).json({ ok: true, user: { ...user, role: 'user' } });
  } catch (e: any) {
    console.error('USER SIGNUP ERROR:', e);
    next(e);
  }
});

/* ----- USER SIGNIN ----- */
router.post('/signin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = userSigninSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Data tidak valid", errors: parsed.error.flatten().fieldErrors });
    }

    const { usernameOrEmail, password } = parsed.data;
    const input = usernameOrEmail.trim();

    let user;
    let userIdForHashLookup: string | undefined;

    if (input.includes('@')) {
      const foundByEmail = await prisma.user.findUnique({
        where: { email: input.toLowerCase() },
        select: { id: true }
      });
      if (foundByEmail) userIdForHashLookup = foundByEmail.id;
    } else {
      const foundByUsername = await prisma.user.findFirst({
        where: { name: input },
        select: { id: true }
      });
      if (foundByUsername) userIdForHashLookup = foundByUsername.id;
    }

    if (!userIdForHashLookup) {
      console.warn(`[AUTH][SIGNIN][FAIL] user not found: ${input}`);
      return res.status(401).json({ message: 'Email/Username atau password salah' });
    }

    const userWithHash = await prisma.user.findUnique({ where: { id: userIdForHashLookup }, select: { passwordHash: true } });

    if (!userWithHash) {
      console.error(`[AUTH][SIGNIN][FAIL] Could not retrieve hash for user ID: ${userIdForHashLookup}`);
      return res.status(401).json({ message: 'Email/Username atau password salah' });
    }

    const ok = await bcrypt.compare(password, userWithHash.passwordHash);
    if (!ok) {
      console.warn(`[AUTH][SIGNIN][FAIL] invalid password for: ${input}`);
      return res.status(401).json({ message: 'Email/Username atau password salah' });
    }

    user = await prisma.user.findUnique({
      where: { id: userIdForHashLookup },
      select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true, createdAt: true }
    });

    if (!user) {
      console.error(`[AUTH][SIGNIN][FAIL] User data disappeared after password check for ID: ${userIdForHashLookup}`);
      return res.status(500).json({ message: 'Terjadi kesalahan saat mengambil data user.' });
    }

    const token = signUserToken({ uid: user.id, role: 'user' });
    setCookie(res, USER_COOKIE, token, 30 * 24 * 60 * 60); // 30 hari

    // DEBUG: log Set-Cookie header
    try {
      const sc = res.getHeader('Set-Cookie');
      console.log('[AUTH][SIGNIN] Set-Cookie header ->', sc);
    } catch (err) {
      console.warn('[AUTH][SIGNIN] Could not read Set-Cookie header:', err);
    }

    return res.json({ ok: true, user: { ...user, role: 'user' } });

  } catch (e: any) {
    console.error('USER SIGNIN ERROR:', e);
    next(e);
  }
});

/* ----- USER SIGNOUT ----- */
router.post('/signout', (_req: Request, res: Response) => {
  clearCookie(res, USER_COOKIE);
  clearCookie(res, EMP_COOKIE);
  return res.status(204).end();
});

/* ----- ME (restore session) ----- */
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = parse(req.headers.cookie || '');
    const userToken = cookies[USER_COOKIE];
    const adminToken = cookies[ADMIN_COOKIE];
    const employerToken = cookies[EMP_COOKIE];

    // Prioritaskan Admin
    if (adminToken) {
      if (!JWT_ADMIN_SECRET) return res.status(500).json({ message: 'Server misconfiguration' });
      try {
        const payload = verifyAdminToken(adminToken);
        const a = await prisma.admin.findUnique({ where: { id: payload.uid }, select: { id: true, username: true, createdAt: true } });
        if (!a) { clearCookie(res, ADMIN_COOKIE); return res.status(401).json({ message: 'Admin not found' }); }
        return res.json({ ok: true, data: { ...a, role: 'admin' } });
      } catch (err: any) { console.warn('[AUTH][ME] admin token invalid:', err?.message ?? err); clearCookie(res, ADMIN_COOKIE); }
    }

    // Employer token placeholder (implement if you have employer JWT)
    if (employerToken) {
      // placeholder: continue to next check
    }

    // User
    if (userToken) {
      if (!JWT_SECRET) return res.status(500).json({ message: 'Server misconfiguration' });
      try {
        const payload = verifyUserToken(userToken);
        const u = await prisma.user.findUnique({ where: { id: payload.uid }, select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true, createdAt: true } });
        if (!u) { clearCookie(res, USER_COOKIE); return res.status(401).json({ message: 'User not found' }); }
        return res.json({ ok: true, data: { ...u, role: 'user' } });
      } catch (err: any) { console.warn('[AUTH][ME] user token invalid:', err?.message ?? err); clearCookie(res, USER_COOKIE); }
    }

    return res.status(401).json({ message: 'Unauthorized: No valid session found' });

  } catch (e: any) {
    console.error('[AUTH][ME] error:', e);
    next(e);
  }
});

/* ----- ADMIN SIGNIN ----- */
router.post('/admin/signin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = adminSigninSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Data tidak valid", errors: parsed.error.flatten().fieldErrors });
    }

    const { username, password } = parsed.data;
    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) return res.status(401).json({ message: 'Username atau password salah' });

    const adminWithHash = await prisma.admin.findUnique({ where: { username }, select: { passwordHash: true }});
    if (!adminWithHash) return res.status(401).json({ message: 'Username atau password salah' });

    const ok = await bcrypt.compare(password, adminWithHash.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Username atau password salah' });

    const token = signAdminToken({ uid: admin.id, role: 'admin' });
    setCookie(res, ADMIN_COOKIE, token, 7 * 24 * 60 * 60); // 7 hari

    // DEBUG: log Set-Cookie header
    try {
      const sc = res.getHeader('Set-Cookie');
      console.log('[AUTH][ADMIN_SIGNIN] Set-Cookie header ->', sc);
    } catch (err) {
      console.warn('[AUTH][ADMIN_SIGNIN] Could not read Set-Cookie header:', err);
    }

    return res.json({ ok: true, data: { id: admin.id, username: admin.username, role: 'admin' } });
  } catch (e: any) {
    console.error('ADMIN SIGNIN ERROR:', e);
    next(e);
  }
});

/* ----- ADMIN SIGNOUT ----- */
router.post('/admin/signout', (_req: Request, res: Response) => {
  clearCookie(res, ADMIN_COOKIE);
  return res.status(204).end();
});

export default router;
