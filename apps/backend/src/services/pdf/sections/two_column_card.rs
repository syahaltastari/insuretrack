//! Two-column card — cream rectangle dibagi vertical line, dua kolom label/value rows.
//! 3 contexts × INDIVIDU/INSTANSI variants. Caller pre-builds rows.

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{
    draw_line, fill_rect, format_date_id, set_color, truncate, wrap_text,
};
use crate::services::pdf::theme::{C_BLACK, C_CREAM, C_OAT_BORDER, C_SILVER};

pub(crate) struct CardRow {
    pub(crate) label: &'static str,
    pub(crate) value: String,
}

pub(crate) enum TwoColumnKind<'a> {
    PolicySchedule {
        left_title: &'a str,
        right_title: &'a str,
        left_rows: Vec<CardRow>,
        right_rows: Vec<CardRow>,
        alamat: Option<String>,
    },
    InvoiceBillTo {
        applicant_type: &'a str,
        company_name: Option<String>,
        company_npwp: Option<String>,
        pic_name: &'a str,
        pic_nik: &'a str,
        pic_email: &'a str,
        pic_mobile: &'a str,
        customer_name: &'a str,
        customer_nik: &'a str,
        customer_birth_place: &'a str,
        customer_birth_date: chrono::NaiveDate,
        customer_email: &'a str,
        customer_mobile: &'a str,
        customer_address: &'a str,
        invoice_no: &'a str,
        registration_no: &'a str,
        created_at: chrono::NaiveDate,
        due_date: chrono::NaiveDate,
        status: &'a str,
    },
    ReceiptPayer {
        applicant_type: &'a str,
        company_name: Option<String>,
        company_npwp: Option<String>,
        pic_name: &'a str,
        pic_nik: &'a str,
        pic_email: &'a str,
        customer_name: &'a str,
        customer_nik: &'a str,
        customer_email: &'a str,
        invoice_no: &'a str,
        registration_no: &'a str,
        payment_date: chrono::NaiveDate,
        payment_channel: Option<&'a str>,
        payment_reference: Option<&'a str>,
    },
}

impl<'a> TwoColumnKind<'a> {
    pub(crate) fn height(&self) -> f32 {
        match self {
            TwoColumnKind::PolicySchedule { .. } => 66.0,
            TwoColumnKind::InvoiceBillTo { applicant_type, .. } => {
                if *applicant_type == "INSTANSI" {
                    56.0
                } else {
                    44.0
                }
            }
            TwoColumnKind::ReceiptPayer { applicant_type, .. } => {
                if *applicant_type == "INSTANSI" {
                    60.0
                } else {
                    50.0
                }
            }
        }
    }
}

pub(crate) fn render<'a>(
    kind: &TwoColumnKind<'a>,
    layer: &PdfLayerReference,
    bold: &IndirectFontRef,
    reg: &IndirectFontRef,
    top_y: f32,
) -> f32 {
    let bottom_y = top_y - kind.height();
    match kind {
        TwoColumnKind::PolicySchedule {
            left_title,
            right_title,
            left_rows,
            right_rows,
            alamat,
        } => {
            fill_rect(layer, 15.0, bottom_y, 195.0, top_y, C_CREAM);
            set_color(layer, C_OAT_BORDER);
            draw_line(layer, 105.0, bottom_y, 105.0, top_y, 0.3);
            set_color(layer, C_SILVER);
            layer.use_text(
                *left_title,
                7.0,
                printpdf::Mm(19.0),
                printpdf::Mm(top_y - 6.0),
                bold,
            );
            layer.use_text(
                *right_title,
                7.0,
                printpdf::Mm(109.0),
                printpdf::Mm(top_y - 6.0),
                bold,
            );

            let mut ly = top_y - 14.0;
            for row in left_rows {
                if ly < bottom_y + 4.0 {
                    break;
                }
                set_color(layer, C_SILVER);
                layer.use_text(row.label, 7.5, printpdf::Mm(19.0), printpdf::Mm(ly), reg);
                set_color(layer, C_BLACK);
                layer.use_text(
                    truncate(&row.value, 26).as_str(),
                    8.5,
                    printpdf::Mm(19.0),
                    printpdf::Mm(ly - 4.5),
                    reg,
                );
                ly -= 10.5;
            }
            if let Some(addr) = alamat {
                if ly > bottom_y + 8.0 {
                    set_color(layer, C_SILVER);
                    layer.use_text("Alamat", 7.5, printpdf::Mm(19.0), printpdf::Mm(ly), reg);
                    let lines = wrap_text(addr, 30);
                    for (i, line) in lines.iter().take(2).enumerate() {
                        let ypos = ly - 4.5 - i as f32 * 4.5;
                        if ypos > bottom_y + 2.0 {
                            set_color(layer, C_BLACK);
                            layer.use_text(
                                line.as_str(),
                                8.5,
                                printpdf::Mm(19.0),
                                printpdf::Mm(ypos),
                                reg,
                            );
                        }
                    }
                }
            }

            let mut ry = top_y - 14.0;
            for row in right_rows {
                if ry < bottom_y + 4.0 {
                    break;
                }
                set_color(layer, C_SILVER);
                layer.use_text(row.label, 7.5, printpdf::Mm(109.0), printpdf::Mm(ry), reg);
                set_color(layer, C_BLACK);
                layer.use_text(
                    truncate(&row.value, 22).as_str(),
                    8.5,
                    printpdf::Mm(109.0),
                    printpdf::Mm(ry - 4.5),
                    bold,
                );
                ry -= 9.5;
            }
        }
        TwoColumnKind::InvoiceBillTo {
            applicant_type,
            company_name,
            company_npwp,
            pic_name,
            pic_nik,
            pic_email,
            pic_mobile,
            customer_name,
            customer_nik,
            customer_birth_place,
            customer_birth_date,
            customer_email,
            customer_mobile,
            customer_address,
            invoice_no,
            registration_no,
            created_at,
            due_date,
            status,
        } => {
            let card_top = top_y;
            let card_bottom = bottom_y;
            fill_rect(layer, 20.0, card_bottom, 190.0, card_top, C_CREAM);
            set_color(layer, C_OAT_BORDER);
            draw_line(layer, 105.0, card_bottom, 105.0, card_top, 0.3);

            if *applicant_type == "INSTANSI" {
                set_color(layer, C_SILVER);
                layer.use_text(
                    "DITAGIHKAN KEPADA",
                    7.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(card_top - 6.0),
                    bold,
                );
                set_color(layer, C_BLACK);
                layer.use_text(
                    truncate(company_name.as_deref().unwrap_or("—"), 30).as_str(),
                    12.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(card_top - 14.0),
                    bold,
                );
                set_color(layer, C_SILVER);
                let mut y = card_top - 20.0;
                if let Some(npwp) = company_npwp.as_deref().filter(|s| !s.is_empty()) {
                    layer.use_text(
                        format!("NPWP: {}", truncate(npwp, 22)).as_str(),
                        8.5,
                        printpdf::Mm(25.0),
                        printpdf::Mm(y),
                        reg,
                    );
                    y -= 4.0;
                }
                y -= 1.0;
                set_color(layer, C_OAT_BORDER);
                draw_line(layer, 25.0, y, 100.0, y, 0.2);
                y -= 5.0;
                set_color(layer, C_SILVER);
                layer.use_text("PIC", 7.0, printpdf::Mm(25.0), printpdf::Mm(y), bold);
                y -= 4.5;
                set_color(layer, C_BLACK);
                layer.use_text(*pic_name, 8.5, printpdf::Mm(25.0), printpdf::Mm(y), reg);
                y -= 3.5;
                layer.use_text(
                    format!("NIK: {pic_nik}").as_str(),
                    8.5,
                    printpdf::Mm(25.0),
                    printpdf::Mm(y),
                    reg,
                );
                y -= 3.5;
                layer.use_text(
                    format!("Email: {}", truncate(pic_email, 24)).as_str(),
                    8.5,
                    printpdf::Mm(25.0),
                    printpdf::Mm(y),
                    reg,
                );
                y -= 3.5;
                layer.use_text(
                    format!("HP: {pic_mobile}").as_str(),
                    8.5,
                    printpdf::Mm(25.0),
                    printpdf::Mm(y),
                    reg,
                );
            } else {
                set_color(layer, C_SILVER);
                layer.use_text(
                    "DITAGIHKAN KEPADA",
                    7.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(card_top - 6.0),
                    bold,
                );
                set_color(layer, C_BLACK);
                layer.use_text(
                    *customer_name,
                    12.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(card_top - 14.0),
                    bold,
                );
                set_color(layer, C_SILVER);
                layer.use_text(
                    format!("NIK: {customer_nik}").as_str(),
                    8.5,
                    printpdf::Mm(25.0),
                    printpdf::Mm(card_top - 21.0),
                    reg,
                );
                let ttl = format!(
                    "{}, {}",
                    customer_birth_place,
                    format_date_id(*customer_birth_date)
                );
                layer.use_text(
                    format!("TTL: {ttl}").as_str(),
                    8.5,
                    printpdf::Mm(25.0),
                    printpdf::Mm(card_top - 27.0),
                    reg,
                );
                let addr_lines = wrap_text(customer_address, 38);
                for (i, line) in addr_lines.iter().enumerate() {
                    let y = card_top - 33.0 - i as f32 * 4.0;
                    if y < card_bottom + 3.0 {
                        break;
                    }
                    layer.use_text(line.as_str(), 8.5, printpdf::Mm(25.0), printpdf::Mm(y), reg);
                }
                let count = (addr_lines.len() as f32).min(3.0);
                let cy = card_top - 33.0 - count * 4.0 - 1.0;
                if cy > card_bottom + 3.0 {
                    layer.use_text(
                        format!("Email: {customer_email}").as_str(),
                        8.5,
                        printpdf::Mm(25.0),
                        printpdf::Mm(cy),
                        reg,
                    );
                    layer.use_text(
                        format!("HP: {customer_mobile}").as_str(),
                        8.5,
                        printpdf::Mm(25.0),
                        printpdf::Mm(cy - 4.0),
                        reg,
                    );
                }
            }

            // Right column
            set_color(layer, C_SILVER);
            layer.use_text(
                "INVOICE",
                7.0,
                printpdf::Mm(110.0),
                printpdf::Mm(card_top - 6.0),
                bold,
            );
            set_color(layer, C_BLACK);
            layer.use_text(
                *invoice_no,
                11.0,
                printpdf::Mm(110.0),
                printpdf::Mm(card_top - 14.0),
                bold,
            );
            set_color(layer, C_SILVER);
            layer.use_text(
                format!("No. Reg: {registration_no}").as_str(),
                8.5,
                printpdf::Mm(110.0),
                printpdf::Mm(card_top - 21.0),
                reg,
            );
            layer.use_text(
                format!("Issued: {}", format_date_id(*created_at)).as_str(),
                8.5,
                printpdf::Mm(110.0),
                printpdf::Mm(card_top - 27.0),
                reg,
            );
            if *status == "UNPAID" {
                fill_rect(
                    layer,
                    108.0,
                    card_top - 40.0,
                    188.0,
                    card_top - 33.0,
                    (248, 204, 101),
                );
            }
            set_color(layer, C_BLACK);
            layer.use_text(
                format!("Jatuh Tempo: {}", format_date_id(*due_date)).as_str(),
                9.0,
                printpdf::Mm(110.0),
                printpdf::Mm(card_top - 38.0),
                bold,
            );
        }
        TwoColumnKind::ReceiptPayer {
            applicant_type,
            company_name,
            company_npwp,
            pic_name,
            pic_nik,
            pic_email,
            customer_name,
            customer_nik,
            customer_email,
            invoice_no,
            registration_no,
            payment_date,
            payment_channel,
            payment_reference,
        } => {
            fill_rect(layer, 20.0, bottom_y, 190.0, top_y, C_CREAM);
            set_color(layer, C_OAT_BORDER);
            draw_line(layer, 105.0, bottom_y, 105.0, top_y, 0.3);

            if *applicant_type == "INSTANSI" {
                set_color(layer, C_SILVER);
                layer.use_text(
                    "DIBAYAR OLEH",
                    7.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(top_y - 6.0),
                    bold,
                );
                set_color(layer, C_BLACK);
                layer.use_text(
                    truncate(company_name.as_deref().unwrap_or("—"), 30).as_str(),
                    12.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(top_y - 14.0),
                    bold,
                );
                set_color(layer, C_SILVER);
                let mut y = top_y - 20.0;
                if let Some(npwp) = company_npwp.as_deref().filter(|s| !s.is_empty()) {
                    layer.use_text(
                        format!("NPWP: {}", truncate(npwp, 22)).as_str(),
                        8.5,
                        printpdf::Mm(25.0),
                        printpdf::Mm(y),
                        reg,
                    );
                    y -= 4.0;
                }
                y -= 1.0;
                set_color(layer, C_OAT_BORDER);
                draw_line(layer, 25.0, y, 100.0, y, 0.2);
                y -= 5.0;
                set_color(layer, C_SILVER);
                layer.use_text("PIC", 7.0, printpdf::Mm(25.0), printpdf::Mm(y), bold);
                y -= 4.5;
                set_color(layer, C_BLACK);
                layer.use_text(*pic_name, 8.5, printpdf::Mm(25.0), printpdf::Mm(y), reg);
                y -= 3.5;
                layer.use_text(
                    format!("NIK: {pic_nik}").as_str(),
                    8.5,
                    printpdf::Mm(25.0),
                    printpdf::Mm(y),
                    reg,
                );
                y -= 3.5;
                if !pic_email.is_empty() {
                    layer.use_text(
                        format!("Email: {}", truncate(pic_email, 24)).as_str(),
                        8.5,
                        printpdf::Mm(25.0),
                        printpdf::Mm(y),
                        reg,
                    );
                }
            } else {
                set_color(layer, C_SILVER);
                layer.use_text(
                    "DIBAYAR OLEH",
                    7.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(top_y - 6.0),
                    bold,
                );
                set_color(layer, C_BLACK);
                layer.use_text(
                    truncate(customer_name, 28).as_str(),
                    12.0,
                    printpdf::Mm(25.0),
                    printpdf::Mm(top_y - 14.0),
                    bold,
                );
                set_color(layer, C_SILVER);
                layer.use_text(
                    format!("NIK: {customer_nik}").as_str(),
                    8.5,
                    printpdf::Mm(25.0),
                    printpdf::Mm(top_y - 21.0),
                    reg,
                );
                if !customer_email.is_empty() {
                    layer.use_text(
                        format!("Email: {}", truncate(customer_email, 30)).as_str(),
                        8.5,
                        printpdf::Mm(25.0),
                        printpdf::Mm(top_y - 27.0),
                        reg,
                    );
                }
            }

            // Right column DETAIL TRANSAKSI
            set_color(layer, C_SILVER);
            layer.use_text(
                "DETAIL TRANSAKSI",
                7.0,
                printpdf::Mm(110.0),
                printpdf::Mm(top_y - 6.0),
                bold,
            );
            set_color(layer, C_BLACK);
            layer.use_text(
                truncate(invoice_no, 22).as_str(),
                11.0,
                printpdf::Mm(110.0),
                printpdf::Mm(top_y - 14.0),
                bold,
            );
            set_color(layer, C_SILVER);
            layer.use_text(
                format!("No. Reg: {registration_no}").as_str(),
                8.5,
                printpdf::Mm(110.0),
                printpdf::Mm(top_y - 21.0),
                reg,
            );
            layer.use_text(
                format!("Tanggal: {}", format_date_id(*payment_date)).as_str(),
                8.5,
                printpdf::Mm(110.0),
                printpdf::Mm(top_y - 27.0),
                reg,
            );
            let mut dy = top_y - 33.0;
            if let Some(ch) = payment_channel.filter(|s| !s.is_empty()) {
                layer.use_text(
                    format!("Channel: {ch}").as_str(),
                    8.5,
                    printpdf::Mm(110.0),
                    printpdf::Mm(dy),
                    reg,
                );
                dy -= 6.0;
            }
            if let Some(rf) = payment_reference.filter(|s| !s.is_empty()) {
                layer.use_text(
                    format!("Ref: {}", truncate(rf, 22)).as_str(),
                    8.5,
                    printpdf::Mm(110.0),
                    printpdf::Mm(dy),
                    reg,
                );
            }
        }
    }
    bottom_y
}
