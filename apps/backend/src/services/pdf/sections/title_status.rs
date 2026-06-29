//! Title block + status badge — muncul di top konten (di bawah header bar).
//! 3 variants untuk 3 PDF kind.

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{fill_rect, set_color};
use crate::services::pdf::theme::{C_BLACK, C_LEMON_400, C_MATCHA_300, C_POMEGRANATE, C_SILVER};

pub(crate) enum TitleStatus<'a> {
    /// e-Policy: judul besar "POLIS ASURANSI" + product + nomor polis + AKTIF badge.
    Policy {
        product_name: &'a str,
        policy_no: &'a str,
    },
    /// Invoice: judul + status-tinted badge (UNPAID/PAID/EXPIRED/CANCELLED).
    Invoice { status: &'a str },
    /// Receipt: judul + LUNAS matcha badge.
    Receipt,
}

impl<'a> TitleStatus<'a> {
    pub(crate) fn policy(product_name: &'a str, policy_no: &'a str) -> Self {
        TitleStatus::Policy {
            product_name,
            policy_no,
        }
    }
    pub(crate) fn invoice(status: &'a str) -> Self {
        TitleStatus::Invoice { status }
    }

    /// Tinggi title block dalam mm.
    pub(crate) fn height(&self) -> f32 {
        match self {
            TitleStatus::Policy { .. } => 110.0,
            TitleStatus::Invoice { .. } | TitleStatus::Receipt => 35.0,
        }
    }

    /// Render. top_y = top edge of title (untuk policy: setelah header; untuk invoice/receipt: setelah header).
    pub(crate) fn render(
        &self,
        layer: &PdfLayerReference,
        bold: &IndirectFontRef,
        reg: &IndirectFontRef,
        italic: &IndirectFontRef,
        top_y: f32,
    ) -> f32 {
        let bottom_y = top_y - self.height();
        match self {
            TitleStatus::Policy {
                product_name,
                policy_no,
            } => {
                // Badge AKTIF (matcha, top-right konten)
                fill_rect(layer, 148.0, 259.0, 195.0, 270.0, C_MATCHA_300);
                set_color(layer, C_BLACK);
                layer.use_text(
                    "AKTIF",
                    10.0,
                    printpdf::Mm(163.0),
                    printpdf::Mm(262.5),
                    bold,
                );

                // Judul besar
                layer.use_text(
                    "POLIS ASURANSI",
                    26.0,
                    printpdf::Mm(15.0),
                    printpdf::Mm(248.0),
                    bold,
                );
                set_color(layer, (85, 83, 78));
                layer.use_text(
                    *product_name,
                    13.0,
                    printpdf::Mm(15.0),
                    printpdf::Mm(235.5),
                    bold,
                );
                fill_rect(layer, 15.0, 229.5, 68.0, 232.0, C_BLACK);

                set_color(layer, C_SILVER);
                layer.use_text(
                    "NOMOR POLIS",
                    7.0,
                    printpdf::Mm(15.0),
                    printpdf::Mm(223.0),
                    bold,
                );
                set_color(layer, C_BLACK);
                layer.use_text(
                    *policy_no,
                    20.0,
                    printpdf::Mm(15.0),
                    printpdf::Mm(210.0),
                    bold,
                );

                // 3 kotak info — di-render di sini juga karena coupled dengan title block
                // (Masa Berlaku | Uang Pertanggungan | Premi)
                let _ = italic;
            }
            TitleStatus::Invoice { status } => {
                set_color(layer, C_BLACK);
                layer.use_text(
                    "Invoice untuk Pembayaran Premi",
                    16.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 10.0),
                    bold,
                );
                set_color(layer, C_SILVER);
                layer.use_text(
                    "Mohon selesaikan pembayaran sebelum jatuh tempo untuk mengaktifkan polis Anda.",
                    9.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 18.0),
                    reg,
                );
                let (bg, label) = match *status {
                    "UNPAID" => (C_LEMON_400, "BELUM DIBAYAR"),
                    "PAID" => (C_MATCHA_300, "LUNAS"),
                    "EXPIRED" => (C_SILVER, "KADALUARSA"),
                    "CANCELLED" => (C_POMEGRANATE, "DIBATALKAN"),
                    other => (C_SILVER, other),
                };
                fill_rect(layer, 140.0, top_y - 20.0, 190.0, top_y - 10.0, bg);
                set_color(layer, C_BLACK);
                layer.use_text(
                    label,
                    10.0,
                    printpdf::Mm(146.0),
                    printpdf::Mm(top_y - 17.0),
                    bold,
                );
            }
            TitleStatus::Receipt => {
                set_color(layer, C_BLACK);
                layer.use_text(
                    "Pembayaran Premi Berhasil Diterima",
                    16.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 10.0),
                    bold,
                );
                set_color(layer, C_SILVER);
                layer.use_text(
                    "Dokumen ini merupakan bukti resmi penerimaan pembayaran premi asuransi.",
                    9.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 18.0),
                    reg,
                );
                fill_rect(
                    layer,
                    140.0,
                    top_y - 20.0,
                    190.0,
                    top_y - 10.0,
                    C_MATCHA_300,
                );
                set_color(layer, C_BLACK);
                layer.use_text(
                    "LUNAS",
                    11.0,
                    printpdf::Mm(157.0),
                    printpdf::Mm(top_y - 17.0),
                    bold,
                );
            }
        }
        bottom_y
    }
}
