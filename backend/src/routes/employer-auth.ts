// src/routes/employer-auth.ts
import { Router } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";

const router = Router();

/* ===================== Cookie helpers ===================== */
const EMP_COOKIE = "emp_session";
const SESSION_HOURS = 12;

/**
 * IMPORTANT:
 * - SameSite MUST be 'none' so cross-site XHR from http://localhost:3000 to http://localhost:4000 sends the cookie.
 * - Browsers require Secure=true when SameSite=None. Chrome allows Secure cookies on localhost.
 * - If you deploy behind HTTPS, this is also the right setting.
 */
function makeCookie(sessionId: string) {
  return serializeCookie(EMP_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,          // required with SameSite=None; allowed on localhost
    sameSite: "none",      // <-- KEY FIX: allow cross-site requests to include cookie
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

function clearCookie() {
  return serializeCookie(EMP_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 0,
  });
}

function readSessionIdFromReq(req: any): string | null {
  try {
    const sid = parseCookie(req.headers?.cookie || "")[EMP_COOKIE];
    return sid || null;
  } catch {
    return null;
  }
}

/* ===================== POST /signin ===================== */
/**
 * Body can be { email, password } or { usernameOrEmail, password }.
 * We look up employer_admin_users by email (or full_name as a simple fallback).
 */
router.post("/signin", async (req, res) => {
  try {
    const usernameOrEmail: string =
      req.body?.usernameOrEmail ?? req.body?.email ?? "";
    const password: string = req.body?.password ?? "";

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ ok: false, error: "MISSING_CREDENTIALS" });
    }

    const admin = await prisma.employerAdminUser.findFirst({
      where: {
        OR: [{ email: usernameOrEmail }, { fullName: usernameOrEmail }],
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        employerId: true,
        employer: { select: { id: true, slug: true, displayName: true } },
      },
    });

    if (!admin || !admin.passwordHash) {
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    }

    const passOk = await bcrypt.compare(password, admin.passwordHash);
    if (!passOk) {
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    }

    const employer = await prisma.employer.findUnique({
      where: { id: admin.employerId },
      select: { id: true, slug: true, displayName: true },
    });
    if (!employer) {
      return res.status(401).json({ ok: false, error: "NO_EMPLOYER" });
    }

    const now = Date.now();
    const session = await prisma.session.create({
      data: {
        userId: null, // keep null so it doesn't conflict with User FK
        employerId: employer.id,
        createdAt: new Date(now),
        lastSeenAt: new Date(now),
        expiresAt: new Date(now + SESSION_HOURS * 60 * 60 * 1000),
        ip: req.ip,
        userAgent: req.get("user-agent") || "",
      },
      select: { id: true },
    });

    res.setHeader("Set-Cookie", makeCookie(session.id));

    return res.json({
      ok: true,
      employer, // { id, slug, displayName }
      admin: { id: admin.id, email: admin.email },
    });
  } catch (e) {
    console.error("[EMP-AUTH] /signin error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

/* ===================== POST /signout ===================== */
router.post("/signout", async (req, res) => {
  try {
    const sid = readSessionIdFromReq(req);
    if (sid) {
      await prisma.session.updateMany({
        where: { id: sid, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } catch (e) {
    console.warn("[EMP-AUTH] /signout revoke warn:", e);
  }
  res.setHeader("Set-Cookie", clearCookie());
  return res.status(204).end();
});

/* ===================== GET /me ===================== */
router.get("/me", async (req, res) => {
  try {
    const sid = readSessionIdFromReq(req);
    if (!sid) return res.status(401).json({ ok: false, error: "NO_SESSION" });

    const s = await prisma.session.findUnique({
      where: { id: sid },
      select: { employerId: true, revokedAt: true, expiresAt: true },
    });

    if (!s || s.revokedAt || !s.employerId || (s.expiresAt && s.expiresAt < new Date())) {
      return res.status(401).json({ ok: false, error: "NO_SESSION" });
    }

    const employer = await prisma.employer.findUnique({
      where: { id: s.employerId },
      select: {
        id: true,
        slug: true,
        displayName: true, // FE will show this as Company
        legalName: true,
        website: true,
        profile: { select: { logoUrl: true } }, // from employer_profiles
      },
    });
    if (!employer) {
      return res.status(404).json({ ok: false, error: "EMPLOYER_NOT_FOUND" });
    }

    const admin = await prisma.employerAdminUser.findFirst({
      where: { employerId: s.employerId },
      orderBy: { isOwner: "desc" },
      select: { id: true, email: true, fullName: true, isOwner: true },
    });

    return res.json({
      ok: true,
      role: "employer",
      employer: {
        id: employer.id,
        slug: employer.slug,
        displayName: employer.displayName,
        legalName: employer.legalName,
        website: employer.website,
        logoUrl: employer.profile?.logoUrl ?? null,
      },
      admin: admin ?? null,
    });
  } catch (e) {
    console.error("[EMP-AUTH] /me error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

/* ===================== (Optional) POST /renew ===================== */
router.post("/renew", async (req, res) => {
  try {
    const sid = readSessionIdFromReq(req);
    if (!sid) return res.status(401).json({ ok: false, error: "NO_SESSION" });

    const s = await prisma.session.findUnique({
      where: { id: sid },
      select: { id: true, revokedAt: true, expiresAt: true },
    });
    if (!s || s.revokedAt || (s.expiresAt && s.expiresAt < new Date())) {
      return res.status(401).json({ ok: false, error: "NO_SESSION" });
    }

    const now = Date.now();
    const newExp = new Date(now + SESSION_HOURS * 60 * 60 * 1000);
    await prisma.session.update({
      where: { id: s.id },
      data: { lastSeenAt: new Date(now), expiresAt: newExp },
      select: { id: true },
    });

    res.setHeader("Set-Cookie", makeCookie(s.id));
    return res.json({ ok: true });
  } catch (e) {
    console.error("[EMP-AUTH] /renew error:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
