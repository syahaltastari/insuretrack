// API fetch helpers untuk landing page. Dipanggil dari Server Component
// (page.tsx) secara paralel via `Promise.all`. Semua return array kosong
// saat backend down — UI render fallback "Tidak bisa memuat..." tanpa
// throw, supaya 1 endpoint failure tidak menggugur section lain.
//
// Cache: `no-store` supaya setiap request dapat data fresh (CMS-driven
// content bisa berubah). Trade-off: latency vs staleness. Untuk landing
// page dengan traffic organik tinggi, pertimbangkan ISR di fase lanjut.

import { API_BASE } from "@insuretrack/api-client";

const API = API_BASE;

export type Product = {
  code: string;
  name: string;
  description: string;
};

export type Client = {
  id: string;
  name: string;
  logo_url: string;
  industry: string | null;
  website: string | null;
};

export type Testimonial = {
  id: string;
  customer_name: string;
  photo_url: string | null;
  rating: number;
  review: string;
  role: string | null;
  company: string | null;
  policy_type: string | null;
  is_featured: boolean;
};

async function fetchJsonOrNull<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchProducts(): Promise<Product[]> {
  const json = await fetchJsonOrNull<{ data?: { products?: Product[] } }>(
    `${API}/public/products`,
  );
  return json?.data?.products ?? [];
}

export async function fetchClients(): Promise<Client[]> {
  const json = await fetchJsonOrNull<{ data: Client[] }>(`${API}/public/clients`);
  return json?.data ?? [];
}

export async function fetchTestimonials(): Promise<Testimonial[]> {
  const json = await fetchJsonOrNull<{ data: Testimonial[] }>(
    `${API}/public/testimonials`,
  );
  return json?.data ?? [];
}
