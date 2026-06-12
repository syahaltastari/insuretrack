"use client";

import { useState } from "react";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import type { ParticipantData } from "@insuretrack/api-client";

/**
 * File import (CSV atau Excel) untuk bulk peserta Instansi.
 * Parse client-side (papaparse + xlsx), validate per baris dengan
 * `participantSchema`, tampil preview table dengan error per-row,
 * lalu "Terapkan" untuk apply baris valid ke ParticipantTable.
 *
 * Expected column header (case-insensitive, header row required):
 *   NIK, Nama Lengkap, Tempat Lahir, Tanggal Lahir (YYYY-MM-DD),
 *   Jenis Kelamin (MALE/FEMALE), Alamat, RT/RW, Kelurahan,
 *   Kecamatan, Kota, Provinsi, Kode Pos, Email, No HP, Ahli Waris
 *
 * Aliases juga dikenal: "Nama" → Nama Lengkap, "Gender" → Jenis Kelamin, dll.
 * Lihat `COLUMN_ALIASES` di bawah.
 */

const COLUMN_ALIASES: Record<keyof ParticipantData, string[]> = {
  nik: ["nik", "no_ktp", "nomor_ktp"],
  full_name: ["nama_lengkap", "nama", "full_name", "nama peserta"],
  birth_place: ["tempat_lahir", "birth_place", "tempat"],
  birth_date: ["tanggal_lahir", "tgl_lahir", "birth_date", "ttl"],
  gender: ["jenis_kelamin", "gender", "sex", "jk"],
  address: ["alamat", "address"],
  rt_rw: ["rt_rw", "rtrw", "rt/rw"],
  village: ["kelurahan", "desa", "village"],
  district: ["kecamatan", "district", "kec"],
  city: ["kota", "kabupaten", "kab", "city"],
  province: ["provinsi", "province", "prov"],
  postal_code: ["kode_pos", "kodepos", "postal_code", "zip"],
  email: ["email", "e-mail"],
  mobile_number: ["no_hp", "nomor_hp", "mobile", "phone", "hp"],
  beneficiary_name: ["ahli_waris", "beneficiary", "nama_ahli_waris"],
};

type ParsedRow = {
  /** Index di parsed array (0-based). */
  index: number;
  /** Raw object dari CSV/Excel row (key = original header lowercase). */
  raw: Record<string, string>;
  /** Mapped ke ParticipantData. Null/undefined kalau field tidak dikenal. */
  data: Partial<ParticipantData>;
  /** Error per-field. Kalau errors.length > 0, row invalid. */
  errors: Array<{ field: string; message: string }>;
  /** Quick flag. */
  valid: boolean;
};

interface ParticipantImportProps {
  /** Dipanggil dengan array baris valid saat user klik "Terapkan". */
  onImport: (rows: ParticipantData[]) => void;
}

export function ParticipantImport({ onImport }: ParticipantImportProps) {
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  const reset = () => {
    setParsed(null);
    setParseError(null);
    setFilename(null);
  };

  const handleFile = async (file: File) => {
    reset();
    setFilename(file.name);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let rawRows: Record<string, unknown>[] = [];
      if (ext === "csv" || ext === "txt") {
        rawRows = await parseCsv(file);
      } else if (ext === "xlsx" || ext === "xls") {
        rawRows = await parseExcel(file);
      } else {
        setParseError(`Format file tidak didukung: .${ext}. Gunakan CSV atau Excel.`);
        return;
      }
      if (rawRows.length === 0) {
        setParseError("File kosong atau tidak ada baris data.");
        return;
      }
      const validated = rawRows.map((raw, i) => validateRow(raw, i));
      setParsed(validated);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Gagal membaca file");
    }
  };

  const validRows = parsed?.filter((r) => r.valid).map((r) => r.data as ParticipantData) ?? [];
  const errorCount = parsed?.filter((r) => !r.valid).length ?? 0;

  return (
    <div>
      {/* File picker — tersembunyi, dipicu oleh label button */}
      <input
        type="file"
        accept=".csv,.xlsx,.xls,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        id="participant-import-input"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          // Reset supaya pilih file yang sama bisa re-trigger
          e.target.value = "";
        }}
      />

      <label
        htmlFor="participant-import-input"
        className="clay-button solid-ube size-small"
        style={{ display: "inline-flex", cursor: "pointer", marginRight: 8 }}
      >
        Import CSV / Excel
      </label>

      <button
        type="button"
        className="clay-button ghost size-small"
        onClick={downloadSampleCsv}
        style={{ display: "inline-flex", cursor: "pointer" }}
        title="Download file CSV contoh dengan 3 baris peserta valid (untuk produk Jiwa)"
      >
        ⬇ Download Template
      </button>

      {parseError && (
        <div
          className="clay-card dashed"
          style={{
            marginTop: 12,
            padding: 12,
            background: "#fff5f5",
            borderColor: "var(--pomegranate-400)",
            color: "var(--pomegranate-400)",
            fontSize: "0.9rem",
          }}
          role="alert"
        >
          ⚠ {parseError}{" "}
          <button
            type="button"
            onClick={reset}
            className="clay-button ghost size-small"
            style={{ marginLeft: 8 }}
          >
            Reset
          </button>
        </div>
      )}

      {parsed && (
        <div style={{ marginTop: 16 }}>
          <div
            className="body"
            style={{
              marginBottom: 8,
              color: "var(--warm-charcoal)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>
              📄 <strong>{filename}</strong>: {parsed.length} baris terbaca —{" "}
              <span style={{ color: "var(--matcha-600)" }}>
                {validRows.length} valid
              </span>
              {errorCount > 0 && (
                <>
                  ,{" "}
                  <span style={{ color: "var(--pomegranate-400)" }}>
                    {errorCount} error
                  </span>
                </>
              )}
            </span>
            <button
              type="button"
              className="clay-button ghost size-small"
              onClick={reset}
            >
              Ganti file
            </button>
            {validRows.length > 0 && (
              <button
                type="button"
                className="clay-button solid-matcha size-small"
                onClick={() => onImport(validRows)}
              >
                Terapkan {validRows.length} baris valid
              </button>
            )}
          </div>

          {/* Preview table — compact, scrollable */}
          <div
            style={{
              maxHeight: 240,
              overflowY: "auto",
              border: "1px solid var(--oat-border)",
              borderRadius: "var(--radius-card)",
              background: "var(--warm-cream)",
            }}
          >
            <table
              className="clay-table"
              style={{ fontSize: "0.8rem", marginBottom: 0 }}
            >
              <thead>
                <tr>
                  <th style={{ width: 32, position: "sticky", top: 0 }}>#</th>
                  <th style={{ width: 60, position: "sticky", top: 0 }}>Status</th>
                  <th style={{ position: "sticky", top: 0 }}>NIK</th>
                  <th style={{ position: "sticky", top: 0 }}>Nama</th>
                  <th style={{ position: "sticky", top: 0 }}>TTL</th>
                  <th style={{ position: "sticky", top: 0 }}>JK</th>
                  <th style={{ position: "sticky", top: 0 }}>Kota</th>
                  <th style={{ position: "sticky", top: 0 }}>Errors</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((r) => (
                  <tr
                    key={r.index}
                    style={{
                      background: r.valid
                        ? undefined
                        : "rgba(252, 121, 129, 0.08)",
                    }}
                  >
                    <td>{r.index + 1}</td>
                    <td>{r.valid ? "✓" : "✗"}</td>
                    <td style={{ fontFamily: "var(--font-space-mono), monospace" }}>
                      {r.data.nik ?? "—"}
                    </td>
                    <td>{r.data.full_name ?? "—"}</td>
                    <td>{r.data.birth_date ?? "—"}</td>
                    <td>{r.data.gender ?? "—"}</td>
                    <td>{r.data.city ?? "—"}</td>
                    <td style={{ color: "var(--pomegranate-400)", fontSize: "0.75rem" }}>
                      {r.errors.map((e) => `${e.field}: ${e.message}`).join("; ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- helpers --------------------------------------------------------------

/** Sample data untuk CSV template. 3 baris peserta valid dengan data
 *  realistis (nama Indonesia, alamat, NIK format). Semua untuk produk
 *  Jiwa — Ahli Waris diisi di kolom terakhir. Untuk produk PA/HEALTH,
 *  kolom Ahli Waris boleh dikosongkan. */
const SAMPLE_ROWS: Array<Record<string, string>> = [
  {
    NIK: "3174012508900001",
    "Nama Lengkap": "Budi Santoso",
    "Tempat Lahir": "Jakarta",
    "Tanggal Lahir": "1990-08-25",
    "Jenis Kelamin": "MALE",
    Alamat: "Jalan Merdeka No. 17",
    "RT/RW": "001/002",
    Kelurahan: "Gambir",
    Kecamatan: "Gambir",
    Kota: "Jakarta Pusat",
    Provinsi: "DKI Jakarta",
    "Kode Pos": "10110",
    Email: "budi.santoso@example.com",
    "No HP": "081234567890",
    "Ahli Waris": "Siti Aminah (istri)",
  },
  {
    NIK: "3578015503920002",
    "Nama Lengkap": "Siti Aminah",
    "Tempat Lahir": "Surabaya",
    "Tanggal Lahir": "1992-03-15",
    "Jenis Kelamin": "FEMALE",
    Alamat: "Jalan Pahlawan No. 5",
    "RT/RW": "003/004",
    Kelurahan: "Krembangan Selatan",
    Kecamatan: "Krembangan",
    Kota: "Surabaya",
    Provinsi: "Jawa Timur",
    "Kode Pos": "60175",
    Email: "siti.aminah@example.com",
    "No HP": "082345678901",
    "Ahli Waris": "Budi Santoso (suami)",
  },
  {
    NIK: "3273011505950003",
    "Nama Lengkap": "Ahmad Fauzi",
    "Tempat Lahir": "Bandung",
    "Tanggal Lahir": "1995-05-15",
    "Jenis Kelamin": "MALE",
    Alamat: "Jalan Sudirman Kavling 21",
    "RT/RW": "002/005",
    Kelurahan: "Cikawao",
    Kecamatan: "Lengkong",
    Kota: "Bandung",
    Provinsi: "Jawa Barat",
    "Kode Pos": "40261",
    Email: "",
    "No HP": "083456789012",
    "Ahli Waris": "Dewi Lestari (ibu)",
  },
];

/** Trigger browser download untuk sample CSV. Pakai papaparse unparse
 *  (handles quoting, escaping) lalu Blob URL + anchor click. */
function downloadSampleCsv() {
  // Column order — fixed untuk konsistensi. Pakai nama header utama
  // (bukan alias) supaya user langsung tahu format yang diharapkan.
  const columns = [
    "NIK",
    "Nama Lengkap",
    "Tempat Lahir",
    "Tanggal Lahir",
    "Jenis Kelamin",
    "Alamat",
    "RT/RW",
    "Kelurahan",
    "Kecamatan",
    "Kota",
    "Provinsi",
    "Kode Pos",
    "Email",
    "No HP",
    "Ahli Waris",
  ];
  const csv = Papa.unparse(
    { fields: columns, data: SAMPLE_ROWS.map((row) => columns.map((c) => row[c] ?? "")) },
    { quotes: true, newline: "\r\n" },
  );
  // Prepend BOM (﻿) supaya Excel detect UTF-8 (karakter Indonesia
  // seperti 'é' di "Dé" atau nama dengan diacritics aman).
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template-peserta-instansi.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success("Template CSV terdownload — buka dengan Excel/Google Sheets untuk edit");
}

function parseCsv(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          // Hanya reject kalau SEMUA rows error. Partial errors ditoleransi.
          console.warn("CSV parse warnings:", results.errors);
        }
        resolve(results.data);
      },
      error: (err) => reject(err),
    });
  });
}

async function parseExcel(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("File Excel tidak punya worksheet");
  }
  // Baris 1 = header. Iterasi rows 2..N sebagai data records.
  // Pakai header untuk key (lowercase + trim).
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").toLowerCase().trim();
  });
  const out: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const rec: Record<string, unknown> = {};
    let hasAny = false;
    row.eachCell((cell, colNumber) => {
      const key = headers[colNumber - 1];
      if (!key) return;
      const v = cell.value;
      // ExcelJS cell.value untuk Date adalah Date object — convert ke YYYY-MM-DD
      let str: string;
      if (v instanceof Date) {
        str = v.toISOString().slice(0, 10);
      } else if (v == null) {
        str = "";
      } else {
        str = String(v);
      }
      rec[key] = str;
      if (str) hasAny = true;
    });
    if (hasAny) out.push(rec);
  });
  return out;
}

/** Map raw row ke ParticipantData, validate per field. */
function validateRow(raw: Record<string, unknown>, index: number): ParsedRow {
  // Lowercase + strip whitespace semua keys untuk matching
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    normalized[k.toLowerCase().trim()] = String(v ?? "").trim();
  }
  const data: Partial<ParticipantData> = {};
  const errors: Array<{ field: string; message: string }> = [];

  // Map each field via aliases
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as Array<
    [keyof ParticipantData, string[]]
  >) {
    let value: string | undefined;
    for (const alias of aliases) {
      if (normalized[alias] !== undefined && normalized[alias] !== "") {
        value = normalized[alias];
        break;
      }
    }
    if (value !== undefined) {
      (data as Record<string, unknown>)[field] = value;
    }
  }

  // Validate required fields
  if (!data.nik || !/^\d{16}$/.test(data.nik)) {
    errors.push({ field: "NIK", message: "harus 16 digit" });
  }
  if (!data.full_name || data.full_name.length === 0) {
    errors.push({ field: "Nama", message: "wajib" });
  }
  if (!data.birth_place) {
    errors.push({ field: "Tempat Lahir", message: "wajib" });
  }
  if (!data.birth_date || !/^\d{4}-\d{2}-\d{2}$/.test(data.birth_date)) {
    errors.push({ field: "Tanggal Lahir", message: "format YYYY-MM-DD" });
  } else {
    // Quick check: not in future
    const d = new Date(data.birth_date);
    if (d > new Date()) {
      errors.push({ field: "Tanggal Lahir", message: "tidak boleh di masa depan" });
    }
  }
  if (data.gender && !["MALE", "FEMALE", "L", "P", "M", "F"].includes(data.gender.toUpperCase())) {
    errors.push({ field: "Gender", message: "harus MALE/FEMALE" });
  }
  // Normalize gender shorthand
  if (data.gender) {
    const g = data.gender.toUpperCase();
    if (g === "L" || g === "M") data.gender = "MALE";
    else if (g === "P" || g === "F") data.gender = "FEMALE";
  }
  if (!data.address) errors.push({ field: "Alamat", message: "wajib" });
  if (!data.rt_rw || !data.rt_rw.includes("/")) {
    errors.push({ field: "RT/RW", message: "format 001/002" });
  }
  if (!data.village) errors.push({ field: "Kelurahan", message: "wajib" });
  if (!data.district) errors.push({ field: "Kecamatan", message: "wajib" });
  if (!data.city) errors.push({ field: "Kota", message: "wajib" });
  if (!data.province) errors.push({ field: "Provinsi", message: "wajib" });
  if (!data.postal_code || !/^\d{5}$/.test(data.postal_code)) {
    errors.push({ field: "Kode Pos", message: "5 digit" });
  }

  return {
    index,
    raw: normalized,
    data,
    errors,
    valid: errors.length === 0,
  };
}
