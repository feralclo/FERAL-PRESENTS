import type { Product } from "./products";
import type { Event } from "./events";

// ── Collection status ──

export type CollectionStatus = "draft" | "active" | "archived";

// ── Merch Collection ──

export interface MerchCollection {
  id: string;
  org_id: string;
  event_id: string;
  slug: string;
  title: string;
  description: string | null;
  status: CollectionStatus;
  is_limited_edition: boolean;
  limited_edition_label: string | null;
  hero_image: string | null;
  tile_image: string | null;
  custom_cta_text: string | null;
  pickup_instructions: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined data
  event?: Event;
  items?: MerchCollectionItem[];
}

// ── Collection Item ──

export interface MerchCollectionItem {
  id: string;
  org_id: string;
  collection_id: string;
  product_id: string;
  sort_order: number;
  is_featured: boolean;
  is_limited_edition: boolean;
  limited_edition_label: string | null;
  custom_price: number | null;
  max_per_order: number | null;
  created_at: string;
  // Joined data
  product?: Product;
}

// ── Merch Store Settings ──

export interface MerchStoreSettings {
  enabled: boolean;
  nav_label: string;
  store_heading: string;
  store_description: string;
}

export const DEFAULT_MERCH_STORE_SETTINGS: MerchStoreSettings = {
  enabled: false,
  nav_label: "Shop",
  store_heading: "Shop",
  store_description: "Pre-order exclusive merch for upcoming events.",
};
