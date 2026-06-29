//! Footer bar — black band di bottom halaman. 4 variants untuk
//! e-Policy pages, invoice, receipt, dan lampiran.

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{fill_rect, set_color};
use crate::services::pdf::theme::{C_BLACK, C_CREAM, C_WHITE};

pub(crate) enum FooterBar<'a> {
    /// Footer e-Policy p1/p2 (tinggi 17mm): brand + halaman + no polis.
    PolicyStandard {
        policy_no: &'a str,
        page_label: &'a str,
    },
    /// Footer e-Policy p3 (tinggi 15.5mm, lebih pendek).
    PolicyLastPage {
        policy_no: &'a str,
        page_label: &'a str,
    },
    /// Footer invoice (tinggi 18mm): brand + support + "Halaman 1".
    Invoice,
    /// Footer receipt (tinggi 18mm): brand + support + "Bukti Pembayaran Resmi".
    Receipt,
    /// Footer lampiran (tinggi 12mm): brand + support + page indicator.
    Lampiran { page_no: usize },
}

impl<'a> FooterBar<'a> {
    pub(crate) fn height(&self) -> f32 {
        match self {
            FooterBar::PolicyStandard { .. } => 17.0,
            FooterBar::PolicyLastPage { .. } => 15.5,
            FooterBar::Invoice | FooterBar::Receipt => 18.0,
            FooterBar::Lampiran { .. } => 12.0,
        }
    }

    /// Render footer. Y = 0 (bottom edge) sampai height().
    pub(crate) fn render(&self, layer: &PdfLayerReference, bold: &IndirectFontRef, reg: &IndirectFontRef) {
        let h = self.height();
        fill_rect(layer, 0.0, 0.0, 210.0, h, C_BLACK);
        match self {
            FooterBar::PolicyStandard {
                policy_no,
                page_label,
            } => {
                set_color(layer, C_CREAM);
                layer.use_text(
                    "InsureTrack",
                    8.0,
                    printpdf::Mm(15.0),
                    printpdf::Mm(9.0),
                    bold,
                );
                layer.use_text(
                    format!("Platform Asuransi Digital  ·  {page_label}").as_str(),
                    7.0,
                    printpdf::Mm(15.0),
                    printpdf::Mm(3.5),
                    reg,
                );
                layer.use_text(
                    format!("No. Polis: {policy_no}").as_str(),
                    7.0,
                    printpdf::Mm(140.0),
                    printpdf::Mm(6.0),
                    reg,
                );
            }
            FooterBar::PolicyLastPage {
                policy_no,
                page_label,
            } => {
                set_color(layer, C_CREAM);
                layer.use_text(
                    "InsureTrack",
                    8.0,
                    printpdf::Mm(15.0),
                    printpdf::Mm(8.0),
                    bold,
                );
                layer.use_text(
                    format!("Platform Asuransi Digital  ·  {page_label}").as_str(),
                    7.0,
                    printpdf::Mm(15.0),
                    printpdf::Mm(3.0),
                    reg,
                );
                layer.use_text(
                    format!("No. Polis: {policy_no}").as_str(),
                    7.0,
                    printpdf::Mm(140.0),
                    printpdf::Mm(5.5),
                    reg,
                );
            }
            FooterBar::Invoice => {
                set_color(layer, C_CREAM);
                layer.use_text(
                    "InsureTrack",
                    8.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(8.0),
                    bold,
                );
                layer.use_text(
                    "Platform Asuransi Digital · support@insuretrack.example",
                    7.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(3.0),
                    reg,
                );
                layer.use_text(
                    "Halaman 1",
                    7.0,
                    printpdf::Mm(170.0),
                    printpdf::Mm(5.0),
                    reg,
                );
            }
            FooterBar::Receipt => {
                set_color(layer, C_CREAM);
                layer.use_text(
                    "InsureTrack",
                    8.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(8.0),
                    bold,
                );
                layer.use_text(
                    "Platform Asuransi Digital · support@insuretrack.example",
                    7.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(3.0),
                    reg,
                );
                layer.use_text(
                    "Bukti Pembayaran Resmi · Halaman 1",
                    7.0,
                    printpdf::Mm(145.0),
                    printpdf::Mm(5.0),
                    reg,
                );
            }
            FooterBar::Lampiran { page_no } => {
                set_color(layer, C_WHITE);
                layer.use_text(
                    "InsureTrack",
                    8.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(7.0),
                    bold,
                );
                set_color(layer, C_CREAM);
                layer.use_text(
                    "Platform Asuransi Digital · support@insuretrack.example",
                    7.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(3.0),
                    reg,
                );
                layer.use_text(
                    format!("Halaman {page_no}").as_str(),
                    7.0,
                    printpdf::Mm(170.0),
                    printpdf::Mm(5.0),
                    reg,
                );
            }
        }
    }
}
