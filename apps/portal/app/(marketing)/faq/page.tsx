import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@insuretrack/ui";

export const metadata: Metadata = {
  title: "FAQ — InsureTrack",
  description:
    "Pertanyaan yang sering diajukan tentang InsureTrack: pendaftaran, produk, pembayaran, polis, klaim, dan keamanan data.",
};

/**
 * FAQ — dikelompokkan per topik biar user bisa scan cepat. Tiap item
 * native `<details>` (no JS) — accessible by default, ringkas, dan
 * SEO-friendly (konten di-render, bukan disembunyi sampai di-klik).
 */

type FaqItem = { q: string; a: React.ReactNode };
type FaqGroup = { id: string; title: string; emoji: string; items: FaqItem[] };

const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "umum",
    title: "Umum",
    emoji: "🛡️",
    items: [
      {
        q: "Apa itu InsureTrack?",
        a: (
          <>
            InsureTrack adalah platform asuransi digital end-to-end: dari pendaftaran,
            pembayaran, penerbitan e-policy, hingga pengajuan klaim — semuanya online.
            Tidak ada kunjungan cabang, tidak ada dokumen fisik. Polis terbit otomatis
            setelah pembayaran terverifikasi.
          </>
        ),
      },
      {
        q: "Produk apa saja yang tersedia?",
        a: (
          <>
            Saat ini tersedia tiga produk: <strong>Asuransi Jiwa</strong> (Life),{" "}
            <strong>Asuransi Kecelakaan Diri</strong> (Personal Accident), dan{" "}
            <strong>Asuransi Kesehatan</strong> (Health). Lihat detail di{" "}
            <Link href="/#products">halaman produk</Link>.
          </>
        ),
      },
      {
        q: "Apakah InsureTrack berafiliasi dengan perusahaan asuransi tertentu?",
        a: (
          <>
            InsureTrack adalah platform distribusi. Produk asuransi yang ditampilkan
            disediakan oleh mitra underwriter resmi kami. Detail penanggung
            (underwriter) tercantum di halaman produk masing-masing dan di e-policy
            PDF yang Anda terima setelah pendaftaran.
          </>
        ),
      },
    ],
  },
  {
    id: "pendaftaran",
    title: "Pendaftaran & Akun",
    emoji: "📝",
    items: [
      {
        q: "Bagaimana cara mendaftar?",
        a: (
          <>
            Klik tombol <strong>Beli Polis</strong> di halaman utama, isi formulir
            pendaftaran (nama, email, nomor HP, password), lalu lanjut ke formulir
            aplikasi asuransi. Anda butuh KTP untuk diupload (JPG/PNG/PDF, max 5&nbsp;MB).
          </>
        ),
      },
      {
        q: "Saya lupa password, bagaimana reset?",
        a: (
          <>
            Di halaman login, klik link <strong>Lupa password</strong>. Masukkan
            email Anda — kami kirim link reset yang berlaku 1 jam ke email.
          </>
        ),
      },
      {
        q: "Apakah saya bisa daftar lebih dari satu polis?",
        a: (
          <>
            Bisa. Setiap pendaftaran berdiri sendiri dengan nomor registrasi dan
            invoice masing-masing. Anda bisa kelola semuanya dari{" "}
            <Link href="/portal/dashboard">dashboard customer</Link>.
          </>
        ),
      },
    ],
  },
  {
    id: "pembayaran",
    title: "Pembayaran & Invoice",
    emoji: "💳",
    items: [
      {
        q: "Metode pembayaran apa yang didukung?",
        a: (
          <>
            Saat ini via payment gateway yang terintegrasi (virtual account, e-wallet,
            dan kartu kredit — detail lengkap di halaman invoice). Status pembayaran
            ter-update otomatis setelah webhook dari payment gateway diterima.
          </>
        ),
      },
      {
        q: "Berapa lama invoice berlaku?",
        a: (
          <>
            Invoice berlaku 7 hari sejak diterbitkan. Setelah lewat, invoice
            otomatis berstatus <em>EXPIRED</em> dan Anda perlu registrasi ulang.
          </>
        ),
      },
      {
        q: "Apakah premi bisa di-refund?",
        a: (
          <>
            Untuk polis yang sudah terbit, pembatalan mengikuti ketentuan polis
            masing-masing produk. Hubungi{" "}
            <a href="mailto:cs@insuretrack.example">cs@insuretrack.example</a>{" "}
            untuk proses lebih lanjut.
          </>
        ),
      },
    ],
  },
  {
    id: "polis",
    title: "Polis & Portal",
    emoji: "📄",
    items: [
      {
        q: "Bagaimana cara menerima polis saya?",
        a: (
          <>
            Begitu pembayaran terverifikasi, e-policy PDF otomatis dikirim ke email
            Anda (biasanya dalam 1-2 menit). Anda juga bisa download ulang dari{" "}
            <Link href="/portal/policies">halaman Polis Saya</Link> di portal customer.
          </>
        ),
      },
      {
        q: "Apa yang bisa saya lakukan di portal customer?",
        a: (
          <>
            Portal customer adalah dashboard utama Anda: lihat daftar polis, ajukan
            klaim, kirim pertanyaan ke customer service, dan update profil. Login
            dengan email &amp; password yang Anda daftarkan.
          </>
        ),
      },
    ],
  },
  {
    id: "klaim",
    title: "Klaim",
    emoji: "🩹",
    items: [
      {
        q: "Bagaimana cara mengajukan klaim?",
        a: (
          <>
            Login ke portal customer, masuk ke menu <strong>Klaim</strong>, klik{" "}
            <strong>Ajukan Klaim</strong>. Anda butuh polis aktif, lalu isi
            formulir klaim (tipe klaim, tanggal insiden, jumlah, deskripsi, dan
            dokumen pendukung).
          </>
        ),
      },
      {
        q: "Berapa lama proses klaim?",
        a: (
          <>
            SLA review klaim adalah 7 hari kerja setelah dokumen lengkap diterima.
            Status real-time tersedia di portal — Anda akan dapat notifikasi email
            setiap ada perubahan status (Under Review → Approved/Rejected/Paid).
          </>
        ),
      },
    ],
  },
  {
    id: "keamanan",
    title: "Keamanan & Privasi",
    emoji: "🔒",
    items: [
      {
        q: "Apakah data saya aman?",
        a: (
          <>
            Data dienkripsi saat transit (HTTPS) dan saat disimpan (at-rest
            encryption di PostgreSQL &amp; Cloudflare R2). Akses dibatasi via
            JWT role-scoped (customer / admin) dan audit trail untuk setiap aksi
            sensitif. Detail lengkap di{" "}
            <Link href="/privacy">Kebijakan Privasi</Link>.
          </>
        ),
      },
      {
        q: "Siapa yang bisa melihat data KTP saya?",
        a: (
          <>
            Hanya tim operasional yang memerlukan (underwriter &amp; admin klaim).
            File KTP disimpan di storage privat — tidak bisa diakses via URL
            publik. Customer bisa hapus akun via portal kapan saja.
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      {/* Hero */}
      <section className="clay-section" style={{ paddingTop: 80, paddingBottom: 24 }}>
        <div className="clay-container" style={{ maxWidth: 880 }}>
          <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 12 }}>
            ✦ Help Center
          </p>
          <h1 className="display-secondary" style={{ marginBottom: 16 }}>
            Pertanyaan yang sering diajukan
          </h1>
          <p
            className="body-large"
            style={{ color: "var(--warm-charcoal)", maxWidth: 640 }}
          >
            Tidak menemukan jawaban yang Anda cari?{" "}
            <a
              href="mailto:cs@insuretrack.example"
              style={{ color: "var(--ube-800)", textDecoration: "underline" }}
            >
              Hubungi tim kami
            </a>
            .
          </p>
        </div>
      </section>

      {/* Table of contents (sticky-ish quick jump) */}
      <section style={{ paddingTop: 0, paddingBottom: 24 }}>
        <div className="clay-container" style={{ maxWidth: 880 }}>
          <nav aria-label="Navigasi cepat FAQ">
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {FAQ_GROUPS.map((g) => (
                <li key={g.id}>
                  <a
                    href={`#${g.id}`}
                    className="clay-button ghost size-small"
                    style={{ textDecoration: "none" }}
                  >
                    <span aria-hidden="true">{g.emoji}</span>
                    <span style={{ marginLeft: 6 }}>{g.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* FAQ groups */}
      {FAQ_GROUPS.map((g) => (
        <section
          key={g.id}
          id={g.id}
          className="clay-section"
          style={{ paddingTop: 24, paddingBottom: 24 }}
        >
          <div className="clay-container" style={{ maxWidth: 880 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 24,
              }}
            >
              <span style={{ fontSize: "1.75rem" }} aria-hidden="true">
                {g.emoji}
              </span>
              <h2 className="section-heading" style={{ margin: 0 }}>
                {g.title}
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {g.items.map((item, i) => (
                <details
                  key={i}
                  className="clay-card"
                  style={{ padding: 0, overflow: "hidden" }}
                >
                  <summary
                    style={{
                      padding: "20px 24px",
                      cursor: "pointer",
                      fontWeight: 600,
                      listStyle: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span>{item.q}</span>
                    <Icon
                      name="ChevronDown"
                      size="sm"
                      style={{ flexShrink: 0, color: "var(--warm-silver)" }}
                    />
                  </summary>
                  <div
                    style={{
                      padding: "0 24px 20px 24px",
                      color: "var(--warm-charcoal)",
                      lineHeight: 1.6,
                    }}
                  >
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Bottom CTA */}
      <section className="clay-section" style={{ paddingTop: 32, paddingBottom: 80 }}>
        <div className="clay-container" style={{ maxWidth: 880 }}>
          <div
            className="clay-card feature"
            style={{ background: "var(--matcha-300)", textAlign: "center" }}
          >
            <h2 className="section-heading" style={{ marginBottom: 12 }}>
              Masih ada pertanyaan?
            </h2>
            <p className="body-large" style={{ color: "var(--matcha-800)", marginBottom: 24 }}>
              Tim customer service kami siap membantu Senin–Jumat, 09:00–18:00 WIB.
            </p>
            <a
              href="mailto:cs@insuretrack.example"
              className="clay-button solid-ube size-large"
            >
              Hubungi Customer Service
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
