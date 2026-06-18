// Unit test untuk pure helpers — no fetch, no React. Cepat & deterministik.
import { describe, expect, it } from "vitest";

import { cn, formatIdr, formatIdrShort } from "./utils";

describe("cn", () => {
  it("merges conflicting tailwind classes (later wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-600")).toBe("text-blue-600");
  });

  it("combines non-conflicting classes", () => {
    expect(cn("p-2", "mt-4")).toBe("p-2 mt-4");
  });

  it("handles conditional / falsy inputs", () => {
    expect(cn("p-2", false && "p-4", null, undefined, "mt-4")).toBe("p-2 mt-4");
  });
});

describe("formatIdr", () => {
  it("formats standard amounts with dot separator", () => {
    expect(formatIdr(0)).toBe("Rp 0");
    expect(formatIdr(1000)).toBe("Rp 1.000");
    expect(formatIdr(100_000_000)).toBe("Rp 100.000.000");
    expect(formatIdr(1_500_000_000)).toBe("Rp 1.500.000.000");
  });

  it("handles negative amounts (untuk display refund/deduction)", () => {
    expect(formatIdr(-50_000)).toBe("Rp -50.000");
  });

  it("rounds fractional to integer (no decimals for IDR)", () => {
    expect(formatIdr(99.6)).toBe("Rp 100");
    expect(formatIdr(99.4)).toBe("Rp 99");
  });
});

describe("formatIdrShort", () => {
  it("uses rb (ribu) suffix below 1jt", () => {
    expect(formatIdrShort(0)).toBe("Rp 0");
    expect(formatIdrShort(500)).toBe("Rp 500");
    expect(formatIdrShort(5_000)).toBe("Rp 5rb");
    expect(formatIdrShort(999_000)).toBe("Rp 999rb");
  });

  it("uses jt (juta) suffix from 1jt to 1M", () => {
    expect(formatIdrShort(1_000_000)).toBe("Rp 1jt");
    expect(formatIdrShort(1_500_000)).toBe("Rp 1,5jt");
    expect(formatIdrShort(100_500_000)).toBe("Rp 100,5jt");
    expect(formatIdrShort(999_000_000)).toBe("Rp 999jt");
  });

  it("uses M (miliar) suffix from 1M", () => {
    expect(formatIdrShort(1_000_000_000)).toBe("Rp 1M");
    expect(formatIdrShort(1_500_000_000)).toBe("Rp 1,5M");
    expect(formatIdrShort(15_750_000_000)).toBe("Rp 15,8M"); // toFixed(1) rounds
  });
});
