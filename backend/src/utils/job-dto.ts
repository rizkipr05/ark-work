// backend/src/utils/job-dto.ts
import type { Job, Employer, EmployerProfile } from "@prisma/client";

export type JobDTO = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  employment: string | null;
  postedAt: string;         // ISO
  company: string;          // displayName || legalName
  logoUrl: string | null;
  isActive: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  requirements?: string | null;
  employerId?: string | null;
};

type JobWithEmployer = Job & {
  employer: (Employer & { profile: EmployerProfile | null }) | null;
};

export function mapJobToDTO(row: JobWithEmployer): JobDTO {
  const company =
    row.employer?.displayName ||
    row.employer?.legalName ||
    "Unknown Company";

  const logoUrl = row.employer?.profile?.logoUrl ?? null;

  return {
    id: String(row.id),
    title: row.title,
    description: row.description ?? "",
    location: row.location ?? "",
    employment: row.employment ?? "Full-time",
    postedAt: row.createdAt.toISOString(),
    company,
    logoUrl,
    isActive: !!row.isActive,
    salaryMin: row.salaryMin ?? null,
    salaryMax: row.salaryMax ?? null,
    currency: row.currency ?? "IDR",
    requirements: row.requirements ?? null,
    employerId: row.employerId,
  };
}
