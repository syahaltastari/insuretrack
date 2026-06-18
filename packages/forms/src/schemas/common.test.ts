// Unit test untuk Zod schemas — schemas dipakai di banyak form, jadi
// regression di sini langsung terasa di banyak tempat.
import { describe, expect, it } from "vitest";

import {
  dateNotFutureSchema,
  emailSchema,
  imageFileSchema,
  nikSchema,
  passwordSchema,
  phoneSchema,
} from "./common";

describe("phoneSchema", () => {
  it("accepts 10-15 digits", () => {
    expect(phoneSchema.safeParse("0812345678").success).toBe(true);
    expect(phoneSchema.safeParse("081234567890123").success).toBe(true);
  });

  it("strips spaces, dashes, parentheses, plus", () => {
    expect(phoneSchema.safeParse("+62 (812) 3456-7890").success).toBe(true);
  });

  it("rejects too-short", () => {
    expect(phoneSchema.safeParse("12345").success).toBe(false);
  });

  it("rejects too-long", () => {
    expect(phoneSchema.safeParse("1234567890123456").success).toBe(false);
  });

  it("rejects letters", () => {
    expect(phoneSchema.safeParse("0812345678a").success).toBe(false);
  });
});

describe("nikSchema", () => {
  it("accepts exactly 16 digits", () => {
    expect(nikSchema.safeParse("3201010101010001").success).toBe(true);
  });

  it("rejects 15 digits", () => {
    expect(nikSchema.safeParse("320101010101000").success).toBe(false);
  });

  it("rejects 17 digits", () => {
    expect(nikSchema.safeParse("32010101010100010").success).toBe(false);
  });

  it("rejects non-digits", () => {
    expect(nikSchema.safeParse("320101010101000a").success).toBe(false);
    expect(nikSchema.safeParse("3201-0101-0101-0001").success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("accepts empty (treated as 'not provided')", () => {
    expect(emailSchema.safeParse("").success).toBe(true);
  });

  it("accepts valid email format", () => {
    expect(emailSchema.safeParse("user@example.com").success).toBe(true);
    expect(emailSchema.safeParse("first.last@sub.example.co.id").success).toBe(true);
  });

  it("rejects malformed", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("@example.com").success).toBe(false);
    expect(emailSchema.safeParse("user@").success).toBe(false);
    expect(emailSchema.safeParse("user@nodomain").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts strong password (8+ chars, upper, digit)", () => {
    expect(passwordSchema.safeParse("GoodPass1").success).toBe(true);
    expect(passwordSchema.safeParse("MyStr0ngPass99").success).toBe(true);
  });

  it("rejects too-short", () => {
    expect(passwordSchema.safeParse("Short1").success).toBe(false);
  });

  it("rejects missing uppercase", () => {
    expect(passwordSchema.safeParse("alllower1").success).toBe(false);
  });

  it("rejects missing digit", () => {
    expect(passwordSchema.safeParse("NoDigits!").success).toBe(false);
  });
});

describe("dateNotFutureSchema", () => {
  it("accepts past dates (deterministic — TZ-agnostic)", () => {
    expect(dateNotFutureSchema.safeParse("2020-01-01").success).toBe(true);
  });

  it("rejects future dates", () => {
    // 2030 — well past today regardless of timezone.
    expect(dateNotFutureSchema.safeParse("2030-12-31").success).toBe(false);
  });

  it("rejects bad format", () => {
    expect(dateNotFutureSchema.safeParse("01-01-2020").success).toBe(false);
  });
});

describe("imageFileSchema", () => {
  function file(name: string, size: number, type: string): File {
    return new File([new Uint8Array(size)], name, { type });
  }

  it("accepts valid JPG under 5MB", () => {
    expect(imageFileSchema.safeParse(file("ktp.jpg", 1000, "image/jpeg")).success).toBe(true);
  });

  it("accepts PNG, WebP, SVG, PDF", () => {
    expect(imageFileSchema.safeParse(file("a.png", 100, "image/png")).success).toBe(true);
    expect(imageFileSchema.safeParse(file("a.webp", 100, "image/webp")).success).toBe(true);
    expect(imageFileSchema.safeParse(file("a.svg", 100, "image/svg+xml")).success).toBe(true);
    expect(imageFileSchema.safeParse(file("a.pdf", 100, "application/pdf")).success).toBe(true);
  });

  it("rejects file over 5MB", () => {
    const big = file("big.jpg", 6 * 1024 * 1024, "image/jpeg");
    expect(imageFileSchema.safeParse(big).success).toBe(false);
  });

  it("rejects unsupported MIME (e.g. .docx, .exe)", () => {
    expect(imageFileSchema.safeParse(file("evil.exe", 100, "application/x-msdownload")).success).toBe(
      false,
    );
  });
});
