//! Font loading untuk PDF. Bundle 3 builtin Helvetica variants
//! (Bold, Regular, Italic) supaya section tidak perlu call
//! `add_builtin_font` berulang kali.
//!
//! `Fonts::load(&doc)` dipanggil sekali per renderer (e-Policy, Invoice,
//! Receipt). Tiap section menerima `&Fonts` via `render(layer, &fonts, top_y)`.
//!
//! Saat ini orchestrators masih pakai `doc.add_builtin_font` inline —
//! migration ke `Fonts::load` dilakukan saat section extraction.
//! `Fonts::load` exposed sebagai API siap-pakai untuk section structs.

use printpdf::{BuiltinFont, IndirectFontRef, PdfDocumentReference};

use crate::error::AppError;

pub(crate) struct Fonts {
    #[allow(dead_code)] // wired saat orchestrator migrate ke Fonts::load
    pub(crate) bold: IndirectFontRef,
    #[allow(dead_code)]
    pub(crate) reg: IndirectFontRef,
    #[allow(dead_code)]
    pub(crate) italic: IndirectFontRef,
}

impl Fonts {
    #[allow(dead_code)] // dipakai setelah section extraction
    pub(crate) fn load(doc: &PdfDocumentReference) -> Result<Self, AppError> {
        let bold = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("font bold: {e}")))?;
        let reg = doc
            .add_builtin_font(BuiltinFont::Helvetica)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("font reg: {e}")))?;
        let italic = doc
            .add_builtin_font(BuiltinFont::HelveticaOblique)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("font italic: {e}")))?;
        Ok(Self { bold, reg, italic })
    }
}
