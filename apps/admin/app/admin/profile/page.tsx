"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { emailSchema, passwordSchema } from "@insuretrack/forms";
import { API_BASE, ApiError } from "@insuretrack/api-client";
import { getAdminToken } from "@insuretrack/api-client";

type AdminMe = {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  password_changed_at: string | null;
  created_at: string;
  updated_at: string;
};

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Nama wajib diisi").max(120),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    emailSchema.optional(),
  ),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchemaForm = z
  .object({
    current_password: z.string().min(1, "Password saat ini wajib diisi"),
    new_password: passwordSchema,
    confirm_new_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_new_password, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirm_new_password"],
  })
  .refine((d) => d.new_password !== d.current_password, {
    message: "Password baru tidak boleh sama dengan yang lama",
    path: ["new_password"],
  });
type PasswordFormValues = z.infer<typeof passwordSchemaForm>;

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminProfilePage() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const profileMethods = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema) as never,
    defaultValues: { full_name: "", email: "" },
    mode: "onBlur",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSavedAt, setProfileSavedAt] = useState<string | null>(null);

  const passwordMethods = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchemaForm) as never,
    defaultValues: { current_password: "", new_password: "", confirm_new_password: "" },
    mode: "onSubmit",
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSavedAt, setPasswordSavedAt] = useState<string | null>(null);

  const load = async () => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new ApiError(r.status, "ERR", "Gagal load profil");
      const j: AdminMe = await r.json();
      setMe(j);
      profileMethods.reset({
        full_name: j.full_name ?? "",
        email: j.email ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onProfileSubmit = async (values: ProfileFormValues) => {
    const token = getAdminToken();
    if (!token) return;
    setProfileSaving(true);
    try {
      const r = await fetch(`${API_BASE}/admin/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: values.full_name.trim(),
          email: values.email?.trim() || "",
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new ApiError(r.status, j?.error?.code ?? "ERR", j?.error?.message ?? "Gagal simpan");
      }
      const j: AdminMe = await r.json();
      setMe(j);
      setProfileSavedAt(new Date().toLocaleTimeString("id-ID"));
    } catch (e) {
      profileMethods.setError("root", {
        message: e instanceof Error ? e.message : "Gagal",
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const onPasswordSubmit = async (values: PasswordFormValues) => {
    const token = getAdminToken();
    if (!token) return;
    setPasswordSaving(true);
    try {
      const r = await fetch(`${API_BASE}/admin/me/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          current_password: values.current_password,
          new_password: values.new_password,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new ApiError(r.status, j?.error?.code ?? "ERR", j?.error?.message ?? "Gagal ubah password");
      }
      passwordMethods.reset({ current_password: "", new_password: "", confirm_new_password: "" });
      setPasswordSavedAt(new Date().toLocaleTimeString("id-ID"));
      // Refresh `me` to show updated password_changed_at
      load();
    } catch (e) {
      passwordMethods.setError("root", {
        message: e instanceof Error ? e.message : "Gagal",
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const profileRootErr = profileMethods.formState.errors.root?.message;
  const passwordRootErr = passwordMethods.formState.errors.root?.message;

  return (
    <>
      <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 8 }}>
        ✦ Akun Saya
      </p>
      <h1 className="page-title">Profil</h1>
      <p className="page-subtitle">Edit informasi akun dan ubah password.</p>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}
      {loading && <p>Memuat...</p>}

      {me && (
        <>
          <div
            className="clay-card feature"
            style={{ marginBottom: 24, padding: 20 }}
          >
            <p className="caption" style={{ color: "var(--warm-charcoal)", marginBottom: 8 }}>
              Akun
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <p className="caption" style={{ margin: 0 }}>Username</p>
                <p style={{ margin: 0, fontWeight: 600 }}>{me.username}</p>
              </div>
              <div>
                <p className="caption" style={{ margin: 0 }}>Role</p>
                <p style={{ margin: 0, fontWeight: 600 }}>{me.role}</p>
              </div>
              <div>
                <p className="caption" style={{ margin: 0 }}>Login terakhir</p>
                <p style={{ margin: 0 }}>{fmtDateTime(me.last_login_at)}</p>
              </div>
              <div>
                <p className="caption" style={{ margin: 0 }}>Password diubah</p>
                <p style={{ margin: 0 }}>{fmtDateTime(me.password_changed_at)}</p>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: 20,
            }}
          >
            <section className="clay-card feature" style={{ padding: 24 }}>
              <h2 className="card-heading" style={{ marginBottom: 16 }}>
                Informasi Profil
              </h2>
              <Form
                methods={profileMethods}
                onSubmit={onProfileSubmit}
                style={{ display: "grid", gap: 12 }}
              >
                <FormError message={profileRootErr ?? null} />
                <FormField label="Nama Lengkap" name="full_name" required>
                  <input
                    id="full_name"
                    className="clay-input"
                    autoComplete="name"
                    {...profileMethods.register("full_name")}
                  />
                </FormField>
                <FormField label="Email" name="email" hint="Untuk notifikasi & reset password">
                  <input
                    id="email"
                    className="clay-input"
                    type="email"
                    autoComplete="email"
                    {...profileMethods.register("email")}
                  />
                </FormField>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <button
                    type="submit"
                    className="clay-button solid-ube"
                    disabled={profileSaving}
                  >
                    {profileSaving ? "Menyimpan..." : "Simpan Profil"}
                  </button>
                  {profileSavedAt && (
                    <span className="caption" style={{ color: "var(--matcha-600)" }}>
                      ✓ Tersimpan pukul {profileSavedAt}
                    </span>
                  )}
                </div>
              </Form>
            </section>

            <section className="clay-card feature" style={{ padding: 24 }}>
              <h2 className="card-heading" style={{ marginBottom: 16 }}>
                Ubah Password
              </h2>
              <Form
                methods={passwordMethods}
                onSubmit={onPasswordSubmit}
                style={{ display: "grid", gap: 12 }}
              >
                <FormError message={passwordRootErr ?? null} />
                <FormField label="Password Saat Ini" name="current_password" required>
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
                  hint="Min 8 karakter, 1 huruf besar, 1 angka"
                >
                  <input
                    id="new_password"
                    className="clay-input"
                    type="password"
                    autoComplete="new-password"
                    {...passwordMethods.register("new_password")}
                  />
                </FormField>
                <FormField
                  label="Konfirmasi Password Baru"
                  name="confirm_new_password"
                  required
                >
                  <input
                    id="confirm_new_password"
                    className="clay-input"
                    type="password"
                    autoComplete="new-password"
                    {...passwordMethods.register("confirm_new_password")}
                  />
                </FormField>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <button
                    type="submit"
                    className="clay-button solid-pomegranate"
                    disabled={passwordSaving}
                  >
                    {passwordSaving ? "Mengubah..." : "Ubah Password"}
                  </button>
                  {passwordSavedAt && (
                    <span className="caption" style={{ color: "var(--matcha-600)" }}>
                      ✓ Password diubah pukul {passwordSavedAt}
                    </span>
                  )}
                </div>
              </Form>
            </section>
          </div>
        </>
      )}
    </>
  );
}
