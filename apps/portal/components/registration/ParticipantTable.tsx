"use client";

import { useEffect, useState } from "react";
import type { ParticipantData } from "@insuretrack/api-client";
import { Confirm, Icon } from "@insuretrack/ui";

/**
 * Editable table untuk N peserta Instansi. Tampilan ringkas (NIK, Nama,
 * TTL, JK) — full detail (alamat, dll.) di-trim dari CSV/Excel yang
 * valid; user cukup lihat ringkasan di sini.
 *
 * Aksi:
 *   - "Tambah Manual" → buka modal (ParticipantFormModal mode=add) untuk
 *     isi 1 peserta
 *   - "Edit" per baris → buka modal mode=edit dengan field pre-filled
 *   - "Hapus" per baris → Confirm dialog
 *   - Import (CSV/Excel) → komponen <ParticipantImport> di parent
 *
 * Modal participant TIDAK close on outside click (per requirement user
 * untuk mencegah close tidak sengaja). User harus klik tombol X / Batal /
 * tekan ESC. Tombol close X di pojok kanan atas card.
 *
 * Props:
 *   - participants: state array dari parent (controlled)
 *   - onChange: dipanggil saat array berubah (add/edit/remove)
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
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

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
                <th style={{ width: 110 }}>Aksi</th>
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
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        className="clay-button ghost size-small"
                        onClick={() => setEditingIdx(i)}
                        aria-label={`Edit peserta ${p.full_name || i + 1}`}
                        style={{ padding: "4px 8px" }}
                      >
                        <Icon name="Pencil" size="sm" />
                      </button>
                      <button
                        type="button"
                        className="clay-button ghost size-small"
                        onClick={() => setPendingRemove(i)}
                        aria-label={`Hapus peserta ${p.full_name || i + 1}`}
                        style={{ padding: "4px 8px" }}
                      >
                        <Icon name="X" size="sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <ParticipantFormModal
          mode="add"
          existingNiks={new Set(participants.map((p) => p.nik).filter(Boolean))}
          showBeneficiary={showBeneficiary}
          onClose={() => setShowAdd(false)}
          onSave={(p) => {
            onChange([...participants, p]);
            setShowAdd(false);
          }}
        />
      )}

      {/* Edit modal */}
      {editingIdx !== null && (
        <ParticipantFormModal
          mode="edit"
          initial={participants[editingIdx]}
          existingNiks={new Set(
            participants
              .map((p, idx) => (idx !== editingIdx ? p.nik : ""))
              .filter(Boolean),
          )}
          showBeneficiary={showBeneficiary}
          onClose={() => setEditingIdx(null)}
          onSave={(p) => {
            onChange(participants.map((q, idx) => (idx === editingIdx ? p : q)));
            setEditingIdx(null);
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

// ---- Add / Edit modal (reusable) ---------------------------------------

interface ParticipantFormModalProps {
  mode: "add" | "edit";
  /** Untuk mode="edit": data existing yang akan di-prefill. */
  initial?: ParticipantData;
  /** Set NIK yang sudah ada di list (exclude row yang sedang di-edit
   *  supaya user bisa save tanpa konflik dengan NIK sendiri). */
  existingNiks: Set<string>;
  showBeneficiary: boolean;
  onClose: () => void;
  /** Callback tunggal untuk add & edit. Parent yang putuskan append
   *  atau replace based on mode. */
  onSave: (p: ParticipantData) => void;
}

function ParticipantFormModal({
  mode,
  initial,
  existingNiks,
  showBeneficiary,
  onClose,
  onSave,
}: ParticipantFormModalProps) {
  const empty: ParticipantData = {
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
  };
  const [form, setForm] = useState<ParticipantData>(initial ?? empty);
  const [error, setError] = useState<string | null>(null);

  // ESC key close — selain tombol X / Batal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof ParticipantData>(k: K, v: ParticipantData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    // Sama validation rules untuk add & edit.
    if (!/^\d{16}$/.test(form.nik)) {
      setError("NIK harus 16 digit angka");
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
    if (showBeneficiary && !form.beneficiary_name?.trim()) {
      setError("Nama ahli waris wajib diisi untuk produk Jiwa");
      return;
    }
    onSave(form);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "add" ? "Tambah peserta" : "Edit peserta"}
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
    >
      <div
        className="clay-card section clay-modal-scroll"
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
        }}
      >
        {/* Close X di pojok kanan atas. Tidak ada click-outside-close:
            user harus explicit close via X / Batal / ESC. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="clay-button ghost size-small"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            padding: "4px 8px",
            zIndex: 1,
          }}
        >
          <Icon name="X" size="sm" />
        </button>
        <h2 className="card-heading" style={{ marginBottom: 16, paddingRight: 40 }}>
          {mode === "add" ? "Tambah Peserta Manual" : "Edit Peserta"}
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
            {mode === "add" ? "Tambah" : "Simpan"}
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
