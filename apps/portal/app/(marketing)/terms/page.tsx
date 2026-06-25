import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan — InsureTrack",
  description:
    "Syarat dan ketentuan penggunaan platform InsureTrack.",
};

const LAST_UPDATED = "9 Juni 2026";

/**
 * Syarat & Ketentuan — generic MVP, perlu review legal sebelum live.
 * Plain prose + section anchors (sama pattern dengan Privacy).
 */

type Section = { id: string; title: string; body: React.ReactNode };

const SECTIONS: Section[] = [
  {
    id: "penerimaan",
    title: "1. Penerimaan Syarat",
    body: (
      <p>
        Dengan mengakses atau menggunakan platform InsureTrack, Anda dianggap
        telah membaca, memahami, dan menyetujui Syarat &amp; Ketentuan ini.
        Jika Anda tidak menyetujui salah satu bagian, mohon untuk tidak
        menggunakan layanan kami.
      </p>
    ),
  },
  {
    id: "layanan",
    title: "2. Layanan",
    body: (
      <>
        <p>
          InsureTrack menyediakan platform untuk:
        </p>
        <ul>
          <li>Pendaftaran aplikasi asuransi jiwa, kecelakaan diri, dan kesehatan.</li>
          <li>Penerbitan e-policy digital setelah pembayaran terverifikasi.</li>
          <li>
            Portal customer untuk kelola polis, ajukan klaim, dan kirim pertanyaan.
          </li>
        </ul>
        <p>
          Detail cakupan, pengecualian, dan manfaat polis tercantum di masing-masing
          produk dan di e-policy PDF Anda.
        </p>
      </>
    ),
  },
  {
    id: "akun",
    title: "3. Akun Pengguna",
    body: (
      <ul>
        <li>
          Anda bertanggung jawab menjaga kerahasiaan password dan akses ke akun Anda.
        </li>
        <li>
          Data yang Anda berikan saat pendaftaran harus akurat dan dapat
          diverifikasi. Informasi palsu dapat menyebabkan pembatalan polis.
        </li>
        <li>
          Satu email = satu akun. Akun ganda akan digabungkan atau salah satunya
          ditangguhkan.
        </li>
        <li>
          Anda bisa hapus akun melalui portal customer atau dengan menghubungi CS.
        </li>
      </ul>
    ),
  },
  {
    id: "pembayaran",
    title: "4. Pembayaran",
    body: (
      <ul>
        <li>
          Premi dihitung berdasarkan produk, uang pertanggungan, dan masa
          pertanggungan yang Anda pilih di formulir.
        </li>
        <li>
          Invoice diterbitkan setelah formulir lengkap dan berlaku 7 hari.
        </li>
        <li>
          Status polis <strong>aktif</strong> setelah pembayaran terverifikasi
          oleh payment gateway.
        </li>
        <li>
          Kami tidak menyimpan data kartu pembayaran Anda — semua diproses oleh
          payment gateway bersertifikasi PCI-DSS.
        </li>
      </ul>
    ),
  },
  {
    id: "pembatalan",
    title: "5. Pembatalan & Refund",
    body: (
      <p>
        Untuk polis yang sudah terbit, pembatalan mengikuti ketentuan polis
        masing-masing produk (lihat e-policy Anda). Dalam masa{" "}
        <em>free-look period</em> (umumnya 14 hari setelah polis terbit), Anda
        dapat membatalkan dan mendapatkan refund penuh dikurangi biaya
        administrasi. Hubungi <a href="mailto:cs@insuretrack.example">cs@insuretrack.example</a>{" "}
        untuk proses lebih lanjut.
      </p>
    ),
  },
  {
    id: "larangan",
    title: "6. Larangan Penggunaan",
    body: (
      <p>
        Anda setuju untuk TIDAK menggunakan platform ini untuk: (a) aktivitas
        ilegal atau melanggar hukum; (b) penipuan atau misrepresentasi identitas;
        (c) upaya akses tidak sah ke sistem kami; (d) distribusi malware atau
        konten berbahaya. Pelanggaran dapat menyebabkan penangguhan akun dan
        tindakan hukum.
      </p>
    ),
  },
  {
    id: "tanggung-jawab",
    title: "7. Batasan Tanggung Jawab",
    body: (
      <p>
        Sepanjang diizinkan hukum, InsureTrack tidak bertanggung jawab atas
        kerugian tidak langsung, insidental, atau konsekuensial yang timbul dari
        penggunaan atau ketidakmampuan menggunakan layanan. Tanggung jawab total
        kami dibatasi pada nilai premi yang Anda bayarkan untuk polis terkait.
      </p>
    ),
  },
  {
    id: "perubahan",
    title: "8. Perubahan Syarat",
    body: (
      <p>
        Kami dapat memperbarui Syarat &amp; Ketentuan ini sewaktu-waktu. Versi
        terbaru akan selalu tersedia di halaman ini. Perubahan material akan
        diumumkan via email minimal 30 hari sebelum berlaku.
      </p>
    ),
  },
  {
    id: "hukum",
    title: "9. Hukum yang Berlaku",
    body: (
      <p>
        Syarat &amp; Ketentuan ini tunduk pada hukum Republik Indonesia. Segala
        perselisihan akan diselesaikan melalui musyawarah, atau jika gagal,
        melalui Pengadilan Negeri Jakarta Pusat.
      </p>
    ),
  },
  {
    id: "persetujuan-pengajuan",
    title: "10. Persetujuan saat Pengajuan Asuransi",
    body: (
      <>
        <p>
          Dengan mencentang kotak persetujuan di halaman pengajuan asuransi,
          Calon Tertanggung menyatakan dan menyetujui bahwa:
        </p>
        <ol style={{ paddingLeft: 20 }}>
          <li>
            Semua data yang diisi (identitas, alamat, kontak, dan data terkait
            pengajuan) adalah benar, akurat, dan dapat dipertanggungjawabkan.
          </li>
          <li>
            Calon Tertanggung bersedia memberikan dokumen pendukung asli
            (KTP, dan dokumen lain yang relevan) sewaktu-waktu diminta oleh
            PT AMA Salam Indonesia untuk proses verifikasi.
          </li>
          <li>
            Polis asuransi baru akan diterbitkan setelah pembayaran premi lunas
            dan konfirmasi diterima dari payment gateway.
          </li>
          <li>
            PT AMA Salam Indonesia berhak menolak pengajuan atau membatalkan
            polis yang telah diterbitkan apabila di kemudian hari ditemukan
            ketidaksesuaian antara data yang diisi dengan dokumen asli atau
            ketentuan polis yang berlaku.
          </li>
          <li>
            Untuk produk Asuransi Jiwa: polis tunduk pada Syarat &amp;
            Ketentuan Polis (Policy Wording) yang akan dikirimkan bersama
            e-policy. S&amp;K pada halaman ini mengatur penggunaan
            platform, sedangkan S&amp;K polis mengatur hak dan kewajiban
            terkait pertanggungan.
          </li>
        </ol>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <>
      <section className="clay-section" style={{ paddingTop: 80, paddingBottom: 24 }}>
        <div className="clay-container" style={{ maxWidth: 880 }}>
          <p className="uppercase-label" style={{ color: "var(--honey-700)", marginBottom: 12 }}>
            ✦ Legal
          </p>
          <h1 className="display-secondary" style={{ marginBottom: 12 }}>
            Syarat &amp; Ketentuan
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
            style={{ color: "var(--charcoal)", marginBottom: 32, lineHeight: 1.6 }}
          >
            Harap baca Syarat &amp; Ketentuan ini dengan seksama sebelum menggunakan
            layanan InsureTrack. Dokumen ini merupakan perjanjian antara Anda
            (sebagai pengguna) dan PT InsureTrack Indonesia.
          </p>

          <nav
            aria-label="Daftar isi"
            className="clay-card dashed"
            style={{ padding: 20, marginBottom: 40 }}
          >
            <p
              className="uppercase-label"
              style={{ color: "var(--warm-silver)", margin: 0 }}
            >
              Daftar Isi
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "12px 0 0 0",
                display: "grid",
                gap: 6,
              }}
            >
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    style={{ color: "var(--honey-700)", textDecoration: "none" }}
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
                  style={{ color: "var(--charcoal)", lineHeight: 1.7 }}
                >
                  {s.body}
                </div>
              </article>
            ))}
          </div>

          <div
            className="clay-card dashed"
            style={{
              marginTop: 48,
              padding: 24,
              textAlign: "center",
            }}
          >
            <p className="body" style={{ margin: 0, color: "var(--charcoal)" }}>
              Pertanyaan tentang syarat &amp; ketentuan?{" "}
              <Link
                href="/faq"
                style={{ color: "var(--honey-700)", textDecoration: "underline" }}
              >
                Lihat FAQ
              </Link>{" "}
              atau{" "}
              <a
                href="mailto:cs@insuretrack.example"
                style={{ color: "var(--honey-700)", textDecoration: "underline" }}
              >
                hubungi kami
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
