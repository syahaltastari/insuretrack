"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AdminListPage } from "@/components/AdminListPage";
import { Button } from "@insuretrack/ui";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@insuretrack/ui";
import { Confirm } from "@insuretrack/ui";
import { SafeImage } from "@insuretrack/ui";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { optionalString } from "@insuretrack/forms";
import { API_BASE, ApiError } from "@insuretrack/api-client";
import { getAdminToken } from "@insuretrack/api-client";

type Testimonial = {
  id: string;
  customer_name: string;
  photo_path: string | null;
  rating: number;
  review: string;
  role: string | null;
  company: string | null;
  policy_type: string | null;
  display_date: string;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const POLICY_TYPES = ["LIFE", "PERSONAL_ACCIDENT", "HEALTH"] as const;

const testimonialSchema = z.object({
  customer_name: z
    .string()
    .trim()
    .min(1, "Nama pelanggan wajib diisi")
    .max(120, "Maksimal 120 karakter"),
  rating: z.coerce
    .number({ invalid_type_error: "Rating harus angka" })
    .int("Rating harus bilangan bulat")
    .min(1, "Rating minimal 1")
    .max(5, "Rating maksimal 5"),
  review: z
    .string()
    .trim()
    .min(5, "Review minimal 5 karakter")
    .max(2000, "Maksimal 2000 karakter"),
  role: optionalString(80),
  company: optionalString(120),
  policy_type: z
    .enum(["", ...POLICY_TYPES] as [string, ...typeof POLICY_TYPES])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  display_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD"),
  is_featured: z.boolean().default(false),
  is_active: z.boolean().default(true),
  photo: z.any().optional(),
});

type TestimonialFormValues = z.infer<typeof testimonialSchema>;

function photoUrl(photo_path: string | null): string {
  if (!photo_path) return "";
  if (photo_path.startsWith("http")) return photo_path;
  const apiRoot = API_BASE.replace(/\/api\/?$/, "");
  return `${apiRoot}/api/public/uploads/${photo_path.replace(/^\/+/, "")}`;
}

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Beri rating ${n}`}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 4,
            color: n <= value ? "var(--lemon-700)" : "var(--oat-light)",
            fontSize: "1.5rem",
            lineHeight: 1,
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function StarsDisplay({ value }: { value: number }) {
  return (
    <span style={{ color: "var(--lemon-700)", letterSpacing: 1 }} aria-label={`Rating ${value}`}>
      {"★".repeat(value)}
      <span style={{ color: "var(--oat-light)" }}>{"★".repeat(5 - value)}</span>
    </span>
  );
}

const todayYmd = () => new Date().toISOString().slice(0, 10);

export default function AdminTestimonialsPage() {
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const methods = useForm<TestimonialFormValues>({
    resolver: zodResolver(testimonialSchema) as never,
    defaultValues: {
      customer_name: "",
      rating: 5,
      review: "",
      role: "",
      company: "",
      policy_type: "",
      display_date: todayYmd(),
      is_featured: false,
      is_active: true,
    },
    mode: "onBlur",
  });

  const openCreate = () => {
    setEditing(null);
    setPhotoPreview(null);
    methods.reset({
      customer_name: "",
      rating: 5,
      review: "",
      role: "",
      company: "",
      policy_type: "",
      display_date: todayYmd(),
      is_featured: false,
      is_active: true,
    });
    if (fileRef.current) fileRef.current.value = "";
    setShowForm(true);
  };

  const openEdit = (t: Testimonial) => {
    setEditing(t);
    setPhotoPreview(null);
    methods.reset({
      customer_name: t.customer_name,
      rating: t.rating,
      review: t.review,
      role: t.role ?? "",
      company: t.company ?? "",
      policy_type: (t.policy_type ?? "") as TestimonialFormValues["policy_type"],
      display_date: t.display_date,
      is_featured: t.is_featured,
      is_active: t.is_active,
    });
    if (fileRef.current) fileRef.current.value = "";
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onSubmit = async (values: TestimonialFormValues) => {
    const token = getAdminToken();
    if (!token) return;
    const photoFile = (values.photo instanceof FileList ? values.photo[0] : values.photo) as
      | File
      | undefined;
    if (photoFile && photoFile.size > 5 * 1024 * 1024) {
      methods.setError("photo", { message: "Ukuran foto maksimal 5 MB" });
      return;
    }
    if (
      photoFile &&
      !["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(photoFile.type)
    ) {
      methods.setError("photo", { message: "Format foto harus JPG, PNG, WebP, atau SVG" });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      const data = {
        customer_name: values.customer_name.trim(),
        rating: Number(values.rating),
        review: values.review.trim(),
        role: (values.role ?? "").toString().trim() || null,
        company: (values.company ?? "").toString().trim() || null,
        policy_type: values.policy_type || null,
        display_date: values.display_date,
        is_featured: values.is_featured,
        is_active: values.is_active,
      };
      fd.append("data", JSON.stringify(data));
      if (photoFile) fd.append("photo", photoFile);
      const url = editing
        ? `${API_BASE}/admin/testimonials/${editing.id}`
        : `${API_BASE}/admin/testimonials`;
      const method = editing ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new ApiError(
          r.status,
          j?.error?.code ?? "ERR",
          j?.error?.message ?? `HTTP ${r.status}`,
        );
      }
      toast.success(editing ? "Testimoni diperbarui" : "Testimoni ditambahkan");
      closeForm();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTestimonial = async (t: Testimonial) => {
    const token = getAdminToken();
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE}/admin/testimonials/${t.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok && r.status !== 204) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      toast.success(`Testimoni dari "${t.customer_name}" dihapus`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal hapus");
    }
  };

  return (
    <>
      <AdminListPage<Testimonial>
        key={refreshKey}
        title="Testimoni"
        endpoint="/admin/testimonials"
        searchPlaceholder="Cari nama atau review..."
        headerActions={
          <Button
            onClick={openCreate}
            className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]"
          >
            + Tambah Testimoni
          </Button>
        }
        emptyMessage='Belum ada testimoni. Klik "+Tambah Testimoni" untuk menambahkan.'
        columns={[
          {
            key: "photo_path",
            label: "Foto",
            width: "72px",
            render: (t) => (
              <SafeImage
                src={t.photo_path ? photoUrl(t.photo_path) : null}
                alt={t.customer_name}
                initials={t.customer_name.slice(0, 2)}
                size={40}
                rounded
              />
            ),
          },
          { key: "customer_name", label: "Nama", width: "160px" },
          {
            key: "rating",
            label: "Rating",
            width: "110px",
            render: (t) => <StarsDisplay value={t.rating} />,
          },
          {
            key: "review",
            label: "Review",
            width: "280px",
            render: (t) => (
              <span
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {t.review}
              </span>
            ),
          },
          {
            key: "role",
            label: "Jabatan",
            width: "140px",
            hideOnMobile: true,
            render: (t) => t.role ?? <span style={{ color: "var(--warm-silver)" }}>—</span>,
          },
          {
            key: "company",
            label: "Perusahaan",
            width: "140px",
            hideOnMobile: true,
            render: (t) => t.company ?? <span style={{ color: "var(--warm-silver)" }}>—</span>,
          },
          {
            key: "policy_type",
            label: "Produk",
            width: "130px",
            hideOnMobile: true,
            render: (t) => t.policy_type ?? <span style={{ color: "var(--warm-silver)" }}>—</span>,
          },
          {
            key: "display_date",
            label: "Tanggal",
            width: "110px",
            hideOnMobile: true,
            render: (t) => new Date(t.display_date).toLocaleDateString("id-ID"),
          },
          {
            key: "is_featured",
            label: "Featured",
            width: "110px",
            hideOnMobile: true,
            render: (t) =>
              t.is_featured ? (
                <span className="clay-badge lemon">Featured</span>
              ) : (
                <span style={{ color: "var(--warm-silver)" }}>—</span>
              ),
          },
          {
            key: "is_active",
            label: "Status",
            width: "100px",
            render: (t) => (
              <span className={`clay-badge ${t.is_active ? "matcha" : "muted"}`}>
                {t.is_active ? "Aktif" : "Nonaktif"}
              </span>
            ),
          },
          {
            key: "updated_at",
            label: "Tgl Update",
            width: "110px",
            hideOnMobile: true,
            render: (t) => new Date(t.updated_at).toLocaleDateString("id-ID"),
          },
        ]}
        actions={(t) => (
          <>
            <Button
              size="sm"
              className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]"
              onClick={() => openEdit(t)}
            >
              Edit
            </Button>
            <Confirm
              trigger={
                <Button
                  size="sm"
                  className="bg-[var(--pomegranate-400)] text-black hover:opacity-90"
                >
                  Hapus
                </Button>
              }
              title="Hapus Testimoni?"
              description={
                <p>
                  Testimoni dari <strong>“{t.customer_name}”</strong> akan dihapus
                  permanen. Tindakan ini tidak dapat dibatalkan.
                </p>
              }
              confirmLabel="Hapus"
              destructive
              onConfirm={() => deleteTestimonial(t)}
            />
          </>
        )}
      />

      <Dialog open={showForm} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Testimoni" : "Tambah Testimoni"}</DialogTitle>
          </DialogHeader>
          <Form
            methods={methods}
            onSubmit={onSubmit}
            className="clay-form-grid cols-2"
            id="testimonial-form"
          >
            <FormError message={null} />
            <FormField label="Nama Pelanggan" name="customer_name" required>
              <input
                id="customer_name"
                className="clay-input"
                autoComplete="off"
                {...methods.register("customer_name")}
              />
            </FormField>
            <FormField label="Rating" name="rating" required>
              <Stars
                value={methods.watch("rating")}
                onChange={(n) => methods.setValue("rating", n, { shouldValidate: true })}
              />
            </FormField>
            <div style={{ gridColumn: "1 / -1" }}>
              <FormField label="Review" name="review" required>
                <textarea
                  id="review"
                  className="clay-textarea"
                  rows={4}
                  {...methods.register("review")}
                />
              </FormField>
            </div>
            <FormField label="Role / Jabatan" name="role">
              <input
                id="role"
                className="clay-input"
                autoComplete="off"
                {...methods.register("role")}
              />
            </FormField>
            <FormField label="Perusahaan" name="company">
              <input
                id="company"
                className="clay-input"
                autoComplete="off"
                {...methods.register("company")}
              />
            </FormField>
            <FormField label="Produk" name="policy_type">
              <select
                id="policy_type"
                className="clay-select"
                {...methods.register("policy_type")}
              >
                <option value="">—</option>
                <option value="LIFE">Asuransi Jiwa</option>
                <option value="PERSONAL_ACCIDENT">Asuransi Kecelakaan Diri</option>
                <option value="HEALTH">Asuransi Kesehatan</option>
              </select>
            </FormField>
            <FormField label="Tanggal Tampil" name="display_date" required>
              <input
                id="display_date"
                className="clay-input"
                type="date"
                {...methods.register("display_date")}
              />
            </FormField>
            <FormField
              label={editing ? "Foto (opsional)" : "Foto"}
              name="photo"
              hint={editing ? "Biarkan kosong jika tidak ingin mengganti foto." : "JPG/PNG/WebP/SVG, max 5 MB."}
            >
              <input
                ref={(el) => {
                  fileRef.current = el;
                  methods.register("photo").ref(el);
                }}
                id="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  methods.setValue("photo", f ?? null, { shouldValidate: true });
                  setPhotoPreview(f ? URL.createObjectURL(f) : null);
                }}
                className="clay-input"
              />
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="Preview"
                  style={{
                    marginTop: 8,
                    width: 60,
                    height: 60,
                    objectFit: "cover",
                    borderRadius: "50%",
                  }}
                />
              )}
              {editing && !photoPreview && editing.photo_path && (
                <img
                  src={photoUrl(editing.photo_path)}
                  alt={editing.customer_name}
                  style={{
                    marginTop: 8,
                    width: 60,
                    height: 60,
                    objectFit: "cover",
                    borderRadius: "50%",
                  }}
                />
              )}
            </FormField>
            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                gap: 20,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={methods.watch("is_featured")}
                  onChange={(e) => methods.setValue("is_featured", e.target.checked)}
                />
                Featured (tampil menonjol)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={methods.watch("is_active")}
                  onChange={(e) => methods.setValue("is_active", e.target.checked)}
                />
                Aktif (tampil di landing page)
              </label>
            </div>
          </Form>
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
              form="testimonial-form"
              disabled={submitting}
              className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]"
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
