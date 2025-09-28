import { Router } from "express";
import { prisma } from "../lib/prisma";
import { mapJobToDTO } from "../utils/job-dto";
import type { Prisma } from "@prisma/client";

const router = Router();

/** ===== Type helper: Job + employer(displayName, profile.logoUrl) ===== */
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
 *  - active=1 => hanya job aktif (dan bukan draft)
 *  - employerId=uuid => filter per employer
 */
router.get("/jobs", async (req, res) => {
  try {
    const active = String(req.query.active ?? "");
    const employerId = typeof req.query.employerId === "string" ? req.query.employerId.trim() : "";

    const where: Prisma.JobWhereInput = {};
    if (active === "1") {
      where.isActive = true;
      where.isDraft = false;
    }
    if (employerId) where.employerId = employerId;

    const rows = await prisma.job.findMany({
      where,
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

    const data = (rows as JobWithEmployer[]).map((j) => ({
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
      employerId: j.employerId,
      salaryMin: j.salaryMin ?? null,
      salaryMax: j.salaryMax ?? null,
      currency: j.currency ?? "IDR",
      requirements: j.requirements ?? null,
    }));

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("[GET /api/jobs] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Server Error" });
  }
});

/**
 * GET /api/employer/jobs
 * Mengembalikan SEMUA job milik employer tsb (aktif/nonaktif), untuk panel admin employer.
 */
router.get("/employer/jobs", async (req, res) => {
  try {
    const employerId =
      (typeof req.query.employerId === "string" ? req.query.employerId.trim() : "") ||
      process.env.DEV_EMPLOYER_ID;

    if (!employerId) return res.status(400).json({ ok: false, error: "employerId tidak tersedia" });

    const jobs = await prisma.job.findMany({
      where: { employerId },
      orderBy: { createdAt: "desc" },
      include: {
        employer: { select: { displayName: true, profile: { select: { logoUrl: true } } } },
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
      employerId: j.employerId,
      salaryMin: j.salaryMin ?? null,
      salaryMax: j.salaryMax ?? null,
      currency: j.currency ?? "IDR",
      requirements: j.requirements ?? null,
    }));

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("[GET /api/employer/jobs] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal error" });
  }
});

/**
 * POST /api/employer/jobs
 * Membuat job baru milik employer
 */
router.post("/employer/jobs", async (req, res) => {
  try {
    const {
      title,
      location,
      employment,
      description,
      isDraft,
      employerId: bodyEmployerId,
      logoDataUrl,
    } = req.body ?? {};

    if (!title || typeof title !== "string") {
      return res.status(400).json({ ok: false, error: "title wajib diisi" });
    }

    const employerId = (bodyEmployerId || process.env.DEV_EMPLOYER_ID) as string | undefined;
    if (!employerId) return res.status(401).json({ ok: false, error: "Tidak ada employerId (login dulu)" });

    // opsional: simpan logo ke profile
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
        isActive: !Boolean(isDraft),
      },
    });

    return res.json({
      ok: true,
      data: {
        id: job.id,
        title: job.title,
        location: job.location ?? "",
        employment: job.employment ?? "",
        description: job.description ?? "",
        postedAt: job.createdAt.toISOString(),
        company: employer?.displayName ?? "Company",
        logoUrl: employer?.profile?.logoUrl ?? null,
        isActive: job.isActive,
        isDraft: job.isDraft,
        employerId,
      },
    });
  } catch (e: any) {
    console.error("[POST /api/employer/jobs] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal error" });
  }
});

/**
 * PATCH /api/jobs/:id
 * Update parsial (aktif/nonaktif, dll.)
 */
router.patch("/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      isActive,
      isDraft,
      title,
      description,
      location,
      employment,
      salaryMin,
      salaryMax,
      currency,
      requirements,
    } = req.body ?? {};

    const data: Prisma.JobUpdateInput = {
      updatedAt: new Date(),
    };

    if (typeof isActive === "boolean") data.isActive = isActive;
    if (typeof isDraft === "boolean") data.isDraft = isDraft;
    if (typeof title === "string") data.title = title;
    if (typeof description === "string") data.description = description;
    if (typeof location === "string") data.location = location;
    if (typeof employment === "string") data.employment = employment;
    if (typeof salaryMin === "number") data.salaryMin = salaryMin;
    if (typeof salaryMax === "number") data.salaryMax = salaryMax;
    if (typeof currency === "string") data.currency = currency;
    if (typeof requirements === "string") data.requirements = requirements;

    const updated = await prisma.job.update({
      where: { id },
      data,
      include: { employer: { select: { displayName: true, profile: { select: { logoUrl: true } } } } },
    });

    return res.json({ ok: true, data: mapJobToDTO(updated as any) });
  } catch (e: any) {
    console.error("[PATCH /api/jobs/:id] error:", e);
    return res.status(404).json({ ok: false, error: "Job not found" });
  }
});

/**
 * DELETE /api/jobs/:id
 */
router.delete("/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.job.delete({ where: { id } });
    return res.status(204).end();
  } catch (e: any) {
    console.error("[DELETE /api/jobs/:id] error:", e);
    return res.status(404).json({ ok: false, error: "Job not found" });
  }
});

export default router;
