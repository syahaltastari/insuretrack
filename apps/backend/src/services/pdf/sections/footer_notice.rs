//! Footer notice (italic) + PaymentInstructions/Catatan section.

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::set_color;
use crate::services::pdf::theme::{C_BLACK, C_SILVER};

/// Footer notice di policy p1 (italic 2 baris tentang polis elektronik).
pub struct FooterNotice;

impl FooterNotice {
    pub fn height() -> f32 {
        12.0
    }

    pub fn render(layer: &PdfLayerReference, italic: &IndirectFontRef, top_y: f32) -> f32 {
        let bottom_y = top_y - Self::height();
        set_color(layer, C_SILVER);
        layer.use_text(
            "Polis ini diterbitkan secara elektronik dan sah tanpa tanda tangan basah.",
            7.5,
            printpdf::Mm(15.0),
            printpdf::Mm(top_y - 5.5),
            italic,
        );
        layer.use_text(
            "Lihat halaman selanjutnya untuk ikhtisar lengkap dan syarat & ketentuan.",
            7.5,
            printpdf::Mm(15.0),
            printpdf::Mm(top_y - 11.0),
            italic,
        );
        bottom_y
    }
}

/// Payment instructions + catatan (untuk invoice & receipt).
pub struct PaymentInstructions {
    pub kind: PaymentKind,
}

pub enum PaymentKind {
    Invoice,
    Receipt,
}

impl PaymentInstructions {
    pub fn height(&self) -> f32 {
        match self.kind {
            PaymentKind::Invoice => 35.0,
            PaymentKind::Receipt => 22.0,
        }
    }

    pub fn render(
        &self,
        layer: &PdfLayerReference,
        bold: &IndirectFontRef,
        reg: &IndirectFontRef,
        top_y: f32,
    ) -> f32 {
        let bottom_y = top_y - self.height();
        match self.kind {
            PaymentKind::Invoice => {
                set_color(layer, C_SILVER);
                layer.use_text(
                    "INSTRUKSI PEMBAYARAN",
                    7.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 8.0),
                    bold,
                );
                set_color(layer, C_BLACK);
                layer.use_text(
                    "1. Login ke portal InsureTrack → menu Invoice",
                    8.5,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 15.0),
                    reg,
                );
                layer.use_text(
                    "2. Klik tombol 'Bayar' pada invoice ini",
                    8.5,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 20.0),
                    reg,
                );
                layer.use_text(
                    "3. Pilih metode pembayaran & selesaikan",
                    8.5,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 25.0),
                    reg,
                );
                set_color(layer, C_SILVER);
                layer.use_text(
                    "Polis terbit otomatis setelah pembayaran terverifikasi.",
                    7.5,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 33.0),
                    reg,
                );
            }
            PaymentKind::Receipt => {
                set_color(layer, C_SILVER);
                layer.use_text(
                    "CATATAN",
                    7.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 8.0),
                    bold,
                );
                set_color(layer, C_BLACK);
                layer.use_text(
                    "Simpan dokumen ini sebagai bukti pembayaran premi. Polis elektronik",
                    8.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 14.0),
                    reg,
                );
                layer.use_text(
                    "telah terbit dan dapat diunduh dari portal customer InsureTrack.",
                    8.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 20.0),
                    reg,
                );
            }
        }
        bottom_y
    }
}
