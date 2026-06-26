//! Total box — large amount box di tengah-bawah halaman.
//! 2 variants: invoice (cream) vs receipt (matcha border + cream interior).

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{draw_line, fill_rect, format_idr, set_color, truncate};
use crate::services::pdf::theme::{C_BLACK, C_CREAM, C_MATCHA_300, C_OAT_BORDER, C_SILVER};
use rust_decimal::Decimal;

pub enum TotalBox<'a> {
    /// Invoice: cream box kanan-bawah. "Subtotal" + "TOTAL" + amount.
    Invoice { premium: Decimal },
    /// Receipt: matcha-bordered + cream interior. "TOTAL DIBAYAR" + 22pt amount + invoice ref.
    Receipt {
        paid_amount: Decimal,
        invoice_no: &'a str,
    },
}

impl<'a> TotalBox<'a> {
    pub fn invoice(premium: Decimal) -> Self {
        TotalBox::Invoice { premium }
    }
    pub fn receipt(paid_amount: Decimal, invoice_no: &'a str) -> Self {
        TotalBox::Receipt {
            paid_amount,
            invoice_no,
        }
    }

    pub fn height(&self) -> f32 {
        match self {
            TotalBox::Invoice { .. } => 28.0,
            TotalBox::Receipt { .. } => 34.0,
        }
    }

    /// Render dengan `top_y` sebagai top edge.
    pub fn render(
        &self,
        layer: &PdfLayerReference,
        bold: &IndirectFontRef,
        reg: &IndirectFontRef,
        top_y: f32,
    ) -> f32 {
        let bottom_y = top_y - self.height();
        match self {
            TotalBox::Invoice { premium } => {
                fill_rect(layer, 120.0, bottom_y, 190.0, top_y, C_CREAM);
                set_color(layer, C_SILVER);
                layer.use_text(
                    "Subtotal",
                    8.0,
                    printpdf::Mm(125.0),
                    printpdf::Mm(top_y - 8.0),
                    reg,
                );
                let s = format_idr(*premium);
                let x = 187.0 - (s.chars().count() as f32) * 2.0;
                layer.use_text(
                    s.as_str(),
                    9.0,
                    printpdf::Mm(x),
                    printpdf::Mm(top_y - 8.0),
                    reg,
                );
                set_color(layer, C_OAT_BORDER);
                draw_line(layer, 125.0, top_y - 15.0, 185.0, top_y - 15.0, 0.3);
                set_color(layer, C_BLACK);
                layer.use_text(
                    "TOTAL",
                    11.0,
                    printpdf::Mm(125.0),
                    printpdf::Mm(top_y - 20.0),
                    bold,
                );
                let s2 = format_idr(*premium);
                let x2 = 187.0 - (s2.chars().count() as f32) * 3.2;
                layer.use_text(
                    s2.as_str(),
                    14.0,
                    printpdf::Mm(x2),
                    printpdf::Mm(top_y - 21.0),
                    bold,
                );
            }
            TotalBox::Receipt {
                paid_amount,
                invoice_no,
            } => {
                fill_rect(layer, 20.0, bottom_y, 190.0, top_y, C_MATCHA_300);
                fill_rect(layer, 22.0, bottom_y + 2.0, 188.0, top_y - 2.0, C_CREAM);
                set_color(layer, C_SILVER);
                layer.use_text(
                    "TOTAL DIBAYAR",
                    8.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(top_y - 8.0),
                    bold,
                );
                set_color(layer, C_BLACK);
                let s = format_idr(*paid_amount);
                layer.use_text(
                    s.as_str(),
                    22.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(top_y - 22.0),
                    bold,
                );
                set_color(layer, C_SILVER);
                layer.use_text(
                    format!("Invoice {}", truncate(invoice_no, 22)).as_str(),
                    8.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(bottom_y + 6.0),
                    reg,
                );
            }
        }
        bottom_y
    }
}
