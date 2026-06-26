//! Benefit list — 3 items (Life/PA/Health variants) di policy p3.

use printpdf::{IndirectFontRef, PdfLayerReference};

use crate::services::pdf::helpers::{draw_line, set_color, wrap_text};
use crate::services::pdf::theme::{C_BLACK, C_CHARCOAL};

pub struct BenefitList<'a> {
    pub product_name: &'a str,
}

const LIFE_BENEFITS: &[(&str, &str)] = &[
    ("Manfaat Meninggal Dunia",
     "Pembayaran 100% Uang Pertanggungan kepada ahli waris yang ditunjuk apabila tertanggung meninggal dunia selama masa perlindungan."),
    ("Manfaat Warisan & Perencanaan",
     "UP dapat dimanfaatkan sebagai jaminan aset dan perencanaan keuangan keluarga sesuai ketentuan produk yang berlaku."),
    ("Manfaat Berakhir Polis",
     "Pada akhir masa perlindungan, nilai manfaat disesuaikan dengan ketentuan produk dan tidak terdapat nilai tunai kecuali diatur lain."),
];

const PA_BENEFITS: &[(&str, &str)] = &[
    ("Manfaat Kematian Akibat Kecelakaan",
     "Pembayaran 100% Uang Pertanggungan apabila tertanggung meninggal dunia akibat kecelakaan dalam masa perlindungan."),
    ("Manfaat Cacat Tetap Total",
     "Pembayaran penuh UP apabila tertanggung mengalami cacat tetap total akibat kecelakaan yang dibuktikan secara medis."),
    ("Manfaat Cacat Tetap Sebagian",
     "Pembayaran sebagian UP sesuai tabel persentase cacat yang tercantum dalam Lampiran Polis."),
];

const HEALTH_BENEFITS: &[(&str, &str)] = &[
    ("Manfaat Rawat Inap",
     "Penggantian biaya rawat inap di rumah sakit rekanan sesuai plan yang dipilih, termasuk biaya kamar, tindakan, dan obat-obatan."),
    ("Manfaat Rawat Jalan",
     "Penggantian biaya konsultasi dokter umum dan spesialis, serta pemeriksaan laboratorium sesuai ketentuan plan."),
    ("Manfaat Tindakan Medis & Operasi",
     "Penggantian biaya operasi dan tindakan medis lainnya di fasilitas kesehatan rekanan sesuai limit plan yang berlaku."),
];

impl<'a> BenefitList<'a> {
    pub fn new(product_name: &'a str) -> Self {
        Self { product_name }
    }

    pub fn pick(&self) -> &[(&'static str, &'static str)] {
        if self.product_name.contains("Life") || self.product_name.contains("Jiwa") {
            LIFE_BENEFITS
        } else if self.product_name.contains("Accident") || self.product_name.contains("Kecelakaan")
        {
            PA_BENEFITS
        } else {
            HEALTH_BENEFITS
        }
    }

    /// Render dengan `top_y` sebagai top edge. Adaptive height.
    /// Returns bottom_y.
    pub fn render(
        &self,
        layer: &PdfLayerReference,
        bold: &IndirectFontRef,
        reg: &IndirectFontRef,
        top_y: f32,
    ) -> f32 {
        let mut y = top_y - 12.0; // below "MANFAAT PERLINDUNGAN" header
        for (title, desc) in self.pick() {
            if y < top_y - 42.0 {
                break;
            }
            set_color(layer, C_BLACK);
            layer.use_text(*title, 9.0, printpdf::Mm(18.0), printpdf::Mm(y), bold);
            set_color(layer, C_CHARCOAL);
            let lines = wrap_text(desc, 88);
            for (i, line) in lines.iter().take(2).enumerate() {
                layer.use_text(
                    line.as_str(),
                    8.0,
                    printpdf::Mm(18.0),
                    printpdf::Mm(y - 5.0 - i as f32 * 4.2),
                    reg,
                );
            }
            y -= if lines.len() > 1 { 17.5 } else { 13.5 };
        }
        // Add divider line before Ketentuan Umum
        set_color(layer, C_BLACK);
        draw_line(layer, 15.0, y - 3.0, 195.0, y - 3.0, 0.4);
        y - 14.0 // reserve space for Ketentuan Umum header
    }
}
