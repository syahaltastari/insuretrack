"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { AdminListPage } from "@/components/AdminListPage";
import { StatusBadge } from "@insuretrack/ui";

type Row = {
  id: string;
  invoice_no: string;
  registration_no: string;
  customer_name: string;
  customer_email: string;
  customer_mobile: string;
  premium_amount: string;
  due_date: string;
  status: string;
  paid_at: string | null;
  pdf_path: string | null;
  created_at: string;
};

export default function Page() {
  return (
    <AdminListPage<Row>
      title="Invoice"
      endpoint="/admin/invoices"
      statusOptions={["UNPAID", "PAID", "EXPIRED", "CANCELLED"]}
      statusFilterLabel="Status invoice"
      pdfDownloadPath={(r) => (r.pdf_path ? `/admin/invoices/${r.id}/pdf` : null)}
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
        { key: "customer_name", label: "Nama", width: "160px", sortValue: "customer_name" },
        {
          key: "customer_email",
          label: "Email",
          width: "220px",
          hideOnMobile: true,
          render: (r) => r.customer_email,
        },
        {
          key: "customer_mobile",
          label: "No. HP",
          width: "140px",
          hideOnMobile: true,
          render: (r) => <code style={{ fontSize: "0.8rem" }}>{r.customer_mobile}</code>,
        },
        {
          key: "premium_amount",
          label: "Premi",
          width: "150px",
          hideOnMobile: true,
          sortValue: "premium_amount",
          render: (r) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(r.premium_amount)),
        },
        { key: "due_date", label: "Jatuh Tempo", width: "120px", hideOnMobile: true, sortValue: "due_date" },
        {
          key: "paid_at",
          label: "Tgl Bayar",
          width: "140px",
          hideOnMobile: true,
          render: (r) => (r.paid_at ? new Date(r.paid_at).toLocaleDateString("id-ID") : "—"),
        },
        { key: "status", label: "Status", width: "110px", render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
