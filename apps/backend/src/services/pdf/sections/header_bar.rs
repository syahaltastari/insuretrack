//! Header bar — black band di top halaman. 4 variants:
//! - `FullCover`: page 1 invoice/receipt/lampiran (brand + doc label + tagline)
//! - `MiniPolicy`: page 2/3 e-Policy (brand + "Halaman X dari Y")
//! - `LampiranContinued`: halaman > 1 lampiran (centered "Daftar Peserta (Lanjutan)")

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{fill_rect, set_color};
use crate::services::pdf::theme::{C_BLACK, C_CREAM, C_WHITE};

pub(crate) enum HeaderBar<'a> {
    /// Page 1 cover (invoice/receipt/lampiran): brand kiri besar, doc_label
    /// kanan besar, tagline + subtitle di bawah.
    FullCover {
        doc_label: &'a str,
        subtitle: &'a str,
    },
    /// Page 2/3 e-Policy: brand mini kiri, page label kanan.
    MiniPolicy { page_label: &'a str },
    /// Halaman > 1 lampiran: judul "(Lanjutan)" di tengah.
    LampiranContinued { doc_label: &'a str },
}

impl<'a> HeaderBar<'a> {
    /// Tinggi header dalam mm.
    pub(crate) fn height(&self) -> f32 {
        match self {
            HeaderBar::FullCover { .. } | HeaderBar::LampiranContinued { .. } => 23.0,
            HeaderBar::MiniPolicy { .. } => 18.0,
        }
    }

    /// Render ke `layer` dengan `top_y` sebagai top edge. Return bottom y.
    pub(crate) fn render(
        &self,
        layer: &PdfLayerReference,
        bold: &IndirectFontRef,
        reg: &IndirectFontRef,
        top_y: f32,
    ) -> f32 {
        let bottom_y = top_y - self.height();
        match self {
            HeaderBar::FullCover {
                doc_label,
                subtitle,
            } => {
                fill_rect(layer, 0.0, bottom_y, 210.0, top_y, C_BLACK);
                set_color(layer, C_WHITE);
                layer.use_text(
                    "InsureTrack",
                    20.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 10.0),
                    bold,
                );
                set_color(layer, C_CREAM);
                layer.use_text(
                    "Asuransi digital, prosesnya cepat, polis langsung terbit.",
                    9.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(top_y - 19.0),
                    reg,
                );
                set_color(layer, C_WHITE);
                layer.use_text(
                    *doc_label,
                    22.0,
                    printpdf::Mm(120.0),
                    printpdf::Mm(top_y - 10.0),
                    bold,
                );
                set_color(layer, C_CREAM);
                layer.use_text(
                    *subtitle,
                    9.0,
                    printpdf::Mm(120.0),
                    printpdf::Mm(top_y - 19.0),
                    reg,
                );
            }
            HeaderBar::MiniPolicy { page_label } => {
                fill_rect(layer, 0.0, bottom_y, 210.0, top_y, C_BLACK);
                set_color(layer, C_WHITE);
                layer.use_text(
                    "InsureTrack",
                    12.0,
                    printpdf::Mm(15.0),
                    printpdf::Mm(top_y - 8.0),
                    bold,
                );
                set_color(layer, C_CREAM);
                layer.use_text(
                    "Platform Asuransi Digital",
                    7.5,
                    printpdf::Mm(15.0),
                    printpdf::Mm(top_y - 15.0),
                    reg,
                );
                layer.use_text(
                    *page_label,
                    7.5,
                    printpdf::Mm(163.0),
                    printpdf::Mm(top_y - 11.5),
                    reg,
                );
            }
            HeaderBar::LampiranContinued { doc_label } => {
                fill_rect(layer, 0.0, bottom_y, 210.0, top_y, C_BLACK);
                set_color(layer, C_CREAM);
                layer.use_text(
                    format!("{} — Daftar Peserta (Lanjutan)", doc_label).as_str(),
                    11.0,
                    printpdf::Mm(105.0),
                    printpdf::Mm(top_y - 12.0),
                    bold,
                );
            }
        }
        bottom_y
    }
}
