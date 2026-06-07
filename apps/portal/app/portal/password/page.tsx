"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { API_BASE } from "@insuretrack/api-client";
import { getCustomerToken } from "@insuretrack/api-client";

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

export default function PortalPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const methods = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema) as never,
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
    mode: "onSubmit",
  });

  const onSubmit = async (values: PasswordValues) => {
    const token = getCustomerToken();
    if (!token) return;
    setSubmitting(true);
    setFormError(null);
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
      methods.reset({ current_password: "", new_password: "", confirm_password: "" });
      toast.success("Password berhasil diperbarui");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal ganti password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <p className="uppercase-label" style={{ color: "var(--matcha-600)", marginBottom: 8 }}>
        ✦ Akun Saya
      </p>
      <h1 className="page-title">Ganti Password</h1>
      <p className="page-subtitle">
        Masukkan password lama Anda untuk verifikasi, lalu password baru.
      </p>

      <Form
        methods={methods}
        onSubmit={onSubmit}
        className="clay-card feature"
        style={{ maxWidth: 480 }}
      >
        <FormError message={formError} />

        <FormField label="Password Lama" name="current_password" required>
          <input
            id="current_password"
            className="clay-input"
            type="password"
            autoComplete="current-password"
            {...methods.register("current_password")}
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
            {...methods.register("new_password")}
          />
        </FormField>

        <FormField label="Konfirmasi Password Baru" name="confirm_password" required>
          <input
            id="confirm_password"
            className="clay-input"
            type="password"
            autoComplete="new-password"
            {...methods.register("confirm_password")}
          />
        </FormField>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="submit"
            disabled={submitting}
            className="clay-button solid-matcha"
          >
            {submitting ? "Menyimpan..." : "Ganti Password"}
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
    </>
  );
}
