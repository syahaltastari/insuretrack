"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileDown } from "lucide-react";
import { API_BASE, apiFetch, formatIdr } from "@insuretrack/api-client";
import { Reveal } from "@/components/Reveal";
import { SkeletonCard, StatusBadge } from "@insuretrack/ui";

type PolicyDetail = {
  id: string;
  policy_no: string;
  registration_no: string;
  customer_name: string;
  customer_email: string | null;
  customer_mobile: string | null;
  product: string;
  sum_assured: string;
  premium: string;
  effective_date: string;
  expiry_date: string;
  status: string;
  pdf_path: string | null;
  created_at: string;
};

const PRODUCT_LABELS: Record<string, string> = {
  LIFE: "Asuransi Jiwa",
  PERSONAL_ACCIDENT: "Kecelakaan Diri",
  HEALTH: "Kesehatan",
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  // Untuk date-only string ("YYYY-MM-DD") parse sebagai local date —
  // `new Date(iso)` di-parse sebagai UTC midnight, bisa shift ke hari
  // sebelumnya di WIB. Split manual untuk konsistensi.
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = dateOnlyMatch ? new Date(iso + "T00:00:00") : new Date(iso);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p
        className="caption"
        style={{
          color: "var(--warm-silver)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: 0,
          marginBottom: 4,
          fontSize: "0.7rem",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontWeight: 500,
          fontFamily: mono ? "var(--font-space-mono), monospace" : undefined,
          wordBreak: "break-word",
        }}
      >
        {children}
      </p>
    </div>
  );
}

export default function AdminPolicyDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<PolicyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<PolicyDetail>(`/admin/policies/${id}`);
        setData(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat detail polis");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <>
      <Reveal>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <Link href="/admin/policies" className="clay-button ghost size-small">
            <ArrowLeft size={14} /> Kembali ke daftar
          </Link>
          {data?.pdf_path && (
            <a
              href={`${API_BASE}/admin/policies/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="clay-button solid-honey size-small"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <FileDown size={14} /> Download E-Policy
            </a>
          )}
        </div>
      </Reveal>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}

      {loading && <SkeletonCard rows={6} style={{ minHeight: 320 }} />}

      {data && (
        <>
          <Reveal delay={80}>
            <div className="clay-card feature" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <p className="caption" style={{ color: "var(--warm-silver)", margin: 0 }}>
                    Nomor Polis
                  </p>
                  <h1 className="card-heading" style={{ marginTop: 4, fontFamily: "var(--font-space-mono), monospace" }}>
                    {data.policy_no}
                  </h1>
                </div>
                <StatusBadge status={data.status} />
              </div>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="clay-card feature" style={{ marginBottom: 16 }}>
              <h2 className="section-heading" style={{ fontSize: "1.15rem", marginBottom: 16 }}>
                Detail Polis
              </h2>
              <div className="clay-grid cols-2" style={{ gap: 20 }}>
                <Field label="Produk">{PRODUCT_LABELS[data.product] ?? data.product}</Field>
                <Field label="No. Registrasi" mono>
                  <Link
                    href={`/admin/registrations/${data.registration_no}`}
                    style={{ color: "var(--ink)", textDecoration: "underline" }}
                  >
                    {data.registration_no}
                  </Link>
                </Field>
                <Field label="Mulai Berlaku">{formatDate(data.effective_date)}</Field>
                <Field label="Berakhir">{formatDate(data.expiry_date)}</Field>
                <Field label="Nilai Pertanggungan (UP)">
                  {formatIdr(Number(data.sum_assured))}
                </Field>
                <Field label="Premi">{formatIdr(Number(data.premium))}</Field>
                <Field label="Tanggal Terbit">{formatDate(data.created_at)}</Field>
              </div>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <div className="clay-card feature">
              <h2 className="section-heading" style={{ fontSize: "1.15rem", marginBottom: 16 }}>
                Pemegang Polis
              </h2>
              <div className="clay-grid cols-2" style={{ gap: 20 }}>
                <Field label="Nama">{data.customer_name}</Field>
                <Field label="Email">{data.customer_email ?? "—"}</Field>
                <Field label="No. HP">{data.customer_mobile ?? "—"}</Field>
              </div>
            </div>
          </Reveal>
        </>
      )}
    </>
  );
}