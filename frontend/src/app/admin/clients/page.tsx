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
import {
  emailSchema,
  urlOptionalSchema,
  optionalString,
} from "@insuretrack/forms";
import { API_BASE, ApiError } from "@insuretrack/api-client";
import { getAdminToken } from "@insuretrack/api-client";

type Client = {
  id: string;
  name: string;
  logo_path: string;
  industry: string | null;
  website: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const optionalPhone = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .transform((s) => s.replace(/[\s\-+()]/g, ""))
    .refine((s) => /^\d{10,15}$/.test(s), { message: "Nomor telepon harus 10–15 digit" })
    .optional(),
);

const clientSchema = z.object({
  name: z.string().trim().min(1, "Nama klien wajib diisi").max(120, "Maksimal 120 karakter"),
  industry: optionalString(80),
  website: urlOptionalSchema,
  contact_person: optionalString(120),
  contact_email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    emailSchema.optional(),
  ),
  contact_phone: optionalPhone,
  sort_order: z.coerce
    .number({ invalid_type_error: "Urutan harus angka" })
    .int("Urutan harus bilangan bulat")
    .min(0, "Urutan tidak boleh negatif")
    .default(0),
  is_active: z.boolean().default(true),
  notes: optionalString(2000),
  logo: z.any().optional(),
});

type ClientFormValues = z.infer<typeof clientSchema>;

function logoUrl(logo_path: string): string {
  if (!logo_path) return "";
  if (logo_path.startsWith("http")) return logo_path;
  const apiRoot = API_BASE.replace(/\/api\/?$/, "");
  return `${apiRoot}/api/public/uploads/${logo_path.replace(/^\/+/, "")}`;
}

export default function AdminClientsPage() {
  const [editing, setEditing] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const methods = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema) as never,
    defaultValues: {
      name: "",
      industry: "",
      website: "",
      contact_person: "",
      contact_email: "",
      contact_phone: "",
      sort_order: 0,
      is_active: true,
      notes: "",
    },
    mode: "onBlur",
  });

  const openCreate = () => {
    setEditing(null);
    setLogoPreview(null);
    methods.reset({
      name: "",
      industry: "",
      website: "",
      contact_person: "",
      contact_email: "",
      contact_phone: "",
      sort_order: 0,
      is_active: true,
      notes: "",
    });
    if (fileRef.current) fileRef.current.value = "";
    setShowForm(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setLogoPreview(null);
    methods.reset({
      name: c.name,
      industry: c.industry ?? "",
      website: c.website ?? "",
      contact_person: c.contact_person ?? "",
      contact_email: c.contact_email ?? "",
      contact_phone: c.contact_phone ?? "",
      sort_order: c.sort_order,
      is_active: c.is_active,
      notes: c.notes ?? "",
    });
    if (fileRef.current) fileRef.current.value = "";
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setLogoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onSubmit = async (values: ClientFormValues) => {
    const token = getAdminToken();
    if (!token) return;
    const logoFile = (values.logo instanceof FileList ? values.logo[0] : values.logo) as
      | File
      | undefined;
    if (!editing && !logoFile) {
      methods.setError("logo", { message: "Logo wajib diupload" });
      return;
    }
    if (logoFile && logoFile.size > 5 * 1024 * 1024) {
      methods.setError("logo", { message: "Ukuran logo maksimal 5 MB" });
      return;
    }
    if (logoFile && !["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(logoFile.type)) {
      methods.setError("logo", { message: "Format logo harus JPG, PNG, WebP, atau SVG" });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      const data = {
        name: values.name.trim(),
        industry: (values.industry ?? "").toString().trim() || null,
        website: (values.website ?? "").toString().trim() || null,
        contact_person: (values.contact_person ?? "").toString().trim() || null,
        contact_email: (values.contact_email ?? "").toString().trim() || null,
        contact_phone: (values.contact_phone ?? "").toString().trim() || null,
        sort_order: Number(values.sort_order) || 0,
        is_active: values.is_active,
        notes: (values.notes ?? "").toString().trim() || null,
      };
      fd.append("data", JSON.stringify(data));
      if (logoFile) fd.append("logo", logoFile);
      const url = editing
        ? `${API_BASE}/admin/clients/${editing.id}`
        : `${API_BASE}/admin/clients`;
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
      toast.success(editing ? "Klien diperbarui" : "Klien ditambahkan");
      closeForm();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteClient = async (c: Client) => {
    const token = getAdminToken();
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE}/admin/clients/${c.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok && r.status !== 204) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      toast.success(`Klien "${c.name}" dihapus`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal hapus");
    }
  };

  return (
    <>
      <AdminListPage<Client>
        key={refreshKey}
        title="Klien Korporat"
        endpoint="/admin/clients"
        searchPlaceholder="Cari nama atau industri..."
        headerActions={
          <Button onClick={openCreate} className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]">
            + Tambah Klien
          </Button>
        }
        emptyMessage="Belum ada klien. Klik “+Tambah Klien” untuk menambahkan."
        columns={[
          {
            key: "logo_path",
            label: "Logo",
            width: "72px",
            render: (c) => (
              <SafeImage
                src={c.logo_path ? logoUrl(c.logo_path) : null}
                alt={c.name}
                initials={c.name.slice(0, 2)}
                size={40}
              />
            ),
          },
          { key: "name", label: "Nama" },
          {
            key: "industry",
            label: "Industri",
            hideOnMobile: true,
            render: (c) => c.industry ?? <span style={{ color: "var(--warm-silver)" }}>—</span>,
          },
          { key: "sort_order", label: "Urutan", width: "80px", hideOnMobile: true },
          {
            key: "is_active",
            label: "Status",
            width: "110px",
            render: (c) => (
              <span className={`clay-badge ${c.is_active ? "matcha" : "muted"}`}>
                {c.is_active ? "Aktif" : "Nonaktif"}
              </span>
            ),
          },
        ]}
        actions={(c) => (
          <>
            <Button
              size="sm"
              className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]"
              onClick={() => openEdit(c)}
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
              title="Hapus Klien?"
              description={
                <p>
                  Klien <strong>“{c.name}”</strong> akan dihapus permanen. Tindakan
                  ini tidak dapat dibatalkan.
                </p>
              }
              confirmLabel="Hapus"
              destructive
              onConfirm={() => deleteClient(c)}
            />
          </>
        )}
      />

      <Dialog open={showForm} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Klien" : "Tambah Klien"}</DialogTitle>
          </DialogHeader>
          <Form
            methods={methods}
            onSubmit={onSubmit}
            className="clay-form-grid cols-2"
            id="client-form"
          >
            <FormError message={null} />
            <FormField label="Nama Klien" name="name" required>
              <input
                id="name"
                className="clay-input"
                autoComplete="off"
                {...methods.register("name")}
              />
            </FormField>
            <FormField label="Industri" name="industry">
              <input
                id="industry"
                className="clay-input"
                autoComplete="off"
                {...methods.register("industry")}
              />
            </FormField>
            <FormField label="Website" name="website" hint="https://...">
              <input
                id="website"
                className="clay-input"
                type="url"
                autoComplete="off"
                {...methods.register("website")}
              />
            </FormField>
            <FormField label="Urutan Tampil" name="sort_order">
              <input
                id="sort_order"
                className="clay-input"
                type="number"
                min={0}
                {...methods.register("sort_order")}
              />
            </FormField>
            <FormField label="Contact Person" name="contact_person">
              <input
                id="contact_person"
                className="clay-input"
                autoComplete="off"
                {...methods.register("contact_person")}
              />
            </FormField>
            <FormField label="Email Kontak" name="contact_email">
              <input
                id="contact_email"
                className="clay-input"
                type="email"
                autoComplete="off"
                {...methods.register("contact_email")}
              />
            </FormField>
            <FormField label="Telepon Kontak" name="contact_phone" hint="10–15 digit">
              <input
                id="contact_phone"
                className="clay-input"
                type="tel"
                autoComplete="off"
                {...methods.register("contact_phone")}
              />
            </FormField>
            <FormField
              label={editing ? "Logo (opsional)" : "Logo"}
              name="logo"
              required={!editing}
              hint={
                editing
                  ? "Biarkan kosong jika tidak ingin mengganti logo."
                  : "JPG/PNG/WebP/SVG, max 5 MB."
              }
            >
              <input
                ref={(el) => {
                  fileRef.current = el;
                  methods.register("logo").ref(el);
                }}
                id="logo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  methods.setValue("logo", f ?? null, { shouldValidate: true });
                  setLogoPreview(f ? URL.createObjectURL(f) : null);
                }}
                className="clay-input"
                style={{ padding: 8 }}
              />
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="Preview"
                  style={{
                    marginTop: 8,
                    maxHeight: 60,
                    maxWidth: "100%",
                    objectFit: "contain",
                    background: "var(--warm-cream)",
                    padding: 4,
                    borderRadius: 6,
                  }}
                />
              )}
              {editing && !logoPreview && (
                <img
                  src={logoUrl(editing.logo_path)}
                  alt={editing.name}
                  style={{
                    marginTop: 8,
                    maxHeight: 60,
                    maxWidth: "100%",
                    objectFit: "contain",
                    background: "var(--warm-cream)",
                    padding: 4,
                    borderRadius: 6,
                  }}
                />
              )}
            </FormField>
            <div style={{ gridColumn: "1 / -1" }}>
              <FormField label="Catatan Internal" name="notes">
                <textarea
                  id="notes"
                  className="clay-textarea"
                  rows={2}
                  {...methods.register("notes")}
                />
              </FormField>
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
              <input
                id="is_active"
                type="checkbox"
                checked={methods.watch("is_active")}
                onChange={(e) => methods.setValue("is_active", e.target.checked)}
              />
              <label htmlFor="is_active">Aktif (tampil di landing page)</label>
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
              form="client-form"
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
