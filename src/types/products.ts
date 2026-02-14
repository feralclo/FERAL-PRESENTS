export type ProductType =
  | "T-Shirt"
  | "Hoodie"
  | "Poster"
  | "Hat"
  | "Vinyl"
  | "Other";

export type ProductStatus = "draft" | "active" | "archived";

export interface Product {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  type: ProductType;
  sizes: string[];
  price: number;
  images: { front?: string; back?: string };
  status: ProductStatus;
  sku?: string;
  created_at: string;
  updated_at: string;
}
