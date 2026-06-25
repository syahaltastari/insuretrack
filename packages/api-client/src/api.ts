// API client (server & browser safe). Cookie-based auth, CSRF auto-attach.
//
// Dua env var dipakai karena beda konteks eksekusi:
// - `NEXT_PUBLIC_API_URL` di-bake ke client bundle, dipakai browser untuk
//   fetch ke public URL (lewat Traefik di Dokploy atau port mapping di lokal).
// - `BACKEND_URL` (tanpa prefix NEXT_PUBLIC_) adalah runtime env, dipakai
//   Next.js SSR/RSC di dalam container Docker untuk fetch langsung ke
//   service `backend` di internal network. Fallback ke public URL untuk
//   local dev di luar Docker (`pnpm dev` di host).

// Append `/api` ke base URL, strip trailing slash kalau ada. Kalau base
// sudah diakhiri `/api` (mis. `NEXT_PUBLIC_API_URL=/api` di dev mode
// dengan Next.js rewrites), pass-through tanpa double-prefix.
// Konsisten dengan `API_BASE_INTERNAL` di bawah — base URL diharapkan
// TIDAK include `/api` suffix (production pakai `http://api.example.com`)
// KECUALI untuk same-origin proxy mode (`/api`) yang dipakai di dev.
const appendApi = (base: string): string => {
  const trimmed = base.replace(/\/+$/, "");
  return trimmed === "" || trimmed.endsWith("/api") ? trimmed || "/api" : `${trimmed}/api`;
};

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

// CSRF cookie name — di-bake ke client bundle via NEXT_PUBLIC_* env, atau
// fallback ke default. Sinkron dengan `auth.ts` SESSION_COOKIE_NAME.
const CSRF_COOKIE_NAME =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME) ||
  "insuretrack_csrf";

const SESSION_COOKIE_NAME =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME) ||
  "insuretrack_session";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * SSR-only: baca cookies dari Next.js `cookies()` API dan serialize
 * ke `Cookie:` header value. Return `undefined` di non-Next.js
 * context (vitest, dll.) atau kalau `next/headers` tidak di-load.
 */
async function readIncomingCookiesForSsr(): Promise<string | undefined> {
  try {
    // Dynamic import — `next/headers` hanya ada di Next.js runtime.
    // Di unit test (vitest) module ini absent → return undefined.
    const mod = await import("next/headers").catch(() => null);
    if (!mod) return undefined;
    const jar = await mod.cookies();
    const session = jar.get(SESSION_COOKIE_NAME);
    const csrf = jar.get(CSRF_COOKIE_NAME);
    const parts: string[] = [];
    if (session) parts.push(`${SESSION_COOKIE_NAME}=${session.value}`);
    if (csrf) parts.push(`${CSRF_COOKIE_NAME}=${csrf.value}`);
    return parts.length ? parts.join("; ") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Browser-only: baca CSRF token dari `document.cookie`. Return `null`
 * kalau cookie absent (user belum login) atau di server-side.
 */
function readCsrfFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]+)`),
  );
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Fetch wrapper. Auth via httpOnly cookie (browser auto-attach) atau via
 * SSR-forwarded cookie (server-side fetch). CSRF token auto-attach di
 * request mutating.
 *
 * Konvensi request:
 * - GET/HEAD/OPTIONS: aman, no CSRF needed.
 * - POST/PUT/PATCH/DELETE: butuh `X-CSRF-Token` header yang cocok dengan
 *   `insuretrack_csrf` cookie. Helper baca dari cookie (browser) atau
 *   skip-list di backend (login/activate/reset/webhook).
 * - Content-Type: auto-set `application/json` kecuali body FormData.
 *
 * Session token TIDAK di-attach manual — browser auto-attach `Cookie:`
 * untuk same-site request; SSR explicitly forwards via `next/headers`.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  // 1. Content-Type default untuk JSON body (skip FormData — browser
  //    set dengan boundary yang harus match).
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const method = (init.method ?? "GET").toUpperCase();

  // 2. CSRF: untuk request mutating di browser, mirror CSRF cookie
  //    value ke header. Di SSR, cookie sudah di-forward via `Cookie:`
  //    header di bawah — CSRF guard backend baca X-CSRF-Token dari
  //    header ATAU cocokkan cookie vs header (kita yang forward).
  if (MUTATING_METHODS.has(method) && typeof window !== "undefined") {
    const csrf = readCsrfFromDocument();
    if (csrf && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrf);
    }
  }

  // 3. SSR cookie forwarding: kalau di server-side, baca `next/headers`
  //    cookies() dan attach sebagai `Cookie:` header. Tidak dilakukan di
  //    browser — browser auto-attach session cookie.
  if (typeof window === "undefined") {
    const cookie = await readIncomingCookiesForSsr();
    if (cookie) headers.set("Cookie", cookie);
  }

  const r = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
  const text = await r.text();
  // Backend (atau proxy di depannya) bisa balas plain-text di luar
  // kontrol kita — panic handler Axum default, 502/504 dari Traefik,
  // dll. JSON.parse pada body non-JSON harus jadi ApiError yang jelas,
  // bukan SyntaxError mentah yang membingungkan di UI.
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(r.status, "INVALID_RESPONSE", text.slice(0, 200) || `HTTP ${r.status}`);
    }
  }

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

/** `true` kalau user punya session cookie di browser. Cross-tab safe. */
export function hasSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
}
