import { Router } from "express";
import prisma from "../utils/prisma";
import { Prisma } from "@prisma/client";

export const jobsRouter = Router();

// Type helper untuk include employer + profile.logoUrl
type JobWithEmployer = Prisma.JobGetPayload<{
  include: {
    employer: {
      select: {
        displayName: true;
        profile: { select: { logoUrl: true } };
      };
    };
  };
}>;

/**
 * GET /api/jobs
 * Query:
 *  - active=1 => hanya job aktif (isActive true & isDraft false)
 */
jobsRouter.get("/jobs", async (req, res) => {
  try {
    const onlyActive = String(req.query.active ?? "") === "1";

    const jobs = await prisma.job.findMany({
      where: onlyActive ? { isActive: true, isDraft: false } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        employer: {
          select: {
            displayName: true,
            profile: { select: { logoUrl: true } },
          },
        },
      },
    });

    const data = (jobs as JobWithEmployer[]).map((j) => ({
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
    return res.status(500).json({ ok: false, error: e?.message || "Internal error" });
  }
});

/**
 * GET /api/employer/jobs
 * Query: ?employerId=<UUID>
 */
jobsRouter.get("/employer/jobs", async (req, res) => {
  try {
    const employerId = (req.query.employerId as string) || process.env.DEV_EMPLOYER_ID;

    if (!employerId) {
      return res.status(401).json({ ok: false, error: "employerId tidak tersedia" });
    }

    const jobs = await prisma.job.findMany({
      where: { employerId },
      orderBy: { createdAt: "desc" },
      include: {
        employer: {
          select: {
            displayName: true,
            profile: { select: { logoUrl: true } },
          },
        },
      },
    });

    const data = (jobs as JobWithEmployer[]).map((j) => ({
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
    return res.status(500).json({ ok: false, error: e?.message || "Internal error" });
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

    // NOTE produksi: ambil dari session auth
    const employerId = bodyEmployerId || process.env.DEV_EMPLOYER_ID;
    if (!employerId) {
      return res.status(401).json({ ok: false, error: "Tidak ada employerId (login dulu)" });
    }

    // (opsional) update logo di profil employer dari base64 data URL
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

    const job = await prisma.job.create({
      data: {
        employerId,
        title,
        description: description ?? null,
        location: location ?? null,
        employment: employment ?? null,
        isDraft: Boolean(isDraft),
        isActive: !Boolean(isDraft), // bukan draft => aktif
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
    return res.status(500).json({ ok: false, error: e?.message || "Internal error" });
  }
});
