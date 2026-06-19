// Unit test untuk StatusBadge — pure component, no state. Cukup cover
// mapping, fallback, dan underscore replacement.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders known status with correct variant class", () => {
    render(<StatusBadge status="PAID" />);
    const el = screen.getByText("PAID");
    expect(el.className).toContain("clay-badge");
    expect(el.className).toContain("status-paid");
  });

  it("uses muted variant for unknown status", () => {
    render(<StatusBadge status="WHATEVER" />);
    const el = screen.getByText("WHATEVER");
    expect(el.className).toContain("status-muted");
  });

  it("replaces underscore in label (e.g. UNDER_REVIEW → UNDER REVIEW)", () => {
    render(<StatusBadge status="UNDER_REVIEW" />);
    // "UNDER REVIEW" di-render, "UNDER_REVIEW" tidak ada.
    expect(screen.getByText("UNDER REVIEW")).toBeTruthy();
    expect(screen.queryByText("UNDER_REVIEW")).toBeNull();
  });

  it("covers all spec-defined statuses", () => {
    // Spec §10 status enum untuk semua entity + FS-14 email status.
    // Test ini catch kalau ada enum baru ditambahkan tapi lupa di-mapping.
    const required = [
      "PENDING",
      "PAID",
      "ISSUED",
      "CANCELLED",
      "UNPAID",
      "EXPIRED",
      "ACTIVE",
      "LAPSED",
      "SUBMITTED",
      "UNDER_REVIEW",
      "APPROVED",
      "REJECTED",
      "OPEN",
      "ANSWERED",
      "CLOSED",
      "SENT",
      "FAILED",
      "QUEUED",
    ];
    for (const s of required) {
      render(<StatusBadge status={s} />);
      const el = screen.getByText(s.replace(/_/g, " "));
      // Bukan muted fallback → semua harus punya variant.
      // Pakai `expect(value, msg)` (vitest built-in) untuk custom
      // failure message — `toContain(string, msg)` tidak ada di signature.
      expect(el.className, `status ${s} harus punya variant`).not.toContain("status-muted");
    }
  });
});
