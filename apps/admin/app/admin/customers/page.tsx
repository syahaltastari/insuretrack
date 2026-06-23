"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { AdminListPage } from "@/components/AdminListPage";
import { StatusBadge } from "@insuretrack/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AdminCustomer } from "@insuretrack/api-client";

export default function Page() {
  return (
    <AdminListPage<AdminCustomer>
      title="Customer"
      endpoint="/admin/customers"
      detailBasePath="/admin/customers"
      searchPlaceholder="Cari nama, email, NIK, atau HP..."
      // ?status= → portal_status (PENDING|ACTIVE)
      statusOptions={["PENDING", "ACTIVE"]}
      statusFilterLabel="Portal"
      dateField={[
        { value: "created_at", label: "Tgl Daftar" },
        { value: "last_login_at", label: "Login Terakhir" },
      ]}
      defaultDateField="created_at"
      sortableColumns={[
        { value: "created_at", label: "Tgl Daftar" },
        { value: "email", label: "Email" },
        { value: "full_name", label: "Nama" },
        { value: "last_login_at", label: "Login Terakhir" },
      ]}
      // Filter is_active terpisah dari `status` (yang di sini = portal_status)
      // supaya chip-nya tidak bentrok dan URL tetap shareable.
      booleanFilter={{
        paramName: "active",
        label: "Akun",
        options: [
          { value: "", label: "Semua" },
          { value: "true", label: "Aktif" },
          { value: "false", label: "Nonaktif" },
        ],
      }}
      columns={[
        {
          key: "full_name",
          label: "Nama",
          width: "180px",
          sortValue: "full_name",
        },
        {
          key: "email",
          label: "Email",
          width: "220px",
          hideOnMobile: true,
          sortValue: "email",
          render: (c) => <span style={{ fontSize: "0.85rem" }}>{c.email}</span>,
        },
        {
          key: "mobile_number",
          label: "HP",
          width: "140px",
          hideOnMobile: true,
          render: (c) =>
            c.mobile_number ? (
              <code style={{ fontSize: "0.8rem" }}>{c.mobile_number}</code>
            ) : (
              <span style={{ color: "var(--warm-silver)" }}>—</span>
            ),
        },
        {
          key: "nik",
          label: "NIK",
          width: "180px",
          hideOnMobile: true,
          render: (c) =>
            c.nik ? (
              <code className="mono" style={{ fontSize: "0.75rem" }}>
                {c.nik}
              </code>
            ) : (
              <span style={{ color: "var(--warm-silver)" }}>—</span>
            ),
        },
        {
          key: "portal_status",
          label: "Portal",
          width: "100px",
          render: (c) =>
            c.portal_status ? (
              <StatusBadge status={c.portal_status} />
            ) : (
              <span style={{ color: "var(--warm-silver)" }}>—</span>
            ),
        },
        {
          key: "is_active",
          label: "Aktif",
          width: "90px",
          render: (c) =>
            c.is_active ? (
              <span className="clay-badge matcha">Aktif</span>
            ) : (
              <span className="clay-badge muted">Nonaktif</span>
            ),
        },
        {
          key: "last_login_at",
          label: "Login Terakhir",
          width: "160px",
          hideOnMobile: true,
          sortValue: "last_login_at",
          render: (c) => formatDateTime(c.last_login_at),
        },
        {
          key: "created_at",
          label: "Tgl Daftar",
          width: "120px",
          hideOnMobile: true,
          sortValue: "created_at",
          render: (c) => formatDate(c.created_at),
        },
      ]}
    />
  );
}