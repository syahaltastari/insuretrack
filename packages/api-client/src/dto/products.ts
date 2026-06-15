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
