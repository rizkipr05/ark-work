import { z } from 'zod';
import { $Enums } from '@prisma/client';

/* Helpers */
const optionalTrimmedString = z
  .string()
  .transform((v) => v?.trim?.() ?? v)
  .optional()
  .or(z.literal('').transform(() => undefined));

const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal('').transform(() => undefined));

/* ---------------- Step 1: Akun & Perusahaan ---------------- */
export const Step1Schema = z.object({
  companyName: z.string().min(2, 'Nama perusahaan minimal 2 karakter'),
  displayName: z.string().min(2, 'Display name minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  website: optionalUrl,
  password: z.string().min(8, 'Password minimal 8 karakter'),
  confirmPassword: z.string().min(8, 'Password minimal 8 karakter'),
  // ✅ perbaikan agree
  agree: z.boolean().refine((v) => v === true, {
    message: 'Anda harus menyetujui syarat & ketentuan',
  }),
}).refine(
  (v) => v.password === v.confirmPassword,
  { message: 'Passwords do not match', path: ['confirmPassword'] }
);

/* ---------------- Step 2: Profil Perusahaan ---------------- */
export const Step2Schema = z.object({
  employerId: z.string().uuid('employerId harus UUID'),
  industry: optionalTrimmedString,
  size: z.nativeEnum($Enums.CompanySize).optional(), // ✅ match Prisma
  foundedYear: z.preprocess(
    (v) => (typeof v === 'string' ? Number(v) : v),
    z.number().int().gte(1800).lte(new Date().getFullYear())
  ).optional(),
  about: z.string().max(5000, 'Maks 5000 karakter').optional(),
  hqCity: optionalTrimmedString,
  hqCountry: optionalTrimmedString,
  logoUrl: optionalUrl,
  bannerUrl: optionalUrl,
});

/* ---------------- Step 3: Paket/Plan ---------------- */
export const Step3Schema = z.object({
  employerId: z.string().uuid(),
  planSlug: z.string().min(1),
});

/* ---------------- Step 4: Lowongan Awal ---------------- */
export const Step4Schema = z.object({
  employerId: z.string().uuid(),
  title: z.string().min(3, 'Judul minimal 3 karakter'),
  description: optionalTrimmedString,
  location: optionalTrimmedString,
  employment: optionalTrimmedString,
});

/* ---------------- Step 5: Verifikasi ---------------- */
export const Step5Schema = z.object({
  employerId: z.string().uuid(),
  note: optionalTrimmedString,
  files: z
    .array(
      z.object({
        url: z.string().url(),
        type: optionalTrimmedString,
      })
    )
    .default([]),
});

/* Types */
export type Step1Input = z.infer<typeof Step1Schema>;
export type Step2Input = z.infer<typeof Step2Schema>;
export type Step3Input = z.infer<typeof Step3Schema>;
export type Step4Input = z.infer<typeof Step4Schema>;
export type Step5Input = z.infer<typeof Step5Schema>;
