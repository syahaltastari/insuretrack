"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { AdminListPage } from "@/components/AdminListPage";
import { StatusBadge } from "@/components/StatusBadge";

type Row = {
  id: string;
  policy_no: string;
  registration_no: string;
  customer_name: string;
  product: string;
  sum_assured: string;
  premium: string;
  effective_date: string;
  expiry_date: string;
  status: string;
  pdf_path: string | null;
};

export default function Page() {
  return (
    <AdminListPage<Row>
      title="Polis"
      endpoint="/admin/policies"
      statusOptions={["ACTIVE", "LAPSED", "EXPIRED"]}
      pdfDownloadPath={(r) => (r.pdf_path ? `/admin/policies/${r.id}/pdf` : null)}
      columns={[
        { key: "policy_no", label: "No. Polis" },
        { key: "customer_name", label: "Nama" },
        { key: "product", label: "Produk" },
        {
          key: "sum_assured",
          label: "UP",
          render: (r) => new Intl.NumberFormat("id-ID").format(Number(r.sum_assured)),
        },
        { key: "effective_date", label: "Efektif" },
        { key: "expiry_date", label: "Berakhir" },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
