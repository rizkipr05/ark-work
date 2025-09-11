import { z } from "zod";

export const createReportSchema = z.object({
  judul: z.string().min(1),
  perusahaan: z.string().min(1),
  alasan: z.string().min(1),
  catatan: z.string().optional().nullable()
});

export const updateReportStatusSchema = z.object({
  status: z.enum(["baru", "diproses", "selesai"])
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportStatusInput = z.infer<typeof updateReportStatusSchema>;
