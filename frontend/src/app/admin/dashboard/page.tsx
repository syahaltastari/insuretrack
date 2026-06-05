"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
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
  Tooltip,
  XAxis,
  YAxis,
  chartFormatters,
  statusColor,
} from "@/components/Chart";
import { API_BASE, ApiError } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

type Stats = {
  total_registrations: number;
  total_invoices: number;
  total_paid_invoices: number;
  total_unpaid_invoices: number;
  total_policies: number;
  total_premium_collected: string;
};

type MonthCount = { month: string; count: number };
type MonthAmount = { month: string; amount: string };
type StatusCount = { status: string; count: number };
type Charts = {
  registrations_per_month: MonthCount[];
  policies_per_month: MonthCount[];
  revenue_per_month: MonthAmount[];
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

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    (async () => {
      try {
        const [s, c] = await Promise.all([
          fetch(`${API_BASE}/admin/dashboard/stats`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(async (r) => {
            if (!r.ok) throw new ApiError(r.status, "ERR", "Gagal load stats");
            return r.json();
          }),
          fetch(`${API_BASE}/admin/dashboard/charts`, {
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
      }
    })();
  }, []);

  return (
    <AdminShell>
      <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 8 }}>
        ✦ Ringkasan Operasional
      </p>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Metrik agregat & tren 12 bulan terakhir.</p>

      {error && (
        <div
          className="clay-card"
          style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}
        >
          ⚠ {error}
        </div>
      )}
      {!stats && !error && <p>Memuat...</p>}

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
              <ChartCard title="Registrasi 12 Bulan" subtitle="Jumlah pendaftar baru per bulan">
                <ResponsiveContainer>
                  <BarChart
                    data={charts.registrations_per_month}
                    margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="var(--oat-light)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={chartFormatters.shortMonth}
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
                          label={chartFormatters.shortMonth(String(p.label ?? ""))}
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

              <ChartCard title="Polis Diterbitkan" subtitle="Jumlah polis baru per bulan">
                <ResponsiveContainer>
                  <BarChart
                    data={charts.policies_per_month}
                    margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="var(--oat-light)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={chartFormatters.shortMonth}
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
                          label={chartFormatters.shortMonth(String(p.label ?? ""))}
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

              <ChartCard title="Premi Terkumpul" subtitle="Total invoice paid per bulan">
                <ResponsiveContainer>
                  <LineChart
                    data={charts.revenue_per_month}
                    margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="var(--oat-light)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={chartFormatters.shortMonth}
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
                          label={chartFormatters.shortMonth(String(p.label ?? ""))}
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

              <ChartCard title="Status Invoice" subtitle="Distribusi status invoice">
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

              <ChartCard title="Produk" subtitle="Distribusi polis per produk">
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

              <ChartCard title="Status Klaim" subtitle="Distribusi status klaim">
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
