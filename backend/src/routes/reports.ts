import { Router } from "express";
import { ZodError } from "zod";
import {
  listReports, createReport, updateReportStatus, deleteReport
} from "../services/report";
import {
  createReportSchema, updateReportStatusSchema
} from "../validators/report";

const router = Router();

// GET /api/reports
router.get("/", async (_req, res) => {
  try {
    const data = await listReports();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// POST /api/reports
router.post("/", async (req, res) => {
  try {
    const parsed = createReportSchema.parse(req.body);
    const created = await createReport(parsed);
    res.status(201).json(created);
  } catch (e) {
    if (e instanceof ZodError) {
      return res.status(400).json({ message: "Validasi gagal", issues: e.issues });
    }
    console.error(e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// PATCH /api/reports/:id
router.patch("/:id", async (req, res) => {
  try {
    const parsed = updateReportStatusSchema.parse(req.body);
    const updated = await updateReportStatus(req.params.id, parsed);
    res.json(updated);
  } catch (e) {
    if (e instanceof ZodError) {
      return res.status(400).json({ message: "Validasi gagal", issues: e.issues });
    }
    console.error(e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// DELETE /api/reports/:id
router.delete("/:id", async (req, res) => {
  try {
    await deleteReport(req.params.id);
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
