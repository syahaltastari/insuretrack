"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { AdminListPage } from "@/components/AdminListPage";
import { StatusBadge } from "@/components/StatusBadge";

type Row = {
  id: string;
  invoice_no: string;
  registration_no: string;
  customer_name: string;
  premium_amount: string;
  due_date: string;
  status: string;
  paid_at: string | null;
  created_at: string;
};

export default function Page() {
  return (
    <AdminListPage<Row>
      title="Invoice"
      endpoint="/admin/invoices"
      statusOptions={["UNPAID", "PAID", "EXPIRED", "CANCELLED"]}
      columns={[
        { key: "invoice_no", label: "No. Invoice" },
        { key: "registration_no", label: "No. Reg" },
        { key: "customer_name", label: "Nama" },
        {
          key: "premium_amount",
          label: "Premi",
          render: (r) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(r.premium_amount)),
        },
        { key: "due_date", label: "Jatuh Tempo" },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
