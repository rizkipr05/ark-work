// src/routes/auth.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { serialize, parse } from 'cookie';

// >>>> SAMA dengan role.ts
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'none' | 'strict';
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === 'true' ||
  (process.env.NODE_ENV === 'production' && COOKIE_SAMESITE === 'none');

// nama cookie HARUS match middleware/role.ts
const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || 'admin_token';
const EMP_COOKIE   = process.env.EMP_COOKIE_NAME   || 'emp_token';
const USER_COOKIE  = process.env.USER_COOKIE_NAME  || 'user_token';

type JWTPayload = { uid: string; role: 'user' | 'admin' };

const router = Router();

/* ---------- helpers ---------- */
function signToken(p: JWTPayload) {
  return jwt.sign(p, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(t: string) {
  return jwt.verify(t, JWT_SECRET) as JWTPayload;
}
function setCookie(res: Response, name: string, token: string) {
  res.setHeader(
    'Set-Cookie',
    serialize(name, token, {
      httpOnly: true,
      sameSite: COOKIE_SAMESITE,
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 hari
    })
  );
}
function clearCookie(res: Response, name: string) {
  res.setHeader(
    'Set-Cookie',
    serialize(name, '', {
      httpOnly: true,
      sameSite: COOKIE_SAMESITE,
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 0,
    })
  );
}

/* ---------- validators ---------- */
const userSignupSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});
const userSigninSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
const adminSigninSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

/* ---------- routes ---------- */

// ping
router.get('/', (_req, res) => res.json({ message: 'Auth route works!' }));

/** USER SIGNUP */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const parsed = userSignupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
    const { name, email, password } = parsed.data;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ message: 'Email already used' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true, name: true, email: true, photoUrl: true, cvUrl: true, createdAt: true },
    });

    const token = signToken({ uid: user.id, role: 'user' });
    setCookie(res, USER_COOKIE, token); // <<< pakai user_token

    return res.status(201).json(user);
  } catch (e) {
    console.error('USER SIGNUP ERROR:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** USER SIGNIN */
router.post('/signin', async (req: Request, res: Response) => {
  try {
    const parsed = userSigninSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Email atau password salah' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Email atau password salah' });

    const token = signToken({ uid: user.id, role: 'user' });
    setCookie(res, USER_COOKIE, token); // <<< pakai user_token

    return res.json({
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      photoUrl: user.photoUrl ?? null,
      cvUrl: user.cvUrl ?? null,
      role: 'user',
    });
  } catch (e) {
    console.error('USER SIGNIN ERROR:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** USER SIGNOUT */
router.post('/signout', (_req: Request, res: Response) => {
  clearCookie(res, USER_COOKIE);
  return res.status(204).end();
});

/** ME (user/admin) */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const cookies = parse(req.headers.cookie || '');
    // Prioritaskan user_token, lalu admin_token
    const token = cookies[USER_COOKIE] || cookies[ADMIN_COOKIE];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const payload = verifyToken(token); // { uid, role }

    if (payload.role === 'user') {
      const u = await prisma.user.findUnique({
        where: { id: payload.uid },
        select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true, createdAt: true },
      });
      if (!u) return res.status(401).json({ message: 'Unauthorized' });
      return res.json({ ...u, role: 'user' });
    }

    const a = await prisma.admin.findUnique({
      where: { id: payload.uid },
      select: { id: true, username: true, createdAt: true },
    });
    if (!a) return res.status(401).json({ message: 'Unauthorized' });
    return res.json({ id: a.id, email: `${a.username}@local`, name: a.username, role: 'admin' });
  } catch (e) {
    console.error('ME ERROR:', e);
    return res.status(401).json({ message: 'Invalid token' });
  }
});

/** ADMIN SIGNIN */
router.post('/admin/signin', async (req: Request, res: Response) => {
  try {
    const parsed = adminSigninSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const { username, password } = parsed.data;
    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) return res.status(401).json({ message: 'Username atau password salah' });

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Username atau password salah' });

    const token = signToken({ uid: admin.id, role: 'admin' });
    setCookie(res, ADMIN_COOKIE, token); // <<< pakai admin_token

    return res.json({ id: admin.id, email: `${admin.username}@local`, name: admin.username, role: 'admin' });
  } catch (e) {
    console.error('ADMIN SIGNIN ERROR:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** ADMIN SIGNOUT (opsional) */
router.post('/admin/signout', (_req: Request, res: Response) => {
  clearCookie(res, ADMIN_COOKIE);
  return res.status(204).end();
});

export default router;
