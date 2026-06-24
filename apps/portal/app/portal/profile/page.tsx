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
import { apiFetch } from "@insuretrack/api-client";

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
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

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
    apiFetch<MeResponse>("/customer/me")
      .then((json) => {
        setProfile(json);
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
    setProfileSubmitting(true);
    setProfileError(null);
    try {
      const updated = await apiFetch<{ full_name: string; email: string; mobile_number: string }>(
        "/customer/me",
        {
          method: "PATCH",
          body: JSON.stringify({
            full_name: values.full_name.trim(),
            email: values.email.trim().toLowerCase(),
            mobile_number: values.mobile_number.trim(),
          }),
        },
      );
      // Sync form dengan response server (server bisa normalisasi nilai,
      // mis. lowercased email atau cleaned mobile_number).
      profileMethods.reset({
        full_name: updated.full_name,
        email: updated.email,
        mobile_number: updated.mobile_number,
      });
      // Update profile summary card juga
      setProfile((p) =>
        p ? { ...p, full_name: updated.full_name, email: updated.email, mobile_number: updated.mobile_number } : p,
      );
      toast.success("Profil berhasil diperbarui");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Gagal update profil");
    } finally {
      setProfileSubmitting(false);
    }
  };

  const onPasswordSubmit = async (values: PasswordValues) => {
    setPasswordSubmitting(true);
    setPasswordError(null);
    try {
      // Endpoint ini return 204 No Content kalau sukses. apiFetch handle
      // itu dengan return null; abaikan return value.
      await apiFetch("/customer/password/change", {
        method: "POST",
        body: JSON.stringify({
          current_password: values.current_password,
          new_password: values.new_password,
        }),
      });
      passwordMethods.reset({ current_password: "", new_password: "", confirm_password: "" });
      setShowCurrentPw(false);
      setShowNewPw(false);
      toast.success("Password berhasil diperbarui");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Ganti password gagal");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  // Inisial avatar: 2 huruf pertama dari nama (uppercase)
  const initials = (profile?.full_name ?? "??")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

  return (
    <>
      <p
        className="uppercase-label"
        style={{ color: "var(--matcha-600)", marginBottom: 8 }}
      >
        ✦ Akun Saya
      </p>
      <h1 className="page-title">Profil Saya</h1>
      <p className="page-subtitle">Perbarui data diri dan password Anda.</p>

      {loading ? (
        <p style={{ marginTop: 24, color: "var(--warm-silver)" }}>Memuat...</p>
      ) : (
        <div style={{ display: "grid", gap: 24, marginTop: 24, maxWidth: 880 }}>
          {/* ===== PROFILE HERO CARD ===== */}
          <section
            className="clay-card section"
            style={{
              padding: 32,
              display: "flex",
              alignItems: "center",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            {/* Avatar circle dengan inisial nama */}
            <div
              aria-hidden="true"
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "var(--matcha-600)",
                color: "var(--pure-white)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: "1.75rem",
                fontFamily: "var(--font-jakarta), sans-serif",
                letterSpacing: "-0.02em",
                flexShrink: 0,
                boxShadow: "var(--shadow-clay)",
              }}
            >
              {initials || "??"}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2
                className="card-heading"
                style={{ marginBottom: 4, fontSize: "1.35rem" }}
              >
                {profile?.full_name || "—"}
              </h2>
              <p
                className="body"
                style={{
                  color: "var(--warm-charcoal)",
                  margin: 0,
                  fontFamily: "var(--font-space-mono), monospace",
                  fontSize: "0.9rem",
                }}
              >
                {profile?.email || "—"}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 12,
                  flexWrap: "wrap",
                }}
              >
                <span
                  className="clay-badge matcha"
                  aria-label="Tipe akun"
                >
                  Customer
                </span>
                {profile && profile.active_policy_count > 0 && (
                  <span
                    className="clay-badge ube"
                    aria-label="Polis aktif"
                  >
                    {profile.active_policy_count} polis aktif
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* ===== SINGLE-COLUMN STACK: Data Diri + Ganti Password =====
              Single column biar tiap form pakai full-width container —
              form fields lebih lapang, label tidak cramped. Stack vertikal
              dengan gap 24 antar form. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 24,
            }}
          >
            {/* Data Diri card */}
            <Form
              methods={profileMethods}
              onSubmit={onProfileSubmit}
              className="clay-card feature"
            >
              <SectionHeader
                icon="User"
                title="Data Diri"
                hint="Perbarui nama, email, atau nomor HP Anda."
              />
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

              <FormField
                label="Nomor HP"
                name="mobile_number"
                required
                hint="10-15 digit"
              >
                <input
                  id="mobile_number"
                  className="clay-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  {...profileMethods.register("mobile_number")}
                />
              </FormField>

              <FormActions
                submitting={profileSubmitting}
                submitLabel="Simpan Perubahan"
              />
            </Form>

            {/* Ganti Password card */}
            <Form
              id="ganti-password"
              methods={passwordMethods}
              onSubmit={onPasswordSubmit}
              className="clay-card feature"
            >
              <SectionHeader
                icon="Lock"
                title="Ganti Password"
                hint="Minimal 8 karakter, 1 huruf besar, 1 angka."
              />
              <FormError message={passwordError} />

              <FormField label="Password Lama" name="current_password" required>
                <PasswordInput
                  id="current_password"
                  show={showCurrentPw}
                  onToggle={() => setShowCurrentPw((v) => !v)}
                  autoComplete="current-password"
                  {...passwordMethods.register("current_password")}
                />
              </FormField>

              <FormField label="Password Baru" name="new_password" required>
                <PasswordInput
                  id="new_password"
                  show={showNewPw}
                  onToggle={() => setShowNewPw((v) => !v)}
                  autoComplete="new-password"
                  {...passwordMethods.register("new_password")}
                />
              </FormField>

              <FormField
                label="Konfirmasi Password Baru"
                name="confirm_password"
                required
              >
                <input
                  id="confirm_password"
                  className="clay-input"
                  type="password"
                  autoComplete="new-password"
                  {...passwordMethods.register("confirm_password")}
                />
              </FormField>

              <FormActions
                submitting={passwordSubmitting}
                submitLabel="Ganti Password"
              />

              <p
                className="caption"
                style={{
                  color: "var(--warm-silver)",
                  marginTop: 16,
                  marginBottom: 0,
                  paddingTop: 16,
                  borderTop: "1px dashed var(--oat-border)",
                }}
              >
                Lupa password lama?{" "}
                <a
                  href="/portal/reset"
                  style={{
                    color: "var(--matcha-600)",
                    textDecoration: "underline",
                    fontWeight: 500,
                  }}
                >
                  Reset via email
                </a>
              </p>
            </Form>
          </div>
        </div>
      )}
    </>
  );
}

// ---- Sub-components -------------------------------------------------------

/** Section header untuk form card — icon + title + hint di top. */
function SectionHeader({
  icon,
  title,
  hint,
}: {
  icon: "User" | "Lock";
  title: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: "1px dashed var(--oat-border)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: icon === "User" ? "var(--matcha-300)" : "var(--ube-300)",
          color: icon === "User" ? "var(--matcha-800)" : "var(--ube-900)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <IconSvg name={icon} />
      </div>
      <div>
        <h2 className="card-heading" style={{ margin: 0, fontSize: "1.1rem" }}>
          {title}
        </h2>
        {hint && (
          <p
            className="caption"
            style={{
              color: "var(--warm-charcoal)",
              margin: "2px 0 0 0",
              fontSize: "0.82rem",
            }}
          >
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/** Password input dengan show/hide toggle. */
function PasswordInput({
  show,
  onToggle,
  ...inputProps
}: {
  show: boolean;
  onToggle: () => void;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ position: "relative" }}>
      <input
        {...inputProps}
        type={show ? "text" : "password"}
        className="clay-input"
        style={{ paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
        aria-pressed={show}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          color: "var(--warm-silver)",
          padding: 4,
          display: "grid",
          placeItems: "center",
          borderRadius: 6,
        }}
      >
        <IconSvg name={show ? "EyeOff" : "Eye"} size={16} />
      </button>
    </div>
  );
}

/** Submit button row di bawah form — right-aligned, full-width on mobile. */
function FormActions({
  submitting,
  submitLabel,
}: {
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginTop: 20,
        paddingTop: 16,
        borderTop: "1px dashed var(--oat-border)",
        justifyContent: "flex-end",
      }}
    >
      <button
        type="submit"
        disabled={submitting}
        className="clay-button solid-matcha size-small"
      >
        {submitting ? "Menyimpan..." : submitLabel}
      </button>
    </div>
  );
}

// ---- Inline SVG icons (avoid extra dep on lucide-react for 3 icons) ---------

function IconSvg({ name, size = 18 }: { name: "User" | "Lock" | "Eye" | "EyeOff"; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "User":
      return (
        <svg {...props} aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "Lock":
      return (
        <svg {...props} aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case "Eye":
      return (
        <svg {...props} aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "EyeOff":
      return (
        <svg {...props} aria-hidden="true">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      );
  }
}
