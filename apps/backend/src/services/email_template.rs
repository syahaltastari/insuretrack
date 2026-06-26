//! HTML + plain-text email template dengan header & footer InsureTrack.
//!
//! Setiap email yang dikirim lewat `email::send` di-wrap dengan template
//! ini — caller cukup supply subject + body text + optional CTA, dan
//! `render()` menghasilkan pasangan (text, html) siap kirim ke Resend.
//!
//! CSS-nya inline (bukan <style> tag) supaya aman di semua email client
//! (Gmail web/app, Outlook, Apple Mail). Fallback ke background abu
//! hangat dan tipografi Plus Jakarta Sans.
//!
//! Untuk teks polos: header + body + footer plain. Untuk HTML: layout
//! 3-section (header hitam, content putih, footer krem) dengan CTA
//! button hitam di ATAS body (kalau URL tersedia), supaya CTA jadi
//! elemen visual pertama yang dilihat pembaca.

/// Input untuk render template.
pub struct EmailTemplate<'a> {
    pub subject: &'a str,
    /// Body utama (plain text). Akan di-wrap header+footer untuk
    /// versi text, dan di-render sebagai paragraf HTML untuk versi
    /// HTML. Whitespace (newline) di-convert jadi `<br>`.
    pub body_text: &'a str,
    /// Optional pre-built HTML body. Kalau `Some`, di-embed di HTML
    /// wrapper **apa adanya** — caller yang build string ini bertanggung
    /// jawab escape semua variable. Versi text selalu dari `body_text`,
    /// field ini diabaikan di text render.
    ///
    /// Pakai untuk email yang butuh layout HTML di luar paragraph
    /// biasa (mis. invoice email dengan tabel premi, atau rich content).
    /// Default `None` = fallback ke `body_text` → paragraph pipeline
    /// (zero perf overhead, identik dengan behavior sebelum field ini
    /// ditambah).
    pub body_html: Option<&'a str>,
    /// Optional call-to-action button text (mis. "Aktifkan Akun").
    /// Kalau None, button tidak di-render.
    pub cta_text: Option<&'a str>,
    /// Optional CTA URL. Kalau None, button tidak di-render.
    /// WAJIB aman untuk di-include di HTML attribute — caller yang
    /// generate URL harus sanitize (sudah otomatis via http(s) URLs
    /// dari activation token).
    pub cta_url: Option<&'a str>,
}

/// Output: siap kirim ke Resend (text + html).
pub struct RenderedEmail {
    pub text: String,
    pub html: String,
}

const BRAND: &str = "InsureTrack";
const TAGLINE: &str = "Asuransi digital, prosesnya cepat, polis langsung terbit";
// Footer descriptor di email — bukan afiliasi perusahaan. Sebelumnya hardcode
// ke "PT Ama Salam Indonesia" yang tidak akurat; ganti ke descriptor generik.
const COMPANY: &str = "Platform Asuransi Digital";
const SUPPORT_EMAIL: &str = "contact@insuretrack.com";

pub fn render(t: &EmailTemplate) -> RenderedEmail {
    RenderedEmail {
        text: render_text(t),
        html: render_html(t),
    }
}

// -- text version --

fn render_text(t: &EmailTemplate) -> String {
    let mut out = String::new();
    out.push_str(BRAND);
    out.push('\n');
    out.push_str(TAGLINE);
    out.push_str("\n\n===\n\n");
    out.push_str(t.subject);
    out.push_str("\n\n===\n\n");
    out.push_str(t.body_text.trim());
    if let (Some(text), Some(url)) = (t.cta_text, t.cta_url) {
        out.push_str("\n\n");
        out.push_str(text);
        out.push_str(": ");
        out.push_str(url);
    }
    out.push_str("\n\n---\n");
    out.push_str(BRAND);
    out.push_str(" — ");
    out.push_str(COMPANY);
    out.push_str("\nEmail ini dikirim otomatis, mohon tidak dibalas.\n");
    out.push_str("Butuh bantuan? ");
    out.push_str(SUPPORT_EMAIL);
    out.push('\n');
    out
}

// -- html version --

fn render_html(t: &EmailTemplate) -> String {
    // Body source: caller-supplied HTML (preferred kalau ada), else
    // fall back ke plain-text → paragraph converter. text version
    // selalu pakai body_text — body_html cuma untuk HTML render.
    let body_html = match t.body_html {
        Some(html) => html.to_string(),
        None => text_to_html_paragraphs(t.body_text.trim()),
    };
    let cta_html = match (t.cta_text, t.cta_url) {
        (Some(text), Some(url)) if !text.is_empty() && !url.is_empty() => {
            let safe_text = html_escape(text);
            let safe_url = html_escape_attr(url);
            format!(
                r#"<p style="margin: 24px 0 8px 0;"><a href="{safe_url}" class="cta" style="display:inline-block;background:#000;color:#fff !important;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;">{safe_text}</a></p>"#
            )
        }
        _ => String::new(),
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;color:#000;">
<div style="max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#000;padding:32px 24px;text-align:center;border-radius:8px 8px 0 0;">
    <div style="color:#f5f3ee;font-size:24px;font-weight:700;letter-spacing:-0.02em;">{brand}</div>
    <div style="color:#9f9b93;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;margin-top:8px;">{tagline}</div>
  </div>
  <div style="background:#ffffff;padding:32px 24px;">
    <h1 style="font-size:22px;font-weight:700;margin:0 0 20px 0;line-height:1.3;">{subject}</h1>
    {cta_html}
    {body_html}
  </div>
  <div style="background:#faf9f7;padding:20px 24px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #dad4c8;">
    <p style="color:#9f9b93;font-size:12px;margin:4px 0;">{brand} — {company}</p>
    <p style="color:#9f9b93;font-size:12px;margin:4px 0;">Email ini dikirim otomatis, mohon tidak dibalas.</p>
    <p style="color:#9f9b93;font-size:12px;margin:4px 0;">Butuh bantuan? <a href="mailto:{support}" style="color:#55534e;text-decoration:underline;">{support}</a></p>
  </div>
</div>
</body>
</html>"#,
        brand = BRAND,
        tagline = TAGLINE,
        company = COMPANY,
        support = SUPPORT_EMAIL,
        subject = html_escape(t.subject),
        body_html = body_html,
        cta_html = cta_html,
    )
}

/// Convert plain-text body to HTML: split by double newlines jadi
/// paragraf, dan single newlines jadi `<br>`.
fn text_to_html_paragraphs(text: &str) -> String {
    let mut out = String::new();
    for (i, para) in text.split("\n\n").enumerate() {
        if i > 0 {
            out.push_str("</p><p style=\"line-height:1.6;margin:0 0 16px 0;color:#55534e;\">");
        } else {
            out.push_str("<p style=\"line-height:1.6;margin:0 0 16px 0;color:#55534e;\">");
        }
        // Single newlines → <br>
        let escaped = html_escape(para);
        let with_br = escaped.replace('\n', "<br>");
        out.push_str(&with_br);
    }
    out.push_str("</p>");
    out
}

/// Escape karakter yang bermakna khusus di HTML: `<`, `>`, `&`, `"`.
/// Cukup untuk body text dan atribut URL (quotes & ampersand).
fn html_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

/// Sama dengan `html_escape` tapi conservative — hanya escape yang
///会影响 attribute value parsing. Saat ini sama saja, dipisah untuk
/// future-proof kalau perlu escape tambahan.
fn html_escape_attr(s: &str) -> String {
    html_escape(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal() -> EmailTemplate<'static> {
        EmailTemplate {
            subject: "Halo Dunia",
            body_text: "Ini body test.",
            body_html: None,
            cta_text: None,
            cta_url: None,
        }
    }

    #[test]
    fn render_produces_text_and_html() {
        let r = render(&minimal());
        assert!(!r.text.is_empty());
        assert!(!r.html.is_empty());
        assert!(r.html.starts_with("<!DOCTYPE html>"));
    }

    #[test]
    fn html_escapes_special_chars_in_body() {
        let tmpl = EmailTemplate {
            subject: "sub & <test>",
            body_text: "kode <script>alert(1)</script> & \"quoted\"",
            body_html: None,
            cta_text: None,
            cta_url: None,
        };
        let r = render(&tmpl);
        // Subject ke-escape di HTML
        assert!(r.html.contains("sub &amp; &lt;test&gt;"));
        // Body ke-escape — raw <script> tidak boleh ada
        assert!(!r.html.contains("<script>alert(1)</script>"));
        assert!(r.html.contains("&lt;script&gt;"));
        assert!(r.html.contains("&amp;"));
        assert!(r.html.contains("&quot;"));
    }

    #[test]
    fn cta_only_renders_when_both_text_and_url_present() {
        // Both present → CTA muncul.
        let with_both = EmailTemplate {
            subject: "sub",
            body_text: "body",
            body_html: None,
            cta_text: Some("Aktifkan"),
            cta_url: Some("https://example.com/activate"),
        };
        let r = render(&with_both);
        assert!(r.html.contains(r#"href="https://example.com/activate""#));
        assert!(r.text.contains("Aktifkan: https://example.com/activate"));

        // CTA text tanpa URL → button tidak render.
        let only_text = EmailTemplate {
            subject: "sub",
            body_text: "body",
            body_html: None,
            cta_text: Some("Aktifkan"),
            cta_url: None,
        };
        let r = render(&only_text);
        assert!(!r.html.contains("Aktifkan"));
        assert!(!r.text.contains("Aktifkan:"));

        // CTA URL tanpa text → button tidak render.
        let only_url = EmailTemplate {
            subject: "sub",
            body_text: "body",
            body_html: None,
            cta_text: None,
            cta_url: Some("https://example.com/x"),
        };
        let r = render(&only_url);
        assert!(!r.html.contains(r#"href="https://example.com/x""#));
        assert!(!r.text.contains("https://example.com/x"));

        // Empty CTA strings → button tidak render.
        let empty_cta = EmailTemplate {
            subject: "sub",
            body_text: "body",
            body_html: None,
            cta_text: Some(""),
            cta_url: Some("https://example.com/x"),
        };
        let r = render(&empty_cta);
        assert!(!r.html.contains(r#"href="https://example.com/x""#));
    }

    #[test]
    fn text_and_html_include_subject_and_body() {
        let r = render(&minimal());
        assert!(r.text.contains("Halo Dunia"));
        assert!(r.text.contains("Ini body test."));
        assert!(r.html.contains("Halo Dunia"));
        assert!(r.html.contains("Ini body test."));
    }

    #[test]
    fn empty_body_does_not_crash() {
        let tmpl = EmailTemplate {
            subject: "kosong",
            body_text: "",
            body_html: None,
            cta_text: None,
            cta_url: None,
        };
        let r = render(&tmpl);
        // Subject tetap muncul walaupun body kosong.
        assert!(r.html.contains("kosong"));
        assert!(r.text.contains("kosong"));
        // Output non-empty (placeholder <p> OK — caller harusnya tidak
        // mengirim body kosong, tapi render() tidak panic).
        assert!(!r.html.is_empty());
        assert!(!r.text.is_empty());
    }

    #[test]
    fn body_html_overrides_body_text_in_html_version() {
        // Caller-supplied HTML muncul apa adanya di HTML output —
        // TIDAK melalui paragraph converter. body_text diabaikan
        // untuk HTML version (text version tetap pakai body_text).
        let custom = r#"<table style="width:100%;"><tr><td>Rp 100.000</td></tr></table>"#;
        let tmpl = EmailTemplate {
            subject: "Invoice",
            body_text: "Lihat invoice terlampir.",
            body_html: Some(custom),
            cta_text: None,
            cta_url: None,
        };
        let r = render(&tmpl);
        // Custom HTML muncul apa adanya (tidak di-wrap jadi <p>).
        assert!(r.html.contains(custom));
        // body_text TIDAK muncul di HTML version ketika body_html di-supply.
        assert!(!r.html.contains("Lihat invoice terlampir."));
        // Text version tetap pakai body_text (escape rule biasa).
        assert!(r.text.contains("Lihat invoice terlampir."));
    }

    #[test]
    fn body_html_does_not_affect_cta_or_subject() {
        // CTA button + subject tetap di-render normal walaupun
        // body_html supplied — cuma body section yang pakai html.
        let tmpl = EmailTemplate {
            subject: "Halo",
            body_text: "fallback",
            body_html: Some(r#"<div>custom</div>"#),
            cta_text: Some("Aksi"),
            cta_url: Some("https://example.com/x"),
        };
        let r = render(&tmpl);
        // CTA tetap render.
        assert!(r.html.contains(r#"href="https://example.com/x""#));
        // Subject tetap di-render.
        assert!(r.html.contains("Halo"));
        // Custom body muncul.
        assert!(r.html.contains("<div>custom</div>"));
    }
}
