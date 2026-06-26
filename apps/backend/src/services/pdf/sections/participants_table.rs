//! Lampiran "DAFTAR PESERTA" — dipanggil dari invoice & receipt kalau
//! participants tidak kosong (alur INSTANSI). Multi-page: 32 row/halaman
//! font 8pt, tinggi baris 6mm. Page 1 = cover full, halaman lanjutan = mini
//! header dengan suffix "(Lanjutan)" + page indicator.
//!
//! Di-share oleh `invoice.rs` dan `receipt.rs`. Posisikan di `sections/`
//! karena reusable (bukan internal salah satu orchestrator).

use printpdf::{IndirectFontRef, PdfDocumentReference};

use crate::error::AppError;
use crate::services::pdf::{
    helpers::{draw_line, fill_rect, format_date_id, set_color},
    inputs::ParticipantSummary,
    layout::{
        PARTICIPANT_COL_X, PARTICIPANT_HEADERS, PARTICIPANT_ROWS_PER_PAGE, PARTICIPANT_ROW_HEIGHT,
        PARTICIPANT_TABLE_LEFT, PARTICIPANT_TABLE_RIGHT,
    },
    theme::{C_BLACK, C_CHARCOAL, C_CREAM, C_OAT_BORDER, C_OAT_LIGHT, C_SILVER, C_WHITE},
};

/// Append halaman lampiran "DAFTAR PESERTA" ke `doc`. Caller harus skip
/// pemanggilan ini untuk alur INDIVIDU (`participants.is_empty()`).
/// `doc_label` = "INVOICE" atau "BUKTI PEMBAYARAN" (ditampilkan di
/// header bar page pertama).
pub fn render(
    doc: &PdfDocumentReference,
    bold: &IndirectFontRef,
    reg: &IndirectFontRef,
    participants: &[ParticipantSummary],
    invoice_no: &str,
    registration_no: &str,
    doc_label: &str,
) -> Result<(), AppError> {
    let total = participants.len();
    if total == 0 {
        return Ok(());
    }
    let total_pages = total.div_ceil(PARTICIPANT_ROWS_PER_PAGE);

    for page_idx in 0..total_pages {
        let (page, layer_id) =
            doc.add_page(printpdf::Mm(210.0_f32), printpdf::Mm(297.0_f32), "Layer 1");
        let layer = doc.get_page(page).get_layer(layer_id);

        // ===== Header bar (full di page 1, mini di halaman lanjutan) =====
        fill_rect(&layer, 0.0, 274.0, 210.0, 297.0, C_BLACK);
        set_color(&layer, C_WHITE);
        layer.use_text(
            "InsureTrack",
            18.0,
            printpdf::Mm(20.0),
            printpdf::Mm(287.0),
            bold,
        );
        set_color(&layer, C_CREAM);
        layer.use_text(
            "Asuransi digital, prosesnya cepat, polis langsung terbit.",
            8.5,
            printpdf::Mm(20.0),
            printpdf::Mm(279.0),
            reg,
        );
        if page_idx == 0 {
            // Page 1: tampilkan doc label di kanan (sama style dengan page 1 cover)
            set_color(&layer, C_WHITE);
            layer.use_text(
                doc_label,
                16.0,
                printpdf::Mm(150.0),
                printpdf::Mm(287.0),
                bold,
            );
            set_color(&layer, C_CREAM);
            layer.use_text(
                "Lampiran · Daftar Peserta",
                8.5,
                printpdf::Mm(150.0),
                printpdf::Mm(279.0),
                reg,
            );
        } else {
            // Halaman lanjutan: judul dengan suffix
            set_color(&layer, C_CREAM);
            layer.use_text(
                format!("{} — Daftar Peserta (Lanjutan)", doc_label).as_str(),
                11.0,
                printpdf::Mm(105.0),
                printpdf::Mm(285.0),
                bold,
            );
        }

        // ===== Title + count + info row =====
        set_color(&layer, C_BLACK);
        let title = if page_idx == 0 {
            "DAFTAR PESERTA"
        } else {
            "DAFTAR PESERTA (Lanjutan)"
        };
        layer.use_text(title, 14.0, printpdf::Mm(20.0), printpdf::Mm(263.0), bold);
        set_color(&layer, C_SILVER);
        layer.use_text(
            format!("Jumlah peserta: {} orang", total).as_str(),
            9.5,
            printpdf::Mm(20.0),
            printpdf::Mm(254.0),
            reg,
        );
        set_color(&layer, C_CHARCOAL);
        layer.use_text(
            format!(
                "No. {}: {}   ·   No. Pendaftaran: {}",
                doc_label, invoice_no, registration_no
            )
            .as_str(),
            8.5,
            printpdf::Mm(20.0),
            printpdf::Mm(245.0),
            reg,
        );

        // ===== Table header (gray fill) — y 220..226 =====
        fill_rect(
            &layer,
            PARTICIPANT_TABLE_LEFT,
            220.0,
            PARTICIPANT_TABLE_RIGHT,
            226.0,
            C_OAT_LIGHT,
        );
        set_color(&layer, C_BLACK);
        for (i, h) in PARTICIPANT_HEADERS.iter().enumerate() {
            layer.use_text(
                *h,
                8.0,
                printpdf::Mm(PARTICIPANT_COL_X[i] + 1.0),
                printpdf::Mm(222.0),
                bold,
            );
        }
        set_color(&layer, C_OAT_BORDER);
        draw_line(
            &layer,
            PARTICIPANT_TABLE_LEFT,
            220.0,
            PARTICIPANT_TABLE_RIGHT,
            220.0,
            0.3,
        );

        // ===== Data rows =====
        let start = page_idx * PARTICIPANT_ROWS_PER_PAGE;
        let end = (start + PARTICIPANT_ROWS_PER_PAGE).min(total);
        for (i, p) in participants[start..end].iter().enumerate() {
            let row_no = start + i + 1;
            // Baseline y menurun; baris pertama di y=212, lalu -6mm per baris.
            let y = 212.0 - (i as f32) * PARTICIPANT_ROW_HEIGHT;
            // Map MALE/FEMALE → L/P untuk kompak (kolom JK cuma 12mm).
            let jk = match p.gender.as_str() {
                "MALE" => "L",
                "FEMALE" => "P",
                _ => "—",
            };
            let beneficiary = p.beneficiary_name.as_deref().unwrap_or("—");
            let ttl = format!("{}, {}", p.birth_place, format_date_id(p.birth_date));

            set_color(&layer, C_BLACK);
            layer.use_text(
                format!("{}", row_no).as_str(),
                8.0,
                printpdf::Mm(PARTICIPANT_COL_X[0] + 1.0),
                printpdf::Mm(y),
                reg,
            );
            layer.use_text(
                crate::services::pdf::helpers::truncate(&p.nik, 18).as_str(),
                8.0,
                printpdf::Mm(PARTICIPANT_COL_X[1]),
                printpdf::Mm(y),
                reg,
            );
            layer.use_text(
                crate::services::pdf::helpers::truncate(&p.full_name, 32).as_str(),
                8.0,
                printpdf::Mm(PARTICIPANT_COL_X[2]),
                printpdf::Mm(y),
                reg,
            );
            layer.use_text(
                crate::services::pdf::helpers::truncate(&ttl, 26).as_str(),
                8.0,
                printpdf::Mm(PARTICIPANT_COL_X[3]),
                printpdf::Mm(y),
                reg,
            );
            layer.use_text(
                jk,
                8.0,
                printpdf::Mm(PARTICIPANT_COL_X[4] + 2.0),
                printpdf::Mm(y),
                reg,
            );
            layer.use_text(
                crate::services::pdf::helpers::truncate(beneficiary, 18).as_str(),
                8.0,
                printpdf::Mm(PARTICIPANT_COL_X[5]),
                printpdf::Mm(y),
                reg,
            );

            // Row separator (thin)
            set_color(&layer, C_OAT_LIGHT);
            draw_line(
                &layer,
                PARTICIPANT_TABLE_LEFT,
                y - 2.5,
                PARTICIPANT_TABLE_RIGHT,
                y - 2.5,
                0.2,
            );
        }

        // ===== Footer bar (sama dengan page 1 cover) =====
        fill_rect(&layer, 0.0, 0.0, 210.0, 12.0, C_BLACK);
        set_color(&layer, C_WHITE);
        layer.use_text(
            "InsureTrack",
            8.0,
            printpdf::Mm(20.0),
            printpdf::Mm(7.0),
            bold,
        );
        set_color(&layer, C_CREAM);
        layer.use_text(
            "Platform Asuransi Digital · support@insuretrack.example",
            7.0,
            printpdf::Mm(20.0),
            printpdf::Mm(3.0),
            reg,
        );
        // Page indicator: Halaman 2 (setelah cover), Halaman 3, dst.
        layer.use_text(
            format!("Halaman {}", page_idx + 2).as_str(),
            7.0,
            printpdf::Mm(170.0),
            printpdf::Mm(5.0),
            reg,
        );
    }

    Ok(())
}
