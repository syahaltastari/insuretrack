"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Confirm,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SkeletonCard,
  StatusBadge,
} from "@insuretrack/ui";
import {
  apiFetch,
  formatIdr,
  type AdminCustomerDetail,
  type AdminCustomerResetPasswordResponse,
  type ResendActivationResponse,
} from "@insuretrack/api-client";

// ============================================================
// Local presentational helpers
// ============================================================

function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <p
        className="caption"
        style={{
          color: "var(--warm-silver)",
          margin: 0,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0 0",
          color: "var(--clay-black)",
          fontWeight: mono ? 400 : 500,
          fontFamily: mono ? "var(--font-space-mono), monospace" : undefined,
          wordBreak: mono ? "break-all" : undefined,
        }}
      >
        {children}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="clay-card feature" style={{ padding: 24 }}>
      <h2
        className="card-heading"
        style={{ fontSize: "1.1rem", marginBottom: 16, color: "var(--clay-black)" }}
      >
        {title}
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <p
        className="caption"
        style={{
          color: "var(--warm-silver)",
          margin: 0,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0 0",
          fontSize: "1.6rem",
          fontWeight: 700,
          color: accent ?? "var(--clay-black)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================
// Page
// ============================================================

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [data, setData] = useState<AdminCustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ kind: "notfound" | "other"; message: string } | null>(
    null,
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // Reset-password modal — generated plaintext di-hold di local state,
  // TIDAK di-persist. Tutup modal = clear.
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);

  // ---- Fetch detail ----
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const json = await apiFetch<AdminCustomerDetail>(
          `/admin/customers/${id}`,
        );
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (e) {
        // apiFetch throw ApiError(404) untuk not-found — petakan ke UI.
        const err = e as { status?: number; message?: string };
        if (!cancelled) {
          if (err.status === 404) {
            setError({ kind: "notfound", message: "Customer tidak ditemukan." });
          } else {
            setError({
              kind: "other",
              message: err.message ?? "Gagal load detail customer",
            });
          }
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  // ---- Action handlers ----
  // Local thin wrapper around apiFetch — 204 response maps ke `undefined`
  // (cocok dengan T = void / Response yang void). Body FormData di-skip
  // Content-Type (browser set dengan boundary — lihat apiFetch).

  const adminFetchJson = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const result = await apiFetch<T>(path, init);
      return result;
    },
    [],
  );

  const toggleActive = async () => {
    if (!data) return;
    const path = data.is_active ? "deactivate" : "activate";
    try {
      await adminFetchJson(`/admin/customers/${data.id}/${path}`, { method: "POST" });
      toast.success(
        data.is_active
          ? `Customer "${data.full_name}" dinonaktifkan`
          : `Customer "${data.full_name}" diaktifkan`,
      );
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal ubah status");
    }
  };

  const performResetPassword = async () => {
    if (!data) return;
    setResetting(true);
    try {
      const res = await adminFetchJson<AdminCustomerResetPasswordResponse>(
        `/admin/customers/${data.id}/reset-password`,
        { method: "POST" },
      );
      setGeneratedPassword(res.new_password);
      setCopied(false);
      toast.success("Password baru di-generate. Salin sekarang.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal reset password");
    } finally {
      setResetting(false);
    }
  };

  const closeResetModal = () => {
    setGeneratedPassword(null);
    setCopied(false);
  };

  const resendActivation = async () => {
    if (!data) return;
    try {
      const res = await adminFetchJson<ResendActivationResponse>(
        `/admin/customers/${data.id}/resend-activation`,
        { method: "POST" },
      );
      toast.success(`Email aktivasi dikirim ulang ke ${res.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal kirim aktivasi");
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal copy. Silakan salin manual.");
    }
  };

  // ---- Render ----

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/admin/customers"
          style={{
            color: "var(--ube-800)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 12,
            fontSize: "0.85rem",
          }}
        >
          <ArrowLeft size={14} /> Kembali ke daftar customer
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              {data?.full_name ?? "Detail Customer"}
            </h1>
            {data && (
              <p
                className="mono"
                style={{
                  color: "var(--warm-charcoal)",
                  margin: "8px 0 0 0",
                  fontSize: "0.9rem",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span>{data.email}</span>
                {data.portal_status && <StatusBadge status={data.portal_status} />}
                <span
                  className={`clay-badge ${data.is_active ? "matcha" : "muted"}`}
                  style={{ fontSize: "0.7rem" }}
                >
                  {data.is_active ? "Aktif" : "Nonaktif"}
                </span>
              </p>
            )}
          </div>
          {data && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Confirm
                trigger={
                  <Button
                    size="sm"
                    className={
                      data.is_active
                        ? "bg-[var(--pomegranate-400)] text-black hover:opacity-90"
                        : "bg-[var(--matcha-600)] text-white hover:bg-[var(--matcha-800)]"
                    }
                  >
                    {data.is_active ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                }
                title={data.is_active ? "Nonaktifkan Customer?" : "Aktifkan Customer?"}
                description={
                  <p>
                    Customer <strong>"{data.full_name}"</strong>{" "}
                    {data.is_active
                      ? "tidak akan bisa login lagi sampai diaktifkan kembali. Data registrasi/polis/klaim tidak dihapus."
                      : "akan bisa login kembali."}
                  </p>
                }
                confirmLabel={data.is_active ? "Nonaktifkan" : "Aktifkan"}
                destructive={data.is_active}
                onConfirm={toggleActive}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setGeneratedPassword(null);
                  setCopied(false);
                }}
              >
                Reset Password
              </Button>
              {data.portal_status === "PENDING" && (
                <Confirm
                  trigger={
                    <Button
                      size="sm"
                      className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]"
                    >
                      Kirim Ulang Aktivasi
                    </Button>
                  }
                  title="Kirim Ulang Email Aktivasi?"
                  description={
                    <p>
                      Email aktivasi akan dikirim ke <strong>{data.email}</strong>.
                      Link aktivasi berlaku 24 jam.
                    </p>
                  }
                  confirmLabel="Kirim Email"
                  onConfirm={resendActivation}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SkeletonCard rows={3} />
          <SkeletonCard rows={4} />
          <SkeletonCard rows={2} />
        </div>
      )}

      {error && (
        <div
          className="clay-card feature"
          style={{
            padding: 24,
            borderColor: "var(--pomegranate-400)",
            background: "#fff5f5",
          }}
        >
          <p
            className="body"
            style={{ color: "var(--pomegranate-400)", margin: 0, fontWeight: 600 }}
          >
            {error.kind === "notfound" ? "Data tidak ditemukan" : "Gagal memuat data"}
          </p>
          <p className="caption" style={{ color: "var(--warm-charcoal)", margin: "8px 0 0 0" }}>
            {error.message}
          </p>
          <Link
            href="/admin/customers"
            className="clay-button solid-ube size-small"
            style={{ marginTop: 16, display: "inline-block" }}
          >
            ← Kembali
          </Link>
        </div>
      )}

      {data && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Statistik */}
          <section
            className="clay-card feature"
            style={{
              padding: 24,
              background: "var(--warm-cream)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 20,
            }}
          >
            <SummaryStat
              label="Registrasi"
              value={data.registrations_count}
              accent="var(--ube-800)"
            />
            <SummaryStat
              label="Polis"
              value={data.policies_count}
              accent="var(--matcha-800)"
            />
            <SummaryStat
              label="Klaim"
              value={data.claims_count}
              accent="var(--pomegranate-400)"
            />
            <SummaryStat
              label="Inquiry"
              value={data.inquiries_count}
              accent="var(--blueberry-800)"
            />
          </section>

          {/* Profil */}
          <SectionCard title="Profil">
            <Field label="Nama Lengkap">{data.full_name}</Field>
            <Field label="Email">{data.email}</Field>
            <Field label="HP" mono>
              {data.mobile_number ?? "—"}
            </Field>
            <Field label="NIK" mono>
              {data.nik ?? "—"}
            </Field>
            <Field label="Tempat Lahir">{data.birth_place ?? "—"}</Field>
            <Field label="Tanggal Lahir">{formatDate(data.birth_date)}</Field>
            <Field label="Gender">{data.gender ?? "—"}</Field>
            <Field label="Alamat">{data.address ?? "—"}</Field>
            <Field label="RT/RW">{data.rt_rw ?? "—"}</Field>
            <Field label="Kelurahan">{data.village ?? "—"}</Field>
            <Field label="Kecamatan">{data.district ?? "—"}</Field>
            <Field label="Kota">{data.city ?? "—"}</Field>
            <Field label="Provinsi">{data.province ?? "—"}</Field>
            <Field label="Kode Pos">{data.postal_code ?? "—"}</Field>
            <Field label="KTP">{data.id_card_path ?? "—"}</Field>
            <Field label="Login Terakhir">{formatDateTime(data.last_login_at)}</Field>
            <Field label="Password Diubah">{formatDateTime(data.password_changed_at)}</Field>
            <Field label="Dinonaktifkan">{formatDateTime(data.deactivated_at)}</Field>
            <Field label="Terdaftar">{formatDateTime(data.created_at)}</Field>
            <Field label="Update Terakhir">{formatDateTime(data.updated_at)}</Field>
          </SectionCard>

          {/* Aktivitas Terkini — 4 kolom ringkas */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            <RecentCard
              title="Registrasi Terbaru"
              empty="Belum ada registrasi."
              items={data.recent_registrations.map((r) => ({
                key: r.id,
                primary: r.registration_no,
                secondary: r.product,
                status: r.status,
                date: r.created_at,
                href: `/admin/registrations/${r.id}`,
              }))}
            />
            <RecentCard
              title="Polis Terbaru"
              empty="Belum ada polis."
              items={data.recent_policies.map((p) => ({
                key: p.id,
                primary: p.policy_no,
                secondary: `${p.product} · ${formatDate(p.effective_date)} – ${formatDate(p.expiry_date)}`,
                status: p.status,
                href: `/admin/policies/${p.id}`,
              }))}
            />
            <RecentCard
              title="Klaim Terbaru"
              empty="Belum ada klaim."
              items={data.recent_claims.map((c) => ({
                key: c.id,
                primary: c.claim_no,
                secondary: `${c.claim_type} · ${formatIdr(Number(c.claimed_amount))}`,
                status: c.status,
                date: c.created_at,
                href: `/admin/claims`,
              }))}
            />
            <RecentCard
              title="Inquiry Terbaru"
              empty="Belum ada inquiry."
              items={data.recent_inquiries.map((i) => ({
                key: i.id,
                primary: i.inquiry_no,
                secondary: i.subject,
                status: i.status,
                date: i.created_at,
                href: `/admin/inquiries/${i.id}`,
              }))}
            />
          </section>

          {/* Audit trail untuk customer ini */}
          <section className="clay-card feature" style={{ padding: 24 }}>
            <h2
              className="card-heading"
              style={{ fontSize: "1.1rem", marginBottom: 16, color: "var(--clay-black)" }}
            >
              Audit Trail
            </h2>
            {data.recent_audit.length === 0 ? (
              <p
                className="caption"
                style={{ color: "var(--warm-silver)", margin: 0 }}
              >
                Belum ada aktivitas tercatat untuk customer ini.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {data.recent_audit.map((a) => (
                  <li
                    key={a.id}
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid var(--oat-light)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <code
                        className="mono"
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--ube-800)",
                          fontWeight: 600,
                        }}
                      >
                        {a.action}
                      </code>
                      <span
                        className="caption"
                        style={{ color: "var(--warm-silver)" }}
                      >
                        {formatDateTime(a.created_at)} · oleh {a.actor}
                      </span>
                    </div>
                    {a.metadata && (
                      <pre
                        className="mono"
                        style={{
                          margin: 0,
                          fontSize: "0.75rem",
                          color: "var(--warm-charcoal)",
                          background: "var(--warm-cream)",
                          padding: "6px 8px",
                          borderRadius: 4,
                          overflow: "auto",
                        }}
                      >
                        {JSON.stringify(a.metadata, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Reset password modal — reveal generated password */}
      <Dialog
        open={generatedPassword !== null || resetting}
        onOpenChange={(o) => {
          if (!o) closeResetModal();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          {generatedPassword ? (
            <div>
              <p style={{ marginBottom: 12 }}>
                Password baru untuk <strong>{data?.full_name}</strong>:
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: 12,
                  background: "var(--warm-cream)",
                  border: "1px solid var(--oat-border)",
                  borderRadius: 8,
                  fontFamily: "var(--font-space-mono)",
                  fontSize: "0.95rem",
                  marginBottom: 12,
                }}
              >
                <code style={{ flex: 1, wordBreak: "break-all" }}>
                  {generatedPassword}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(generatedPassword)}
                >
                  {copied ? "✓ Tersalin" : "Salin"}
                </Button>
              </div>
              <p
                style={{
                  color: "var(--pomegranate-400)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                }}
              >
                ⚠ Password ini hanya ditampilkan sekali. Segera catat dan
                berikan ke customer melalui channel yang aman.
              </p>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: 16 }}>
                Sistem akan men-generate password baru untuk customer{" "}
                <strong>{data?.full_name}</strong>. Password lama akan langsung
                tidak berlaku.
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--warm-charcoal)" }}>
                Password baru hanya ditampilkan sekali di langkah berikutnya.
              </p>
            </div>
          )}
          <DialogFooter>
            {generatedPassword ? (
              <Button onClick={closeResetModal}>Tutup</Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={closeResetModal}
                  disabled={resetting}
                >
                  Batal
                </Button>
                <Button
                  onClick={performResetPassword}
                  disabled={resetting}
                  className="bg-[var(--ube-800)] text-white hover:bg-[var(--ube-900)]"
                >
                  {resetting ? "Generating..." : "Generate Password"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// RecentCard — list 5-item ringkas untuk 1 entity type
// ============================================================

type RecentItem = {
  key: string;
  primary: string;
  secondary: string;
  status: string;
  date?: string;
  href: string;
};

function RecentCard({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: RecentItem[];
}) {
  return (
    <section className="clay-card feature" style={{ padding: 20 }}>
      <h2
        className="card-heading"
        style={{ fontSize: "1rem", marginBottom: 12, color: "var(--clay-black)" }}
      >
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="caption" style={{ color: "var(--warm-silver)", margin: 0 }}>
          {empty}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((it) => (
            <li
              key={it.key}
              style={{
                padding: "8px 0",
                borderBottom: "1px solid var(--oat-light)",
              }}
            >
              <Link
                href={it.href}
                style={{
                  color: "var(--clay-black)",
                  textDecoration: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <code className="mono" style={{ fontSize: "0.8rem", color: "var(--ube-800)" }}>
                    {it.primary}
                  </code>
                  <StatusBadge status={it.status} />
                </div>
                <span
                  className="caption"
                  style={{ color: "var(--warm-charcoal)", fontSize: "0.75rem" }}
                >
                  {it.secondary}
                </span>
                {it.date && (
                  <span
                    className="caption"
                    style={{ color: "var(--warm-silver)", fontSize: "0.7rem" }}
                  >
                    {formatDate(it.date)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}