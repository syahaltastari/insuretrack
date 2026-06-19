// API client (server & browser safe). Token-based auth helper.
//
// Dua env var dipakai karena beda konteks eksekusi:
// - `NEXT_PUBLIC_API_URL` di-bake ke client bundle, dipakai browser untuk
//   fetch ke public URL (lewat Traefik di Dokploy atau port mapping di lokal).
// - `BACKEND_URL` (tanpa prefix NEXT_PUBLIC_) adalah runtime env, dipakai
//   Next.js SSR/RSC di dalam container Docker untuk fetch langsung ke
//   service `backend` di internal network. Fallback ke public URL untuk
//   local dev di luar Docker (`pnpm dev` di host).

// Append `/api` ke base URL, strip trailing slash kalau ada.
// Konsisten dengan `API_BASE_INTERNAL` di bawah — baik PUBLIC maupun
// INTERNAL base URL diharapkan TIDAK include `/api` suffix di env var;
// client cukup set `http://api.example.com` (atau `http://backend:8080`).
// `appendApi` helper sentralisasi logic ini agar tidak duplikasi.
const appendApi = (base: string): string =>
  `${base.replace(/\/+$/, "")}/api`;

export const API_BASE_PUBLIC =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
    ? appendApi(process.env.NEXT_PUBLIC_API_URL)
    : null) ||
  "http://localhost:8080/api";

export const API_BASE_INTERNAL =
  (typeof process !== "undefined" && process.env.BACKEND_URL
    ? appendApi(process.env.BACKEND_URL)
    : null) ||
  API_BASE_PUBLIC;

// Pilih otomatis: SSR (Next.js server) pakai internal, client (browser)
// pakai public. `typeof window` dievaluasi saat runtime, bukan build time.
export const API_BASE =
  typeof window === "undefined" ? API_BASE_INTERNAL : API_BASE_PUBLIC;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (init.token) {
    headers.set("Authorization", `Bearer ${init.token}`);
  }

  const r = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await r.text();
  const json = text ? JSON.parse(text) : null;

  if (!r.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      r.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? `HTTP ${r.status}`,
    );
  }
  return json as T;
}
