"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { AdminListPage } from "@/components/AdminListPage";
import { StatusBadge } from "@insuretrack/ui";
import { formatCurrency, formatDate } from "@/lib/format";

type Row = {
  id: string;
  registration_no: string;
  customer_name: string;
  customer_email: string;
  customer_mobile: string;
  product: string;
  sum_assured: string;
  coverage_term: number;
  status: string;
  created_at: string;
};

export default function Page() {
  return (
    <AdminListPage<Row>
      title="Registrasi"
      endpoint="/admin/registrations"
      detailBasePath="/admin/registrations"
      statusOptions={["PENDING", "PAID", "ISSUED", "CANCELLED"]}
      columns={[
        { key: "registration_no", label: "No. Registrasi", width: "175px" },
        { key: "customer_name", label: "Nama", width: "160px" },
        { key: "customer_email", label: "Email", width: "220px", hideOnMobile: true },
        {
          key: "customer_mobile",
          label: "No. HP",
          width: "140px",
          hideOnMobile: true,
          render: (r) => <code style={{ fontSize: "0.8rem" }}>{r.customer_mobile}</code>,
        },
        { key: "product", label: "Produk", width: "120px", hideOnMobile: true },
        {
          key: "sum_assured",
          label: "UP",
          width: "200px",
          hideOnMobile: true,
          render: (r) => formatCurrency(r.sum_assured),
        },
        { key: "coverage_term", label: "Tahun", width: "90px", hideOnMobile: true },
        { key: "status", label: "Status", width: "110px", render: (r) => <StatusBadge status={r.status} /> },
        {
          key: "created_at",
          label: "Tgl",
          width: "140px",
          hideOnMobile: true,
          render: (r) => formatDate(r.created_at),
        },
      ]}
    />
  );
}
