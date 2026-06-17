"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { AdminListPage } from "@/components/AdminListPage";
import { StatusBadge } from "@insuretrack/ui";

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
        { key: "email_type", label: "Tipe", width: "170px", hideOnMobile: true },
        { key: "recipient", label: "Penerima", width: "220px" },
        { key: "subject", label: "Subjek", width: "240px" },
        { key: "status", label: "Status", width: "110px", render: (r) => <StatusBadge status={r.status} /> },
        {
          key: "error_message",
          label: "Error",
          width: "280px",
          hideOnMobile: true,
          render: (r) =>
            r.error_message ? (
              <span
                title={r.error_message}
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  color: "var(--pomegranate-400)",
                  fontSize: "0.8rem",
                }}
              >
                {r.error_message}
              </span>
            ) : (
              <span style={{ color: "var(--warm-silver)" }}>—</span>
            ),
        },
        {
          key: "sent_at",
          label: "Tgl Kirim",
          width: "140px",
          hideOnMobile: true,
          render: (r) => (r.sent_at ? new Date(r.sent_at).toLocaleString("id-ID") : "—"),
        },
      ]}
    />
  );
}
