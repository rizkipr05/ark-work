// src/routes/employer.ts
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { prisma } from '../lib/prisma';

export const employerRouter = Router();

/* ================== TYPE AUGMENTATION ================== */
declare module 'express-serve-static-core' {
  interface Request {
    employerId?: string | null;
    employerSessionId?: string | null;
    employerAdminUserId?: string | null;
  }
}

/* ================== AUTH ================== */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EMP_SESSION_COOKIE = 'emp_session';
const EMP_TOKEN_COOKIE = 'emp_token';

type EmployerJWTPayload = {
  uid: string; // employer admin user id
  role: 'employer';
  eid: string; // employerId
  iat?: number;
  exp?: number;
};

async function authFromSession(req: Request) {
  const sid = parseCookie(req.headers.cookie || '')[EMP_SESSION_COOKIE];
  if (!sid) return null;

  const s = await prisma.session.findUnique({
    where: { id: sid },
    select: { id: true, employerId: true, revokedAt: true, expiresAt: true },
  });

  const now = new Date();
  if (!s || !s.employerId || s.revokedAt || (s.expiresAt && s.expiresAt < now)) return null;

  return { employerId: s.employerId as string, sessionId: s.id as string };
}

function authFromToken(req: Request) {
  const token = parseCookie(req.headers.cookie || '')[EMP_TOKEN_COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, JWT_SECRET) as EmployerJWTPayload;
    if (p.role !== 'employer' || !p.eid) return null;
    return { employerId: p.eid, adminUserId: p.uid };
  } catch {
    return null;
  }
}

async function resolveEmployerAuth(req: Request) {
  const bySess = await authFromSession(req);
  if (bySess) {
    return {
      employerId: bySess.employerId,
      sessionId: bySess.sessionId,
      adminUserId: null as string | null,
    };
  }

  const byJwt = authFromToken(req);
  if (byJwt) {
    return {
      employerId: byJwt.employerId,
      sessionId: null as string | null,
      adminUserId: byJwt.adminUserId ?? null,
    };
  }

  const header = (req.headers['x-employer-id'] as string | undefined)?.trim() || null;
  const query = (req.query?.employerId as string | undefined)?.trim() || null;
  const env = process.env.DEV_EMPLOYER_ID || null;

  const employerId = header || query || env;
  if (!employerId) return null;

  return { employerId, sessionId: null as string | null, adminUserId: null as string | null };
}

export async function attachEmployerId(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = await resolveEmployerAuth(req);
    req.employerId = auth?.employerId ?? null;
    req.employerSessionId = auth?.sessionId ?? null;
    // ✅ konsisten: gunakan adminUserId
    req.employerAdminUserId = auth?.adminUserId ?? null;
  } catch {
    req.employerId = null;
    req.employerSessionId = null;
    req.employerAdminUserId = null;
  }
  next();
}

/* ================== /auth/me & /me ================== */
/** Selalu kembalikan employer.displayName; fallback ke admin.fullName/legalName bila kosong */
async function handleMe(req: Request, res: Response) {
  const auth = await resolveEmployerAuth(req);
  if (!auth?.employerId) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const employer = await prisma.employer.findUnique({
    where: { id: auth.employerId },
    select: { id: true, slug: true, displayName: true, legalName: true, website: true },
  });
  if (!employer) {
    return res.status(404).json({ ok: false, message: 'Employer not found' });
  }

  // ✅ gunakan adminUserId (bukan employerAdminUserId)
  const adminUserId = auth.adminUserId;
  const admin = adminUserId
    ? await prisma.employerAdminUser
        .findUnique({
          where: { id: adminUserId },
          select: { id: true, email: true, fullName: true, isOwner: true },
        })
        .catch(() => null as any)
    : null;

  const fallbackName =
    employer.displayName ||
    admin?.fullName ||
    employer.legalName ||
    'Company';

  return res.json({
    ok: true,
    role: 'employer',
    employer: {
      id: employer.id,
      slug: employer.slug,
      displayName: employer.displayName ?? fallbackName,
      legalName: employer.legalName,
      website: employer.website,
    },
    admin: admin
      ? { id: admin.id, email: admin.email, fullName: admin.fullName, isOwner: admin.isOwner }
      : null,
    sessionId: auth.sessionId,
  });
}

employerRouter.get('/auth/me', handleMe);
employerRouter.get('/me', handleMe);

/* ================== Upload logo ================== */
const uploadsRoot = path.join(process.cwd(), 'public', 'uploads');
fs.mkdirSync(uploadsRoot, { recursive: true });

function pickEmployerIdForStorage(req: Request): string {
  const byAttach = (req.employerId as string | null) || undefined;
  const byHeader = (req.headers['x-employer-id'] as string | undefined)?.trim();
  const byToken = authFromToken(req)?.employerId;
  return byAttach || byHeader || byToken || 'unknown';
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const eid = pickEmployerIdForStorage(req);
    const dir = path.join(uploadsRoot, 'employers', eid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, 'logo' + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.mimetype)) {
      return cb(new Error('Only PNG/JPG/WebP allowed'));
    }
    cb(null, true);
  },
});

type MulterReq = Request & { file?: Express.Multer.File };

employerRouter.post('/profile/logo', upload.single('file'), async (req, res) => {
  const mreq = req as MulterReq;
  const auth = await resolveEmployerAuth(req);
  const employerId =
    req.employerId ||
    (mreq.body?.employerId as string | undefined) ||
    auth?.employerId ||
    null;

  if (!employerId) return res.status(400).json({ message: 'employerId required' });
  if (!mreq.file) return res.status(400).json({ message: 'file required' });

  const dir = path.join(uploadsRoot, 'employers', employerId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    const from = path.join(uploadsRoot, 'employers', 'unknown', mreq.file.filename);
    const to = path.join(dir, mreq.file.filename);
    try { fs.renameSync(from, to); } catch {}
  }

  const publicUrl = `/uploads/employers/${employerId}/${mreq.file.filename}`;

  await prisma.employerProfile.upsert({
    where: { employerId },
    create: { employerId, logoUrl: publicUrl },
    update: { logoUrl: publicUrl },
  });

  return res.json({ ok: true, url: publicUrl });
});

export default employerRouter;
