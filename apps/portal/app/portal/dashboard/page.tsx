"use client";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@insuretrack/api-client";
import { Reveal, StaggerGroup } from "@/components/Reveal";

type Me = {
  customer_id: string;
  email: string;
  full_name: string;
  portal_status: string;
  active_policy_count: number;
  total_sum_assured: string;
  open_claim_count: number;
  open_inquiry_count: number;
};

const formatIDR = (n: string | number) => {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);
};

export default function PortalDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Cookie auth: apiFetch attach session otomatis. Kalau tidak
        // ada session, backend return 401 → throw → masuk `catch`
        // (Shell layer redirect ke /login kalau user belum auth).
        const m = await apiFetch<Me>("/customer/me");
        setMe(m);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal load");
      }
    })();
  }, []);

  return (
    <>
      <Reveal>
        <p className="uppercase-label" style={{ color: "var(--honey-700)", marginBottom: 8 }}>
          ✦ Selamat Datang
        </p>
        <h1 className="page-title">{me?.full_name ?? "..."}</h1>
        <p className="page-subtitle">Ringkasan polis, klaim, dan pertanyaan Anda.</p>
      </Reveal>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "var(--pomegranate-50)" }}>
          ⚠ {error}
        </div>
      )}
      {!me && !error && <p>Memuat...</p>}

      {me && (
        <>
          {/* Banner aktivasi: tampil kalau portal_status masih PENDING.
              Arahkan user untuk klik link aktivasi di email sebelum
              mengajukan form (gate di backend → AppError::EmailNotActivated).
              Pakai honey palette (--honey-tint + --ink borderLeft) supaya
              konsisten dengan landing page hero CTA, bukan lemon kuning
              kontras tinggi yang terasa "alert keras". */}
          {me.portal_status === "PENDING" && (
            <Reveal delay={120}>
              <div
                className="clay-card feature"
                style={{
                  marginTop: 24,
                  marginBottom: 32,
                  padding: 24,
                  background: "var(--honey-tint)",
                  borderLeft: "6px solid var(--honey-400)",
                }}
                role="alert"
              >
                <p
                  className="uppercase-label"
                  style={{ color: "var(--honey-700)", marginBottom: 8 }}
                >
                  ✦ Aktivasi Email Diperlukan
                </p>
                <p className="body" style={{ color: "var(--ink)", margin: 0 }}>
                  Akun Anda belum diaktivasi. Cek kotak masuk email{" "}
                  <span className="mono">{me.email}</span> dan klik link
                  aktivasi. Aktivasi diperlukan untuk mengajukan polis, klaim,
                  dan pertanyaan baru.
                </p>
              </div>
            </Reveal>
          )}

          {/* CTA: kalau user belum punya polis aktif, tampilkan banner
              prominent untuk apply asuransi. Honey-400 background dengan
              CTA ink outline-honey untuk kontras yang harmonis dengan
              landing hero. */}
          {me.active_policy_count === 0 && (
            <Reveal delay={120}>
              <div
                className="clay-card feature"
                style={{
                  marginTop: 24,
                  marginBottom: 32,
                  padding: 32,
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  flexWrap: "wrap",
                  background: "var(--honey-400)",
                  border: "1px solid var(--oat-refined)",
                }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <p
                    className="uppercase-label"
                    style={{ color: "var(--honey-700)", marginBottom: 8 }}
                  >
                    ✦ Mulai perlindungan Anda
                  </p>
                  <h2
                    className="display-secondary"
                    style={{ color: "var(--ink)", fontSize: "1.75rem", marginBottom: 8 }}
                  >
                    Ajukan Asuransi Sekarang
                  </h2>
                  <p
                    className="body"
                    style={{ color: "var(--charcoal)", margin: 0 }}
                  >
                    Pilih produk (Jiwa / Kecelakaan Diri / Kesehatan), isi data,
                    upload KTP, dan polis terbit dalam hitungan menit setelah
                    pembayaran.
                  </p>
                </div>
                <Link
                  href="/portal/insurance/new"
                  className="clay-button size-large"
                  style={{
                    flexShrink: 0,
                    background: "var(--ink)",
                    color: "var(--honey-400)",
                    border: "1px solid var(--ink)",
                  }}
                >
                  Ajukan Sekarang →
                </Link>
              </div>
            </Reveal>
          )}

          <StaggerGroup
            step={80}
            baseDelay={180}
            className="clay-grid cols-2"
          >
            <Card label="Polis Aktif" value={me.active_policy_count} />
            <Card
              label="Total UP Aktif"
              value={formatIDR(me.total_sum_assured)}
            />
            <Card label="Klaim Terbuka" value={me.open_claim_count} />
            <Card label="Pertanyaan Terbuka" value={me.open_inquiry_count} />
          </StaggerGroup>

          <Reveal delay={520}>
            <h2 className="section-heading" style={{ fontSize: "1.5rem", marginBottom: 16, marginTop: 8 }}>
              Aksi Cepat
            </h2>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/portal/insurance/new" className="clay-button solid-honey">
                + Ajukan Asuransi
              </Link>
              <Link href="/portal/policies" className="clay-button outline-honey">
                Lihat Polis →
              </Link>
              <Link href="/portal/invoices" className="clay-button outline-honey">
                Lihat Invoice →
              </Link>
              <Link href="/portal/claims/new" className="clay-button solid-pomegranate">
                Ajukan Klaim →
              </Link>
              <Link href="/portal/inquiries" className="clay-button ghost">
                Buat Pertanyaan
              </Link>
            </div>
          </Reveal>
        </>
      )}
    </>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="clay-card feature clay-card-hoverable"
      style={{ borderLeft: "6px solid var(--honey-400)", padding: 24 }}
    >
      <p className="caption" style={{ color: "var(--warm-charcoal)", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "1.75rem", fontWeight: 600, color: "var(--ink)" }}>
        {value}
      </p>
    </div>
  );
}
