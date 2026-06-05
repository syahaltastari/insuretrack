"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { AdminListPage } from "@/components/AdminListPage";
import { StatusBadge } from "@/components/StatusBadge";

type Row = {
  id: string;
  registration_no: string;
  customer_name: string;
  customer_email: string;
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
        { key: "registration_no", label: "No. Registrasi" },
        { key: "customer_name", label: "Nama" },
        { key: "customer_email", label: "Email", hideOnMobile: true },
        { key: "product", label: "Produk", hideOnMobile: true },
        {
          key: "sum_assured",
          label: "UP",
          hideOnMobile: true,
          render: (r) => new Intl.NumberFormat("id-ID").format(Number(r.sum_assured)),
        },
        { key: "coverage_term", label: "Tahun", hideOnMobile: true },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        {
          key: "created_at",
          label: "Tgl",
          hideOnMobile: true,
          render: (r) => new Date(r.created_at).toLocaleDateString("id-ID"),
        },
      ]}
    />
  );
}
