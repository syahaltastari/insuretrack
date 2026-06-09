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
const COMPANY: &str = "PT Ama Salam Indonesia";
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
    let body_html = text_to_html_paragraphs(t.body_text.trim());
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
