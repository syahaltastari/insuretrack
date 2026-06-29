//! Drawing primitives (fill_rect, draw_line, set_color) + format helpers
//! (format_idr, format_date_id) + text utilities (truncate, wrap_text).
//!
//! Semua koordinat dalam mm. printpdf `Mm(x)` adalah newtype 1-line,
//! jadi `Mm(15.0)` di-call site tetap.
//!
//! `set_color` mengkonversi (u8, u8, u8) → f32 ratio 0..1 sesuai
//! requirement printpdf 0.7.

use chrono::{Datelike, NaiveDate};
use printpdf::{Color, Line, Mm, PdfLayerReference, Point, Rgb};
use rust_decimal::Decimal;

use crate::error::AppError;
use crate::services::pdf::theme::ID_MONTHS;

// ---- Drawing primitives -----------------------------------------------------

/// Set fill + outline color sekaligus. printpdf butuh dua call terpisah
/// (`set_fill_color` + `set_outline_color`) — helper ini sekaligus.
pub(crate) fn set_color(layer: &PdfLayerReference, c: (u8, u8, u8)) {
    // printpdf 0.7's Rgb::new expects f32 dalam 0.0..1.0, bukan u8 (0-255).
    let r = c.0 as f32 / 255.0;
    let g = c.1 as f32 / 255.0;
    let b = c.2 as f32 / 255.0;
    layer.set_fill_color(Color::Rgb(Rgb::new(r, g, b, None)));
    layer.set_outline_color(Color::Rgb(Rgb::new(r, g, b, None)));
}

/// Fill rectangle. Coords: bottom-left (x1, y1) dan top-right (x2, y2)
/// dalam mm.
pub(crate) fn fill_rect(
    layer: &PdfLayerReference,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    color: (u8, u8, u8),
) {
    use printpdf::path::PaintMode;
    set_color(layer, color);
    layer.set_outline_thickness(0.0);
    layer.add_rect(printpdf::Rect {
        ll: Point::new(Mm(x1), Mm(y1)),
        ur: Point::new(Mm(x2), Mm(y2)),
        mode: PaintMode::Fill,
        winding: printpdf::path::WindingOrder::NonZero,
    });
    layer.set_outline_thickness(0.5);
}

/// Draw straight line antara dua titik.
pub(crate) fn draw_line(layer: &PdfLayerReference, x1: f32, y1: f32, x2: f32, y2: f32, thickness: f32) {
    layer.set_outline_thickness(thickness);
    let line = Line {
        points: vec![
            (Point::new(Mm(x1), Mm(y1)), false),
            (Point::new(Mm(x2), Mm(y2)), false),
        ],
        is_closed: false,
    };
    layer.add_line(line);
}

// ---- Format helpers ---------------------------------------------------------

/// Format `Decimal` jadi "Rp 1.234.567" (Indonesian thousand separator, no decimals).
///
/// Convert ke integer string dulu, lalu format pakai separator manual
/// supaya aman untuk nilai besar tanpa kehilangan presisi.
pub(crate) fn format_idr(d: Decimal) -> String {
    let s = d.trunc().to_string();
    let (sign, int_part) = if let Some(stripped) = s.strip_prefix('-') {
        ("-", stripped)
    } else {
        ("", s.as_str())
    };
    let mut out = String::new();
    for (i, c) in int_part.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push('.');
        }
        out.push(c);
    }
    let rev: String = out.chars().rev().collect();
    format!("Rp {}{}", sign, rev)
}

/// Format tanggal Indonesia: "9 Juni 2026".
pub(crate) fn format_date_id(d: NaiveDate) -> String {
    format!(
        "{} {} {}",
        d.day(),
        ID_MONTHS[(d.month() - 1) as usize],
        d.year()
    )
}

// ---- Text utilities ---------------------------------------------------------

/// Truncate string dengan ellipsis kalau lebih panjang dari `max_len`.
pub(crate) fn truncate(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_len - 1).collect();
        format!("{}…", truncated)
    }
}

/// Word-wrap sederhana — split by space, group by `max_chars` per line.
pub(crate) fn wrap_text(s: &str, max_chars: usize) -> Vec<String> {
    let mut lines = Vec::new();
    for raw_line in s.split('\n') {
        let mut current = String::new();
        for word in raw_line.split_whitespace() {
            if current.is_empty() {
                current = word.to_string();
            } else if current.len() + 1 + word.len() <= max_chars {
                current.push(' ');
                current.push_str(word);
            } else {
                lines.push(current);
                current = word.to_string();
            }
        }
        if !current.is_empty() {
            lines.push(current);
        }
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

// Placeholder untuk satisfy compiler bila AppError tidak dipakai langsung.
#[allow(dead_code)]
fn _ensure_app_error_in_scope() -> AppError {
    AppError::Internal(anyhow::anyhow!("unused"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_text_short_string_no_wrap() {
        let lines = wrap_text("halo dunia", 80);
        assert_eq!(lines, vec!["halo dunia".to_string()]);
    }

    #[test]
    fn wrap_text_breaks_long_line() {
        let lines = wrap_text("a b c d e f g h i j k l m n o", 5);
        // 5 chars max → group kata pendek sampai muat
        assert!(lines.len() > 1);
        for l in &lines {
            assert!(l.len() <= 10, "line too long: {l:?}"); // sedikit headroom
        }
    }

    #[test]
    fn wrap_text_preserves_explicit_newlines() {
        let lines = wrap_text("line1\nline2", 80);
        assert_eq!(lines, vec!["line1".to_string(), "line2".to_string()]);
    }

    #[test]
    fn wrap_text_empty_input_returns_one_empty_line() {
        // Dipakai untuk safety di Notes section — kalau string kosong,
        // minimal return 1 line kosong supaya caller tidak NPE.
        let lines = wrap_text("", 80);
        assert_eq!(lines, vec!["".to_string()]);
    }

    #[test]
    fn format_idr_basic() {
        assert_eq!(format_idr(Decimal::from(0)), "Rp 0");
        assert_eq!(format_idr(Decimal::from(1)), "Rp 1");
        assert_eq!(format_idr(Decimal::from(1_000)), "Rp 1.000");
        assert_eq!(format_idr(Decimal::from(1_000_000)), "Rp 1.000.000");
        assert_eq!(format_idr(Decimal::from(100_000_000)), "Rp 100.000.000");
    }

    #[test]
    fn format_idr_with_negative() {
        assert_eq!(format_idr(Decimal::from(-1_234)), "Rp -1.234");
    }
}
