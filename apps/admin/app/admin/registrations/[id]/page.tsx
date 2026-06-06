"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { StatusBadge } from "@insuretrack/ui";
import { API_BASE, ApiError, getAdminToken } from "@insuretrack/api-client";

type RegistrationDetail = {
  id: string;
  registration_no: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_nik: string;
  product: string;
  sum_assured: string;
  coverage_term: number;
  status: string;
  created_at: string;
  invoice_no: string | null;
  invoice_status: string | null;
  premium_amount: string | null;
  due_date: string | null;
  policy_no: string | null;
  policy_status: string | null;
};

const PRODUCT_LABELS: Record<string, string> = {
  LIFE: "Asuransi Jiwa",
  PERSONAL_ACCIDENT: "Kecelakaan Diri",
  HEALTH: "Kesehatan",
};

const formatIDR = (n: string | number | null | undefined) => {
  if (n == null) return "—";
  const v = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="caption"
        style={{
          color: "var(--warm-silver)",
          margin: 0,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </p>
      <p style={{ margin: "4px 0 0 0", color: "var(--clay-black)", fontWeight: 500 }}>
        {children}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="clay-card feature" style={{ padding: 24 }}>
      <h2
        className="card-heading"
        style={{ fontSize: "1.1rem", marginBottom: 16, color: "var(--clay-black)" }}
      >
        {title}
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function RegistrationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [data, setData] = useState<RegistrationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ kind: "notfound" | "other"; message: string } | null>(
    null,
  );

  useEffect(() => {
    if (!id) return;
    const token = getAdminToken();
    if (!token) {
      setError({ kind: "other", message: "Sesi admin tidak ditemukan. Silakan login ulang." });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const r = await fetch(`${API_BASE}/admin/registrations/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.status === 404) {
          if (!cancelled) {
            setError({ kind: "notfound", message: "Registrasi tidak ditemukan." });
            setLoading(false);
          }
          return;
        }
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new ApiError(r.status, "ERR", txt || `HTTP ${r.status}`);
        }
        const json = (await r.json()) as RegistrationDetail;
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError({
            kind: "other",
            message: e instanceof Error ? e.message : "Gagal load detail registrasi",
          });
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AdminShell>
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/admin/registrations"
          className="caption"
          style={{
            color: "var(--ube-800)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 8,
          }}
        >
          ← Kembali ke daftar registrasi
        </Link>
        <h1 className="page-title" style={{ marginBottom: 4 }}>
          Detail Registrasi
        </h1>
        {data && (
          <p className="caption" style={{ color: "var(--warm-charcoal)" }}>
            {data.registration_no}
          </p>
        )}
      </div>

      {loading && (
        <div className="clay-card feature" style={{ padding: 32, textAlign: "center" }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Memuat...
          </p>
        </div>
      )}

      {error && (
        <div
          className="clay-card feature"
          style={{
            padding: 24,
            borderColor: "var(--pomegranate-400)",
            background: "#fff5f5",
          }}
        >
          <p
            className="body"
            style={{ color: "var(--pomegranate-400)", margin: 0, fontWeight: 600 }}
          >
            {error.kind === "notfound" ? "Data tidak ditemukan" : "Gagal memuat data"}
          </p>
          <p
            className="caption"
            style={{ color: "var(--warm-charcoal)", margin: "8px 0 0 0" }}
          >
            {error.message}
          </p>
          <Link
            href="/admin/registrations"
            className="clay-button solid-ube size-small"
            style={{ marginTop: 16, display: "inline-block" }}
          >
            ← Kembali
          </Link>
        </div>
      )}

      {data && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SectionCard title="Informasi Registrasi">
            <Field label="No. Registrasi">
              <span className="mono">{data.registration_no}</span>
            </Field>
            <Field label="Status">
              <StatusBadge status={data.status} />
            </Field>
            <Field label="Produk">
              {PRODUCT_LABELS[data.product] ?? data.product}
            </Field>
            <Field label="Uang Pertanggungan">{formatIDR(data.sum_assured)}</Field>
            <Field label="Masa Perlindungan">{data.coverage_term} tahun</Field>
            <Field label="Tanggal Daftar">{formatDateTime(data.created_at)}</Field>
          </SectionCard>

          <SectionCard title="Customer">
            <Field label="Nama">{data.customer_name}</Field>
            <Field label="Email">
              <a
                href={`mailto:${data.customer_email}`}
                style={{ color: "var(--ube-800)", textDecoration: "none" }}
              >
                {data.customer_email}
              </a>
            </Field>
            <Field label="NIK">
              <span className="mono">{data.customer_nik}</span>
            </Field>
            <Field label="Customer ID">
              <span className="mono" style={{ fontSize: "0.8rem" }}>
                {data.customer_id}
              </span>
            </Field>
          </SectionCard>

          <SectionCard title="Invoice">
            {data.invoice_no ? (
              <>
                <Field label="No. Invoice">
                  <span className="mono">{data.invoice_no}</span>
                </Field>
                <Field label="Status">
                  {data.invoice_status ? <StatusBadge status={data.invoice_status} /> : "—"}
                </Field>
                <Field label="Premi">{formatIDR(data.premium_amount)}</Field>
                <Field label="Jatuh Tempo">{formatDate(data.due_date)}</Field>
              </>
            ) : (
              <p
                className="caption"
                style={{ color: "var(--warm-silver)", margin: 0, gridColumn: "1 / -1" }}
              >
                Invoice belum dibuat (registrasi belum dibayar?).
              </p>
            )}
          </SectionCard>

          <SectionCard title="Polis">
            {data.policy_no ? (
              <>
                <Field label="No. Polis">
                  <span className="mono">{data.policy_no}</span>
                </Field>
                <Field label="Status">
                  {data.policy_status ? <StatusBadge status={data.policy_status} /> : "—"}
                </Field>
              </>
            ) : (
              <p
                className="caption"
                style={{ color: "var(--warm-silver)", margin: 0, gridColumn: "1 / -1" }}
              >
                Polis belum terbit. Lihat status invoice di atas.
              </p>
            )}
          </SectionCard>
        </div>
      )}
    </AdminShell>
  );
}
