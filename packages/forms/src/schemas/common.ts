import { z } from "zod";

/** Indonesian mobile number: 10–15 digits, allowing + prefix and spaces/dashes. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s\-+()]/g, ""))
  .refine((s) => /^\d{10,15}$/.test(s), {
    message: "Nomor telepon harus 10–15 digit",
  });

/** Indonesian NIK: exactly 16 digits. */
export const nikSchema = z
  .string()
  .trim()
  .regex(/^\d{16}$/, "NIK harus 16 digit angka");

/** Standard email, optional. Empty string is treated as "not provided". */
export const emailSchema = z
  .string()
  .trim()
  .max(160)
  .refine((s) => s === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), {
    message: "Format email tidak valid",
  });

/** Optional URL: empty string → undefined. */
export const urlOptionalSchema = z
  .string()
  .trim()
  .max(2048)
  .transform((s) => (s === "" ? undefined : s))
  .pipe(
    z
      .string()
      .url("URL tidak valid (contoh: https://example.com)")
      .optional(),
  );

/** Password: min 8 chars, at least 1 uppercase letter and 1 digit. */
export const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .regex(/[A-Z]/, "Password harus mengandung minimal 1 huruf besar")
  .regex(/\d/, "Password harus mengandung minimal 1 angka");

/** Date in YYYY-MM-DD format. */
export const dateYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");

/** Date that is not in the future. */
export const dateNotFutureSchema = dateYmdSchema.refine(
  (s) => new Date(s) <= new Date(new Date().toDateString()),
  { message: "Tanggal tidak boleh di masa depan" },
);

/** Image file (for KTP, logo, photo). 5 MB max. */
export const imageFileSchema = z
  .instanceof(File)
  .refine((f) => f.size <= 5 * 1024 * 1024, "Ukuran file maksimal 5 MB")
  .refine(
    (f) =>
      ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "application/pdf"].includes(
        f.type,
      ),
    "Format file harus JPG, PNG, WebP, SVG, atau PDF",
  );

/** Helper: optional string that trims and treats empty as undefined. */
export const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? undefined : s))
    .optional();
