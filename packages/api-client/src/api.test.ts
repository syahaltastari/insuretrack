// Unit test untuk apiFetch — cover header logic, error envelope parsing,
// empty body, dan CSRF auto-attach.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "./api";

const originalFetch = globalThis.fetch;
const originalDocument = (globalThis as { document?: unknown }).document;

describe("apiFetch", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    // Default mock document.cookie kosong (no session/CSRF).
    setDocumentCookie("");
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    setDocumentCookie(null);
  });

  function setDocumentCookie(value: string | null) {
    if (value === null) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: unknown }).document = {
        cookie: value,
      };
    }
  }

  function mockResponse(status: number, body: unknown) {
    // jsdom Response constructor menolak 204 status (sebagian besar browser
    // modern juga). Untuk test empty body, pakai 200 dengan body null →
    // API kita treat sebagai empty response → return null.
    const safeStatus = status === 204 ? 200 : status;
    const text = body === null ? "" : JSON.stringify(body);
    return new Response(text, {
      status: safeStatus,
      headers: { "content-type": "application/json" },
    });
  }

  it("sets Content-Type: application/json for JSON body", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockResponse(200, { ok: true }));

    await apiFetch("/test", { method: "POST", body: JSON.stringify({ a: 1 }) });

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.headers.get("content-type")).toBe("application/json");
  });

  it("does NOT set Content-Type for FormData (browser sets with boundary)", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockResponse(200, { ok: true }));

    const fd = new FormData();
    fd.append("file", new Blob(["x"]), "test.txt");
    await apiFetch("/upload", { method: "POST", body: fd });

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    // Browser auto-set dengan boundary — kalau kita set manual, dia akan
    // salah. apiFetch harus skip Content-Type supaya browser yang handle.
    expect(init.headers.has("content-type")).toBe(false);
  });

  it("returns parsed JSON on 2xx", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse(200, { id: "abc", name: "Test" }),
    );
    const result = await apiFetch<{ id: string; name: string }>("/items/abc");
    expect(result).toEqual({ id: "abc", name: "Test" });
  });

  it("returns null on empty body (e.g. 200 No Content)", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockResponse(200, null));
    const result = await apiFetch("/items/abc", { method: "DELETE" });
    expect(result).toBeNull();
  });

  it("throws ApiError with code+message from error envelope", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse(400, {
        error: { code: "VALIDATION", message: "NIK harus 16 digit" },
      }),
    );

    await expect(apiFetch("/bad")).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION",
      message: "NIK harus 16 digit",
    });
  });

  it("falls back to UNKNOWN code when error envelope missing", async () => {
    // mockImplementation (bukan mockResolvedValue) supaya tiap call
    // dapat Response fresh — Response body cuma bisa di-read sekali.
    (globalThis.fetch as any).mockImplementation(() =>
      Promise.resolve(mockResponse(500, "Internal Server Error")),
    );

    await expect(apiFetch("/crash")).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch("/crash-2")).rejects.toMatchObject({
      status: 500,
      code: "UNKNOWN",
    });
  });

  it("mutating request auto-attaches X-CSRF-Token from document.cookie", async () => {
    setDocumentCookie("insuretrack_session=abc; insuretrack_csrf=csrf-xyz");
    (globalThis.fetch as any).mockResolvedValue(mockResponse(200, { ok: true }));

    await apiFetch("/admin/foo", { method: "POST", body: "{}" });

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.headers.get("x-csrf-token")).toBe("csrf-xyz");
  });

  it("GET request does NOT attach X-CSRF-Token (skip CSRF check)", async () => {
    setDocumentCookie("insuretrack_csrf=csrf-xyz");
    (globalThis.fetch as any).mockResolvedValue(mockResponse(200, { ok: true }));

    await apiFetch("/admin/me");

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.headers.has("x-csrf-token")).toBe(false);
  });

  it("does NOT attach X-CSRF-Token when cookie absent", async () => {
    setDocumentCookie(""); // no csrf cookie
    (globalThis.fetch as any).mockResolvedValue(mockResponse(200, { ok: true }));

    await apiFetch("/admin/foo", { method: "POST", body: "{}" });

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    // Backend will reject (403) — FE tidak fabricate token.
    expect(init.headers.has("x-csrf-token")).toBe(false);
  });

  it("attaches credentials: 'include' for cross-origin cookie inclusion", async () => {
    setDocumentCookie("insuretrack_session=abc");
    (globalThis.fetch as any).mockResolvedValue(mockResponse(200, { ok: true }));

    await apiFetch("/admin/me");

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    // Penting untuk cross-origin request agar browser kirim cookie.
    expect(init.credentials).toBe("include");
  });
});
