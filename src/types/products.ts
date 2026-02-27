export type ProductType =
  | "T-Shirt"
  | "Hoodie"
  | "Poster"
  | "Hat"
  | "Vinyl"
  | "Other";

export type ProductStatus = "draft" | "active" | "archived";

export type DisplayEffect = "default" | "system_error";

export interface Product {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  type: ProductType;
  sizes: string[];
  price: number;
  images: string[] | { front?: string; back?: string };
  status: ProductStatus;
  sku?: string;
  display_effect: DisplayEffect;
  /** Manual price overrides per currency, e.g. { "EUR": 50, "USD": 55 }. NULL/empty = auto-convert. */
  price_overrides?: Record<string, number> | null;
  created_at: string;
  updated_at: string;
}
