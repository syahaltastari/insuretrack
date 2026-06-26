"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Switch } from "@insuretrack/ui";
import {
  apiFetch,
  type ClaimsSettings,
  type UpdateClaimsSettingsRequest,
} from "@insuretrack/api-client";

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ClaimsSettingsPage() {
  const [data, setData] = useState<ClaimsSettings | null>(null);
  const [draft, setDraft] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty = data !== null && draft !== data.one_active_per_policy;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const j = await apiFetch<ClaimsSettings>("/admin/settings/claims");
      setData(j);
      setDraft(j.one_active_per_policy);
      setSavedAt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat pengaturan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body: UpdateClaimsSettingsRequest = { one_active_per_policy: draft };
      const j = await apiFetch<ClaimsSettings>("/admin/settings/claims", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setData(j);
      setDraft(j.one_active_per_policy);
      setSavedAt(new Date().toLocaleTimeString("id-ID"));
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    if (data) setDraft(data.one_active_per_policy);
    setError(null);
    setSavedAt(null);
  };

  return (
    <>
      <p
        className="uppercase-label"
        style={{ color: "var(--honey-700)", marginBottom: 8 }}
      >
        ✦ Konfigurasi Sistem
      </p>
      <h1 className="page-title">Pengaturan Klaim</h1>
      <p className="page-subtitle">
        Atur aturan klaim yang berlaku untuk semua polis. Perubahan langsung
        effect ke submission klaim berikutnya.
      </p>

      {error && (
        <div
          className="clay-card"
          style={{
            borderColor: "var(--pomegranate-400)",
            background: "#fff5f5",
            marginBottom: 16,
          }}
        >
          ⚠ {error}
        </div>
      )}

      {loading && <p>Memuat...</p>}

      {data && (
        <section
          className="clay-card feature"
          style={{ padding: 24, marginTop: 8, maxWidth: 720 }}
        >
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
            <div>
              <h2 className="card-heading" style={{ marginBottom: 8 }}>
                Klaim Aktif per Polis
              </h2>
              <p
                className="caption"
                style={{ color: "var(--warm-charcoal)", margin: 0 }}
              >
                Aturan ini mencegah customer mengajukan lebih dari satu klaim
                yang sedang diproses untuk polis yang sama. Klaim dianggap
                aktif ketika berstatus SUBMITTED atau UNDER_REVIEW — klaim
                yang sudah APPROVED, PAID, atau REJECTED tidak mengunci slot.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                paddingTop: 8,
                borderTop: "1px solid var(--oat-light)",
              }}
            >
              <Switch
                checked={draft}
                onChange={setDraft}
                ariaLabel="Aktifkan batasan satu klaim aktif per polis"
              />
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {draft ? "Aktif" : "Nonaktif"}
                </p>
                <p
                  className="caption"
                  style={{ color: "var(--warm-silver)", margin: 0 }}
                >
                  {draft
                    ? "Klaim kedua pada polis yang sama akan ditolak dengan pesan 409."
                    : "Customer boleh mengajukan klaim baru meskipun klaim sebelumnya masih diproses."}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
                paddingTop: 8,
                borderTop: "1px solid var(--oat-light)",
              }}
            >
              <div>
                <p className="caption" style={{ margin: 0 }}>
                  Nilai tersimpan
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {data.one_active_per_policy ? "Aktif" : "Nonaktif"}
                </p>
              </div>
              <div>
                <p className="caption" style={{ margin: 0 }}>
                  Terakhir diubah
                </p>
                <p style={{ margin: 0 }}>{fmtDateTime(data.updated_at)}</p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <button
                type="submit"
                className="clay-button solid-honey"
                disabled={!dirty || saving}
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
              <button
                type="button"
                className="clay-button ghost"
                onClick={onReset}
                disabled={!dirty || saving}
              >
                Batal
              </button>
              {savedAt && (
                <span
                  className="caption"
                  style={{ color: "var(--matcha-600)" }}
                >
                  ✓ Tersimpan pukul {savedAt}
                </span>
              )}
            </div>
          </form>
        </section>
      )}

      <section style={{ marginTop: 32, maxWidth: 720 }}>
        <p
          className="caption"
          style={{ color: "var(--warm-silver)", margin: 0 }}
        >
          Perubahan tercatat di Audit Trail dengan action{" "}
          <code>settings_updated</code> dan metadata old/new value.
        </p>
      </section>
    </>
  );
}
