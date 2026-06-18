// Shared setup untuk semua Vitest tests. Loaded via `setupFiles` di
// vitest.config.ts.
//
// Tujuan: polyfill / matcher untuk environment jsdom.

import "@testing-library/jest-dom/vitest";

// jsdom tidak implement `matchMedia` — package yang pakai (mis. radix-ui
// components) akan crash kalau tidak di-stub.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// `IntersectionObserver` juga missing di jsdom — dipakai oleh beberapa
// component untuk lazy-mount / infinite-scroll.
if (typeof globalThis.IntersectionObserver === "undefined") {
  (globalThis as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}
