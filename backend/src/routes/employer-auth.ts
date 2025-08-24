import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { serialize, parse as parseCookie } from 'cookie'

const router = Router()

/* ======================= ENV & Helpers ======================= */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'none' | 'strict'
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === 'true' ||
  (process.env.NODE_ENV === 'production' && COOKIE_SAMESITE === 'none')

type JWTPayload = { uid: string; role: 'employer'; eid: string }

const sign = (p: JWTPayload) => jwt.sign(p, JWT_SECRET, { expiresIn: '7d' })

const setEmpCookie = (res: Response, token: string) => {
  res.setHeader(
    'Set-Cookie',
    serialize('emp_token', token, {
      httpOnly: true,
      sameSite: COOKIE_SAMESITE,
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 hari
    }),
  )
}

const readEmpCookie = (req: Request) => {
  const token = parseCookie(req.headers.cookie || '')['emp_token']
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch {
    return null
  }
}

/* ======================= Schemas ======================= */
// Frontend kamu kirim `usernameOrEmail`, jadi backend terima itu.
// Kita tetap support email murni juga.
const signinSchema = z.object({
  usernameOrEmail: z.string().trim().min(3, 'username/email terlalu pendek'),
  password: z.string().min(6, 'password terlalu pendek'),
})

// Website sering dikirim "-" / "" dari UI — kita rapihin jadi `undefined`
const websiteCoerce = z.preprocess((v) => {
  const s = (typeof v === 'string' ? v : '').trim()
  if (!s || s === '-' || s === '—') return undefined
  return s
}, z.string().url().optional())

const signupSchema = z.object({
  companyName: z.string().min(2, 'nama perusahaan minimal 2 karakter'),
  email: z.string().email('email tidak valid'),
  password: z.string().min(8, 'password minimal 8 karakter'),
  website: websiteCoerce.optional(),
})

/* ======================= Routes ======================= */
/**
 * POST /api/employers/auth/signup
 * Buat Employer + EmployerAdminUser + set emp_token
 */
router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format(), message: 'Validation error' })
  }

  const { companyName, email, password, website } = parsed.data

  try {
    const exist = await prisma.employerAdminUser.findUnique({ where: { email: email.toLowerCase() } })
    if (exist) return res.status(409).json({ message: 'Email sudah terpakai' })

    const employer = await prisma.employer.create({
      data: {
        slug: companyName.toLowerCase().replace(/\s+/g, '-'),
        displayName: companyName,
        legalName: companyName,
        website: website ?? null,
      },
      select: { id: true, slug: true, displayName: true },
    })

    const passwordHash = await bcrypt.hash(password, 10)
    const admin = await prisma.employerAdminUser.create({
      data: {
        employerId: employer.id,
        email: email.toLowerCase(),
        passwordHash,
        fullName: companyName,
        isOwner: true,
        agreedTosAt: new Date(),
      },
      select: { id: true, email: true, fullName: true, employerId: true, isOwner: true },
    })

    const token = sign({ uid: admin.id, role: 'employer', eid: employer.id })
    setEmpCookie(res, token)

    return res.status(201).json({ ok: true, admin, employer })
  } catch (err: any) {
    // Unique constraint, dll.
    if (err?.code === 'P2002') {
      return res.status(409).json({ message: 'Email sudah terpakai' })
    }
    console.error('employer signup error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

/**
 * POST /api/employers/auth/signin
 * Login employer-admin
 * Body: { usernameOrEmail, password }
 */
router.post('/signin', async (req, res) => {
  const parsed = signinSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format(), message: 'Validation error' })
  }

  const { usernameOrEmail, password } = parsed.data
  const login = usernameOrEmail.trim().toLowerCase()
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)

  try {
    // NOTE: skema kamu hanya ada email (tidak ada username). Jadi fallback ke email.
    const admin = await prisma.employerAdminUser.findUnique({
      where: { email: isEmail ? login : login }, // kalau nanti ada kolom username, ubah query ke OR
    })

    if (!admin) return res.status(401).json({ message: 'Email atau password salah' })

    const ok = await bcrypt.compare(password, admin.passwordHash)
    if (!ok) return res.status(401).json({ message: 'Email atau password salah' })

    const employer = await prisma.employer.findUnique({
      where: { id: admin.employerId },
      select: { id: true, slug: true, displayName: true, legalName: true },
    })
    if (!employer) return res.status(404).json({ message: 'Employer tidak ditemukan' })

    const token = sign({ uid: admin.id, role: 'employer', eid: employer.id })
    setEmpCookie(res, token)

    return res.json({
      ok: true,
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        isOwner: !!admin.isOwner,
      },
      employer,
    })
  } catch (err) {
    console.error('employer signin error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

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
    }),
  )
  res.status(204).end()
})

/**
 * GET /api/employers/auth/me
 */
router.get('/me', async (req, res) => {
  try {
    const p = readEmpCookie(req)
    if (!p) return res.status(401).json({ message: 'Unauthorized' })

    const admin = await prisma.employerAdminUser.findUnique({
      where: { id: p.uid },
      select: { id: true, email: true, fullName: true, employerId: true, isOwner: true },
    })
    if (!admin) return res.status(401).json({ message: 'Unauthorized' })

    const employer = await prisma.employer.findUnique({
      where: { id: p.eid },
      select: { id: true, slug: true, displayName: true, legalName: true },
    })

    return res.json({ ok: true, admin, employer, role: 'employer' })
  } catch (err) {
    console.error('employer me error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

export default router
