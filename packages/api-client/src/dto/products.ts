// Wire DTOs untuk product & plan catalog. Single source of truth antara
// backend (apps/backend/src/dto/mod.rs) dan frontend. Backend serve via
// `GET /api/public/products` dengan shape `{ data: { products, plans } }`.

export type ProductCode = "LIFE" | "PERSONAL_ACCIDENT" | "HEALTH";
export type TierCode = "BASIC" | "STANDARD" | "PREMIUM";

export interface Product {
  code: ProductCode;
  name: string;
  description: string;
}

export interface ProductPlan {
  /** Composite id, mis. "LIFE_BASIC" — dikirim ke backend di registration request. */
  code: string;
  product_code: ProductCode;
  tier: TierCode;
  /** Display name, mis. "Basic" / "Standard" / "Premium". */
  name: string;
  /** Uang pertanggungan dalam IDR. Decimal di backend, number di wire JSON. */
  sum_assured: number;
  /** Premi bulanan dalam IDR. */
  monthly_premium: number;
  description: string;
}

export interface ProductCatalogData {
  products: Product[];
  plans: ProductPlan[];
}

/** Full response wrapper from `GET /api/public/products`. */
export interface ProductCatalogResponse {
  data: ProductCatalogData;
}

// ---- Display label helpers ---------------------------------------------------
//
// Backend mengirim raw codes (e.g. "LIFE", "LIFE_BASIC") via invoice list
// endpoint. Helper di sini resolve ke label bahasa Inggris yang konsisten
// dengan catalog endpoint. Tidak ada localization di MVP — label bahasa
// Inggris dipertahankan untuk konsistensi dengan nama plan di catalog.

/** Resolve product code ke label display (mis. "LIFE" → "Life Insurance"). */
export function productLabel(code: string): string {
  switch (code) {
    case "LIFE":
      return "Life Insurance";
    case "PERSONAL_ACCIDENT":
      return "Personal Accident";
    case "HEALTH":
      return "Health Insurance";
    default:
      return code;
  }
}

/** Resolve tier code ke label display (mis. "BASIC" → "Basic"). */
export function tierLabel(tier: string | null | undefined): string {
  if (!tier) return "—";
  switch (tier) {
    case "BASIC":
      return "Basic";
    case "STANDARD":
      return "Standard";
    case "PREMIUM":
      return "Premium";
    default:
      return tier;
  }
}

/** Format composite `product + plan_code` jadi satu label.
 *  - "LIFE" + "LIFE_BASIC" → "Life Insurance — Basic"
 *  - "LIFE" + null         → "Life Insurance"
 *  - "LIFE" + "UNKNOWN"    → "Life Insurance — UNKNOWN" (defensive) */
export function formatProductPlan(
  product: string,
  planCode: string | null | undefined,
): string {
  const productStr = productLabel(product);
  if (!planCode) return productStr;
  // planCode = "LIFE_BASIC" → tier = "BASIC". rsplit('_') handle edge
  // case plan tanpa underscore (defensive — di MVP semua plan punya).
  const tier = planCode.includes("_")
    ? planCode.split("_").pop()
    : planCode;
  return `${productStr} — ${tierLabel(tier)}`;
}
