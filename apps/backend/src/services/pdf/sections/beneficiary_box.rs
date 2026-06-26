//! Beneficiary box — "AHLI WARIS / PENERIMA MANFAAT" + nama.
//! LIFE only — di-skip kalau beneficiary_name kosong.

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{draw_line, set_color, truncate};
use crate::services::pdf::theme::{C_BLACK, C_CHARCOAL, C_SILVER};

pub struct BeneficiaryBox<'a> {
    pub name: &'a str,
}

impl<'a> BeneficiaryBox<'a> {
    /// Return None kalau name kosong (caller skip).
    pub fn new(name: Option<&'a str>) -> Option<Self> {
        name.filter(|s| !s.is_empty()).map(|n| Self { name: n })
    }

    pub fn height(&self) -> f32 {
        27.0
    }

    pub fn render(
        &self,
        layer: &PdfLayerReference,
        bold: &IndirectFontRef,
        italic: &IndirectFontRef,
        top_y: f32,
    ) -> f32 {
        let bottom_y = top_y - self.height();
        set_color(layer, C_SILVER);
        draw_line(layer, 15.0, top_y, 195.0, top_y, 0.3);
        layer.use_text(
            "AHLI WARIS / PENERIMA MANFAAT",
            7.0,
            printpdf::Mm(15.0),
            printpdf::Mm(top_y - 5.5),
            bold,
        );
        set_color(layer, C_BLACK);
        layer.use_text(
            truncate(self.name, 32).as_str(),
            11.0,
            printpdf::Mm(15.0),
            printpdf::Mm(top_y - 15.0),
            bold,
        );
        set_color(layer, C_CHARCOAL);
        layer.use_text(
            "Penerima manfaat polis sesuai ketentuan yang berlaku dalam polis ini.",
            8.0,
            printpdf::Mm(15.0),
            printpdf::Mm(top_y - 23.0),
            italic,
        );
        bottom_y
    }
}
