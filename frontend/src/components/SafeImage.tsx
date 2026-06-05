"use client";

import { useState } from "react";

/**
 * Image with built-in placeholder fallback.
 *
 * - When `src` is empty/null OR fails to load (`onError`), renders initials
 *   in a soft-tinted circle.
 * - When `src` is a valid URL, renders <img>.
 *
 * Use everywhere a user-uploaded image might be missing or broken (logos,
 * avatars, photos) so the UI never shows a broken-image glyph.
 */
export function SafeImage({
  src,
  alt,
  initials,
  size = 40,
  rounded = false,
  style,
}: {
  src: string | null | undefined;
  alt: string;
  /** Initials to show in placeholder. Default = first letter of alt (uppercase). */
  initials?: string;
  /** Width & height in px. */
  size?: number;
  /** Use 50% radius (full circle) for avatars. */
  rounded?: boolean;
  style?: React.CSSProperties;
}) {
  const [errored, setErrored] = useState(false);
  const hasImage = Boolean(src) && !errored;

  const dim = { width: size, height: size };

  if (hasImage) {
    return (
      <img
        src={src as string}
        alt={alt}
        onError={() => setErrored(true)}
        style={{
          ...dim,
          objectFit: "cover",
          background: "var(--warm-cream)",
          borderRadius: rounded ? "50%" : 6,
          ...style,
        }}
      />
    );
  }

  const text = (initials ?? alt ?? "?").trim().slice(0, 2).toUpperCase() || "?";
  const fontSize = Math.max(11, Math.round(size * 0.38));

  return (
    <span
      role="img"
      aria-label={alt}
      style={{
        ...dim,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ube-300)",
        color: "var(--ube-900)",
        borderRadius: rounded ? "50%" : 6,
        fontWeight: 700,
        fontSize,
        letterSpacing: "-0.02em",
        flexShrink: 0,
        userSelect: "none",
        ...style,
      }}
    >
      {text}
    </span>
  );
}
