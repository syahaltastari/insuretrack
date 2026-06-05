"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AdminShell } from "@/components/AdminShell";
import { StatusBadge } from "@/components/StatusBadge";
import { FormField, FormError } from "@/lib/forms";
import { API_BASE } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

type Claim = {
  id: string;
  claim_no: string;
  policy_no: string;
  customer_name: string;
  claim_type: string;
  incident_date: string;
  claimed_amount: string;
  status: string;
  decision_note: string | null;
  submitted_at: string;
};

const decisionNoteSchema = z.object({
  decision_note: z
    .string()
    .max(2000, "Catatan maksimal 2000 karakter")
    .optional()
    .or(z.literal("")),
});
type DecisionNoteValues = z.infer<typeof decisionNoteSchema>;

function ClaimCard({ claim, onUpdated }: { claim: Claim; onUpdated: () => void }) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const methods = useForm<DecisionNoteValues>({
    resolver: zodResolver(decisionNoteSchema) as never,
    defaultValues: { decision_note: "" },
    mode: "onSubmit",
  });

  const update = async (values: DecisionNoteValues, status: string) => {
    const token = getAdminToken();
    if (!token) return;
    setSubmitting(status);
    setFormError(null);
    try {
      const r = await fetch(`${API_BASE}/admin/claims/${claim.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          status,
          decision_note: values.decision_note?.trim() || null,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      methods.reset({ decision_note: "" });
      onUpdated();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setSubmitting(null);
    }
  };

  const onSubmit = (status: string) => methods.handleSubmit((v) => update(v, status));

  return (
    <div className="clay-card feature" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <p
            className="mono"
            style={{ fontSize: "0.85rem", color: "var(--warm-silver)", margin: 0 }}
          >
            {claim.claim_no}
          </p>
          <h3 className="feature-title" style={{ marginTop: 4, marginBottom: 4 }}>
            {claim.customer_name} · {claim.claim_type}
          </h3>
          <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Polis <span className="mono">{claim.policy_no}</span> · Insiden {claim.incident_date} ·
            Klaim {new Intl.NumberFormat("id-ID").format(Number(claim.claimed_amount))}
          </p>
        </div>
        <StatusBadge status={claim.status} />
      </div>

      <FormField
        label="Catatan keputusan (opsional)"
        name="decision_note"
        hint="Akan di-email ke customer"
      >
        <input
          className="clay-input"
          autoComplete="off"
          disabled={submitting !== null}
          {...methods.register("decision_note")}
        />
      </FormField>

      <FormError message={formError} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {claim.status === "SUBMITTED" && (
          <button
            className="clay-button solid-ube size-small"
            onClick={onSubmit("UNDER_REVIEW")}
            disabled={submitting !== null}
          >
            {submitting === "UNDER_REVIEW" ? "Memproses..." : "→ Under Review"}
          </button>
        )}
        {claim.status === "UNDER_REVIEW" && (
          <>
            <button
              className="clay-button solid-matcha size-small"
              onClick={onSubmit("APPROVED")}
              disabled={submitting !== null}
            >
              {submitting === "APPROVED" ? "Memproses..." : "✓ Approve"}
            </button>
            <button
              className="clay-button solid-pomegranate size-small"
              onClick={onSubmit("REJECTED")}
              disabled={submitting !== null}
            >
              {submitting === "REJECTED" ? "Memproses..." : "✗ Reject"}
            </button>
          </>
        )}
        {claim.status === "APPROVED" && (
          <button
            className="clay-button solid-slushie size-small"
            onClick={onSubmit("PAID")}
            disabled={submitting !== null}
          >
            {submitting === "PAID" ? "Memproses..." : "Mark as Paid"}
          </button>
        )}
        {claim.status === "REJECTED" || claim.status === "PAID" ? (
          <span className="caption" style={{ color: "var(--warm-silver)" }}>
            Status final.
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminClaimsPage() {
  const [data, setData] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = () => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/admin/claims?page=1&page_size=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => setData(j.data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <AdminShell>
      <p className="uppercase-label" style={{ color: "var(--pomegranate-400)", marginBottom: 8 }}>
        ✦ Review Klaim
      </p>
      <h1 className="page-title">Klaim Customer</h1>
      <p className="page-subtitle">
        Tinjau klaim dan ubah status. Transisi yang valid sesuai state machine (spec §10.4).
      </p>

      {error && (
        <div
          className="clay-card"
          style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}
        >
          ⚠ {error}
        </div>
      )}
      {loading && <p>Memuat...</p>}

      {!loading && data.length === 0 && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada klaim masuk.
          </p>
        </div>
      )}

      {!loading && data.map((c) => <ClaimCard key={c.id} claim={c} onUpdated={() => setRefreshKey((k) => k + 1)} />)}
    </AdminShell>
  );
}
