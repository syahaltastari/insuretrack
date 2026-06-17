"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { AdminListPage } from "@/components/AdminListPage";
import { StatusBadge } from "@insuretrack/ui";

type Row = {
  id: string;
  policy_no: string;
  registration_no: string;
  customer_name: string;
  customer_email: string;
  customer_mobile: string;
  product: string;
  sum_assured: string;
  premium: string;
  effective_date: string;
  expiry_date: string;
  status: string;
  pdf_path: string | null;
  created_at: string;
};

export default function Page() {
  return (
    <AdminListPage<Row>
      title="Polis"
      endpoint="/admin/policies"
      statusOptions={["ACTIVE", "LAPSED", "EXPIRED"]}
      statusFilterLabel="Status polis"
      pdfDownloadPath={(r) => (r.pdf_path ? `/admin/policies/${r.id}/pdf` : null)}
      // Date filter — fokus operasional: cari polis akan expired.
      dateField={[
        { value: "created_at", label: "Tanggal dibuat" },
        { value: "effective_date", label: "Efektif" },
        { value: "expiry_date", label: "Berakhir" },
      ]}
      defaultDateField="created_at"
      // Product filter — 3 produk insurance.
      products={["LIFE", "PERSONAL_ACCIDENT", "HEALTH"]}
      sortableColumns={[
        { value: "created_at", label: "Tanggal dibuat" },
        { value: "effective_date", label: "Efektif" },
        { value: "expiry_date", label: "Berakhir" },
        { value: "sum_assured", label: "Uang pertanggungan" },
        { value: "premium", label: "Premi" },
        { value: "customer_name", label: "Nama customer" },
        { value: "product", label: "Produk" },
      ]}
      columns={[
        { key: "policy_no", label: "No. Polis", width: "160px", sortValue: "policy_no" },
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
        { key: "product", label: "Produk", width: "120px", hideOnMobile: true, sortValue: "product" },
        {
          key: "sum_assured",
          label: "UP",
          width: "140px",
          hideOnMobile: true,
          sortValue: "sum_assured",
          render: (r) => new Intl.NumberFormat("id-ID").format(Number(r.sum_assured)),
        },
        {
          key: "premium",
          label: "Premi",
          width: "140px",
          hideOnMobile: true,
          sortValue: "premium",
          render: (r) => new Intl.NumberFormat("id-ID").format(Number(r.premium)),
        },
        { key: "effective_date", label: "Efektif", width: "110px", hideOnMobile: true, sortValue: "effective_date" },
        { key: "expiry_date", label: "Berakhir", width: "110px", hideOnMobile: true, sortValue: "expiry_date" },
        { key: "status", label: "Status", width: "110px", render: (r) => <StatusBadge status={r.status} /> },
        {
          key: "created_at",
          label: "Tgl Buat",
          width: "110px",
          hideOnMobile: true,
          render: (r) => new Date(r.created_at).toLocaleDateString("id-ID"),
        },
      ]}
    />
  );
}
