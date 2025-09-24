import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";

import { prisma } from "../lib/prisma";
import { authRequired } from "../middleware/role";

const router = Router();

/* ========= Konfigurasi upload ========= */
const UP_DIR = path.join(process.cwd(), "public", "uploads", "cv");
fs.mkdirSync(UP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UP_DIR),
    filename: (_req, file, cb) => {
      const ext = ".pdf";
      const rand = crypto.randomBytes(8).toString("hex");
      cb(null, `${Date.now()}_${rand}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      (file.originalname || "").toLowerCase().endsWith(".pdf");
    if (!isPdf) return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "ONLY_PDF"));
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

/**
 * POST /api/applications
 * Body: multipart/form-data
 *  - jobId (string)
 *  - cv (file/pdf, optional tapi direkomendasikan)
 * Guard: user login (cookie user_token)
 */
router.post("/", authRequired, upload.single("cv"), async (req, res) => {
  try {
    const jobId = String(req.body?.jobId || "").trim();

    if (!jobId) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ ok: false, error: "jobId required" });
    }

    const user = (req as any).auth as { uid: string };
    const userId = user?.uid;
    if (!userId) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, isActive: true, title: true },
    });
    if (!job || !job.isActive) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ ok: false, error: "Job not found/active" });
    }

    // siapkan metadata CV (jika ada file)
    let cv: null | {
      url: string; name: string; type: string; size: number;
    } = null;

    if (req.file) {
      cv = {
        url: `/uploads/cv/${req.file.filename}`,
        name: req.file.originalname || req.file.filename,
        type: req.file.mimetype || "application/pdf",
        size: req.file.size,
      };
    }

    // upsert lamaran (unik per user x job)
    const result = await prisma.jobApplication.upsert({
      where: { jobId_applicantId: { jobId, applicantId: userId } },
      create: {
        jobId,
        applicantId: userId,
        ...(cv
          ? {
              cvUrl: cv.url,
              cvFileName: cv.name,
              cvFileType: cv.type,
              cvFileSize: cv.size,
            }
          : {}),
      },
      update: {
        ...(cv
          ? {
              cvUrl: cv.url,
              cvFileName: cv.name,
              cvFileType: cv.type,
              cvFileSize: cv.size,
              updatedAt: new Date(),
            }
          : { updatedAt: new Date() }),
      },
      include: {
        job: { select: { id: true, title: true } },
      },
    });

    return res.json({
      ok: true,
      data: {
        id: result.id,
        jobId: result.job.id,
        jobTitle: result.job.title,
        status: result.status,
        createdAt: result.createdAt,
        cv: result.cvUrl
          ? {
              url: result.cvUrl,
              name: result.cvFileName,
              type: result.cvFileType,
              size: result.cvFileSize,
            }
          : null,
      },
    });
  } catch (e: any) {
    if (e instanceof multer.MulterError) {
      if (e.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ ok: false, error: "CV terlalu besar. Maks 2 MB." });
      }
      return res.status(400).json({ ok: false, error: "Upload CV gagal. Pastikan file PDF." });
    }
    console.error("[POST /api/applications] error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

export default router;
