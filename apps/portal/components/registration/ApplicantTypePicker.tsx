"use client";

import type { ApplicantType } from "@insuretrack/api-client";

interface ApplicantTypePickerProps {
  value: ApplicantType;
  onChange: (value: ApplicantType) => void;
}

/**
 * 2-card picker untuk pilih tipe pendaftaran: Individu (1 peserta) atau
 * Instansi (N peserta kolektif). Pola visual mirip PlanPicker — kartu
 * besar dengan icon + label + deskripsi + radio button hidden.
 *
 * Mengontrol alur form di /portal/insurance/new. Saat user ganti tipe,
 * form di-replace dengan versi sesuai (Individu = existing 4-tab;
 * Instansi = 4-tab baru dengan Data Instansi + Data Peserta).
 */
export function ApplicantTypePicker({ value, onChange }: ApplicantTypePickerProps) {
  const options: Array<{
    type: ApplicantType;
    icon: string;
    title: string;
    desc: string;
    badge?: string;
  }> = [
    {
      type: "INDIVIDU",
      icon: "👤",
      title: "Individu",
      desc: "Daftarkan 1 peserta. Cocok untuk perlindungan diri sendiri atau keluarga inti.",
    },
    {
      type: "INSTANSI",
      icon: "🏢",
      title: "Instansi",
      desc: "Daftarkan banyak peserta sekaligus (kolektif). Cocok untuk HR mendaftarkan karyawan, atau admin yayasan mendaftarkan anggota.",
      badge: "Baru",
    },
  ];

  return (
    <div
      className="clay-form-grid cols-2"
      role="radiogroup"
      aria-label="Pilih tipe pendaftaran"
      style={{ marginBottom: 32 }}
    >
      {options.map((opt) => {
        const isSelected = opt.type === value;
        return (
          <label
            key={opt.type}
            className={`clay-card feature clay-radio-card${isSelected ? " selected" : ""}`}
            style={{ display: "block", padding: 24, cursor: "pointer" }}
          >
            <input
              type="radio"
              name="applicant_type"
              value={opt.type}
              checked={isSelected}
              onChange={() => onChange(opt.type)}
              className="clay-radio-card-input"
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0,0,0,0)",
                whiteSpace: "nowrap",
                border: 0,
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: "2rem", lineHeight: 1 }} aria-hidden="true">
                {opt.icon}
              </span>
              {opt.badge && (
                <span className="clay-badge ube" aria-label="Fitur baru">
                  {opt.badge}
                </span>
              )}
            </div>
            <h3 className="card-heading" style={{ marginBottom: 8 }}>
              {opt.title}
            </h3>
            <p
              className="small"
              style={{ color: "var(--warm-charcoal)", margin: 0, lineHeight: 1.5 }}
            >
              {opt.desc}
            </p>
          </label>
        );
      })}
    </div>
  );
}
