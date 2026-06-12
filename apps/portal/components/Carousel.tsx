"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import AutoScroll from "embla-carousel-auto-scroll";
import { Icon } from "@insuretrack/ui";

/**
 * Carousel berbasis Embla Carousel (https://embla-carousel.com).
 *
 * Dipilih daripada DIY karena:
 *   - Swipe / drag native (touch + mouse) tanpa extra code.
 *   - Bundle kecil (~8 KB gzipped) & tree-shakable.
 *   - TypeScript-first, maintained aktif, dipakai shadcn/ui (standar de
 *     facto untuk React 19 / Next 15).
 *   - Plugin resmi untuk autoplay, auto-scroll (marquee), class names, dll.
 *
 * Dua mode auto-rotation:
 *   - **Snap + autoplay** (default): discrete snap, jeda `autoMs` ms per slide.
 *     Cocok untuk konten yang perlu dibaca (testimoni, promo copy).
 *   - **Continuous** (`continuous: true`): linear marquee-style, slide bergeser
 *     halus tanpa jeda. Cocok untuk logo strip, banner, dekoratif.
 *     `autoMs` diabaikan — kecepatan pakai default plugin (bisa di-tune nanti).
 *
 * Props publik:
 *   - `items` — daftar konten (JSX) untuk setiap slide.
 *   - `autoMs` — interval snap ke slide berikutnya (default 5 detik). Hanya
 *     berlaku untuk mode snap. Pause saat hover via `stopOnMouseEnter`.
 *   - `continuous` — true = marquee linear, false = snap discrete (default).
 *   - `showControls` — true = tampilkan dot + arrow (default), false = auto-only.
 *   - `itemsPerSlideDesktop` — jumlah slide yang terlihat di desktop (≥1024px).
 *   - `itemsPerSlideTablet` — jumlah slide yang terlihat di tablet (≥640px & <1024px).
 *   - Di mobile (<640px), default 1 slide per view.
 *   - `ariaLabel` — label untuk region (a11y).
 *
 * Mode: `loop: true` — slides loop terus tanpa henti.
 */
export function Carousel({
  items,
  // 9 detik default — cukup lama untuk baca testimoni/konten singkat
  // tanpa terasa lambat. User dapat override per-call-site kalau perlu.
  autoMs = 9000,
  itemsPerSlideDesktop = 3,
  itemsPerSlideTablet = 2,
  ariaLabel,
  showControls = true,
  continuous = false,
}: {
  items: ReactNode[];
  autoMs?: number;
  itemsPerSlideDesktop?: number;
  itemsPerSlideTablet?: number;
  ariaLabel?: string;
  // Tampilkan dot pagination + arrow prev/next. Set `false` untuk auto-play
  // saja (mis. landing page sections yang cuma butuh slide otomatis, tanpa
  // chrome visible). Autoplay/autoscroll tetap jalan regardless.
  showControls?: boolean;
  // `false` (default) = mode snap discrete + autoplay delay (autoMs).
  // `true` = mode continuous linear scroll (marquee), autoMs diabaikan.
  continuous?: boolean;
}) {
  // `slidesToScroll` = jumlah slide yang di-skip per navigasi (1 = satu per satu,
  // yang paling predictable). Alignment `start` = snap ke awal slide.
  // Plugin sesuai mode: continuous → AutoScroll (linear marquee), snap → Autoplay
  // (delay-based). Untuk continuous, speed default plugin (~2s/full) dipakai —
  // pass `autoMs` jadi tidak relevan; tambahkan prop `continuousSpeed` kalau
  // perlu tune. `stopOnMouseEnter: false` — continuous marquee dimaksudkan
  // sebagai visual interest, bukan readability, jadi tidak pause saat hover.
  // `stopOnInteraction: true` masih aktif (drag manual = pause, beda sinyal).
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: "start",
      slidesToScroll: 1,
    },
    continuous
      ? [
          AutoScroll({
            stopOnMouseEnter: false,
            stopOnInteraction: true,
            stopOnFocusIn: true,
          }),
        ]
      : [
          // Autoplay plugin: stop pada hover/focus, jalan lagi saat mouse leave.
          // `stopOnInteraction: false` — user interaction tidak mematikan autoplay
          // selamanya (cuma pause sekali).
          Autoplay({ delay: autoMs, stopOnMouseEnter: true, stopOnInteraction: false }),
        ],
  );

  // Track selected index buat dot indicator.
  const [selectedIndex, setSelectedIndex] = useState(0);
  // snapCount = jumlah "halaman" (banyaknya scroll positions). Dipakai buat
  // dot pagination — Embla membedakan slide vs snap; untuk carousel yang
  // snap per-slide, snapCount ≈ items.length.
  const [snapCount, setSnapCount] = useState(0);
  // Slides per view dihitung dari viewport — pakai JS (bukan CSS @media
  // + custom prop) karena Embla perlu tau lebar slide untuk hitung
  // snap count. Breakpoint: ≥1024px desktop, ≥640px tablet, else mobile.
  const [slidesPerView, setSlidesPerView] = useState(1);
  useEffect(() => {
    const calc = () => {
      if (typeof window === "undefined") return;
      const w = window.innerWidth;
      if (w >= 1024) setSlidesPerView(itemsPerSlideDesktop);
      else if (w >= 640) setSlidesPerView(itemsPerSlideTablet);
      else setSlidesPerView(1);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [itemsPerSlideDesktop, itemsPerSlideTablet]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    const onReinit = () => {
      setSnapCount(emblaApi.scrollSnapList().length);
      onSelect();
    };
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onReinit);
    onReinit();
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onReinit);
    };
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback(
    (i: number) => emblaApi?.scrollTo(i),
    [emblaApi],
  );

  if (items.length === 0) return null;

  return (
    <div
      aria-label={ariaLabel}
      role="region"
      aria-roledescription="carousel"
      className="carousel-root"
      style={{ position: "relative" }}
    >
      {/* Viewport */}
      <div
        className="carousel-viewport"
        ref={emblaRef}
        style={{ overflow: "hidden" }}
      >
        {/* Track — flex row. flexBasis di-skip, pake CSS variable dari .carousel-slide */}
        <div
          className="carousel-track"
          style={{ display: "flex", touchAction: "pan-y pinch-zoom" }}
        >
          {items.map((node, i) => (
            <div
              key={i}
              className="carousel-slide"
              style={{
                // Lebar slide dihitung JS dari viewport (slidesPerView).
                // Pakai calc() bukan hardcoded percentage supaya responsif
                // terhadap props itemsPerSlideDesktop/Tablet.
                flex: `0 0 calc(100% / ${slidesPerView})`,
                minWidth: 0,
                padding: "0 12px",
                boxSizing: "border-box",
              }}
            >
              {node}
            </div>
          ))}
        </div>
      </div>

      {/* Controls (dot + arrow) — only when ada lebih dari 1 snap DAN caller
          minta control visible. Untuk < 2 slide, control makes no sense. */}
      {showControls && snapCount > 1 && (
        <div
          className="carousel-controls"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            marginTop: 24,
          }}
        >
          <button
            type="button"
            aria-label="Slide sebelumnya"
            onClick={scrollPrev}
            className="clay-button ghost size-small"
            style={{ padding: "6px 10px" }}
          >
            <Icon name="ChevronLeft" size="sm" />
          </button>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {Array.from({ length: snapCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ke slide ${i + 1}`}
                aria-current={i === selectedIndex ? "true" : undefined}
                onClick={() => scrollTo(i)}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  border: "none",
                  background:
                    i === selectedIndex ? "var(--ube-800)" : "var(--oat-border)",
                  cursor: "pointer",
                  padding: 0,
                  transition: "background 200ms, transform 200ms",
                  transform: i === selectedIndex ? "scale(1.2)" : "scale(1)",
                }}
              />
            ))}
          </div>

          <button
            type="button"
            aria-label="Slide berikutnya"
            onClick={scrollNext}
            className="clay-button ghost size-small"
            style={{ padding: "6px 10px" }}
          >
            <Icon name="ChevronRight" size="sm" />
          </button>
        </div>
      )}
    </div>
  );
}
