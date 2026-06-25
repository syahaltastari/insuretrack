"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, X } from "lucide-react";
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
  DateRangePicker,
  type DateRangeValue,
  FilterSelect,
  FilterChipBar,
  type FilterChip,
} from "@insuretrack/ui";
import { apiFetch, formatIdr } from "@insuretrack/api-client";
import { Reveal, StaggerGroup } from "@/components/Reveal";

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

type Snapshot = {
  total_registrations: number;
  total_invoices: number;
  total_paid_invoices: number;
  total_unpaid_invoices: number;
  total_policies: number;
  total_premium_collected: string;
};

type Comparison = {
  as_of: string;
  current: Snapshot;
  previous: Snapshot;
};

type Charts = {
  granularity: Granularity;
  from: string;
  to: string;
  product: string | null;
  applicant_type: string | null;
  registrations_per_period: BucketCount[];
  policies_per_period: BucketCount[];
  revenue_per_period: BucketAmount[];
  invoice_status_breakdown: StatusCount[];
  claim_status_breakdown: StatusCount[];
  policy_product_breakdown: StatusCount[];
  comparison: Comparison | null;
};

const SWATCHES: Array<{ key: keyof Stats; color: string; isCurrency: boolean }> = [
  { key: "total_registrations", color: "var(--ube-800)", isCurrency: false },
  { key: "total_invoices", color: "var(--blueberry-800)", isCurrency: false },
  { key: "total_paid_invoices", color: "var(--matcha-600)", isCurrency: false },
  { key: "total_unpaid_invoices", color: "var(--lemon-700)", isCurrency: false },
  { key: "total_policies", color: "var(--matcha-600)", isCurrency: false },
  { key: "total_premium_collected", color: "var(--pomegranate-400)", isCurrency: true },
];

const METRIC_LABEL: Record<keyof Stats, string> = {
  total_registrations: "Total Registrasi",
  total_invoices: "Total Invoice",
  total_paid_invoices: "Invoice Paid",
  total_unpaid_invoices: "Invoice Unpaid",
  total_policies: "Total Polis",
  total_premium_collected: "Premi Terkumpul",
};

const STATUS_LABELS: Record<string, string> = {
  PAID: "Paid",
  UNPAID: "Unpaid",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  PENDING: "Pending",
  ISSUED: "Issued",
  ACTIVE: "Active",
  LAPSED: "Lapsed",
  EXPIRED_POLICY: "Expired",
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

const PRODUCT_LABELS: Record<string, string> = {
  LIFE: "Asuransi Jiwa",
  PERSONAL_ACCIDENT: "Kecelakaan Diri",
  HEALTH: "Kesehatan",
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function bucketLabel(ymd: string, granularity: Granularity): string {
  const parts = ymd.split("-");
  if (parts.length < 3) return ymd;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (granularity === "day") return `${d} ${MONTH_LABELS[m - 1]}`;
  if (granularity === "week") return `${d} ${MONTH_LABELS[m - 1]}`;
  return `${MONTH_LABELS[m - 1]} '${String(y).slice(2)}`;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// Hitung selisih absolut & persen antara current vs previous. Return null
// kalau previous = 0 (menghindari division by zero). Tanda persen
// disimpan di `sign`: +1 untuk naik (matcha), -1 untuk turun (pomegranate).
function computeDelta(
  current: number,
  previous: number,
): { delta: number; pct: number | null; sign: 1 | -1 | 0 } {
  const delta = current - previous;
  const pct =
    previous === 0 ? null : Math.round((delta / previous) * 1000) / 10;
  const sign = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  return { delta, pct, sign };
}

function DeltaBadge({
  current,
  previous,
  isCurrency,
}: {
  current: number;
  previous: number;
  isCurrency: boolean;
}) {
  const { delta, pct, sign } = computeDelta(current, previous);
  const color =
    sign === 1
      ? "var(--matcha-600)"
      : sign === -1
        ? "var(--pomegranate-400)"
        : "var(--warm-silver)";
  const Icon = sign === 1 ? ArrowUp : sign === -1 ? ArrowDown : null;
  const display = isCurrency
    ? `${delta >= 0 ? "+" : ""}${formatIdr(Math.abs(delta))}`
    : `${delta >= 0 ? "+" : ""}${delta.toLocaleString("id-ID")}`;
  return (
    <p
      className="caption"
      style={{
        margin: "8px 0 0 0",
        color,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontWeight: 600,
      }}
      title={`vs periode sebelumnya: ${previous.toLocaleString("id-ID")}`}
    >
      {Icon && <Icon size={12} />}
      {display}
      {pct !== null && (
        <span style={{ color: "var(--warm-silver)", fontWeight: 400 }}>
          {" "}
          ({pct >= 0 ? "+" : ""}
          {pct}%)
        </span>
      )}
    </p>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ----- URL-driven state (semua filter di searchParams, shareable) -----
  const dateFromUrl = searchParams.get("date_from") ?? "";
  const dateToUrl = searchParams.get("date_to") ?? "";
  const productFromUrl = searchParams.get("product") ?? "";
  const applicantTypeFromUrl = searchParams.get("applicant_type") ?? "";
  const granularityFromUrl = searchParams.get("granularity") ?? "";
  const compareFromUrl = searchParams.get("compare") === "1";

  const dateRange = useMemo<DateRangeValue | undefined>(() => {
    if (!dateFromUrl) return undefined;
    return { from: fromYmd(dateFromUrl), to: dateToUrl ? fromYmd(dateToUrl) : undefined };
  }, [dateFromUrl, dateToUrl]);

  // ----- Data state -----
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setFilterParams = useCallback(
    (next: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v && v.length > 0) params.set(k, v);
        else params.delete(k);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  // ----- Data fetch (triggered by URL changes) -----
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Charts pakai query param filter lengkap. Stats endpoint saat ini
      // belum accept filter (tetap all-time); comparison di-handle via
      // `compare_with_previous` di charts.
      const params = new URLSearchParams();
      if (dateFromUrl) params.set("from", dateFromUrl);
      if (dateToUrl) params.set("to", dateToUrl);
      if (granularityFromUrl) params.set("granularity", granularityFromUrl);
      if (productFromUrl) params.set("product", productFromUrl);
      if (applicantTypeFromUrl) params.set("applicant_type", applicantTypeFromUrl);
      if (compareFromUrl) params.set("compare_with_previous", "true");

      // Cookie auth: browser auto-attach session, apiFetch auto-attach
      // CSRF token (untuk GET tidak perlu — endpoint ini read-only).
      // Tidak ada `Authorization: Bearer` lagi — tidak ada localStorage
      // token yang harus di-pass manual.
      const [s, c] = await Promise.all([
        apiFetch<Stats>("/admin/dashboard/stats"),
        apiFetch<Charts>(`/admin/dashboard/charts?${params.toString()}`),
      ]);
      setStats(s);
      setCharts(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal load");
    } finally {
      setLoading(false);
    }
  }, [
    dateFromUrl,
    dateToUrl,
    granularityFromUrl,
    productFromUrl,
    applicantTypeFromUrl,
    compareFromUrl,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  // ----- Filter change handlers -----
  const onDateRangeChange = (range: DateRangeValue | undefined) => {
    setFilterParams({
      date_from: range?.from ? toYmd(range.from) : undefined,
      date_to: range?.to ? toYmd(range.to) : undefined,
    });
  };
  const onProductChange = (v: string) => setFilterParams({ product: v || undefined });
  const onApplicantTypeChange = (v: string) =>
    setFilterParams({ applicant_type: v || undefined });
  const onGranularityChange = (v: string) => setFilterParams({ granularity: v || undefined });
  const onCompareToggle = () => setFilterParams({ compare: compareFromUrl ? undefined : "1" });

  const resetAll = () => router.replace(pathname);

  // ----- Active filter chips -----
  const chips: FilterChip[] = [];
  if (dateFromUrl || dateToUrl) {
    const dfLbl = dateFromUrl
      ? `${dateFromUrl.slice(8, 10)} ${MONTH_LABELS[Number(dateFromUrl.slice(5, 7)) - 1]} ${dateFromUrl.slice(0, 4)}`
      : "…";
    const dtLbl = dateToUrl
      ? `${dateToUrl.slice(8, 10)} ${MONTH_LABELS[Number(dateToUrl.slice(5, 7)) - 1]} ${dateToUrl.slice(0, 4)}`
      : "…";
    chips.push({
      key: "date",
      label: `Tanggal: ${dfLbl} – ${dtLbl}`,
      onRemove: () => setFilterParams({ date_from: undefined, date_to: undefined }),
    });
  }
  if (productFromUrl) {
    chips.push({
      key: "product",
      label: `Produk: ${PRODUCT_LABELS[productFromUrl] ?? productFromUrl}`,
      onRemove: () => setFilterParams({ product: undefined }),
    });
  }
  if (applicantTypeFromUrl) {
    chips.push({
      key: "applicant_type",
      label: `Tipe: ${applicantTypeFromUrl === "INDIVIDU" ? "Individu" : "Instansi"}`,
      onRemove: () => setFilterParams({ applicant_type: undefined }),
    });
  }
  if (granularityFromUrl) {
    const labels: Record<string, string> = {
      day: "Harian",
      week: "Mingguan",
      month: "Bulanan",
    };
    chips.push({
      key: "granularity",
      label: `Granularity: ${labels[granularityFromUrl] ?? granularityFromUrl}`,
      onRemove: () => setFilterParams({ granularity: undefined }),
    });
  }
  if (compareFromUrl) {
    chips.push({
      key: "compare",
      label: "Bandingkan periode sebelumnya",
      onRemove: () => setFilterParams({ compare: undefined }),
    });
  }

  return (
    <>
      <Reveal>
        <p className="uppercase-label" style={{ color: "var(--honey-700)", marginBottom: 8 }}>
          ✦ Ringkasan Operasional
        </p>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Metrik agregat & tren berdasarkan rentang waktu.</p>
      </Reveal>

      {error && (
        <div
          className="clay-card"
          style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Filter bar */}
      <Reveal delay={120}>
        <div
          className="clay-card"
          style={{
            padding: 16,
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <DateRangePicker
              value={dateRange}
              onChange={onDateRangeChange}
              ariaLabel="Pilih rentang tanggal"
            />

            <FilterSelect
              label="Produk"
              value={productFromUrl}
              onChange={onProductChange}
              options={[
                { value: "", label: "Semua" },
                { value: "LIFE", label: "Asuransi Jiwa" },
                { value: "PERSONAL_ACCIDENT", label: "Kecelakaan Diri" },
                { value: "HEALTH", label: "Kesehatan" },
              ]}
              ariaLabel="Filter produk"
              width={170}
            />

            <FilterSelect
              label="Tipe Pendaftaran"
              value={applicantTypeFromUrl}
              onChange={onApplicantTypeChange}
              options={[
                { value: "", label: "Semua" },
                { value: "INDIVIDU", label: "Individu" },
                { value: "INSTANSI", label: "Instansi" },
              ]}
              ariaLabel="Filter tipe pendaftaran"
              width={170}
            />

            <FilterSelect
              label="Granularity"
              value={granularityFromUrl}
              onChange={onGranularityChange}
              options={[
                { value: "", label: "Otomatis" },
                { value: "day", label: "Harian" },
                { value: "week", label: "Mingguan" },
                { value: "month", label: "Bulanan" },
              ]}
              ariaLabel="Granularity chart"
              width={150}
            />

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: "var(--radius-card)",
                background: compareFromUrl ? "var(--honey-tint)" : "var(--warm-cream)",
                border: `1px solid ${compareFromUrl ? "var(--honey-400)" : "var(--oat-border)"}`,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "var(--ink)",
                userSelect: "none",
              }}
              title="Tampilkan delta % vs periode sebelumnya"
            >
              <input
                type="checkbox"
                checked={compareFromUrl}
                onChange={onCompareToggle}
                style={{ margin: 0 }}
              />
              Bandingkan periode sebelumnya
            </label>

            {chips.length > 0 && (
              <button
                type="button"
                onClick={resetAll}
                className="clay-button ghost size-small"
                title="Hapus semua filter"
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <X size={14} /> Reset
              </button>
            )}
          </div>

          <FilterChipBar chips={chips} onResetAll={resetAll} />
        </div>
      </Reveal>

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
          <StaggerGroup
            step={60}
            baseDelay={180}
            className="clay-grid cols-3"
          >
            {SWATCHES.map(({ key, color, isCurrency }) => {
              const raw = (stats as Record<string, unknown>)[key];
              const current = isCurrency
                ? Number(raw as string)
                : (raw as number);
              const value = isCurrency ? formatIdr(current) : current.toLocaleString("id-ID");
              // Ambil previous dari comparison (kalau user toggle compare on).
              const prevRaw = charts?.comparison?.previous?.[key as keyof Snapshot];
              const previous = isCurrency
                ? Number(prevRaw as string)
                : (prevRaw as number | undefined);
              return (
                <div
                  key={key}
                  className="clay-card feature clay-card-hoverable"
                  style={{ borderLeft: `6px solid ${color}`, padding: 24 }}
                >
                  <p
                    className="caption"
                    style={{ color: "var(--warm-charcoal)", marginBottom: 4 }}
                  >
                    {METRIC_LABEL[key]}
                  </p>
                  <p style={{ margin: 0, fontSize: "2rem", fontWeight: 600, color: "var(--ink)" }}>
                    {value}
                  </p>
                  {compareFromUrl && previous !== undefined && (
                    <DeltaBadge current={current} previous={previous} isCurrency={isCurrency} />
                  )}
                </div>
              );
            })}
          </StaggerGroup>

          {charts && (
            <StaggerGroup
              step={70}
              baseDelay={580}
              className="chart-grid"
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
            </StaggerGroup>
          )}
        </>
      )}
    </>
  );
}