import { prisma } from "../lib/prisma";

export async function applyJob(userId: string, jobId: string) {
  return prisma.jobApplication.create({
    data: { jobId, applicantId: userId },
  });
}

export async function listApplications(userId: string) {
  return prisma.jobApplication.findMany({
    where: { applicantId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      job: { select: { id: true, title: true, location: true, employment: true } }
    }
  });
}

export async function cancelApplication(userId: string, id: string) {
  const app = await prisma.jobApplication.findUnique({ where: { id } });
  if (!app || app.applicantId !== userId) return null;

  return prisma.jobApplication.delete({ where: { id } });
}
