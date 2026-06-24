"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AdminListPage } from "@/components/AdminListPage";
import {
  Button,
  Confirm,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from "@insuretrack/ui";
import { Form, FormField, FormError, passwordSchema } from "@insuretrack/forms";
import { apiFetch } from "@insuretrack/api-client";
import type {
  AdminUser,
  CreateAdminUserRequest,
  UpdateAdminUserRequest,
  ResetPasswordResponse,
} from "@insuretrack/api-client";
import { useAdmin } from "@/lib/useAdmin";
import { formatDate, formatDateTime } from "@/lib/format";

// ============================================================
// Form schemas
// ============================================================

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter")
    .max(64, "Username maksimal 64 karakter")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Hanya huruf, angka, _ . -"),
  full_name: z
    .string()
    .trim()
    .min(1, "Nama lengkap wajib diisi")
    .max(120, "Maksimal 120 karakter"),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((s) => s === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), {
      message: "Format email tidak valid",
    }),
  password: passwordSchema,
  is_super_admin: z.boolean().default(false),
});

const editSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "Nama lengkap wajib diisi")
    .max(120, "Maksimal 120 karakter"),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((s) => s === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), {
      message: "Format email tidak valid",
    }),
  is_super_admin: z.boolean().default(false),
});

type CreateFormValues = z.infer<typeof createSchema>;
type EditFormValues = z.infer<typeof editSchema>;

// ============================================================
// Page
// ============================================================

export default function AdminUsersPage() {
  const { profile: currentProfile, isSuperAdmin, ready } = useAdmin();
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset password flow: opened dari row action, hold generated password
  // plaintext sampai modal ditutup. TIDAK persist di state global.
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ============================================================
  // Forms (create + edit). Dipisah biar default values & reset
  // tidak tercampur.
  // ============================================================

  const createMethods = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema) as never,
    defaultValues: {
      username: "",
      full_name: "",
      email: "",
      password: "",
      is_super_admin: false,
    },
    mode: "onBlur",
  });

  const editMethods = useForm<EditFormValues>({
    resolver: zodResolver(editSchema) as never,
    defaultValues: {
      full_name: "",
      email: "",
      is_super_admin: false,
    },
    mode: "onBlur",
  });

  // ============================================================
  // Modal lifecycle
  // ============================================================

  const openCreate = () => {
    setEditing(null);
    createMethods.reset({
      username: "",
      full_name: "",
      email: "",
      password: "",
      is_super_admin: false,
    });
    setShowForm(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditing(u);
    editMethods.reset({
      full_name: u.full_name ?? "",
      email: u.email ?? "",
      is_super_admin: u.is_super_admin,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const openResetConfirm = (u: AdminUser) => {
    setResetTarget(u);
    setGeneratedPassword(null);
    setCopied(false);
  };

  const closeResetModal = () => {
    setResetTarget(null);
    setGeneratedPassword(null);
    setCopied(false);
  };

  // ============================================================
  // Submit handlers
  // ============================================================

  const onCreate = async (values: CreateFormValues) => {
    setSubmitting(true);
    try {
      const body: CreateAdminUserRequest = {
        username: values.username.trim(),
        full_name: values.full_name.trim(),
        password: values.password,
        is_super_admin: values.is_super_admin,
        ...(values.email.trim() ? { email: values.email.trim() } : {}),
      };
      await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(`Admin "${body.username}" berhasil dibuat`);
      closeForm();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat admin");
    } finally {
      setSubmitting(false);
    }
  };

  const onEdit = async (values: EditFormValues) => {
    if (!editing) return;

    // Build PATCH body: hanya kirim field yang berubah (atau semua yang
    // ada nilainya) — backend pakai COALESCE jadi unspecified field
    // di-COALESCE ke nilai existing. Tapi untuk `is_super_admin`,
    // kita harus always kirim explicit value (checkbox toggle) supaya
    // intent user jelas.
    const body: UpdateAdminUserRequest = {
      full_name: values.full_name.trim(),
      // Empty string → undefined → backend Option<String> = None.
      email: values.email.trim() || undefined,
      is_super_admin: values.is_super_admin,
    };
    setSubmitting(true);
    try {
      await apiFetch(`/admin/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("Data admin diperbarui");
      closeForm();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memperbarui admin");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (values: CreateFormValues | EditFormValues) => {
    if (editing) return onEdit(values as EditFormValues);
    return onCreate(values as CreateFormValues);
  };

  // ============================================================
  // Row actions
  // ============================================================

  const toggleActive = async (u: AdminUser) => {
    const newActive = !u.is_active;
    const path = newActive ? "activate" : "deactivate";
    try {
      await apiFetch(`/admin/users/${u.id}/${path}`, { method: "POST" });
      toast.success(
        newActive
          ? `Admin "${u.username}" diaktifkan`
          : `Admin "${u.username}" dinonaktifkan`,
      );
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal ubah status");
    }
  };

  const performResetPassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const data = await apiFetch<ResetPasswordResponse>(
        `/admin/users/${resetTarget.id}/reset-password`,
        { method: "POST" },
      );
      setGeneratedPassword(data.new_password);
      toast.success("Password baru di-generate. Salin sekarang.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal reset password");
    } finally {
      setResetting(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal copy. Silakan salin manual.");
    }
  };

  // ============================================================
  // Render
  // ============================================================

  // Block render kalau belum ready atau user bukan super admin.
  // Backend juga gate, tapi ini kasih UX yang konsisten (langsung
  // empty state alih-alih error 403 dari API call).
  if (!ready) {
    return (
      <div className="clay-container clay-section">
        <p>Memuat...</p>
      </div>
    );
  }
  if (!isSuperAdmin) {
    return (
      <div className="clay-container clay-section">
        <h1 className="page-title">Manajemen User</h1>
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)" }}>
          <p>Akses ditolak. Halaman ini hanya untuk super admin.</p>
        </div>
      </div>
    );
  }

  const currentUserId = currentProfile?.id;
  const isSelf = (u: AdminUser) => u.id === currentUserId;

  return (
    <>
      <AdminListPage<AdminUser>
        key={refreshKey}
        title="Manajemen User"
        endpoint="/admin/users"
        searchPlaceholder="Cari username atau nama..."
        statusOptions={["true", "false"]}
        statusFilterLabel="Status"
        headerActions={
          <Button
            onClick={openCreate}
            className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]"
          >
            <Icon name="UserPlus" size="sm" style={{ marginRight: 6 }} />
            Tambah Admin
          </Button>
        }
        emptyMessage='Belum ada admin lain. Klik "Tambah Admin" untuk menambahkan.'
        columns={[
          {
            key: "username",
            label: "Username",
            width: "160px",
            render: (u) => (
              <span className="mono" style={{ fontSize: "0.85rem" }}>
                {u.username}
                {isSelf(u) && (
                  <span
                    className="clay-badge blueberry"
                    style={{ marginLeft: 8, fontSize: "0.7rem" }}
                  >
                    Anda
                  </span>
                )}
              </span>
            ),
          },
          {
            key: "full_name",
            label: "Nama Lengkap",
            width: "180px",
            render: (u) => u.full_name ?? <span style={{ color: "var(--warm-silver)" }}>—</span>,
          },
          {
            key: "email",
            label: "Email",
            width: "200px",
            hideOnMobile: true,
            render: (u) =>
              u.email ? (
                <span style={{ fontSize: "0.85rem" }}>{u.email}</span>
              ) : (
                <span style={{ color: "var(--warm-silver)" }}>—</span>
              ),
          },
          {
            key: "is_super_admin",
            label: "Role",
            width: "110px",
            render: (u) =>
              u.is_super_admin ? (
                <span className="clay-badge blueberry">Super Admin</span>
              ) : (
                <span className="clay-badge muted">Admin</span>
              ),
          },
          {
            key: "is_active",
            label: "Status",
            width: "110px",
            render: (u) =>
              u.is_active ? (
                <span className="clay-badge matcha">Aktif</span>
              ) : (
                <span className="clay-badge muted">Nonaktif</span>
              ),
          },
          {
            key: "last_login_at",
            label: "Login Terakhir",
            width: "160px",
            hideOnMobile: true,
            render: (u) => formatDateTime(u.last_login_at),
          },
          {
            key: "created_at",
            label: "Dibuat",
            width: "120px",
            hideOnMobile: true,
            render: (u) => formatDate(u.created_at),
          },
        ]}
        actions={(u) => {
          // Self-protection: tombol deactivate & reset password disable
          // untuk akun sendiri. Edit tetap enabled tapi checkbox
          // is_super_admin di-handle di modal (lihat openEdit + form).
          const selfBlocked = isSelf(u);
          return (
            <>
              <Button
                size="sm"
                className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]"
                onClick={() => openEdit(u)}
              >
                Edit
              </Button>
              {u.is_active ? (
                <Confirm
                  trigger={
                    <Button
                      size="sm"
                      className="bg-[var(--pomegranate-400)] text-black hover:opacity-90"
                      disabled={selfBlocked}
                      title={
                        selfBlocked
                          ? "Tidak bisa menonaktifkan akun sendiri"
                          : undefined
                      }
                    >
                      Nonaktifkan
                    </Button>
                  }
                  title="Nonaktifkan Admin?"
                  description={
                    <p>
                      Admin <strong>"{u.username}"</strong> tidak akan bisa
                      login lagi sampai diaktifkan kembali. Untuk audit,
                      akun tidak dihapus permanen.
                      {selfBlocked && (
                        <>
                          <br />
                          <br />
                          <em>Anda tidak bisa menonaktifkan akun sendiri.</em>
                        </>
                      )}
                    </p>
                  }
                  confirmLabel="Nonaktifkan"
                  destructive
                  onConfirm={() => {
                    if (selfBlocked) return;
                    toggleActive(u);
                  }}
                />
              ) : (
                <Button
                  size="sm"
                  className="bg-[var(--matcha-600)] text-white hover:bg-[var(--matcha-800)]"
                  onClick={() => toggleActive(u)}
                >
                  Aktifkan
                </Button>
              )}
              <Confirm
                trigger={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selfBlocked}
                    title={
                      selfBlocked
                        ? "Gunakan menu Profil Saya untuk ganti password sendiri"
                        : "Generate password baru untuk admin ini"
                    }
                  >
                    Reset Password
                  </Button>
                }
                title="Reset Password?"
                description={
                  <p>
                    Password baru akan di-generate oleh sistem. Password
                    hanya ditampilkan <strong>sekali</strong> setelah
                    konfirmasi ini.
                    {selfBlocked && (
                      <>
                        <br />
                        <br />
                        <em>
                          Anda tidak bisa reset password sendiri. Gunakan menu
                          "Profil Saya" untuk ganti password.
                        </em>
                      </>
                    )}
                  </p>
                }
                confirmLabel="Generate Password Baru"
                onConfirm={() => {
                  if (selfBlocked) return;
                  openResetConfirm(u);
                }}
              />
            </>
          );
        }}
      />

      {/* ============================================================
       * Create / Edit modal
       * ============================================================ */}
      <Dialog
        open={showForm}
        onOpenChange={(o) => !o && closeForm()}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit Admin: ${editing.username}` : "Tambah Admin"}
            </DialogTitle>
          </DialogHeader>
          {editing ? (
            <Form
              methods={editMethods}
              onSubmit={onEdit}
              className="clay-form-grid cols-2"
              id="admin-edit-form"
            >
              <FormError message={null} />
              <FormField label="Username" name="username">
                <input
                  className="clay-input"
                  value={editing.username}
                  disabled
                  readOnly
                />
              </FormField>
              <FormField label="Nama Lengkap" name="full_name" required>
                <input
                  id="full_name"
                  className="clay-input"
                  autoComplete="off"
                  {...editMethods.register("full_name")}
                />
              </FormField>
              <FormField label="Email" name="email">
                <input
                  id="email"
                  className="clay-input"
                  type="email"
                  autoComplete="off"
                  {...editMethods.register("email")}
                />
              </FormField>
              <FormField
                label="Super Admin"
                name="is_super_admin"
                hint={
                  isSelf(editing)
                    ? "Tidak bisa mengubah role Anda sendiri"
                    : undefined
                }
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    opacity: isSelf(editing) ? 0.5 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={isSelf(editing)}
                    checked={editMethods.watch("is_super_admin")}
                    onChange={(e) =>
                      editMethods.setValue("is_super_admin", e.target.checked, {
                        shouldValidate: true,
                      })
                    }
                  />
                  Boleh mengelola user lain
                </label>
              </FormField>
            </Form>
          ) : (
            <Form
              methods={createMethods}
              onSubmit={onCreate}
              className="clay-form-grid cols-2"
              id="admin-create-form"
            >
              <FormError message={null} />
              <FormField label="Username" name="username" required>
                <input
                  id="username"
                  className="clay-input"
                  autoComplete="off"
                  {...createMethods.register("username")}
                />
              </FormField>
              <FormField label="Nama Lengkap" name="full_name" required>
                <input
                  id="full_name"
                  className="clay-input"
                  autoComplete="off"
                  {...createMethods.register("full_name")}
                />
              </FormField>
              <FormField label="Email" name="email">
                <input
                  id="email"
                  className="clay-input"
                  type="email"
                  autoComplete="off"
                  {...createMethods.register("email")}
                />
              </FormField>
              <FormField
                label="Password Awal"
                name="password"
                required
                hint="Minimal 8 karakter, harus ada huruf besar & angka. Minta admin baru ganti setelah login pertama."
              >
                <input
                  id="password"
                  className="clay-input"
                  type="password"
                  autoComplete="new-password"
                  {...createMethods.register("password")}
                />
              </FormField>
              <div style={{ gridColumn: "1 / -1" }}>
                <FormField label="Role" name="is_super_admin">
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={createMethods.watch("is_super_admin")}
                      onChange={(e) =>
                        createMethods.setValue("is_super_admin", e.target.checked, {
                          shouldValidate: true,
                        })
                      }
                    />
                    Jadikan Super Admin (boleh mengelola user lain)
                  </label>
                </FormField>
              </div>
            </Form>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeForm}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form={editing ? "admin-edit-form" : "admin-create-form"}
              disabled={submitting}
              className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]"
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================
       * Reset password — generate & reveal modal
       * ============================================================ */}
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(o) => !o && closeResetModal()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          {generatedPassword ? (
            <div>
              <p style={{ marginBottom: 12 }}>
                Password baru untuk{" "}
                <strong>{resetTarget?.username}</strong>:
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: 12,
                  background: "var(--warm-cream)",
                  border: "1px solid var(--oat-border)",
                  borderRadius: 8,
                  fontFamily: "var(--font-space-mono)",
                  fontSize: "0.95rem",
                  marginBottom: 12,
                }}
              >
                <code style={{ flex: 1, wordBreak: "break-all" }}>
                  {generatedPassword}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(generatedPassword)}
                >
                  {copied ? "✓ Tersalin" : "Salin"}
                </Button>
              </div>
              <p
                style={{
                  color: "var(--pomegranate-400)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                }}
              >
                ⚠ Password ini hanya ditampilkan sekali. Segera catat dan
                berikan ke user. User wajib ganti password setelah login
                pertama via menu "Profil Saya".
              </p>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: 16 }}>
                Sistem akan men-generate password baru untuk admin{" "}
                <strong>{resetTarget?.username}</strong>. Password lama akan
                langsung tidak berlaku.
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--warm-charcoal)" }}>
                Password baru hanya ditampilkan sekali di langkah berikutnya.
                Pastikan Anda mencatatnya atau menyampaikannya ke admin
                terkait.
              </p>
            </div>
          )}
          <DialogFooter>
            {generatedPassword ? (
              <Button onClick={closeResetModal}>Tutup</Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={closeResetModal}
                  disabled={resetting}
                >
                  Batal
                </Button>
                <Button
                  onClick={performResetPassword}
                  disabled={resetting}
                  className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]"
                >
                  {resetting ? "Generating..." : "Generate Password"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
