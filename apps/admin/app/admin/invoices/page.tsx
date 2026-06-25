"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { AdminListPage } from "@/components/AdminListPage";
import { StatusBadge } from "@insuretrack/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatProductPlan } from "@insuretrack/api-client";

type Row = {
  id: string;
  invoice_no: string;
  registration_no: string;
  customer_name: string;
  // null kalau customer PENDING (dibuat via POST /api/public/customers
  // sebelum lengkapi form registrasi — kolom email/mobile di customers
  // nullable per 0008_relax_customer_for_split.sql).
  customer_email: string | null;
  customer_mobile: string | null;
  premium_amount: string;
  due_date: string;
  status: string;
  paid_at: string | null;
  pdf_path: string | null;
  created_at: string;
  /** "INDIVIDU" | "INSTANSI" — lihat 0013_group_registration.sql. */
  applicant_type: "INDIVIDU" | "INSTANSI";
  /** 1 untuk INDIVIDU, N untuk INSTANSI (di-compute di SQL). */
  participant_count: number;
  /** Kode produk (`"LIFE" | "PERSONAL_ACCIDENT" | "HEALTH"`) — lihat
   *  registrations.product (0018_registrations_plan_code.sql). */
  product: string;
  /** Composite plan code (mis. `"LIFE_BASIC"`) — nullable untuk rows
   *  lama sebelum migration 0018. */
  plan_code: string | null;
};

export default function Page() {
  return (
    <AdminListPage<Row>
      title="Invoice"
      endpoint="/admin/invoices"
      detailBasePath="/admin/invoices"
      statusOptions={["UNPAID", "PAID", "EXPIRED", "CANCELLED"]}
      statusFilterLabel="Status invoice"
      pdfDownloadPath={(r) => (r.pdf_path ? `/admin/invoices/${r.id}/pdf` : null)}
      receiptDownloadPath={(r) => (r.status === "PAID" ? `/admin/invoices/${r.id}/receipt` : null)}
      // Date filter: kolom yang paling sering ditanya admin
      // (created_at = "kapan invoice dibuat", due_date = "jatuh tempo",
      // paid_at = "kapan dibayar").
      dateField={[
        { value: "created_at", label: "Tanggal dibuat" },
        { value: "due_date", label: "Jatuh tempo" },
        { value: "paid_at", label: "Tanggal dibayar" },
      ]}
      defaultDateField="created_at"
      sortableColumns={[
        { value: "created_at", label: "Tanggal dibuat" },
        { value: "due_date", label: "Jatuh tempo" },
        { value: "paid_at", label: "Tanggal dibayar" },
        { value: "premium_amount", label: "Premi" },
        { value: "customer_name", label: "Nama customer" },
      ]}
      columns={[
        { key: "invoice_no", label: "No. Invoice", width: "160px", sortValue: "invoice_no" },
        { key: "registration_no", label: "No. Reg", width: "150px", hideOnMobile: true },
        {
          // Produk + plan tier gabung jadi 1 kolom (mis. "Life Insurance — Standard").
          // Helper formatProductPlan handle plan_code null (rows lama).
          key: "product",
          label: "Produk",
          width: "220px",
          hideOnMobile: true,
          render: (r) => (
            <span style={{ color: "var(--warm-charcoal)" }}>
              {formatProductPlan(r.product, r.plan_code)}
            </span>
          ),
        },
        { key: "customer_name", label: "Nama", width: "160px", sortValue: "customer_name" },
        {
          key: "applicant_type",
          label: "Tipe",
          width: "110px",
          render: (r) => (
            <span
              className={`clay-badge ${
                r.applicant_type === "INSTANSI" ? "blueberry" : "ube"
              }`}
            >
              {r.applicant_type === "INSTANSI" ? "Instansi" : "Individu"}
            </span>
          ),
        },
        {
          key: "participant_count",
          label: "Peserta",
          width: "90px",
          render: (r) => (
            <span className="mono">{r.participant_count}</span>
          ),
        },
        {
          key: "customer_email",
          label: "Email",
          width: "220px",
          hideOnMobile: true,
          render: (r) => r.customer_email ?? "—",
        },
        {
          key: "customer_mobile",
          label: "No. HP",
          width: "140px",
          hideOnMobile: true,
          render: (r) => (
            <code style={{ fontSize: "0.8rem" }}>
              {r.customer_mobile ?? "—"}
            </code>
          ),
        },
        {
          key: "premium_amount",
          label: "Premi",
          width: "200px",
          hideOnMobile: true,
          sortValue: "premium_amount",
          render: (r) => formatCurrency(r.premium_amount),
        },
        { key: "due_date", label: "Jatuh Tempo", width: "140px", hideOnMobile: true, sortValue: "due_date", render: (r) => formatDate(r.due_date) },
        {
          key: "paid_at",
          label: "Tgl Bayar",
          width: "160px",
          hideOnMobile: true,
          render: (r) => (r.paid_at ? formatDate(r.paid_at) : "—"),
        },
        { key: "status", label: "Status", width: "110px", render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
