import { Router } from "express";
import { prisma } from "../lib/prisma"; // <-- samakan import
import { Prisma } from "@prisma/client";

export const jobsRouter = Router();

/**
 * GET /api/jobs
 * ?active=1 => hanya job aktif (isActive true & isDraft false)
 */
jobsRouter.get("/jobs", async (req, res) => {
  try {
    const onlyActive = String(req.query.active ?? "") === "1";

    const jobs = await prisma.job.findMany({
      where: onlyActive ? { isActive: true, isDraft: false } : undefined,
      orderBy: { createdAt: "desc" },
      // Pakai SELECT eksplisit agar TS melihat field2 baru
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        isActive: true,
        isDraft: true,

        // kolom baru yang sering hilang di tipe cache TS
        location: true,
        employment: true,

        employer: {
          select: {
            displayName: true,
            profile: { select: { logoUrl: true } },
          },
        },
      },
    });

    const data = jobs.map((j) => ({
      id: j.id,
      title: j.title,
      location: j.location ?? "",
      employment: j.employment ?? "",
      description: j.description ?? "",
      postedAt: j.createdAt.toISOString(),
      company: j.employer?.displayName ?? "Company",
      logoUrl: j.employer?.profile?.logoUrl ?? null,
      isActive: j.isActive,
    }));

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("GET /api/jobs error:", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "Internal error" });
  }
});

/**
 * GET /api/employer/jobs
 * ?employerId=<UUID>
 */
jobsRouter.get("/employer/jobs", async (req, res) => {
  try {
    const employerId =
      (req.query.employerId as string) || process.env.DEV_EMPLOYER_ID;

    if (!employerId) {
      return res
        .status(401)
        .json({ ok: false, error: "employerId tidak tersedia" });
    }

    const jobs = await prisma.job.findMany({
      where: { employerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        isActive: true,
        isDraft: true,

        // kolom baru
        location: true,
        employment: true,

        employer: {
          select: {
            displayName: true,
            profile: { select: { logoUrl: true } },
          },
        },
      },
    });

    const data = jobs.map((j) => ({
      id: j.id,
      title: j.title,
      location: j.location ?? "",
      employment: j.employment ?? "",
      description: j.description ?? "",
      postedAt: j.createdAt.toISOString(),
      company: j.employer?.displayName ?? "Company",
      logoUrl: j.employer?.profile?.logoUrl ?? null,
      isActive: j.isActive,
      isDraft: j.isDraft,
    }));

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("GET /api/employer/jobs error:", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "Internal error" });
  }
});

/**
 * POST /api/employer/jobs
 * Body: { title, location?, employment?, description?, isDraft?, employerId?, logoDataUrl? }
 */
jobsRouter.post("/employer/jobs", async (req, res) => {
  try {
    const {
      title,
      location,
      employment,
      description,
      isDraft,
      employerId: bodyEmployerId,
      logoDataUrl,
    } = req.body || {};

    if (!title || typeof title !== "string") {
      return res.status(400).json({ ok: false, error: "title wajib diisi" });
    }

    // produksi: ambil dari session auth
    const employerId = bodyEmployerId || process.env.DEV_EMPLOYER_ID;
    if (!employerId) {
      return res
        .status(401)
        .json({ ok: false, error: "Tidak ada employerId (login dulu)" });
    }

    // (opsional) update logo via base64
    if (logoDataUrl && typeof logoDataUrl === "string") {
      await prisma.employer.update({
        where: { id: employerId },
        data: {
          profile: {
            upsert: {
              create: { logoUrl: logoDataUrl },
              update: { logoUrl: logoDataUrl },
            },
          },
        },
      });
    }

    const employer = await prisma.employer.findUnique({
      where: { id: employerId },
      select: { displayName: true, profile: { select: { logoUrl: true } } },
    });

    // kadang TS masih pakai tipe lama -> cast ringan sebagai guard
    const job = await prisma.job.create({
      data: {
        employerId,
        title,
        description: description ?? null,
        // kolom baru, izinkan null
        location: (location ?? null) as any,
        employment: (employment ?? null) as any,

        isDraft: !!isDraft,
        isActive: !isDraft,
      } as any,
      select: {
        id: true,
        title: true,
        createdAt: true,
        description: true,
        isActive: true,
        location: true,
        employment: true,
      },
    });

    return res.json({
      ok: true,
      data: {
        id: job.id,
        title: job.title,
        location: job.location,
        employment: job.employment,
        description: job.description,
        postedAt: job.createdAt.toISOString(),
        company: employer?.displayName ?? "Company",
        logoUrl: employer?.profile?.logoUrl ?? null,
        isActive: job.isActive,
      },
    });
  } catch (e: any) {
    console.error("POST /api/employer/jobs error:", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "Internal error" });
  }
});
