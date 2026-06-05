"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useState } from "react";
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

function MetadataCell({ value }: { value: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!value) return <span style={{ color: "var(--warm-silver)" }}>—</span>;
  const json = JSON.stringify(value, null, 2);
  return (
    <div>
      <button
        type="button"
        className="clay-button ghost size-small"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Sembunyikan" : "Lihat"}
      </button>
      {open && (
        <pre
          style={{
            marginTop: 8,
            padding: 12,
            background: "var(--warm-cream)",
            border: "1px solid var(--oat-border)",
            borderRadius: 8,
            fontSize: "0.75rem",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            maxWidth: 480,
            fontFamily: "var(--font-mono)",
          }}
        >
          {json}
        </pre>
      )}
    </div>
  );
}

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
          width: "180px",
          render: (r) => new Date(r.created_at).toLocaleString("id-ID"),
        },
        { key: "actor", label: "Actor", width: "140px" },
        { key: "action", label: "Action", width: "180px" },
        { key: "entity_type", label: "Entity", width: "120px" },
        {
          key: "entity_id",
          label: "Entity ID",
          width: "110px",
          render: (r) =>
            r.entity_id ? (
              <code style={{ fontSize: "0.75rem" }}>{r.entity_id.slice(0, 8)}</code>
            ) : (
              "—"
            ),
        },
        {
          key: "metadata",
          label: "Metadata",
          render: (r) => <MetadataCell value={r.metadata} />,
        },
      ]}
    />
  );
}
