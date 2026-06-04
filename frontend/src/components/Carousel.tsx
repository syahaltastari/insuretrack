"use client";

import { useEffect, useState, ReactNode } from "react";

/**
 * Carousel auto-slide sederhana.
 * - `items` — daftar konten (JSX) untuk setiap slide.
 * - `autoMs` — interval perpindahan otomatis (default 5 detik).
 * - `itemsPerSlide` — jumlah item per slide; di mobile selalu 1.
 */
export function Carousel({
  items,
  autoMs = 5000,
  itemsPerSlideDesktop = 3,
  ariaLabel,
}: {
  items: ReactNode[];
  autoMs?: number;
  itemsPerSlideDesktop?: number;
  ariaLabel?: string;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Deteksi lebar layar → items per slide responsif
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const perSlide = isMobile ? 1 : itemsPerSlideDesktop;
  const totalPages = Math.max(1, Math.ceil(items.length / perSlide));
  const safePage = Math.min(pageIndex, totalPages - 1);

  // Auto-slide
  useEffect(() => {
    if (isPaused || items.length <= perSlide) return;
    const id = setInterval(() => {
      setPageIndex((p) => (p + 1) % totalPages);
    }, autoMs);
    return () => clearInterval(id);
  }, [isPaused, autoMs, items.length, perSlide, totalPages]);

  // Reset kalau items berubah
  useEffect(() => {
    setPageIndex(0);
  }, [items.length]);

  if (items.length === 0) return null;

  const startIdx = safePage * perSlide;
  const visibleItems = items.slice(startIdx, startIdx + perSlide);

  return (
    <div
      aria-label={ariaLabel}
      role="region"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{ position: "relative" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${perSlide}, 1fr)`,
          gap: 20,
        }}
      >
        {visibleItems}
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginTop: 24,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            aria-label="Slide sebelumnya"
            onClick={() => setPageIndex((p) => (p - 1 + totalPages) % totalPages)}
            className="clay-button ghost size-small"
            style={{ padding: "6px 12px" }}
          >
            ←
          </button>
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ke slide ${i + 1}`}
              onClick={() => setPageIndex(i)}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: "none",
                background: i === safePage ? "var(--ube-800)" : "var(--oat-border)",
                cursor: "pointer",
                padding: 0,
                transition: "background 200ms",
              }}
            />
          ))}
          <button
            type="button"
            aria-label="Slide berikutnya"
            onClick={() => setPageIndex((p) => (p + 1) % totalPages)}
            className="clay-button ghost size-small"
            style={{ padding: "6px 12px" }}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
