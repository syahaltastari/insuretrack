"use client";

/**
 * shadcn-style chart wrappers around recharts.
 *
 * We don't depend on the full shadcn/ui library — the chart "theme" is
 * driven by CSS variables in globals.css, and consumers pass colors
 * directly to recharts props (fill, stroke) using `var(--ube-800)` etc.
 *
 * The two reusable pieces here are:
 *  - <ChartCard>: a styled card with title that wraps any chart.
 *  - <ChartTooltip>: a content formatter that just renders a key-value list.
 *    (Recharts' default tooltip clashes with our light cream canvas.)
 */

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ChartCard({
  title,
  subtitle,
  children,
  height = 260,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  height?: number;
}) {
  return (
    <div className="clay-card feature" style={{ padding: 20, height: height + 80 }}>
      <div style={{ marginBottom: 8 }}>
        <h3 className="feature-title" style={{ margin: 0 }}>
          {title}
        </h3>
        {subtitle && (
          <p
            className="caption"
            style={{ color: "var(--warm-charcoal)", margin: "4px 0 0 0" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}

const TOOLTIP_STYLE = {
  background: "var(--pure-white)",
  border: "1px solid var(--oat-border)",
  borderRadius: "var(--radius-card)",
  padding: "8px 12px",
  fontSize: "0.8rem",
  boxShadow: "0 6px 12px rgba(0, 0, 0, 0.08)",
};

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string | number;
  valueFormatter?: (v: number | string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      {label !== undefined && label !== null && (
        <div
          style={{
            color: "var(--warm-charcoal)",
            fontWeight: 600,
            marginBottom: 4,
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {String(label)}
        </div>
      )}
      {payload.map((p) => (
        <div
          key={p.dataKey ?? p.name}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: p.color ?? p.fill ?? "var(--clay-black)",
              flexShrink: 0,
            }}
          />
          <span style={{ color: "var(--warm-charcoal)" }}>
            {p.name ?? p.dataKey}:
          </span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            {valueFormatter ? valueFormatter(p.value) : String(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  PAID: "var(--matcha-600)",
  SENT: "var(--matcha-600)",
  ACTIVE: "var(--matcha-600)",
  ISSUED: "var(--matcha-600)",
  APPROVED: "var(--matcha-600)",
  ANSWERED: "var(--matcha-600)",
  UNPAID: "var(--lemon-700)",
  PENDING: "var(--lemon-700)",
  UNDER_REVIEW: "var(--lemon-700)",
  QUEUED: "var(--lemon-700)",
  SUBMITTED: "var(--slushie-500)",
  OPEN: "var(--slushie-500)",
  REJECTED: "var(--pomegranate-400)",
  LAPSED: "var(--pomegranate-400)",
  EXPIRED: "var(--pomegranate-400)",
  FAILED: "var(--pomegranate-400)",
  CANCELLED: "var(--pomegranate-400)",
  CLOSED: "var(--oat-light)",
  PAID_OUT: "var(--slushie-500)",
  LIFE: "var(--ube-800)",
  PERSONAL_ACCIDENT: "var(--matcha-600)",
  HEALTH: "var(--lemon-700)",
};

export function statusColor(s: string): string {
  return STATUS_COLORS[s] ?? "var(--warm-silver)";
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function shortMonth(ym: string): string {
  // ym is "YYYY-MM"
  const m = Number(ym.slice(5, 7));
  return MONTH_LABELS[m - 1] ?? ym;
}

// ============================================================================
// Re-exports of recharts primitives for convenience.
// ============================================================================
export {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
};

export const chartFormatters = {
  shortMonth,
  idr: (v: number | string) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(typeof v === "string" ? Number(v) : v),
  idrShort: (v: number | string) => {
    const n = typeof v === "string" ? Number(v) : v;
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
    return `Rp ${n.toLocaleString("id-ID")}`;
  },
  count: (v: number | string) => new Intl.NumberFormat("id-ID").format(Number(v)),
};
