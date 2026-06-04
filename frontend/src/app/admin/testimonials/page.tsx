"use client";

import { useEffect, useRef, useState } from "react";

// Admin pages are interactive client components; skip static prerendering.
export const dynamic = "force-dynamic";
import { AdminShell } from "@/components/AdminShell";
import { Pagination } from "@/components/Pagination";
import { API_BASE } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

type Testimonial = {
  id: string;
  customer_name: string;
  photo_path: string | null;
  rating: number;
  review: string;
  role: string | null;
  company: string | null;
  policy_type: string | null;
  display_date: string;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type FormState = {
  customer_name: string;
  rating: number;
  review: string;
  role: string;
  company: string;
  policy_type: string;
  display_date: string;
  is_featured: boolean;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  customer_name: "",
  rating: 5,
  review: "",
  role: "",
  company: "",
  policy_type: "LIFE",
  display_date: new Date().toISOString().slice(0, 10),
  is_featured: false,
  is_active: true,
};

const POLICY_OPTIONS = [
  { code: "LIFE", label: "Life Insurance" },
  { code: "PERSONAL_ACCIDENT", label: "Personal Accident" },
  { code: "HEALTH", label: "Health Insurance" },
];

function photoUrl(photo_path: string | null): string {
  if (!photo_path) return "";
  if (photo_path.startsWith("http")) return photo_path;
  const apiRoot = API_BASE.replace(/\/api\/?$/, "");
  return `${apiRoot}/api/public/uploads/${photo_path.replace(/^\/+/, "")}`;
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{
            fontSize: size,
            color: i <= rating ? "var(--lemon-700)" : "var(--oat-light)",
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export default function AdminTestimonialsPage() {
  const [data, setData] = useState<Testimonial[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pageSize = 12;

  const load = async () => {
    const token = getAdminToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const r = await fetch(`${API_BASE}/admin/testimonials?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setData(json.data);
      setTotal(json.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPhotoFile(null);
    setShowForm(true);
  };

  const openEdit = (t: Testimonial) => {
    setEditing(t);
    setForm({
      customer_name: t.customer_name,
      rating: t.rating,
      review: t.review,
      role: t.role ?? "",
      company: t.company ?? "",
      policy_type: t.policy_type ?? "LIFE",
      display_date: t.display_date,
      is_featured: t.is_featured,
      is_active: t.is_active,
    });
    setPhotoFile(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setPhotoFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAdminToken();
    if (!token) return;
    if (!form.customer_name.trim()) {
      alert("Nama customer wajib diisi");
      return;
    }
    if (!form.review.trim()) {
      alert("Isi review wajib diisi");
      return;
    }
    if (form.rating < 1 || form.rating > 5) {
      alert("Rating harus 1-5");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append(
        "data",
        JSON.stringify({
          customer_name: form.customer_name.trim(),
          rating: form.rating,
          review: form.review.trim(),
          role: form.role.trim() || null,
          company: form.company.trim() || null,
          policy_type: form.policy_type,
          display_date: form.display_date,
          is_featured: form.is_featured,
          is_active: form.is_active,
        }),
      );
      if (photoFile) fd.append("photo", photoFile);
      const url = editing
        ? `${API_BASE}/admin/testimonials/${editing.id}`
        : `${API_BASE}/admin/testimonials`;
      const method = editing ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      closeForm();
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Testimonial) => {
    if (!confirm(`Hapus testimoni dari "${t.customer_name}"?`)) return;
    const token = getAdminToken();
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE}/admin/testimonials/${t.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok && r.status !== 204) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      }
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal hapus");
    }
  };

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <p className="uppercase-label" style={{ color: "var(--ube-800)", marginBottom: 8 }}>
            ✦ Marketing
          </p>
          <h1 className="page-title">Testimoni Customer</h1>
          <p className="page-subtitle">Testimoni yang tampil di carousel landing page.</p>
        </div>
        <button className="clay-button solid-ube" onClick={openCreate}>
          + Tambah Testimoni
        </button>
      </div>

      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama atau review..."
          className="clay-input"
          style={{ flex: 1, minWidth: 200 }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="clay-select"
          style={{ width: 200 }}
        >
          <option value="">Semua status</option>
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
        <button type="submit" className="clay-button solid-ube">
          Cari
        </button>
      </form>

      {error && (
        <div className="clay-card" style={{ borderColor: "var(--pomegranate-400)", background: "#fff5f5" }}>
          ⚠ {error}
        </div>
      )}
      {loading && <p>Memuat...</p>}

      {!loading && data.length === 0 && !showForm && (
        <div className="clay-card feature dashed" style={{ textAlign: "center", padding: 48 }}>
          <p className="body" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
            Belum ada testimoni. Klik &quot;Tambah Testimoni&quot; untuk menambahkan.
          </p>
        </div>
      )}

      {showForm && (
        <div className="clay-card feature" style={{ marginBottom: 24 }}>
          <h2 className="card-heading" style={{ marginBottom: 16 }}>
            {editing ? "Edit Testimoni" : "Tambah Testimoni"}
          </h2>
          <form onSubmit={save}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label className="clay-label">Nama Customer *</label>
                <input
                  className="clay-input"
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="clay-label">Peran / Jabatan</label>
                <input
                  className="clay-input"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="cth: Ibu rumah tangga"
                />
              </div>
              <div>
                <label className="clay-label">Perusahaan / Asal</label>
                <input
                  className="clay-input"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="cth: PT Contoh, atau —"
                />
              </div>
              <div>
                <label className="clay-label">Produk Asuransi</label>
                <select
                  className="clay-select"
                  value={form.policy_type}
                  onChange={(e) => setForm({ ...form, policy_type: e.target.value })}
                >
                  {POLICY_OPTIONS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="clay-label">Rating *</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setForm({ ...form, rating: i })}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 28,
                        color: i <= form.rating ? "var(--lemon-700)" : "var(--oat-light)",
                        padding: 0,
                      }}
                    >
                      ★
                    </button>
                  ))}
                  <span className="caption" style={{ color: "var(--warm-silver)" }}>
                    {form.rating} / 5
                  </span>
                </div>
              </div>
              <div>
                <label className="clay-label">Tanggal Tampil</label>
                <input
                  className="clay-input"
                  type="date"
                  value={form.display_date}
                  onChange={(e) => setForm({ ...form, display_date: e.target.value })}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="clay-label">Review *</label>
                <textarea
                  className="clay-textarea"
                  rows={4}
                  value={form.review}
                  onChange={(e) => setForm({ ...form, review: e.target.value })}
                  required
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="clay-label">Foto Customer (opsional)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="clay-input"
                  style={{ padding: 8 }}
                />
                {editing && (
                  <p className="caption" style={{ color: "var(--warm-silver)", marginTop: 4 }}>
                    Biarkan kosong jika tidak ingin mengganti foto.
                  </p>
                )}
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                />
                Featured (unggulan)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Aktif (tampil di landing page)
              </label>
            </div>
            <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
              <button type="submit" className="clay-button solid-ube" disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
              <button type="button" className="clay-button ghost" onClick={closeForm} disabled={saving}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="clay-grid cols-2">
          {data.map((t) => (
            <div key={t.id} className="clay-card feature" style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: "var(--warm-cream)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    border: "2px solid var(--oat-border)",
                  }}
                >
                  {t.photo_path ? (
                    <img
                      src={photoUrl(t.photo_path)}
                      alt={t.customer_name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 24, color: "var(--warm-silver)" }}>
                      {t.customer_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 className="feature-title" style={{ marginBottom: 2 }}>
                    {t.customer_name}
                  </h3>
                  <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
                    {t.role ?? "—"}
                    {t.company ? ` · ${t.company}` : ""}
                  </p>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Stars rating={t.rating} />
                    {t.is_featured && (
                      <span className="clay-badge lemon" style={{ fontSize: "0.7rem" }}>
                        Featured
                      </span>
                    )}
                    <span className={`clay-badge ${t.is_active ? "matcha" : "muted"}`} style={{ fontSize: "0.7rem" }}>
                      {t.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                </div>
              </div>
              <p
                className="body"
                style={{
                  color: "var(--warm-charcoal)",
                  margin: 0,
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                &ldquo;{t.review}&rdquo;
              </p>
              <p className="caption" style={{ color: "var(--warm-silver)", margin: "8px 0 0 0" }}>
                {t.display_date} · {t.policy_type ?? "—"}
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="clay-button solid-ube size-small" onClick={() => openEdit(t)}>
                  Edit
                </button>
                <button className="clay-button solid-pomegranate size-small" onClick={() => remove(t)}>
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </AdminShell>
  );
}
