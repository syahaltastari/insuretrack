// Status badge — pakai CSS variables (clay-badge + status-* modifiers).
// Reference: DESIGN.md §Badges + §Status colors.

const STATUS_MAP: Record<string, string> = {
  // Registrations / Invoices
  PENDING: "pending",
  PAID: "paid",
  ISSUED: "issued",
  CANCELLED: "cancelled",
  UNPAID: "unpaid",
  EXPIRED: "expired",
  // Policies
  ACTIVE: "active",
  LAPSED: "lapsed",
  // Claims (PAID is shared with invoice — same "paid" variant)
  SUBMITTED: "submitted",
  UNDER_REVIEW: "under_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  // Inquiries
  OPEN: "open",
  ANSWERED: "answered",
  CLOSED: "closed",
  // Email log
  SENT: "sent",
  FAILED: "failed",
  QUEUED: "queued",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_MAP[status] ?? "muted";
  return <span className={`clay-badge status-${variant}`}>{status.replace(/_/g, " ")}</span>;
}
