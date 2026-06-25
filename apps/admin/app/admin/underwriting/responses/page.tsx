"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@insuretrack/ui";
import { apiFetch } from "@insuretrack/api-client";

type ResponseRow = {
  id: string;
  registration_no: string;
  customer_name: string | null;
  product: string;
  age: number | null;
  bmi: number | null;
  risk_tier: string;
  premium_multiplier: number;
  decision: string;
  decision_reason: string;
  override_tier: string | null;
  override_multiplier: number | null;
  created_at: string;
};

const TIER_COLORS: Record<string, string> = {
  standard: "matcha",
  loaded: "lemon",
  heavily_loaded: "pomegranate",
  declined: "ube",
};

const TIER_LABELS: Record<string, string> = {
  standard: "Standard",
  loaded: "Loaded",
  heavily_loaded: "Heavy",
  declined: "Declined",
};

const DECISION_LABELS: Record<string, string> = {
  auto_approved: "Auto-Approved",
  auto_declined: "Auto-Declined",
};

export default function UnderwritingResponsesPage() {
  const [data, setData] = useState<ResponseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [productFilter, setProductFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: "20",
        });
        if (productFilter) params.set("product", productFilter);
        if (decisionFilter) params.set("status", decisionFilter);
        const res = await apiFetch<{
          data: ResponseRow[];
          total: number;
          page: number;
          page_size: number;
        }>(`/admin/underwriting/responses?${params}`);
        setData(res.data);
        setTotal(res.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat data");
      } finally {
        setLoading(false);
      }
    })();
  }, [page, productFilter, decisionFilter]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="card-heading">Underwriting Responses</h1>
          <p className="caption mt-1 text-stone-500">
            Daftar submission kuesioner underwriting. Click row untuk
            lihat detail & override.
          </p>
        </div>
        <Link
          href="/admin/underwriting"
          className="text-sm text-honey-700 underline underline-offset-4"
        >
          ← Kembali ke Config
        </Link>
      </header>

      <div className="flex flex-wrap gap-3">
        <select
          value={productFilter}
          onChange={(e) => {
            setProductFilter(e.target.value);
            setPage(1);
          }}
          className="clay-select"
        >
          <option value="">Semua produk</option>
          <option value="LIFE">Life</option>
          <option value="HEALTH">Health</option>
          <option value="PERSONAL_ACCIDENT">Personal Accident</option>
        </select>
        <select
          value={decisionFilter}
          onChange={(e) => {
            setDecisionFilter(e.target.value);
            setPage(1);
          }}
          className="clay-select"
        >
          <option value="">Semua keputusan</option>
          <option value="auto_approved">Auto-Approved</option>
          <option value="auto_declined">Auto-Declined</option>
        </select>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-stone-500">
          <Icon name="Loader2" className="animate-spin" /> Memuat…
        </div>
      )}
      {error && <div className="text-pomegranate-700">Error: {error}</div>}

      {!loading && !error && data.length === 0 && (
        <div className="clay-card p-8 text-center text-stone-500">
          Belum ada underwriting response.
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <div className="clay-card overflow-x-auto p-0">
          <table className="clay-table w-full">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Profil</th>
                <th>Tier</th>
                <th>Decision</th>
                <th>Override</th>
                <th>Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const effectiveTier = r.override_tier ?? r.risk_tier;
                const effectiveMult = r.override_multiplier ?? r.premium_multiplier;
                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => {
                      window.location.href = `/admin/underwriting/responses/${r.id}`;
                    }}
                  >
                    <td className="mono text-xs">
                      {r.registration_no}
                    </td>
                    <td>{r.customer_name ?? "—"}</td>
                    <td>
                      <span className="caption text-stone-600">
                        {r.product}
                      </span>
                    </td>
                    <td className="caption text-stone-600">
                      {r.age !== null ? `${r.age} tahun` : "—"}
                      {r.bmi !== null ? ` · BMI ${r.bmi}` : ""}
                    </td>
                    <td>
                      <span className={`clay-badge ${TIER_COLORS[effectiveTier]}`}>
                        {TIER_LABELS[effectiveTier] ?? effectiveTier} · ×
                        {effectiveMult.toFixed(2)}
                      </span>
                    </td>
                    <td className="caption">
                      {DECISION_LABELS[r.decision] ?? r.decision}
                    </td>
                    <td>
                      {r.override_tier ? (
                        <span className="caption text-honey-700">
                          Ya (×{r.override_multiplier?.toFixed(2)})
                        </span>
                      ) : (
                        <span className="caption text-stone-400">—</span>
                      )}
                    </td>
                    <td className="caption text-stone-500">
                      {new Date(r.created_at).toLocaleString("id-ID")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > 20 && (
        <div className="flex items-center justify-between">
          <span className="caption text-stone-500">
            Halaman {page} dari {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="clay-button outline-honey size-small disabled:opacity-50"
            >
              ← Sebelumnya
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="clay-button outline-honey size-small disabled:opacity-50"
            >
              Berikutnya →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}