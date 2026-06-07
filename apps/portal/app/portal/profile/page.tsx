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
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const methods = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema) as never,
    defaultValues: { full_name: "", email: "", mobile_number: "" },
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
        methods.reset({
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

  const onSubmit = async (values: ProfileValues) => {
    const token = getCustomerToken();
    if (!token) return;
    setSubmitting(true);
    setFormError(null);
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
      methods.reset({
        full_name: updated.full_name,
        email: updated.email,
        mobile_number: updated.mobile_number,
      });
      toast.success("Profil berhasil diperbarui");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal update profil");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <p className="uppercase-label" style={{ color: "var(--matcha-600)", marginBottom: 8 }}>
        ✦ Akun Saya
      </p>
      <h1 className="page-title">Profil Saya</h1>
      <p className="page-subtitle">
        Perbarui nama, email, dan nomor HP Anda.
      </p>

      {loading ? (
        <p>Memuat...</p>
      ) : (
        <Form
          methods={methods}
          onSubmit={onSubmit}
          className="clay-card feature"
          style={{ maxWidth: 560 }}
        >
          <FormError message={formError} />

          <FormField label="Nama Lengkap" name="full_name" required>
            <input
              id="full_name"
              className="clay-input"
              autoComplete="name"
              {...methods.register("full_name")}
            />
          </FormField>

          <FormField label="Email" name="email" required>
            <input
              id="email"
              className="clay-input"
              type="email"
              autoComplete="email"
              {...methods.register("email")}
            />
          </FormField>

          <FormField label="Nomor HP" name="mobile_number" required hint="10-15 digit, contoh: 081234567890">
            <input
              id="mobile_number"
              className="clay-input"
              type="tel"
              autoComplete="tel"
              {...methods.register("mobile_number")}
            />
          </FormField>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={submitting}
              className="clay-button solid-matcha"
            >
              {submitting ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>

          <p
            className="caption"
            style={{ color: "var(--warm-silver)", marginTop: 16, marginBottom: 0 }}
          >
            Untuk mengganti password, klik avatar Anda di kanan atas → "Ganti Password".
          </p>
        </Form>
      )}
    </>
  );
}
