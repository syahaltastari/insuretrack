"use client";

import { AdminListPage } from "@/components/AdminListPage";

type Row = {
  id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

export default function Page() {
  return (
    <AdminListPage<Row>
      title="Audit Trail"
      endpoint="/admin/audit-logs"
      searchPlaceholder="Cari (actor, action, entity_type)..."
      columns={[
        {
          key: "created_at",
          label: "Waktu",
          render: (r) => new Date(r.created_at).toLocaleString("id-ID"),
        },
        { key: "actor", label: "Actor" },
        { key: "action", label: "Action" },
        { key: "entity_type", label: "Entity" },
        { key: "entity_id", label: "Entity ID", render: (r) => r.entity_id?.slice(0, 8) ?? "—" },
        {
          key: "metadata",
          label: "Metadata",
          render: (r) => (r.metadata ? <code style={{ fontSize: "0.75rem" }}>{JSON.stringify(r.metadata)}</code> : "—"),
        },
      ]}
    />
  );
}
