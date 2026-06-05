"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { AdminListPage } from "@/components/AdminListPage";
import { StatusBadge } from "@/components/StatusBadge";

type Row = {
  id: string;
  recipient: string;
  email_type: string;
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
};

export default function Page() {
  return (
    <AdminListPage<Row>
      title="Email Log"
      endpoint="/admin/email-logs"
      statusOptions={["SENT", "FAILED", "QUEUED"]}
      columns={[
        { key: "email_type", label: "Tipe", hideOnMobile: true },
        { key: "recipient", label: "Penerima" },
        { key: "subject", label: "Subjek" },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        {
          key: "sent_at",
          label: "Tgl Kirim",
          hideOnMobile: true,
          render: (r) => (r.sent_at ? new Date(r.sent_at).toLocaleString("id-ID") : "—"),
        },
      ]}
    />
  );
}
