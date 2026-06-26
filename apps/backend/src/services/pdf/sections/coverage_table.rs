//! Coverage table — header baris + 1 data row + opsional breakdown line.
//! 3 variants: Policy, Invoice, Receipt. Applicant_type drives y-shift.

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{draw_line, fill_rect, format_idr, set_color, truncate};
use crate::services::pdf::theme::{C_BLACK, C_OAT_BORDER, C_OAT_LIGHT, C_SILVER};
use chrono::Datelike;
use rust_decimal::Decimal;

pub struct CoverageTable<'a> {
    pub variant: CoverageVariant,
    pub product_name: &'a str,
    pub plan_tier: Option<&'a str>,
    pub sum_assured: Decimal,
    pub premium: Decimal,
    pub coverage_term_years: i32,
    pub applicant_type: &'a str,
    pub per_participant_premium: Option<Decimal>,
    pub participant_count: usize,
}

pub enum CoverageVariant {
    Policy,
    Invoice,
    Receipt { effective_date: chrono::NaiveDate },
}

impl<'a> CoverageTable<'a> {
    pub fn height(&self) -> f32 {
        match self.variant {
            CoverageVariant::Policy => 38.0, // +total premi row
            CoverageVariant::Invoice | CoverageVariant::Receipt { .. } => {
                if self.applicant_type == "INSTANSI"
                    && self.per_participant_premium.is_some()
                    && self.participant_count > 0
                {
                    40.0 // base + breakdown line
                } else {
                    36.0
                }
            }
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
        match self.variant {
            CoverageVariant::Policy => {
                set_color(layer, C_BLACK);
                layer.use_text(
                    "DETAIL COVERAGE",
                    8.5,
                    printpdf::Mm(15.0),
                    printpdf::Mm(top_y - 4.0),
                    bold,
                );
                draw_line(layer, 15.0, top_y - 8.0, 195.0, top_y - 8.0, 0.5);
                fill_rect(layer, 15.0, top_y - 18.0, 195.0, top_y - 8.0, C_OAT_LIGHT);
                set_color(layer, C_BLACK);
                layer.use_text(
                    "JENIS MANFAAT",
                    7.0,
                    printpdf::Mm(18.0),
                    printpdf::Mm(top_y - 14.0),
                    bold,
                );
                layer.use_text(
                    "UANG PERTANGGUNGAN",
                    7.0,
                    printpdf::Mm(74.0),
                    printpdf::Mm(top_y - 14.0),
                    bold,
                );
                layer.use_text(
                    "PREMI / TAHUN",
                    7.0,
                    printpdf::Mm(129.0),
                    printpdf::Mm(top_y - 14.0),
                    bold,
                );
                layer.use_text(
                    "MASA",
                    7.0,
                    printpdf::Mm(172.0),
                    printpdf::Mm(top_y - 14.0),
                    bold,
                );
                let label =
                    if self.product_name.contains("Life") || self.product_name.contains("Jiwa") {
                        "Manfaat Meninggal Dunia"
                    } else if self.product_name.contains("Accident")
                        || self.product_name.contains("Kecelakaan")
                    {
                        "Manfaat Kecelakaan"
                    } else {
                        "Manfaat Rawat Inap"
                    };
                layer.use_text(
                    label,
                    9.0,
                    printpdf::Mm(18.0),
                    printpdf::Mm(top_y - 26.0),
                    bold,
                );
                set_color(layer, (85, 83, 78));
                layer.use_text(
                    format_idr(self.sum_assured).as_str(),
                    9.0,
                    printpdf::Mm(74.0),
                    printpdf::Mm(top_y - 26.0),
                    reg,
                );
                layer.use_text(
                    format_idr(self.premium).as_str(),
                    9.0,
                    printpdf::Mm(129.0),
                    printpdf::Mm(top_y - 26.0),
                    reg,
                );
                layer.use_text(
                    format!("{} thn", self.coverage_term_years).as_str(),
                    9.0,
                    printpdf::Mm(172.0),
                    printpdf::Mm(top_y - 26.0),
                    reg,
                );
                draw_line(layer, 15.0, top_y - 32.0, 195.0, top_y - 32.0, 0.2);
                fill_rect(layer, 15.0, top_y - 46.0, 195.0, top_y - 34.0, C_OAT_LIGHT);
                set_color(layer, (85, 83, 78));
                layer.use_text(
                    "TOTAL PREMI SELAMA POLIS",
                    7.5,
                    printpdf::Mm(18.0),
                    printpdf::Mm(top_y - 41.0),
                    bold,
                );
                set_color(layer, C_BLACK);
                let total = self.premium * Decimal::from(self.coverage_term_years);
                layer.use_text(
                    format_idr(total).as_str(),
                    10.0,
                    printpdf::Mm(129.0),
                    printpdf::Mm(top_y - 41.5),
                    bold,
                );
                layer.use_text(
                    format!("{} Tahun", self.coverage_term_years).as_str(),
                    7.5,
                    printpdf::Mm(172.0),
                    printpdf::Mm(top_y - 41.0),
                    reg,
                );
            }
            CoverageVariant::Invoice => {
                let label_y = top_y - 10.0;
                let header_top = if self.applicant_type == "INSTANSI" {
                    top_y - 23.0
                } else {
                    top_y - 13.0
                };
                let header_bottom = if self.applicant_type == "INSTANSI" {
                    top_y - 15.0
                } else {
                    top_y - 5.0
                };
                let header_text_y = header_bottom - 5.0;
                let data_y = header_bottom - 10.0;

                set_color(layer, C_BLACK);
                layer.use_text(
                    "RINCIAN PEMBAYARAN",
                    7.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(label_y),
                    bold,
                );
                set_color(layer, C_OAT_BORDER);
                draw_line(layer, 20.0, label_y - 3.0, 190.0, label_y - 3.0, 0.3);
                fill_rect(layer, 20.0, header_bottom, 190.0, header_top, C_OAT_LIGHT);
                set_color(layer, C_BLACK);
                layer.use_text(
                    "PRODUK",
                    7.0,
                    printpdf::Mm(23.0),
                    printpdf::Mm(header_text_y),
                    bold,
                );
                layer.use_text(
                    "SUM ASSURED",
                    7.0,
                    printpdf::Mm(85.0),
                    printpdf::Mm(header_text_y),
                    bold,
                );
                layer.use_text(
                    "TERM",
                    7.0,
                    printpdf::Mm(125.0),
                    printpdf::Mm(header_text_y),
                    bold,
                );
                layer.use_text(
                    "SUBTOTAL",
                    7.0,
                    printpdf::Mm(155.0),
                    printpdf::Mm(header_text_y),
                    bold,
                );

                let product_display = match self.plan_tier {
                    Some(tier) => format!("{} — {}", self.product_name, tier),
                    None => self.product_name.to_string(),
                };
                layer.use_text(
                    truncate(&product_display, 28).as_str(),
                    10.0,
                    printpdf::Mm(23.0),
                    printpdf::Mm(data_y),
                    bold,
                );
                layer.use_text(
                    format_idr(self.sum_assured).as_str(),
                    10.0,
                    printpdf::Mm(85.0),
                    printpdf::Mm(data_y),
                    bold,
                );
                layer.use_text(
                    format!("{} tahun", self.coverage_term_years).as_str(),
                    10.0,
                    printpdf::Mm(125.0),
                    printpdf::Mm(data_y),
                    bold,
                );
                let sub = format_idr(self.premium);
                let x_sub = 187.0 - (sub.chars().count() as f32) * 2.0;
                layer.use_text(
                    sub.as_str(),
                    11.0,
                    printpdf::Mm(x_sub),
                    printpdf::Mm(data_y),
                    bold,
                );

                set_color(layer, C_SILVER);
                layer.use_text(
                    format!(
                        "{} tahun · Dimulai setelah pembayaran dikonfirmasi",
                        self.coverage_term_years
                    )
                    .as_str(),
                    7.5,
                    printpdf::Mm(23.0),
                    printpdf::Mm(data_y - 5.0),
                    reg,
                );

                if self.applicant_type == "INSTANSI" {
                    if let Some(per_p) = self.per_participant_premium {
                        if self.participant_count > 0 {
                            let total_check = per_p * Decimal::from(self.participant_count as u64);
                            let breakdown = format!(
                                "Premi per peserta: {} × {} peserta = {}",
                                format_idr(per_p),
                                self.participant_count,
                                format_idr(total_check)
                            );
                            layer.use_text(
                                breakdown.as_str(),
                                7.5,
                                printpdf::Mm(23.0),
                                printpdf::Mm(data_y - 10.0),
                                reg,
                            );
                        }
                    }
                }

                let line_y = if self.applicant_type == "INSTANSI" {
                    data_y - 12.0
                } else {
                    data_y - 7.0
                };
                set_color(layer, C_OAT_BORDER);
                draw_line(layer, 20.0, line_y, 190.0, line_y, 0.2);
            }
            CoverageVariant::Receipt { effective_date } => {
                let label_y = if self.applicant_type == "INSTANSI" {
                    top_y - 15.0
                } else {
                    top_y - 10.0
                };
                let header_top = if self.applicant_type == "INSTANSI" {
                    top_y - 28.0
                } else {
                    top_y - 18.0
                };
                let header_bottom = if self.applicant_type == "INSTANSI" {
                    top_y - 20.0
                } else {
                    top_y - 10.0
                };
                let header_text_y = header_bottom - 5.0;
                let data_y = header_bottom - 10.0;

                set_color(layer, C_BLACK);
                layer.use_text(
                    "RINCIAN PEMBAYARAN",
                    7.0,
                    printpdf::Mm(20.0),
                    printpdf::Mm(label_y),
                    bold,
                );
                set_color(layer, C_OAT_BORDER);
                draw_line(layer, 20.0, label_y - 3.0, 190.0, label_y - 3.0, 0.3);
                fill_rect(layer, 20.0, header_bottom, 190.0, header_top, C_OAT_LIGHT);
                set_color(layer, C_BLACK);
                layer.use_text(
                    "PRODUK",
                    7.0,
                    printpdf::Mm(23.0),
                    printpdf::Mm(header_text_y),
                    bold,
                );
                layer.use_text(
                    "UANG PERTANGGUNGAN",
                    7.0,
                    printpdf::Mm(80.0),
                    printpdf::Mm(header_text_y),
                    bold,
                );
                layer.use_text(
                    "TERM",
                    7.0,
                    printpdf::Mm(160.0),
                    printpdf::Mm(header_text_y),
                    bold,
                );

                let product_display = match self.plan_tier {
                    Some(tier) => format!("{} — {}", self.product_name, tier),
                    None => self.product_name.to_string(),
                };
                layer.use_text(
                    truncate(&product_display, 28).as_str(),
                    10.0,
                    printpdf::Mm(23.0),
                    printpdf::Mm(data_y),
                    bold,
                );
                layer.use_text(
                    format_idr(self.sum_assured).as_str(),
                    10.0,
                    printpdf::Mm(80.0),
                    printpdf::Mm(data_y),
                    bold,
                );
                layer.use_text(
                    format!("{} thn", self.coverage_term_years).as_str(),
                    10.0,
                    printpdf::Mm(160.0),
                    printpdf::Mm(data_y),
                    bold,
                );

                // Periode: effective + N tahun
                let expiry_year = effective_date.year() + self.coverage_term_years;
                let expiry = effective_date
                    .with_year(expiry_year)
                    .unwrap_or(effective_date);
                set_color(layer, C_SILVER);
                layer.use_text(
                    format!(
                        "Periode perlindungan: s.d. {}",
                        format_idr_only_date(expiry)
                    )
                    .as_str(),
                    7.5,
                    printpdf::Mm(23.0),
                    printpdf::Mm(data_y - 5.0),
                    reg,
                );

                if self.applicant_type == "INSTANSI" {
                    if let Some(per_p) = self.per_participant_premium {
                        if self.participant_count > 0 {
                            let total_check = per_p * Decimal::from(self.participant_count as u64);
                            let breakdown = format!(
                                "Premi per peserta: {} × {} peserta = {}",
                                format_idr(per_p),
                                self.participant_count,
                                format_idr(total_check)
                            );
                            layer.use_text(
                                breakdown.as_str(),
                                7.5,
                                printpdf::Mm(23.0),
                                printpdf::Mm(data_y - 10.0),
                                reg,
                            );
                        }
                    }
                }

                let line_y = if self.applicant_type == "INSTANSI" {
                    data_y - 12.0
                } else {
                    data_y - 7.0
                };
                set_color(layer, C_OAT_BORDER);
                draw_line(layer, 20.0, line_y, 190.0, line_y, 0.2);
            }
        }
        bottom_y
    }
}

fn format_idr_only_date(d: chrono::NaiveDate) -> String {
    crate::services::pdf::helpers::format_date_id(d)
}
