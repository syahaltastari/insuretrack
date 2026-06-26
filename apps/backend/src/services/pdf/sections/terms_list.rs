//! Terms list — 5 hardcoded articles di policy p3 (KETENTUAN UMUM POLIS).

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{draw_line, set_color, wrap_text};
use crate::services::pdf::theme::{C_BLACK, C_CHARCOAL, C_SILVER};

const TERMS: &[(&str, &str)] = &[
    ("Pasal 1 — Definisi",
     "Polis ini merupakan dokumen resmi yang mengikat antara Pemegang Polis dan InsureTrack berdasarkan permohonan yang telah disetujui. Istilah mengacu pada definisi standar industri asuransi Indonesia."),
    ("Pasal 2 — Lingkup Perlindungan",
     "Perlindungan berlaku selama masa polis aktif. Pembayaran manfaat dilakukan setelah verifikasi klaim selesai dan seluruh dokumen yang diperlukan diterima dengan lengkap."),
    ("Pasal 3 — Pengecualian",
     "Tidak dijamin: (i) tindakan disengaja/bunuh diri dalam 2 tahun pertama; (ii) kondisi pra-eksisting tidak diungkapkan; (iii) perang, terorisme, nuklir; (iv) pelanggaran hukum."),
    ("Pasal 4 — Prosedur Klaim",
     "Klaim diajukan via portal InsureTrack dalam 30 hari sejak kejadian. Dokumen: formulir klaim, KTP, dan dokumen pendukung. InsureTrack memproses klaim dalam 14 hari kerja."),
    ("Pasal 5 — Pembatalan & Free-Look",
     "Pemegang Polis dapat membatalkan polis kapan saja. Premi dikembalikan penuh jika pembatalan dalam 30 hari sejak terbit (free-look period). Di luar itu, premi tidak dikembalikan."),
];

pub struct TermsList;

impl TermsList {
    /// Render Ketentuan Umum. `top_y` = top edge (di bawah BenefitList). Returns bottom y.
    pub fn render(
        layer: &PdfLayerReference,
        bold: &IndirectFontRef,
        reg: &IndirectFontRef,
        top_y: f32,
    ) -> f32 {
        set_color(layer, C_BLACK);
        layer.use_text(
            "KETENTUAN UMUM POLIS",
            11.0,
            printpdf::Mm(15.0),
            printpdf::Mm(top_y),
            bold,
        );
        let mut ty = top_y - 12.0;
        for (title, content) in TERMS {
            if ty < 30.0 {
                break;
            }
            set_color(layer, C_BLACK);
            layer.use_text(*title, 8.5, printpdf::Mm(15.0), printpdf::Mm(ty), bold);
            set_color(layer, C_CHARCOAL);
            let lines = wrap_text(content, 92);
            for (i, line) in lines.iter().take(2).enumerate() {
                let ypos = ty - 5.0 - i as f32 * 4.0;
                if ypos > 30.0 {
                    layer.use_text(
                        line.as_str(),
                        7.5,
                        printpdf::Mm(15.0),
                        printpdf::Mm(ypos),
                        reg,
                    );
                }
            }
            ty -= if lines.len() > 1 { 15.5 } else { 12.5 };
        }
        // Footer divider for Pengesahan
        set_color(layer, C_SILVER);
        draw_line(layer, 15.0, ty + 4.0, 195.0, ty + 4.0, 0.5);
        ty - 12.0
    }
}
