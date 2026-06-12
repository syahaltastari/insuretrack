"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { emailSchema } from "@insuretrack/forms";
import { API_BASE } from "@insuretrack/api-client";
import { getCustomerToken } from "@insuretrack/api-client";

// Validasi ringan di client. Server (PATCH /api/customer/me) melakukan
// validasi lebih ketat (unique email, length check, dll.) sebagai
// authoritative source of truth.
const profileSchema = z.object({
  full_name: z.string().trim().min(3, "Nama minimal 3 karakter").max(120),
  email: emailSchema.refine((s) => s.length > 0, { message: "Email wajib diisi" }),
  mobile_number: z
    .string()
    .trim()
    .min(10, "Nomor HP minimal 10 digit")
    .max(20, "Nomor HP maksimal 20 karakter")
    .regex(/^[0-9+\-\s()]+$/, "Nomor HP hanya boleh angka dan + - ( ) spasi"),
});
type ProfileValues = z.infer<typeof profileSchema>;

// Validasi client-side. Server (POST /api/customer/password/change)
// melakukan verifikasi password lama + hash check, dan merupakan
// authoritative gate.
const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Password lama wajib diisi"),
    new_password: z
      .string()
      .min(8, "Password baru minimal 8 karakter")
      .regex(/[A-Z]/, "Password baru harus mengandung minimal 1 huruf besar")
      .regex(/\d/, "Password baru harus mengandung minimal 1 angka"),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirm_password"],
  })
  .refine((d) => d.new_password !== d.current_password, {
    message: "Password baru harus berbeda dari password lama",
    path: ["new_password"],
  });
type PasswordValues = z.infer<typeof passwordSchema>;

type MeResponse = {
  customer_id: string;
  email: string;
  full_name: string;
  mobile_number: string;
  active_policy_count: number;
  total_sum_assured: string;
  open_claim_count: number;
  open_inquiry_count: number;
};

export default function PortalProfilePage() {
  const [loading, setLoading] = useState(true);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileMethods = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema) as never,
    defaultValues: { full_name: "", email: "", mobile_number: "" },
    mode: "onSubmit",
  });

  const passwordMethods = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema) as never,
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    fetch(`${API_BASE}/customer/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as MeResponse;
        profileMethods.reset({
          full_name: json.full_name,
          email: json.email,
          mobile_number: json.mobile_number,
        });
      })
      .catch((e) => {
        toast.error("Gagal load profil: " + (e instanceof Error ? e.message : ""));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onProfileSubmit = async (values: ProfileValues) => {
    const token = getCustomerToken();
    if (!token) return;
    setProfileSubmitting(true);
    setProfileError(null);
    try {
      const r = await fetch(`${API_BASE}/customer/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: values.full_name.trim(),
          email: values.email.trim().toLowerCase(),
          mobile_number: values.mobile_number.trim(),
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(json?.error?.message ?? `HTTP ${r.status}`);
      }
      // Sync form dengan response server (server bisa normalisasi nilai,
      // mis. lowercased email atau cleaned mobile_number).
      const updated = json as { full_name: string; email: string; mobile_number: string };
      profileMethods.reset({
        full_name: updated.full_name,
        email: updated.email,
        mobile_number: updated.mobile_number,
      });
      toast.success("Profil berhasil diperbarui");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Gagal update profil");
    } finally {
      setProfileSubmitting(false);
    }
  };

  const onPasswordSubmit = async (values: PasswordValues) => {
    const token = getCustomerToken();
    if (!token) return;
    setPasswordSubmitting(true);
    setPasswordError(null);
    try {
      const r = await fetch(`${API_BASE}/customer/password/change`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: values.current_password,
          new_password: values.new_password,
        }),
      });
      if (!r.ok && r.status !== 204) {
        const json = await r.json().catch(() => ({}));
        throw new Error(json?.error?.message ?? `HTTP ${r.status}`);
      }
      passwordMethods.reset({ current_password: "", new_password: "", confirm_password: "" });
      toast.success("Password berhasil diperbarui");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Ganti password gagal");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <>
      <p className="uppercase-label" style={{ color: "var(--matcha-600)", marginBottom: 8 }}>
        ✦ Akun Saya
      </p>
      <h1 className="page-title">Profil Saya</h1>
      <p className="page-subtitle">
        Perbarui data diri dan password Anda.
      </p>

      {loading ? (
        <p>Memuat...</p>
      ) : (
        <div style={{ display: "grid", gap: 24, maxWidth: 560 }}>
          <Form
            methods={profileMethods}
            onSubmit={onProfileSubmit}
            className="clay-card feature"
          >
            <h2 className="feature-title" style={{ marginBottom: 16 }}>
              Data Diri
            </h2>
            <FormError message={profileError} />

            <FormField label="Nama Lengkap" name="full_name" required>
              <input
                id="full_name"
                className="clay-input"
                autoComplete="name"
                {...profileMethods.register("full_name")}
              />
            </FormField>

            <FormField label="Email" name="email" required>
              <input
                id="email"
                className="clay-input"
                type="email"
                autoComplete="email"
                {...profileMethods.register("email")}
              />
            </FormField>

            <FormField label="Nomor HP" name="mobile_number" required hint="10-15 digit, contoh: 081234567890">
              <input
                id="mobile_number"
                className="clay-input"
                type="tel"
                autoComplete="tel"
                {...profileMethods.register("mobile_number")}
              />
            </FormField>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={profileSubmitting}
                className="clay-button solid-matcha"
              >
                {profileSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </Form>

          <Form
            id="ganti-password"
            methods={passwordMethods}
            onSubmit={onPasswordSubmit}
            className="clay-card feature"
          >
            <h2 className="feature-title" style={{ marginBottom: 16 }}>
              Ganti Password
            </h2>
            <FormError message={passwordError} />

            <FormField label="Password Lama" name="current_password" required>
              <input
                id="current_password"
                className="clay-input"
                type="password"
                autoComplete="current-password"
                {...passwordMethods.register("current_password")}
              />
            </FormField>

            <FormField
              label="Password Baru"
              name="new_password"
              required
              hint="Minimal 8 karakter, 1 huruf besar, 1 angka"
            >
              <input
                id="new_password"
                className="clay-input"
                type="password"
                autoComplete="new-password"
                {...passwordMethods.register("new_password")}
              />
            </FormField>

            <FormField label="Konfirmasi Password Baru" name="confirm_password" required>
              <input
                id="confirm_password"
                className="clay-input"
                type="password"
                autoComplete="new-password"
                {...passwordMethods.register("confirm_password")}
              />
            </FormField>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={passwordSubmitting}
                className="clay-button solid-matcha"
              >
                {passwordSubmitting ? "Menyimpan..." : "Ganti Password"}
              </button>
            </div>

            <p
              className="caption"
              style={{ color: "var(--warm-silver)", marginTop: 16, marginBottom: 0 }}
            >
              Lupa password lama? Gunakan{" "}
              <a
                href="/portal/reset"
                style={{ color: "var(--matcha-600)", textDecoration: "underline" }}
              >
                fitur reset password
              </a>{" "}
              (link akan dikirim ke email Anda).
            </p>
          </Form>
        </div>
      )}
    </>
  );
}
