"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PortalShell } from "@/components/PortalShell";
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

const CLAIM_TYPES = ["DEATH", "ACCIDENT", "HOSPITALIZATION", "MATURITY", "SURRENDER"] as const;

const claimSchema = z.object({
  policy_id: z.string().min(1, "Pilih polis"),
  claim_type: z.enum(CLAIM_TYPES, { errorMap: () => ({ message: "Tipe klaim tidak valid" }) }),
  incident_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD")
    .refine(
      (s) => new Date(s) <= new Date(new Date().toDateString()),
      "Tanggal tidak boleh di masa depan",
    ),
  claimed_amount: z.coerce
    .number({ invalid_type_error: "Jumlah klaim harus angka" })
    .positive("Jumlah klaim harus lebih dari 0")
    .finite(),
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
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [docCount, setDocCount] = useState(0);

  const methods = useForm<ClaimFormValues>({
    resolver: zodResolver(claimSchema) as never,
    defaultValues: {
      policy_id: "",
      claim_type: "ACCIDENT",
      incident_date: "",
      claimed_amount: 0,
      description: "",
    },
    mode: "onBlur",
  });

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
        if (list.length > 0) methods.setValue("policy_id", list[0].id);
      });
  }, [methods]);

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
      fd.append(
        "data",
        JSON.stringify({
          policy_id: values.policy_id,
          claim_type: values.claim_type,
          incident_date: values.incident_date,
          claimed_amount: Number(values.claimed_amount),
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

  return (
    <PortalShell>
      <p className="uppercase-label" style={{ color: "var(--pomegranate-400)", marginBottom: 8 }}>
        ✦ Klaim Baru
      </p>
      <h1 className="page-title">Ajukan Klaim</h1>
      <p className="page-subtitle">Lengkapi formulir di bawah. Lampirkan bukti jika ada.</p>

      {policies.length === 0 ? (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Anda belum memiliki polis aktif untuk diklaim.
          </p>
        </div>
      ) : (
        <Form
          methods={methods}
          onSubmit={onSubmit}
          className="clay-card feature"
          // Disable native validation; we use zod.
        >
          <FormError message={formError} />
          <FormField label="Polis" name="policy_id" required>
            <select id="policy_id" className="clay-select" {...methods.register("policy_id")}>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.policy_no} — {p.product} (UP:{" "}
                  {new Intl.NumberFormat("id-ID").format(Number(p.sum_assured))})
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Tipe Klaim" name="claim_type" required>
            <select id="claim_type" className="clay-select" {...methods.register("claim_type")}>
              <option value="ACCIDENT">Kecelakaan</option>
              <option value="DEATH">Meninggal Dunia</option>
              <option value="HOSPITALIZATION">Rawat Inap</option>
              <option value="MATURITY">Jatuh Tempo</option>
              <option value="SURRENDER">Surrender</option>
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
          <FormField label="Jumlah Klaim (Rp)" name="claimed_amount" required>
            <input
              id="claimed_amount"
              type="number"
              min={1}
              className="clay-input"
              {...methods.register("claimed_amount")}
            />
          </FormField>
          <FormField label="Deskripsi" name="description" required hint="Minimal 10 karakter">
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
            hint="JPG/PNG/PDF, max 5 MB per file. Bisa lebih dari satu file."
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
      )}
    </PortalShell>
  );
}
