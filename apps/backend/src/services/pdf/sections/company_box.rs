//! Company info box — "DIDAFTARKAN OLEH INSTANSI" + nama + NPWP/industry.
//! INSTANSI only.

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{draw_line, set_color, truncate};
use crate::services::pdf::theme::{C_BLACK, C_CHARCOAL, C_SILVER};

pub struct CompanyBox<'a> {
    pub name: &'a str,
    pub npwp: Option<&'a str>,
    pub industry: Option<&'a str>,
}

impl<'a> CompanyBox<'a> {
    pub fn new(
        name: Option<&'a str>,
        npwp: Option<&'a str>,
        industry: Option<&'a str>,
    ) -> Option<Self> {
        let name = name.filter(|s| !s.is_empty())?;
        Some(Self {
            name,
            npwp: npwp.filter(|s| !s.is_empty()),
            industry: industry.filter(|s| !s.is_empty()),
        })
    }

    pub fn height(&self) -> f32 {
        27.0
    }

    pub fn render(
        &self,
        layer: &PdfLayerReference,
        bold: &IndirectFontRef,
        reg: &IndirectFontRef,
        top_y: f32,
    ) -> f32 {
        let bottom_y = top_y - self.height();
        set_color(layer, C_SILVER);
        draw_line(layer, 15.0, top_y, 195.0, top_y, 0.3);
        layer.use_text(
            "DIDAFTARKAN OLEH INSTANSI",
            7.0,
            printpdf::Mm(15.0),
            printpdf::Mm(top_y - 5.5),
            bold,
        );
        set_color(layer, C_BLACK);
        layer.use_text(
            truncate(self.name, 26).as_str(),
            11.0,
            printpdf::Mm(15.0),
            printpdf::Mm(top_y - 15.0),
            bold,
        );
        let mut parts: Vec<String> = Vec::new();
        if let Some(n) = self.npwp {
            parts.push(format!("NPWP: {n}"));
        }
        if let Some(i) = self.industry {
            parts.push(format!("Bidang: {i}"));
        }
        if !parts.is_empty() {
            set_color(layer, C_CHARCOAL);
            layer.use_text(
                parts.join("   ·   ").as_str(),
                8.0,
                printpdf::Mm(15.0),
                printpdf::Mm(top_y - 23.0),
                reg,
            );
        }
        bottom_y
    }
}
