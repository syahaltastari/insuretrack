import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — InsureTrack",
  description:
    "Bagaimana InsureTrack mengumpulkan, menggunakan, dan melindungi data pribadi Anda.",
};

const LAST_UPDATED = "9 Juni 2026";

/**
 * Kebijakan Privasi — disusun generik untuk MVP. Konsultasikan dengan
 * legal tim sebelum dipublikasi ke user final. Pakai plain content + heading
 * hierarchy — searchable & indexable.
 */

type Section = { id: string; title: string; body: React.ReactNode };

const SECTIONS: Section[] = [
  {
    id: "informasi",
    title: "1. Informasi yang Kami Kumpulkan",
    body: (
      <>
        <p>
          Untuk menyediakan layanan asuransi digital, kami mengumpulkan beberapa
          kategori informasi:
        </p>
        <ul>
          <li>
            <strong>Data identitas:</strong> nama lengkap, Nomor Induk Kependudukan
            (NIK), tempat &amp; tanggal lahir, jenis kelamin.
          </li>
          <li>
            <strong>Data kontak:</strong> email, nomor HP, alamat rumah (untuk
            pengiriman dokumen fisik bila diperlukan).
          </li>
          <li>
            <strong>Dokumen pendukung:</strong> foto/scan KTP (untuk verifikasi
            identitas sesuai regulasi).
          </li>
          <li>
            <strong>Data pembayaran:</strong> kami TIDAK menyimpan nomor kartu
            kredit — semua transaksi diproses oleh payment gateway tersertifikasi
            PCI-DSS.
          </li>
          <li>
            <strong>Data penggunaan:</strong> log aktivitas (IP, browser, halaman
            yang dikunjungi) untuk keamanan &amp; analitik produk.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "penggunaan",
    title: "2. Bagaimana Kami Menggunakan Informasi",
    body: (
      <ul>
        <li>Memproses pendaftaran &amp; penerbitan polis.</li>
        <li>Mengirim e-policy, notifikasi pembayaran, dan update polis ke email Anda.</li>
        <li>Memproses klaim dan investigasi terkait.</li>
        <li>
          Verifikasi identitas &amp; pencegahan fraud (KYC/AML sesuai regulasi
          yang berlaku).
        </li>
        <li>Meningkatkan kualitas layanan (analytics agregat, tidak individual).</li>
        <li>
          Komunikasi terkait produk &amp; promo — Anda bisa opt-out kapan saja.
        </li>
      </ul>
    ),
  },
  {
    id: "penyimpanan",
    title: "3. Penyimpanan & Keamanan Data",
    body: (
      <>
        <p>Kami menerapkan langkah-langkah keamanan standar industri:</p>
        <ul>
          <li>
            <strong>Enkripsi in-transit:</strong> semua komunikasi via HTTPS/TLS 1.2+.
          </li>
          <li>
            <strong>Enkripsi at-rest:</strong> PostgreSQL disk-level encryption;
            file upload di Cloudflare R2 dengan server-side encryption.
          </li>
          <li>
            <strong>Access control:</strong> JWT role-scoped (customer/admin) +
            middleware di setiap endpoint. Akses admin dicatat di audit trail.
          </li>
          <li>
            <strong>Backup:</strong> backup harian PostgreSQL, retensi 30 hari.
          </li>
          <li>
            <strong>Retensi:</strong> data polis &amp; klaim disimpan minimal 10
            tahun sesuai regulasi perasuransian Indonesia. Data marketing (log
            analytics) dihapus setelah 24 bulan.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "berbagi",
    title: "4. Berbagi Data dengan Pihak Ketiga",
    body: (
      <>
        <p>
          Kami <strong>tidak menjual</strong> data pribadi Anda. Pembagian hanya
          dilakukan ke:
        </p>
        <ul>
          <li>
            <strong>Mitra underwriter:</strong> untuk proses underwriting &amp;
            klaim (data identitas + dokumen).
          </li>
          <li>
            <strong>Payment gateway:</strong> untuk proses pembayaran (hanya
            tokenized card data, bukan nomor kartu asli).
          </li>
          <li>
            <strong>Email provider (Resend):</strong> untuk mengirim email
            transaksional.
          </li>
          <li>
            <strong>Otoritas:</strong> jika diwajibkan oleh hukum atau perintah
            pengadilan.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "hak",
    title: "5. Hak-Hak Anda",
    body: (
      <ul>
        <li>
          <strong>Akses:</strong> meminta salinan data pribadi Anda yang kami simpan.
        </li>
        <li>
          <strong>Koreksi:</strong> memperbarui data yang tidak akurat (lewat{" "}
          <Link href="/portal/profile">Profil</Link> atau hubungi CS).
        </li>
        <li>
          <strong>Penghapusan:</strong> meminta hapus data (dengan pengecualian
          data yang harus disimpan sesuai regulasi).
        </li>
        <li>
          <strong>Opt-out marketing:</strong> berhenti menerima email promo via
          link unsubscribe di email.
        </li>
      </ul>
    ),
  },
  {
    id: "pengajuan-polis",
    title: "6. Penggunaan Data untuk Pengajuan Polis",
    body: (
      <>
        <p>
          Dalam konteks pengajuan asuransi, data pribadi yang Anda isi melalui
          formulir digunakan untuk:
        </p>
        <ol style={{ paddingLeft: 20 }}>
          <li>
            Verifikasi identitas (NIK, nama, tanggal lahir) sesuai ketentuan
            peraturan perundang-undangan yang berlaku.
          </li>
          <li>
            Pembuatan polis, invoice, dan dokumen pendukung lainnya.
          </li>
          <li>
            Koordinasi dengan payment gateway untuk pemrosesan premi.
          </li>
          <li>
            Pengiriman e-policy, kuitansi pembayaran, dan notifikasi terkait
            polis melalui email.
          </li>
          <li>
            Penanganan klaim, apabila di kemudian hari diajukan.
          </li>
        </ol>
        <p>Data tidak akan dialihkan ke pihak ketiga selain:</p>
        <ul>
          <li>Payment gateway (untuk proses pembayaran premi).</li>
          <li>
            Penyedia layanan email (untuk pengiriman e-policy dan notifikasi).
          </li>
          <li>
            Otoritas pengawas atau instansi yang berwenang (apabila diminta
            sesuai hukum yang berlaku).
          </li>
        </ul>
        <p>
          Periode retensi data mengikuti poin 5 (Hak Anda) di atas. Setelah
          polis berakhir dan melewati masa retensi yang ditentukan, data
          terkait polis akan dianonimkan atau dihapus sesuai kebijakan.
        </p>
      </>
    ),
  },
  {
    id: "kontak",
    title: "7. Hubungi Kami",
    body: (
      <p>
        Pertanyaan tentang privasi? Email ke{" "}
        <a
          href="mailto:privacy@insuretrack.example"
          style={{ color: "var(--ube-800)", textDecoration: "underline" }}
        >
          privacy@insuretrack.example
        </a>
        . Kami merespons dalam 7 hari kerja.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <>
      <section className="clay-section" style={{ paddingTop: 80, paddingBottom: 24 }}>
        <div className="clay-container" style={{ maxWidth: 880 }}>
          <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 12 }}>
            ✦ Legal
          </p>
          <h1 className="display-secondary" style={{ marginBottom: 12 }}>
            Kebijakan Privasi
          </h1>
          <p className="caption" style={{ color: "var(--warm-silver)" }}>
            Terakhir diperbarui: {LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="clay-section" style={{ paddingTop: 0, paddingBottom: 80 }}>
        <div className="clay-container" style={{ maxWidth: 880 }}>
          <p
            className="body-large"
            style={{
              color: "var(--warm-charcoal)",
              marginBottom: 32,
              lineHeight: 1.6,
            }}
          >
            Di InsureTrack, privasi Anda adalah prioritas. Dokumen ini menjelaskan
            data apa saja yang kami kumpulkan, bagaimana kami menggunakannya, dan
            langkah-langkah yang kami ambil untuk melindunginya.
          </p>

          {/* Table of contents */}
          <nav
            aria-label="Daftar isi"
            className="clay-card dashed"
            style={{ padding: 20, marginBottom: 40 }}
          >
            <p
              className="uppercase-label"
              style={{ color: "var(--warm-silver)", marginBottom: 12, margin: 0 }}
            >
              Daftar Isi
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0 0", display: "grid", gap: 6 }}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    style={{ color: "var(--ube-800)", textDecoration: "none" }}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            {SECTIONS.map((s) => (
              <article key={s.id} id={s.id} style={{ scrollMarginTop: 80 }}>
                <h2
                  className="card-heading"
                  style={{ marginBottom: 12, fontSize: "1.5rem" }}
                >
                  {s.title}
                </h2>
                <div
                  className="body"
                  style={{ color: "var(--warm-charcoal)", lineHeight: 1.7 }}
                >
                  {s.body}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
