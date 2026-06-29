//! Info blocks — 3 kotak side-by-side di e-Policy page 1 (Masa Berlaku,
//! Uang Pertanggungan, Premi) + SignatureBlock di policy p3.

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{draw_line, fill_rect, format_idr, set_color, truncate};
use crate::services::pdf::theme::{C_BLACK, C_CREAM, C_OAT_LIGHT, C_SILVER};

/// Tiga kotak info side-by-side di policy p1 (di bawah judul).
pub(crate) struct PolicyScheduleBoxes {
    pub(crate) effective_date: chrono::NaiveDate,
    pub(crate) expiry_date: chrono::NaiveDate,
    pub(crate) coverage_term_years: i32,
    pub(crate) sum_assured: rust_decimal::Decimal,
    pub(crate) premium: rust_decimal::Decimal,
}

impl PolicyScheduleBoxes {
    pub(crate) fn height() -> f32 {
        46.0
    }

    pub(crate) fn render(
        &self,
        layer: &PdfLayerReference,
        bold: &IndirectFontRef,
        italic: &IndirectFontRef,
        reg: &IndirectFontRef,
        top_y: f32,
    ) -> f32 {
        let bottom_y = top_y - Self::height();
        // Kotak 1: Masa Berlaku (x 15..82)
        fill_rect(layer, 15.0, bottom_y, 82.0, top_y, C_CREAM);
        set_color(layer, C_SILVER);
        layer.use_text(
            "MASA BERLAKU",
            7.0,
            printpdf::Mm(19.0),
            printpdf::Mm(top_y - 6.0),
            bold,
        );
        set_color(layer, C_BLACK);
        layer.use_text(
            crate::services::pdf::helpers::format_date_id(self.effective_date).as_str(),
            9.5,
            printpdf::Mm(19.0),
            printpdf::Mm(top_y - 15.0),
            bold,
        );
        set_color(layer, C_SILVER);
        layer.use_text(
            "s.d.",
            7.5,
            printpdf::Mm(19.0),
            printpdf::Mm(top_y - 22.0),
            italic,
        );
        set_color(layer, C_BLACK);
        layer.use_text(
            crate::services::pdf::helpers::format_date_id(self.expiry_date).as_str(),
            9.5,
            printpdf::Mm(19.0),
            printpdf::Mm(top_y - 31.0),
            bold,
        );
        fill_rect(
            layer,
            19.0,
            bottom_y + 3.0,
            58.0,
            bottom_y + 10.5,
            C_OAT_LIGHT,
        );
        set_color(layer, C_BLACK);
        layer.use_text(
            format!("{} Tahun", self.coverage_term_years).as_str(),
            8.5,
            printpdf::Mm(21.0),
            printpdf::Mm(bottom_y + 5.0),
            bold,
        );

        // Kotak 2: Uang Pertanggungan (x 85..151)
        fill_rect(layer, 85.0, bottom_y, 151.0, top_y, C_CREAM);
        set_color(layer, C_SILVER);
        layer.use_text(
            "UANG PERTANGGUNGAN",
            7.0,
            printpdf::Mm(89.0),
            printpdf::Mm(top_y - 6.0),
            bold,
        );
        set_color(layer, C_BLACK);
        layer.use_text(
            format_idr(self.sum_assured).as_str(),
            11.5,
            printpdf::Mm(89.0),
            printpdf::Mm(top_y - 17.5),
            bold,
        );
        set_color(layer, (85, 83, 78));
        layer.use_text(
            "Nilai Pertanggungan Polis",
            7.5,
            printpdf::Mm(89.0),
            printpdf::Mm(top_y - 28.0),
            reg,
        );
        layer.use_text(
            "sesuai manfaat produk",
            7.5,
            printpdf::Mm(89.0),
            printpdf::Mm(top_y - 33.5),
            reg,
        );

        // Kotak 3: Premi (x 154..195)
        fill_rect(layer, 154.0, bottom_y, 195.0, top_y, C_CREAM);
        set_color(layer, C_SILVER);
        layer.use_text(
            "PREMI",
            7.0,
            printpdf::Mm(158.0),
            printpdf::Mm(top_y - 6.0),
            bold,
        );
        set_color(layer, C_BLACK);
        layer.use_text(
            format_idr(self.premium).as_str(),
            10.5,
            printpdf::Mm(158.0),
            printpdf::Mm(top_y - 17.0),
            bold,
        );
        set_color(layer, (85, 83, 78));
        layer.use_text(
            "per tahun",
            8.0,
            printpdf::Mm(158.0),
            printpdf::Mm(top_y - 27.0),
            reg,
        );
        layer.use_text(
            format!("{} thn", self.coverage_term_years).as_str(),
            8.0,
            printpdf::Mm(158.0),
            printpdf::Mm(top_y - 33.5),
            reg,
        );

        bottom_y
    }
}

/// Signature block — dua blok tanda tangan di policy p3.
pub(crate) struct SignatureBlock<'a> {
    pub(crate) customer_name: &'a str,
    pub(crate) effective_date: chrono::NaiveDate,
}

impl<'a> SignatureBlock<'a> {
    pub(crate) fn height() -> f32 {
        40.0
    }

    pub(crate) fn render(
        &self,
        layer: &PdfLayerReference,
        bold: &IndirectFontRef,
        reg: &IndirectFontRef,
        italic: &IndirectFontRef,
        top_y: f32,
    ) -> f32 {
        let bottom_y = top_y - Self::height();
        set_color(layer, C_SILVER);
        layer.use_text(
            "PEMEGANG POLIS",
            7.0,
            printpdf::Mm(20.0),
            printpdf::Mm(top_y - 7.0),
            bold,
        );
        layer.use_text(
            "DITERBITKAN OLEH",
            7.0,
            printpdf::Mm(130.0),
            printpdf::Mm(top_y - 7.0),
            bold,
        );
        draw_line(layer, 20.0, top_y - 14.5, 92.0, top_y - 14.5, 0.5);
        draw_line(layer, 130.0, top_y - 14.5, 195.0, top_y - 14.5, 0.5);
        set_color(layer, C_BLACK);
        layer.use_text(
            truncate(self.customer_name, 26).as_str(),
            8.5,
            printpdf::Mm(20.0),
            printpdf::Mm(top_y - 18.0),
            reg,
        );
        layer.use_text(
            "InsureTrack",
            8.5,
            printpdf::Mm(130.0),
            printpdf::Mm(top_y - 18.0),
            bold,
        );
        set_color(layer, C_SILVER);
        layer.use_text(
            "Tanda tangan elektronik",
            6.5,
            printpdf::Mm(20.0),
            printpdf::Mm(top_y - 21.5),
            italic,
        );
        layer.use_text(
            format!(
                "Diterbitkan: {}",
                crate::services::pdf::helpers::format_date_id(self.effective_date)
            )
            .as_str(),
            6.5,
            printpdf::Mm(130.0),
            printpdf::Mm(top_y - 21.5),
            italic,
        );
        bottom_y
    }
}
