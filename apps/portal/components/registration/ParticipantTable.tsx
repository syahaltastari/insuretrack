"use client";

import { useState } from "react";
import type { ParticipantData } from "@insuretrack/api-client";
import { Confirm, Icon } from "@insuretrack/ui";

/**
 * Editable table untuk N peserta Instansi. Tampilan ringkas (NIK, Nama,
 * TTL, JK) — full detail (alamat, dll.) di-trim dari CSV/Excel yang
 * valid; user cukup lihat ringkasan di sini.
 *
 * Aksi:
 *   - "Tambah Manual" → buka modal (ModalAddParticipant) untuk isi 1 peserta
 *   - "Hapus" per baris → Confirm dialog (Confirm component dari @insuretrack/ui)
 *   - Import (CSV/Excel) → komponen <ParticipantImport> di parent
 *
 * Props:
 *   - participants: state array dari parent (controlled)
 *   - onChange: dipanggil saat array berubah (add/remove)
 *   - showBeneficiary: tampilkan kolom Ahli Waris (untuk produk LIFE)
 */

interface ParticipantTableProps {
  participants: ParticipantData[];
  onChange: (next: ParticipantData[]) => void;
  showBeneficiary?: boolean;
}

export function ParticipantTable({
  participants,
  onChange,
  showBeneficiary = false,
}: ParticipantTableProps) {
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      {/* Header row: count + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <p
          className="body"
          style={{ color: "var(--warm-charcoal)", margin: 0, fontWeight: 600 }}
        >
          {participants.length} peserta
          {participants.length === 0 && (
            <span
              style={{ color: "var(--warm-silver)", fontWeight: 400, marginLeft: 8 }}
            >
              — tambah manual atau import dari CSV/Excel
            </span>
          )}
        </p>
        <button
          type="button"
          className="clay-button solid-ube size-small"
          onClick={() => setShowAdd(true)}
        >
          + Tambah Manual
        </button>
      </div>

      {/* Empty state */}
      {participants.length === 0 && (
        <div
          className="clay-card dashed"
          style={{
            textAlign: "center",
            padding: 32,
            color: "var(--warm-silver)",
            fontSize: "0.9rem",
          }}
        >
          Belum ada peserta. Klik "+ Tambah Manual" atau import dari file.
        </div>
      )}

      {/* Table */}
      {participants.length > 0 && (
        <div
          style={{
            overflowX: "auto",
            border: "1px solid var(--oat-border)",
            borderRadius: "var(--radius-card)",
          }}
        >
          <table className="clay-table" style={{ marginBottom: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>NIK</th>
                <th>Nama Lengkap</th>
                <th>Tempat, Tgl Lahir</th>
                <th>JK</th>
                {showBeneficiary && <th>Ahli Waris</th>}
                <th style={{ width: 80 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--warm-silver)" }}>{i + 1}</td>
                  <td
                    style={{ fontFamily: "var(--font-space-mono), monospace", fontSize: "0.85rem" }}
                  >
                    {p.nik || <span style={{ color: "var(--pomegranate-400)" }}>(kosong)</span>}
                  </td>
                  <td>{p.full_name || "—"}</td>
                  <td>
                    {p.birth_place && p.birth_date
                      ? `${p.birth_place}, ${p.birth_date}`
                      : "—"}
                  </td>
                  <td>
                    {p.gender === "MALE"
                      ? "L"
                      : p.gender === "FEMALE"
                        ? "P"
                        : "—"}
                  </td>
                  {showBeneficiary && <td>{p.beneficiary_name || "—"}</td>}
                  <td>
                    <button
                      type="button"
                      className="clay-button ghost size-small"
                      onClick={() => setPendingRemove(i)}
                      aria-label={`Hapus peserta ${p.full_name || i + 1}`}
                      style={{ padding: "4px 8px" }}
                    >
                      <Icon name="X" size="sm" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddParticipantModal
          existingNiks={new Set(participants.map((p) => p.nik).filter(Boolean))}
          showBeneficiary={showBeneficiary}
          onClose={() => setShowAdd(false)}
          onAdd={(p) => {
            onChange([...participants, p]);
            setShowAdd(false);
          }}
        />
      )}

      {/* Remove confirmation */}
      <Confirm
        open={pendingRemove !== null}
        onOpenChange={(o) => !o && setPendingRemove(null)}
        title="Hapus peserta ini?"
        description={
          pendingRemove !== null && participants[pendingRemove]
            ? `Peserta "${participants[pendingRemove].full_name || `baris ${pendingRemove + 1}`}" akan dihapus dari daftar.`
            : ""
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={() => {
          if (pendingRemove !== null) {
            onChange(participants.filter((_, i) => i !== pendingRemove));
            setPendingRemove(null);
          }
        }}
      />
    </div>
  );
}

// ---- Add modal -------------------------------------------------------------

interface AddModalProps {
  existingNiks: Set<string>;
  showBeneficiary: boolean;
  onClose: () => void;
  onAdd: (p: ParticipantData) => void;
}

function AddParticipantModal({
  existingNiks,
  showBeneficiary,
  onClose,
  onAdd,
}: AddModalProps) {
  const [form, setForm] = useState<ParticipantData>({
    nik: "",
    full_name: "",
    birth_place: "",
    birth_date: "",
    gender: "MALE",
    address: "",
    rt_rw: "",
    village: "",
    district: "",
    city: "",
    province: "",
    postal_code: "",
    email: "",
    mobile_number: "",
    beneficiary_name: "",
  });
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ParticipantData>(k: K, v: ParticipantData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    // Minimal validation
    if (!/^\d{16}$/.test(form.nik)) {
      setError("NIK harus 16 digit");
      return;
    }
    if (existingNiks.has(form.nik)) {
      setError(`NIK ${form.nik} sudah ada di daftar`);
      return;
    }
    if (!form.full_name.trim()) {
      setError("Nama lengkap wajib diisi");
      return;
    }
    if (!form.birth_place.trim() || !form.birth_date) {
      setError("Tempat & tanggal lahir wajib diisi");
      return;
    }
    if (!form.address.trim() || !form.rt_rw.includes("/")) {
      setError("Alamat & RT/RW (format 001/002) wajib diisi");
      return;
    }
    if (
      !form.village.trim() ||
      !form.district.trim() ||
      !form.city.trim() ||
      !form.province.trim() ||
      !/^\d{5}$/.test(form.postal_code)
    ) {
      setError("Kelurahan/Kecamatan/Kota/Provinsi/Kode Pos wajib diisi");
      return;
    }
    onAdd(form);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tambah peserta"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="clay-card section"
        style={{ width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="card-heading" style={{ marginBottom: 16 }}>
          Tambah Peserta Manual
        </h2>
        {error && (
          <div
            className="clay-card dashed"
            style={{
              padding: 12,
              marginBottom: 12,
              background: "#fff5f5",
              borderColor: "var(--pomegranate-400)",
              color: "var(--pomegranate-400)",
              fontSize: "0.9rem",
            }}
            role="alert"
          >
            ⚠ {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <Field label="NIK" required>
            <input
              className="clay-input"
              inputMode="numeric"
              maxLength={16}
              value={form.nik}
              onChange={(e) => set("nik", e.target.value)}
            />
          </Field>
          <Field label="Nama Lengkap" required>
            <input
              className="clay-input"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </Field>
          <Field label="Tempat Lahir" required>
            <input
              className="clay-input"
              value={form.birth_place}
              onChange={(e) => set("birth_place", e.target.value)}
            />
          </Field>
          <Field label="Tanggal Lahir" required>
            <input
              type="date"
              className="clay-input"
              value={form.birth_date}
              onChange={(e) => set("birth_date", e.target.value)}
            />
          </Field>
          <Field label="Jenis Kelamin" required>
            <select
              className="clay-select"
              value={form.gender}
              onChange={(e) => set("gender", e.target.value as "MALE" | "FEMALE")}
            >
              <option value="MALE">Laki-laki</option>
              <option value="FEMALE">Perempuan</option>
            </select>
          </Field>
          <Field label="RT/RW" required>
            <input
              className="clay-input"
              placeholder="001/002"
              value={form.rt_rw}
              onChange={(e) => set("rt_rw", e.target.value)}
            />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Alamat" required>
              <input
                className="clay-input"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Kelurahan / Desa" required>
            <input
              className="clay-input"
              value={form.village}
              onChange={(e) => set("village", e.target.value)}
            />
          </Field>
          <Field label="Kecamatan" required>
            <input
              className="clay-input"
              value={form.district}
              onChange={(e) => set("district", e.target.value)}
            />
          </Field>
          <Field label="Kota / Kabupaten" required>
            <input
              className="clay-input"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>
          <Field label="Provinsi" required>
            <input
              className="clay-input"
              value={form.province}
              onChange={(e) => set("province", e.target.value)}
            />
          </Field>
          <Field label="Kode Pos" required>
            <input
              className="clay-input"
              inputMode="numeric"
              maxLength={5}
              value={form.postal_code}
              onChange={(e) => set("postal_code", e.target.value)}
            />
          </Field>
          <Field label="Email (opsional)">
            <input
              type="email"
              className="clay-input"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="No HP (opsional)">
            <input
              className="clay-input"
              inputMode="tel"
              value={form.mobile_number}
              onChange={(e) => set("mobile_number", e.target.value)}
            />
          </Field>
          {showBeneficiary && (
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Nama Ahli Waris" required hint="Wajib untuk produk Jiwa">
                <input
                  className="clay-input"
                  value={form.beneficiary_name}
                  onChange={(e) => set("beneficiary_name", e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 16,
          }}
        >
          <button
            type="button"
            className="clay-button ghost size-small"
            onClick={onClose}
          >
            Batal
          </button>
          <button
            type="button"
            className="clay-button solid-ube size-small"
            onClick={handleSubmit}
          >
            Tambah
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="clay-label">
        {label}
        {required && (
          <span style={{ color: "var(--pomegranate-400)", marginLeft: 4 }}>*</span>
        )}
      </label>
      {children}
      {hint && (
        <p
          className="caption"
          style={{ color: "var(--warm-silver)", marginTop: 4, marginBottom: 0 }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
