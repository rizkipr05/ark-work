import prisma from "../utils/prisma";
import { CreateReportInput, UpdateReportStatusInput } from "../validators/report";

export function listReports() {
  return prisma.report.findMany({ orderBy: { dibuatPada: "desc" } });
}

export function createReport(data: CreateReportInput) {
  return prisma.report.create({
    data: {
      judul: data.judul,
      perusahaan: data.perusahaan,
      alasan: data.alasan,
      catatan: data.catatan ?? undefined
    }
  });
}

export function updateReportStatus(id: string, data: UpdateReportStatusInput) {
  return prisma.report.update({
    where: { id },
    data: { status: data.status }
  });
}

export function deleteReport(id: string) {
  return prisma.report.delete({ where: { id } });
}
