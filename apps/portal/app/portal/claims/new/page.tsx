"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormError } from "@insuretrack/forms";
import { API_BASE } from "@insuretrack/api-client";
import { getCustomerToken } from "@insuretrack/api-client";

type Policy = {
  id: string;
  policy_no: string;
  product: string;
  sum_assured: string;
  effective_date: string;
  expiry_date: string;
  status: string;
};

// Mirror of backend `default_claim_type_for_product` di
// `apps/backend/src/domain/claim.rs`. Dipakai untuk menampilkan
// tipe klaim yang akan di-set server-side (read-only info card).
// Admin bisa override via PATCH /admin/claims/:id (lihat J23).
const PRODUCT_CLAIM_INFO: Record<
  string,
  { type: string; label: string }
> = {
  LIFE: { type: "DEATH", label: "Klaim Meninggal Dunia" },
  HEALTH: { type: "HOSPITALIZATION", label: "Klaim Rawat Inap" },
  PERSONAL_ACCIDENT: { type: "ACCIDENT", label: "Klaim Kecelakaan" },
};

const PRODUCT_LABEL: Record<string, string> = {
  LIFE: "Asuransi Jiwa",
  HEALTH: "Asuransi Kesehatan",
  PERSONAL_ACCIDENT: "Asuransi Kecelakaan Diri",
};

/** Format rupiah tanpa desimal (sesuai formatIdr di @insuretrack/api-client
 * tapi inline karena di sini belum di-share). */
function formatRupiah(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);
}

/** Bangun template deskripsi berdasarkan polis + tanggal insiden.
 * Dipakai untuk auto-fill kolom description saat pertama kali.
 * User bebas edit; auto-fill hanya terjadi kalau textarea masih kosong. */
function buildDescriptionTemplate(
  policy: Policy | undefined,
  incidentDate: string,
): string {
  if (!policy) return "";
  const productName = PRODUCT_LABEL[policy.product] ?? policy.product;
  const datePart = incidentDate || "[tanggal insiden]";
  return `Klaim untuk polis ${policy.policy_no} (${productName}) — kejadian pada ${datePart}.`;
}

// Hanya 3 field yang user isi: polis, tanggal insiden, deskripsi (auto-fill).
// `claim_type` & `claimed_amount` di-set server-side dari policy
// (lihat apps/backend/src/routes/customer.rs::create_claim).
const claimSchema = z.object({
  policy_id: z.string().min(1, "Pilih polis"),
  incident_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD")
    .refine(
      (s) => new Date(s) <= new Date(new Date().toDateString()),
      "Tanggal tidak boleh di masa depan",
    ),
  description: z
    .string()
    .trim()
    .min(10, "Deskripsi minimal 10 karakter")
    .max(2000, "Maksimal 2000 karakter"),
  documents: z.any().optional(),
});
type ClaimFormValues = z.infer<typeof claimSchema>;

export default function NewClaimPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [docCount, setDocCount] = useState(0);

  const methods = useForm<ClaimFormValues>({
    resolver: zodResolver(claimSchema) as never,
    defaultValues: {
      policy_id: "",
      incident_date: "",
      description: "",
    },
    mode: "onBlur",
  });

  // Watch current values untuk auto-fill description (hanya kalau
  // textarea masih kosong — tidak overwrite edit user).
  const watchedPolicyId = methods.watch("policy_id");
  const watchedIncidentDate = methods.watch("incident_date");
  const watchedDescription = methods.watch("description");

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    fetch(`${API_BASE}/customer/policies?status=ACTIVE&page=1&page_size=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => {
        const list: Policy[] = j.data ?? [];
        setPolicies(list);
        if (list.length > 0) {
          methods.setValue("policy_id", list[0].id);
          setSelectedPolicy(list[0]);
        }
      });
  }, [methods]);

  // Update selected policy saat user ganti pilihan.
  useEffect(() => {
    if (!watchedPolicyId) {
      setSelectedPolicy(null);
      return;
    }
    const p = policies.find((x) => x.id === watchedPolicyId);
    setSelectedPolicy(p ?? null);
  }, [watchedPolicyId, policies]);

  // Auto-fill deskripsi: hanya kalau textarea masih kosong DAN polis/date
  // sudah dipilih. Jangan overwrite kalau user sudah mulai ngetik.
  useEffect(() => {
    if (!selectedPolicy) return;
    if (watchedDescription && watchedDescription.trim().length > 0) return;
    const template = buildDescriptionTemplate(
      selectedPolicy,
      watchedIncidentDate ?? "",
    );
    if (template) {
      methods.setValue("description", template, { shouldValidate: false });
    }
  }, [selectedPolicy, watchedIncidentDate, watchedDescription, methods]);

  const onSubmit = async (values: ClaimFormValues) => {
    const token = getCustomerToken();
    if (!token) return;
    const docsRaw = values.documents;
    const docs: File[] = docsRaw instanceof FileList ? Array.from(docsRaw) : [];
    for (const f of docs) {
      if (f.size > 5 * 1024 * 1024) {
        methods.setError("documents", { message: `${f.name} lebih dari 5 MB` });
        return;
      }
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const fd = new FormData();
      // Kirim hanya field yang user-controlled. `claim_type` &
      // `claimed_amount` di-derive server-side.
      fd.append(
        "data",
        JSON.stringify({
          policy_id: values.policy_id,
          incident_date: values.incident_date,
          description: values.description.trim(),
        }),
      );
      for (const f of docs) fd.append("documents", f);
      const r = await fetch(`${API_BASE}/customer/claims`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.error?.message ?? "Gagal submit klaim");
      router.replace("/portal/claims");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setSubmitting(false);
    }
  };

  // Info untuk info card read-only.
  const claimInfo = selectedPolicy
    ? PRODUCT_CLAIM_INFO[selectedPolicy.product]
    : null;
  const productLabel = selectedPolicy
    ? PRODUCT_LABEL[selectedPolicy.product] ?? selectedPolicy.product
    : null;

  return (
    <>
      <p className="uppercase-label" style={{ color: "var(--pomegranate-400)", marginBottom: 8 }}>
        ✦ Klaim Baru
      </p>
      <h1 className="page-title">Ajukan Klaim</h1>
      <p className="page-subtitle">
        Isi formulir di bawah. Tipe klaim dan jumlah akan ditentukan
        berdasarkan polis Anda.
      </p>

      {policies.length === 0 ? (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Anda belum memiliki polis aktif untuk diklaim.
          </p>
        </div>
      ) : (
        <>
          {/* Info card read-only — menunjukkan apa yang akan di-set
              server-side (claim_type + claimed_amount). UX: user tidak
              mengisi crucial fields, sistem yang menentukan. */}
          {selectedPolicy && claimInfo && (
            <div
              className="clay-card feature dashed"
              style={{
                background: "var(--warm-cream)",
                marginBottom: 24,
                padding: 20,
              }}
            >
              <p
                className="uppercase-label"
                style={{ color: "var(--pomegranate-400)", marginBottom: 12 }}
              >
                ✦ Ditentukan oleh sistem
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "8px 16px",
                  alignItems: "baseline",
                }}
              >
                <span
                  className="body"
                  style={{ color: "var(--warm-charcoal)", fontWeight: 600 }}
                >
                  Tipe Klaim
                </span>
                <span className="body">
                  {claimInfo.label}
                  {claimInfo.type === "DEATH" && selectedPolicy.product === "LIFE" && (
                    <span
                      className="caption"
                      style={{ color: "var(--warm-silver)", marginLeft: 8 }}
                    >
                      (default; tim kami akan menyesuaikan jika klaim Maturity/Surrender)
                    </span>
                  )}
                  <br />
                  <span
                    className="caption"
                    style={{ color: "var(--warm-silver)" }}
                  >
                    dari produk {productLabel}
                  </span>
                </span>

                <span
                  className="body"
                  style={{ color: "var(--warm-charcoal)", fontWeight: 600 }}
                >
                  Jumlah Klaim (UP)
                </span>
                <span className="body">
                  {formatRupiah(selectedPolicy.sum_assured)}
                  <br />
                  <span
                    className="caption"
                    style={{ color: "var(--warm-silver)" }}
                  >
                    akan diverifikasi oleh tim kami
                  </span>
                </span>
              </div>
            </div>
          )}

          <Form
            methods={methods}
            onSubmit={onSubmit}
            className="clay-card feature"
          >
            <FormError message={formError} />
            <FormField label="Polis" name="policy_id" required>
              <select
                id="policy_id"
                className="clay-select"
                {...methods.register("policy_id")}
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.policy_no} — {PRODUCT_LABEL[p.product] ?? p.product} (UP:{" "}
                    {formatRupiah(p.sum_assured)})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Tanggal Insiden" name="incident_date" required>
              <input
                id="incident_date"
                type="date"
                className="clay-input"
                {...methods.register("incident_date")}
              />
            </FormField>
            <FormField
              label="Deskripsi"
              name="description"
              required
              hint="Auto-terisi template. Anda dapat menambahkan detail kronologi, kondisi, atau informasi lain di sini."
            >
              <textarea
                id="description"
                className="clay-textarea"
                rows={4}
                {...methods.register("description")}
              />
            </FormField>
            <FormField
              label="Dokumen Pendukung (opsional)"
              name="documents"
              hint="JPG/PNG/PDF, max 5 MB per file. Bisa lebih dari satu file. Contoh: surat dokter, bukti rawat inap, foto kerusakan."
            >
              <input
                id="documents"
                type="file"
                multiple
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => {
                  methods.setValue("documents", e.target.files, { shouldValidate: false });
                  setDocCount(e.target.files?.length ?? 0);
                }}
                className="clay-input"
                style={{ padding: 12 }}
              />
              {docCount > 0 && (
                <p
                  className="caption"
                  style={{ color: "var(--warm-charcoal)", marginTop: 8 }}
                >
                  {docCount} file dipilih
                </p>
              )}
            </FormField>
            <button
              type="submit"
              disabled={submitting}
              className="clay-button solid-pomegranate size-large"
              style={{ marginTop: 8 }}
            >
              {submitting ? "Mengirim..." : "Kirim Klaim →"}
            </button>
          </Form>
        </>
      )}
    </>
  );
}
