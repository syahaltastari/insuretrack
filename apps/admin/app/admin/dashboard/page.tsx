"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ChartCard,
  ChartTooltip,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Skeleton,
  SkeletonCard,
  Tooltip,
  XAxis,
  YAxis,
  chartFormatters,
  statusColor,
} from "@insuretrack/ui";
import { API_BASE, ApiError } from "@insuretrack/api-client";
import { getAdminToken } from "@insuretrack/api-client";

type Stats = {
  total_registrations: number;
  total_invoices: number;
  total_paid_invoices: number;
  total_unpaid_invoices: number;
  total_policies: number;
  total_premium_collected: string;
};

type BucketCount = { bucket: string; count: number };
type BucketAmount = { bucket: string; amount: string };
type StatusCount = { status: string; count: number };
type Granularity = "day" | "week" | "month";
type Charts = {
  granularity: Granularity;
  from: string;
  to: string;
  registrations_per_period: BucketCount[];
  policies_per_period: BucketCount[];
  revenue_per_period: BucketAmount[];
  invoice_status_breakdown: StatusCount[];
  claim_status_breakdown: StatusCount[];
  policy_product_breakdown: StatusCount[];
};

const SWATCHES: Array<{ key: keyof typeof METRIC_LABEL; color: string }> = [
  { key: "total_registrations", color: "var(--ube-800)" },
  { key: "total_invoices", color: "var(--blueberry-800)" },
  { key: "total_paid_invoices", color: "var(--matcha-600)" },
  { key: "total_unpaid_invoices", color: "var(--lemon-700)" },
  { key: "total_policies", color: "var(--matcha-600)" },
  { key: "total_premium_collected", color: "var(--pomegranate-400)" },
];

const METRIC_LABEL = {
  total_registrations: "Total Registrasi",
  total_invoices: "Total Invoice",
  total_paid_invoices: "Invoice Paid",
  total_unpaid_invoices: "Invoice Unpaid",
  total_policies: "Total Polis",
  total_premium_collected: "Premi Terkumpul",
};

const formatIDR = (n: string | number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(typeof n === "string" ? parseFloat(n) : n);

const STATUS_LABELS: Record<string, string> = {
  PAID: "Paid",
  UNPAID: "Unpaid",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  PENDING: "Pending",
  ISSUED: "Issued",
  ACTIVE: "Active",
  LAPSED: "Lapsed",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAID_OUT: "Paid Out",
  OPEN: "Open",
  ANSWERED: "Answered",
  CLOSED: "Closed",
  LIFE: "Asuransi Jiwa",
  PERSONAL_ACCIDENT: "Kecelakaan Diri",
  HEALTH: "Kesehatan",
};

function labelOf(s: string) {
  return STATUS_LABELS[s] ?? s;
}

const RANGE_OPTIONS: Array<{
  key: string;
  label: string;
  /** days back from today, undefined = no upper bound */
  days?: number;
  /** explicit granularity, undefined = auto */
  granularity?: Granularity;
}> = [
  { key: "7d", label: "7 Hari", days: 7, granularity: "day" },
  { key: "30d", label: "30 Hari", days: 30, granularity: "day" },
  { key: "90d", label: "90 Hari", days: 90, granularity: "week" },
  { key: "12m", label: "12 Bulan", days: 365, granularity: "month" },
];

const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
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

function bucketLabel(ymd: string, granularity: Granularity): string {
  // ymd is "YYYY-MM-DD" (the bucket start).
  const parts = ymd.split("-");
  if (parts.length < 3) return ymd;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (granularity === "day") {
    return `${d} ${MONTH_LABELS[m - 1]}`;
  }
  if (granularity === "week") {
    // Show week start date
    return `${d} ${MONTH_LABELS[m - 1]}`;
  }
  // month
  return `${MONTH_LABELS[m - 1]} '${String(y).slice(2)}`;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState("30d");
  const [loading, setLoading] = useState(true);

  const range = RANGE_OPTIONS.find((r) => r.key === rangeKey) ?? RANGE_OPTIONS[1];

  const load = useCallback(async () => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const today = new Date();
      const from = new Date(today);
      if (range.days) from.setDate(today.getDate() - range.days + 1);
      const params = new URLSearchParams({ from: toYmd(from), to: toYmd(today) });
      if (range.granularity) params.set("granularity", range.granularity);

      const [s, c] = await Promise.all([
        fetch(`${API_BASE}/admin/dashboard/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(async (r) => {
          if (!r.ok) throw new ApiError(r.status, "ERR", "Gagal load stats");
          return r.json();
        }),
        fetch(`${API_BASE}/admin/dashboard/charts?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(async (r) => {
          if (!r.ok) throw new ApiError(r.status, "ERR", "Gagal load charts");
          return r.json();
        }),
      ]);
      setStats(s);
      setCharts(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal load");
    } finally {
      setLoading(false);
    }
  }, [rangeKey]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell>
      <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 8 }}>
        ✦ Ringkasan Operasional
      </p>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Metrik agregat & tren berdasarkan rentang waktu.</p>

      {error && (
        <div
          className="clay-card"
          style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}
        >
          ⚠ {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 24,
          background: "var(--oat-light)",
          padding: 4,
          borderRadius: "var(--radius-card)",
          width: "fit-content",
        }}
      >
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRangeKey(r.key)}
            disabled={loading}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-sharp)",
              border: "none",
              background: r.key === rangeKey ? "var(--pure-white)" : "transparent",
              color: "var(--clay-black)",
              fontSize: "0.85rem",
              fontWeight: r.key === rangeKey ? 600 : 500,
              cursor: loading ? "wait" : "pointer",
              boxShadow:
                r.key === rangeKey ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              transition: "all 150ms ease",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {!stats && !error && (
        <>
          <div className="clay-grid cols-3" style={{ marginBottom: 32 }}>
            {SWATCHES.map((s) => (
              <div
                key={s.key}
                className="clay-card feature"
                style={{ borderLeft: `6px solid ${s.color}`, padding: 24 }}
              >
                <Skeleton width="60%" height={12} style={{ marginBottom: 12 }} />
                <Skeleton width="40%" height={28} />
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 20,
            }}
          >
            <SkeletonCard rows={6} style={{ minHeight: 240 }} />
            <SkeletonCard rows={6} style={{ minHeight: 240 }} />
          </div>
        </>
      )}

      {stats && (
        <>
          <div className="clay-grid cols-3" style={{ marginBottom: 32 }}>
            {SWATCHES.map(({ key, color }) => {
              const raw = (stats as Record<string, unknown>)[key];
              const value =
                key === "total_premium_collected" ? formatIDR(raw as string) : (raw as number);
              return (
                <div
                  key={key}
                  className="clay-card feature"
                  style={{ borderLeft: `6px solid ${color}`, padding: 24 }}
                >
                  <p
                    className="caption"
                    style={{ color: "var(--warm-charcoal)", marginBottom: 4 }}
                  >
                    {METRIC_LABEL[key]}
                  </p>
                  <p style={{ margin: 0, fontSize: "2rem", fontWeight: 600, color }}>
                    {value}
                  </p>
                </div>
              );
            })}
          </div>

          {charts && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 20,
              }}
            >
              <ChartCard
                title="Registrasi per Periode"
                subtitle={`Jumlah pendaftar baru (${charts.granularity})`}
              >
                <ResponsiveContainer>
                  <BarChart
                    data={charts.registrations_per_period}
                    margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="var(--oat-light)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="bucket"
                      tickFormatter={(b) => bucketLabel(b, charts.granularity)}
                      interval="preserveStartEnd"
                      tick={{ fill: "var(--warm-charcoal)", fontSize: 10 }}
                      axisLine={{ stroke: "var(--oat-border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "var(--warm-charcoal)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      content={(p) => (
                        <ChartTooltip
                          {...p}
                          label={bucketLabel(String(p.label ?? ""), charts.granularity)}
                          valueFormatter={chartFormatters.count}
                        />
                      )}
                    />
                    <Bar
                      dataKey="count"
                      name="Registrasi"
                      fill="var(--ube-800)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Polis Diterbitkan"
                subtitle={`Jumlah polis baru (${charts.granularity})`}
              >
                <ResponsiveContainer>
                  <BarChart
                    data={charts.policies_per_period}
                    margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="var(--oat-light)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="bucket"
                      tickFormatter={(b) => bucketLabel(b, charts.granularity)}
                      interval="preserveStartEnd"
                      tick={{ fill: "var(--warm-charcoal)", fontSize: 10 }}
                      axisLine={{ stroke: "var(--oat-border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "var(--warm-charcoal)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      content={(p) => (
                        <ChartTooltip
                          {...p}
                          label={bucketLabel(String(p.label ?? ""), charts.granularity)}
                          valueFormatter={chartFormatters.count}
                        />
                      )}
                    />
                    <Bar
                      dataKey="count"
                      name="Polis"
                      fill="var(--matcha-600)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Premi Terkumpul"
                subtitle={`Total invoice paid per ${charts.granularity === "day" ? "hari" : charts.granularity === "week" ? "minggu" : "bulan"}`}
              >
                <ResponsiveContainer>
                  <LineChart
                    data={charts.revenue_per_period}
                    margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="var(--oat-light)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="bucket"
                      tickFormatter={(b) => bucketLabel(b, charts.granularity)}
                      interval="preserveStartEnd"
                      tick={{ fill: "var(--warm-charcoal)", fontSize: 10 }}
                      axisLine={{ stroke: "var(--oat-border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={chartFormatters.idrShort}
                      tick={{ fill: "var(--warm-charcoal)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                    />
                    <Tooltip
                      content={(p) => (
                        <ChartTooltip
                          {...p}
                          label={bucketLabel(String(p.label ?? ""), charts.granularity)}
                          valueFormatter={chartFormatters.idr}
                        />
                      )}
                    />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      name="Premi"
                      stroke="var(--lemon-700)"
                      strokeWidth={2.5}
                      dot={{ fill: "var(--lemon-700)", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Status Invoice" subtitle="Distribusi status invoice (all-time)">
                <ResponsiveContainer>
                  <PieChart>
                    <Tooltip
                      content={(p) => (
                        <ChartTooltip {...p} valueFormatter={chartFormatters.count} />
                      )}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={48}
                      formatter={(value: unknown) => labelOf(String(value))}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }}
                    />
                    <Pie
                      data={charts.invoice_status_breakdown.map((s) => ({
                        ...s,
                        name: s.status,
                      }))}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="45%"
                      innerRadius="40%"
                      outerRadius="70%"
                      paddingAngle={2}
                    >
                      {charts.invoice_status_breakdown.map((s) => (
                        <Cell key={s.status} fill={statusColor(s.status)} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Produk" subtitle="Distribusi polis per produk (all-time)">
                <ResponsiveContainer>
                  <PieChart>
                    <Tooltip
                      content={(p) => (
                        <ChartTooltip {...p} valueFormatter={chartFormatters.count} />
                      )}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={48}
                      formatter={(value: unknown) => labelOf(String(value))}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }}
                    />
                    <Pie
                      data={charts.policy_product_breakdown.map((s) => ({
                        ...s,
                        name: s.status,
                      }))}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="45%"
                      innerRadius="40%"
                      outerRadius="70%"
                      paddingAngle={2}
                    >
                      {charts.policy_product_breakdown.map((s) => (
                        <Cell key={s.status} fill={statusColor(s.status)} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Status Klaim" subtitle="Distribusi status klaim (all-time)">
                <ResponsiveContainer>
                  <PieChart>
                    <Tooltip
                      content={(p) => (
                        <ChartTooltip {...p} valueFormatter={chartFormatters.count} />
                      )}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={48}
                      formatter={(value: unknown) => labelOf(String(value))}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }}
                    />
                    <Pie
                      data={charts.claim_status_breakdown.map((s) => ({
                        ...s,
                        name: s.status,
                      }))}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="45%"
                      innerRadius="40%"
                      outerRadius="70%"
                      paddingAngle={2}
                    >
                      {charts.claim_status_breakdown.map((s) => (
                        <Cell key={s.status} fill={statusColor(s.status)} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
