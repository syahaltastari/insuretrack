"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, FileCheck, Printer, Receipt, Shield, User } from "lucide-react";
import { SkeletonCard, StatusBadge } from "@insuretrack/ui";
import { apiFetch, formatIdr } from "@insuretrack/api-client";
import { AdminDownloadButton } from "@/components/AdminDownloadButton";

type RegistrationDetail = {
  id: string;
  registration_no: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_nik: string | null;
  product: string;
  plan_code: string | null;
  sum_assured: string;
  coverage_term: number;
  status: string;
  created_at: string;
  // Group registration (0013)
  applicant_type: string;
  company_name: string | null;
  company_npwp: string | null;
  company_industry: string | null;
  // Invoice
  invoice_id: string | null;
  invoice_no: string | null;
  invoice_status: string | null;
  premium_amount: string | null;
  due_date: string | null;
  invoice_paid_at: string | null;
  invoice_created_at: string | null;
  // Policy
  policy_id: string | null;
  policy_no: string | null;
  policy_status: string | null;
  policy_effective_date: string | null;
  policy_expiry_date: string | null;
};

type RegistrationMember = {
  member_id: string;
  customer_id: string;
  full_name: string;
  nik: string | null;
  email: string | null;
  mobile_number: string | null;
  birth_date: string | null;
  gender: string | null;
  beneficiary_name: string | null;
};

const PRODUCT_LABELS: Record<string, string> = {
  LIFE: "Asuransi Jiwa",
  PERSONAL_ACCIDENT: "Kecelakaan Diri",
  HEALTH: "Kesehatan",
};

const TIER_LABELS: Record<string, string> = {
  BASIC: "Basic",
  STANDARD: "Standard",
  PREMIUM: "Premium",
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

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
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
      <p
        style={{
          margin: "4px 0 0 0",
          color: "var(--clay-black)",
          fontWeight: mono ? 400 : 500,
          fontFamily: mono ? "var(--font-space-mono), monospace" : undefined,
          wordBreak: mono ? "break-all" : undefined,
        }}
      >
        {children}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  accentColor,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  accentColor?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="clay-card feature"
      style={{
        padding: 24,
        borderLeft: accentColor ? `6px solid ${accentColor}` : undefined,
      }}
    >
      <h2
        className="card-heading"
        style={{
          fontSize: "1.1rem",
          marginBottom: 16,
          color: "var(--clay-black)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {icon && <span style={{ color: accentColor ?? "var(--ube-800)" }}>{icon}</span>}
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
    </section>
  );
}

function SummaryStat({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
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
      <p
        style={{
          margin: "4px 0 0 0",
          fontSize: "1.05rem",
          fontWeight: 600,
          color: "var(--clay-black)",
          fontFamily: mono ? "var(--font-space-mono), monospace" : undefined,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: mono ? "normal" : "nowrap",
        }}
      >
        {value}
      </p>
    </div>
  );
}

export default function RegistrationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [data, setData] = useState<RegistrationDetail | null>(null);
  const [members, setMembers] = useState<RegistrationMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ kind: "notfound" | "other"; message: string } | null>(null);

  // Fetch detail. Members di-fetch terpisah (hanya untuk INSTANSI)
  // supaya payload awal tetap kecil untuk INDIVIDU.
  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const json = await apiFetch<RegistrationDetail>(`/admin/registrations/${id}`);
        if (!cancelled) {
          setData(json);
          setLoading(false);
          // Fetch members hanya kalau INSTANSI (individu tidak punya).
          // Error di members di-swallow agar tidak block seluruh detail page.
          if (json.applicant_type === "INSTANSI") {
            setMembersLoading(true);
            try {
              const list = await apiFetch<RegistrationMember[]>(
                `/admin/registrations/${id}/members`,
              );
              if (!cancelled) setMembers(list);
            } catch {
              /* silent — tabel kosong lebih helpful daripada error */
            } finally {
              if (!cancelled) setMembersLoading(false);
            }
          }
        }
      } catch (e) {
        const err = e as { status?: number; message?: string };
        if (!cancelled) {
          if (err.status === 404) {
            setError({ kind: "notfound", message: "Registrasi tidak ditemukan." });
          } else {
            setError({
              kind: "other",
              message: err.message ?? "Gagal load detail registrasi",
            });
          }
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/admin/registrations"
          style={{
            color: "var(--ube-800)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 12,
            fontSize: "0.85rem",
          }}
        >
          <ArrowLeft size={14} /> Kembali ke daftar registrasi
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h1 className="page-title" style={{ margin: 0 }}>
            Detail Registrasi
          </h1>
          {data && <StatusBadge status={data.status} />}
        </div>
        {data && (
          <p
            className="mono"
            style={{ color: "var(--warm-charcoal)", margin: "8px 0 0 0", fontSize: "0.95rem" }}
          >
            {data.registration_no}
            {data.applicant_type === "INSTANSI" && (
              <span
                className="clay-badge blueberry"
                style={{ marginLeft: 12, verticalAlign: "middle" }}
              >
                Instansi
              </span>
            )}
          </p>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
          <SkeletonCard rows={2} />
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
          <p className="caption" style={{ color: "var(--warm-charcoal)", margin: "8px 0 0 0" }}>
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
          {/* Summary strip — 4 kolom ringkas di atas semua section. */}
          <section
            className="clay-card feature"
            style={{
              padding: 24,
              background: "var(--warm-cream)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 20,
            }}
          >
            <SummaryStat label="Customer" value={data.customer_name} />
            <SummaryStat label="Produk" value={PRODUCT_LABELS[data.product] ?? data.product} />
            <SummaryStat label="Uang Pertanggungan" value={formatIdr(Number(data.sum_assured))} />
            <SummaryStat label="Masa Perlindungan" value={`${data.coverage_term} tahun`} />
          </section>

          {/* Customer section */}
          <SectionCard title="Customer" icon={<User size={18} />} accentColor="var(--ube-800)">
            <Field label="Nama">{data.customer_name}</Field>
            <Field label="Email">
              {data.customer_email ? (
                <a
                  href={`mailto:${data.customer_email}`}
                  style={{ color: "var(--ube-800)", textDecoration: "none" }}
                >
                  {data.customer_email}
                </a>
              ) : (
                "—"
              )}
            </Field>
            <Field label="NIK" mono>
              {data.customer_nik ?? "—"}
            </Field>
            <Field label="Customer ID" mono>
              <span style={{ fontSize: "0.8rem" }}>{data.customer_id}</span>
            </Field>
          </SectionCard>

          {/* Instansi section — hanya tampil untuk applicant_type=INSTANSI */}
          {data.applicant_type === "INSTANSI" && (
            <SectionCard
              title="Instansi"
              icon={<Building2 size={18} />}
              accentColor="var(--blueberry-800)"
            >
              <Field label="Nama Instansi">{data.company_name ?? "—"}</Field>
              <Field label="NPWP" mono>
                {data.company_npwp ?? "—"}
              </Field>
              <Field label="Bidang Usaha">{data.company_industry ?? "—"}</Field>
              <Field label="Tipe Pendaftaran">
                <span className="clay-badge blueberry">INSTANSI</span>
              </Field>

              {/* Members table — span full width */}
              <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                <p
                  className="caption"
                  style={{
                    color: "var(--warm-silver)",
                    margin: "0 0 8px 0",
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontWeight: 600,
                  }}
                >
                  Peserta ({members.length})
                </p>
                {membersLoading ? (
                  <SkeletonCard rows={3} />
                ) : members.length === 0 ? (
                  <p
                    className="caption"
                    style={{ color: "var(--warm-silver)", margin: 0 }}
                  >
                    Belum ada peserta.
                  </p>
                ) : (
                  <div className="clay-table-wrap" style={{ maxHeight: 360 }}>
                    <table className="clay-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>No</th>
                          <th>Nama</th>
                          <th>NIK</th>
                          <th>Email</th>
                          <th>No. HP</th>
                          <th>Beneficiary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m, idx) => (
                          <tr key={m.member_id}>
                            <td>{idx + 1}</td>
                            <td>{m.full_name}</td>
                            <td className="mono" style={{ fontSize: "0.8rem" }}>
                              {m.nik ?? "—"}
                            </td>
                            <td>{m.email ?? "—"}</td>
                            <td>{m.mobile_number ?? "—"}</td>
                            <td>{m.beneficiary_name ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Invoice section + download button */}
          <SectionCard
            title="Invoice"
            icon={<Receipt size={18} />}
            accentColor="var(--lemon-700)"
          >
            {data.invoice_no ? (
              <>
                <Field label="No. Invoice" mono>
                  {data.invoice_no}
                </Field>
                <Field label="Status">
                  {data.invoice_status ? <StatusBadge status={data.invoice_status} /> : "—"}
                </Field>
                <Field label="Premi">{formatIdr(Number(data.premium_amount ?? 0))}</Field>
                <Field label="Jatuh Tempo">{formatDate(data.due_date)}</Field>
                <Field label="Dibuat">{formatDateTime(data.invoice_created_at)}</Field>
                {data.invoice_paid_at && (
                  <Field label="Dibayar">{formatDateTime(data.invoice_paid_at)}</Field>
                )}
                {data.invoice_id && (
                  <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                    <AdminDownloadButton
                      path={`/admin/invoices/${data.invoice_id}/pdf`}
                      label="📄 Invoice PDF"
                      title="Download invoice PDF"
                    />
                  </div>
                )}
              </>
            ) : (
              <p
                className="caption"
                style={{ color: "var(--warm-silver)", margin: 0, gridColumn: "1 / -1" }}
              >
                Invoice belum dibuat.
              </p>
            )}
          </SectionCard>

          {/* Bukti Pembayaran — hanya tampil kalau invoice PAID */}
          {data.invoice_id && data.invoice_status === "PAID" && (
            <SectionCard
              title="Bukti Pembayaran"
              icon={<FileCheck size={18} />}
              accentColor="var(--matcha-600)"
            >
              <Field label="No. Invoice" mono>
                {data.invoice_no}
              </Field>
              <Field label="Tanggal Bayar">{formatDateTime(data.invoice_paid_at)}</Field>
              <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                <AdminDownloadButton
                  path={`/admin/invoices/${data.invoice_id}/receipt`}
                  label="🧾 Bukti Pembayaran PDF"
                  title="Download bukti pembayaran PDF"
                  variant="solid-matcha"
                />
              </div>
            </SectionCard>
          )}

          {/* Polis section + download button */}
          <SectionCard
            title="Polis"
            icon={<Shield size={18} />}
            accentColor="var(--matcha-600)"
          >
            {data.policy_no ? (
              <>
                <Field label="No. Polis" mono>
                  {data.policy_no}
                </Field>
                <Field label="Status">
                  {data.policy_status ? <StatusBadge status={data.policy_status} /> : "—"}
                </Field>
                <Field label="Plan">
                  {data.plan_code
                    ? TIER_LABELS[data.plan_code.split("_").pop() ?? ""] ?? data.plan_code
                    : "—"}
                </Field>
                <Field label="Mulai">{formatDate(data.policy_effective_date)}</Field>
                <Field label="Berakhir">{formatDate(data.policy_expiry_date)}</Field>
                {data.policy_id && (
                  <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                    <AdminDownloadButton
                      path={`/admin/policies/${data.policy_id}/pdf`}
                      label="📄 Polis PDF"
                      title="Download e-policy PDF"
                      variant="solid-ube"
                    />
                  </div>
                )}
              </>
            ) : (
              <p
                className="caption"
                style={{ color: "var(--warm-silver)", margin: 0, gridColumn: "1 / -1" }}
              >
                Polis belum terbit. Selesaikan pembayaran untuk menerbitkan polis.
              </p>
            )}
          </SectionCard>

          {/* Sticky action bar */}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "space-between",
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            <Link
              href="/admin/registrations"
              className="clay-button ghost"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <ArrowLeft size={14} /> Kembali ke daftar
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="clay-button ghost"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Printer size={14} /> Cetak halaman
            </button>
          </div>
        </div>
      )}
    </>
  );
}