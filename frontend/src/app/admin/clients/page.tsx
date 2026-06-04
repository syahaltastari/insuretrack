"use client";

import { useEffect, useRef, useState } from "react";

// Admin pages are interactive client components; skip static prerendering.
export const dynamic = "force-dynamic";
import { AdminShell } from "@/components/AdminShell";
import { Pagination } from "@/components/Pagination";
import { API_BASE } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

type Client = {
  id: string;
  name: string;
  logo_path: string;
  industry: string | null;
  website: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type FormState = {
  name: string;
  industry: string;
  website: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  sort_order: string;
  is_active: boolean;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  industry: "",
  website: "",
  contact_person: "",
  contact_email: "",
  contact_phone: "",
  sort_order: "0",
  is_active: true,
  notes: "",
};

function logoUrl(logo_path: string): string {
  if (!logo_path) return "";
  if (logo_path.startsWith("http")) return logo_path;
  const apiRoot = API_BASE.replace(/\/api\/?$/, "");
  return `${apiRoot}/api/public/uploads/${logo_path.replace(/^\/+/, "")}`;
}

export default function AdminClientsPage() {
  const [data, setData] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [logoFile, setLogoFile] = useState<File | null>(null);
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
      const r = await fetch(`${API_BASE}/admin/clients?${params}`, {
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
    setLogoFile(null);
    setShowForm(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      name: c.name,
      industry: c.industry ?? "",
      website: c.website ?? "",
      contact_person: c.contact_person ?? "",
      contact_email: c.contact_email ?? "",
      contact_phone: c.contact_phone ?? "",
      sort_order: String(c.sort_order),
      is_active: c.is_active,
      notes: c.notes ?? "",
    });
    setLogoFile(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAdminToken();
    if (!token) return;
    if (!form.name.trim()) {
      alert("Nama klien wajib diisi");
      return;
    }
    if (!editing && !logoFile) {
      alert("Logo klien wajib diupload");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append(
        "data",
        JSON.stringify({
          name: form.name.trim(),
          industry: form.industry.trim() || null,
          website: form.website.trim() || null,
          contact_person: form.contact_person.trim() || null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          sort_order: Number(form.sort_order) || 0,
          is_active: form.is_active,
          notes: form.notes.trim() || null,
        }),
      );
      if (logoFile) fd.append("logo", logoFile);
      const url = editing ? `${API_BASE}/admin/clients/${editing.id}` : `${API_BASE}/admin/clients`;
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

  const remove = async (c: Client) => {
    if (!confirm(`Hapus klien "${c.name}"?`)) return;
    const token = getAdminToken();
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE}/admin/clients/${c.id}`, {
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
          <h1 className="page-title">Klien Korporat</h1>
          <p className="page-subtitle">Logo klien yang tampil di carousel landing page.</p>
        </div>
        <button className="clay-button solid-ube" onClick={openCreate}>
          + Tambah Klien
        </button>
      </div>

      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama atau industri..."
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
            Belum ada klien. Klik &quot;Tambah Klien&quot; untuk menambahkan.
          </p>
        </div>
      )}

      {showForm && (
        <div className="clay-card feature" style={{ marginBottom: 24 }}>
          <h2 className="card-heading" style={{ marginBottom: 16 }}>
            {editing ? "Edit Klien" : "Tambah Klien"}
          </h2>
          <form onSubmit={save}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label className="clay-label">Nama Klien *</label>
                <input
                  className="clay-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="clay-label">Industri</label>
                <input
                  className="clay-input"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                />
              </div>
              <div>
                <label className="clay-label">Website</label>
                <input
                  className="clay-input"
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="clay-label">Urutan Tampil</label>
                <input
                  className="clay-input"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                />
              </div>
              <div>
                <label className="clay-label">Contact Person</label>
                <input
                  className="clay-input"
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                />
              </div>
              <div>
                <label className="clay-label">Email Kontak</label>
                <input
                  className="clay-input"
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                />
              </div>
              <div>
                <label className="clay-label">Telepon Kontak</label>
                <input
                  className="clay-input"
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                />
              </div>
              <div>
                <label className="clay-label">Logo {!editing && "*"}</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  className="clay-input"
                  style={{ padding: 8 }}
                />
                {editing && (
                  <p className="caption" style={{ color: "var(--warm-silver)", marginTop: 4 }}>
                    Biarkan kosong jika tidak ingin mengganti logo.
                  </p>
                )}
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="clay-label">Catatan Internal</label>
              <textarea
                className="clay-textarea"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                id="active"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <label htmlFor="active">Aktif (tampil di landing page)</label>
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
        <div className="clay-grid cols-3">
          {data.map((c) => (
            <div key={c.id} className="clay-card feature" style={{ padding: 16 }}>
              <div
                style={{
                  height: 100,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--warm-cream)",
                  borderRadius: 12,
                  marginBottom: 12,
                  padding: 8,
                }}
              >
                <img
                  src={logoUrl(c.logo_path)}
                  alt={c.name}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              </div>
              <h3 className="feature-title" style={{ marginBottom: 4 }}>{c.name}</h3>
              {c.industry && (
                <p className="caption" style={{ color: "var(--warm-silver)", margin: "0 0 8px 0" }}>
                  {c.industry}
                </p>
              )}
              <p className="caption" style={{ color: "var(--warm-charcoal)", margin: 0 }}>
                Urutan: {c.sort_order} ·{" "}
                <span className={`clay-badge ${c.is_active ? "matcha" : "muted"}`}>
                  {c.is_active ? "Aktif" : "Nonaktif"}
                </span>
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="clay-button solid-ube size-small" onClick={() => openEdit(c)}>
                  Edit
                </button>
                <button className="clay-button solid-pomegranate size-small" onClick={() => remove(c)}>
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
