"use client";

import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { API_BASE } from "@/lib/api";
import { getCustomerToken } from "@/lib/auth";

type Policy = {
  id: string;
  policy_no: string;
  product: string;
  sum_assured: string;
  effective_date: string;
  expiry_date: string;
  status: string;
};

export default function NewClaimPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policyId, setPolicyId] = useState("");
  const [claimType, setClaimType] = useState("ACCIDENT");
  const [incidentDate, setIncidentDate] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [description, setDescription] = useState("");
  const [docs, setDocs] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return;
    fetch(`${API_BASE}/customer/policies?status=ACTIVE&page=1&page_size=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => {
        const list: Policy[] = j.data ?? [];
        setPolicies(list);
        if (list.length > 0) setPolicyId(list[0].id);
      });
  }, []);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setDocs(Array.from(e.target.files));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!policyId) return setError("Pilih polis terlebih dahulu.");
    if (!incidentDate) return setError("Tanggal insiden wajib diisi.");
    if (Number(claimedAmount) <= 0) return setError("Jumlah klaim harus > 0.");

    setSubmitting(true);
    try {
      const token = getCustomerToken();
      if (!token) throw new Error("Belum login");

      const fd = new FormData();
      fd.append(
        "data",
        JSON.stringify({
          policy_id: policyId,
          claim_type: claimType,
          incident_date: incidentDate,
          claimed_amount: Number(claimedAmount),
          description,
        }),
      );
      for (const f of docs) fd.append("documents", f);

      const r = await fetch(`${API_BASE}/customer/claims`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error?.message ?? "Gagal submit klaim");
      router.replace("/portal/claims");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalShell>
      <p className="uppercase-label" style={{ color: "var(--pomegranate-400)", marginBottom: 8 }}>
        ✦ Klaim Baru
      </p>
      <h1 className="page-title">Ajukan Klaim</h1>
      <p className="page-subtitle">Lengkapi formulir di bawah. Lampirkan bukti jika ada.</p>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}

      {policies.length === 0 ? (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Anda belum memiliki polis aktif untuk diklaim.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="clay-card feature" style={{ maxWidth: 640, display: "grid", gap: 16 }}>
          <Field label="Polis">
            <select value={policyId} onChange={(e) => setPolicyId(e.target.value)} className="clay-select">
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.policy_no} — {p.product} (UP: {new Intl.NumberFormat("id-ID").format(Number(p.sum_assured))})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipe Klaim">
            <input value={claimType} onChange={(e) => setClaimType(e.target.value)} className="clay-input" required />
          </Field>
          <Field label="Tanggal Insiden">
            <input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} className="clay-input" required />
          </Field>
          <Field label="Jumlah Klaim (Rp)">
            <input type="number" min="1" value={claimedAmount} onChange={(e) => setClaimedAmount(e.target.value)} className="clay-input" required />
          </Field>
          <Field label="Deskripsi">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="clay-textarea"
              required
            />
          </Field>
          <Field label="Dokumen Pendukung (opsional, JPG/PNG/PDF, max 5MB)">
            <input type="file" multiple accept="image/jpeg,image/png,application/pdf" onChange={onFile} className="clay-input" style={{ padding: 12 }} />
            {docs.length > 0 && (
              <p className="caption" style={{ color: "var(--warm-charcoal)", marginTop: 8 }}>
                {docs.length} file dipilih
              </p>
            )}
          </Field>
          <button
            type="submit"
            disabled={submitting}
            className="clay-button solid-pomegranate size-large"
            style={{ marginTop: 8 }}
          >
            {submitting ? "Mengirim..." : "Kirim Klaim →"}
          </button>
        </form>
      )}
    </PortalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="clay-label">{label}</label>
      {children}
    </div>
  );
}
