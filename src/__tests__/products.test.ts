import { describe, it, expect } from "vitest";

/**
 * Tests for the Products feature:
 * - Product type definitions and constraints
 * - Product resolution logic (product_id → inline merch fallback)
 * - Data shape validation
 */

// ─── Product type constraints ──────────────────────────────────────────

const VALID_PRODUCT_TYPES = [
  "T-Shirt",
  "Hoodie",
  "Poster",
  "Hat",
  "Vinyl",
  "Other",
];

const VALID_PRODUCT_STATUSES = ["draft", "active", "archived"];

describe("Product type constraints", () => {
  it("defines all expected product types", () => {
    expect(VALID_PRODUCT_TYPES).toHaveLength(6);
    expect(VALID_PRODUCT_TYPES).toContain("T-Shirt");
    expect(VALID_PRODUCT_TYPES).toContain("Hoodie");
    expect(VALID_PRODUCT_TYPES).toContain("Other");
  });

  it("defines all expected product statuses", () => {
    expect(VALID_PRODUCT_STATUSES).toHaveLength(3);
    expect(VALID_PRODUCT_STATUSES).toContain("draft");
    expect(VALID_PRODUCT_STATUSES).toContain("active");
    expect(VALID_PRODUCT_STATUSES).toContain("archived");
  });
});

// ─── Product resolution logic ──────────────────────────────────────────

interface MockProduct {
  id: string;
  name: string;
  description?: string;
  images: string[] | { front?: string; back?: string };
  sizes: string[];
}

interface MockTicketType {
  id: string;
  includes_merch: boolean;
  product_id?: string;
  product?: MockProduct;
  merch_name?: string;
  merch_description?: string;
  merch_images?: string[] | { front?: string; back?: string };
  merch_sizes?: string[];
}

/** Resolve merch data from linked product or inline fields (same logic as DynamicEventPage) */
function resolveMerch(tt: MockTicketType, eventName: string) {
  const hasProduct = tt.product_id && tt.product;
  return {
    name:
      (hasProduct ? tt.product!.name : tt.merch_name) ||
      `${eventName} Merch`,
    description: hasProduct
      ? tt.product!.description
      : tt.merch_description,
    images: hasProduct ? tt.product!.images : tt.merch_images,
    sizes: hasProduct ? tt.product!.sizes : tt.merch_sizes,
  };
}

describe("Product resolution", () => {
  const mockProduct: MockProduct = {
    id: "prod-1",
    name: "Summer Drop Tee",
    description: "Limited edition event tee",
    images: { front: "media_key_front", back: "media_key_back" },
    sizes: ["S", "M", "L", "XL"],
  };

  it("resolves from linked product when product_id and product exist", () => {
    const tt: MockTicketType = {
      id: "tt-1",
      includes_merch: true,
      product_id: "prod-1",
      product: mockProduct,
      merch_name: "Old Inline Name",
      merch_description: "Old description",
      merch_images: { front: "old_front" },
      merch_sizes: ["M"],
    };

    const merch = resolveMerch(tt, "Test Event");
    expect(merch.name).toBe("Summer Drop Tee");
    expect(merch.description).toBe("Limited edition event tee");
    expect(merch.images).toEqual({
      front: "media_key_front",
      back: "media_key_back",
    });
    expect(merch.sizes).toEqual(["S", "M", "L", "XL"]);
  });

  it("falls back to inline merch fields when no product_id", () => {
    const tt: MockTicketType = {
      id: "tt-2",
      includes_merch: true,
      merch_name: "Event Hoodie",
      merch_description: "Cozy hoodie",
      merch_images: { front: "inline_front" },
      merch_sizes: ["M", "L", "XL"],
    };

    const merch = resolveMerch(tt, "Test Event");
    expect(merch.name).toBe("Event Hoodie");
    expect(merch.description).toBe("Cozy hoodie");
    expect(merch.images).toEqual({ front: "inline_front" });
    expect(merch.sizes).toEqual(["M", "L", "XL"]);
  });

  it("falls back to inline when product_id exists but product is not joined", () => {
    const tt: MockTicketType = {
      id: "tt-3",
      includes_merch: true,
      product_id: "prod-1",
      product: undefined,
      merch_name: "Fallback Name",
      merch_sizes: ["S"],
    };

    const merch = resolveMerch(tt, "Test Event");
    expect(merch.name).toBe("Fallback Name");
    expect(merch.sizes).toEqual(["S"]);
  });

  it("uses event name fallback when no merch name and no product", () => {
    const tt: MockTicketType = {
      id: "tt-4",
      includes_merch: true,
    };

    const merch = resolveMerch(tt, "Liverpool Night");
    expect(merch.name).toBe("Liverpool Night Merch");
  });

  it("returns undefined for optional fields when not set", () => {
    const tt: MockTicketType = {
      id: "tt-5",
      includes_merch: true,
      product_id: "prod-1",
      product: {
        id: "prod-1",
        name: "Minimal Product",
        images: {},
        sizes: [],
      },
    };

    const merch = resolveMerch(tt, "Event");
    expect(merch.name).toBe("Minimal Product");
    expect(merch.description).toBeUndefined();
    expect(merch.images).toEqual({});
    expect(merch.sizes).toEqual([]);
  });

  it("resolves from linked product with string[] images (new format)", () => {
    const tt: MockTicketType = {
      id: "tt-6",
      includes_merch: true,
      product_id: "prod-2",
      product: {
        id: "prod-2",
        name: "Multi-image Hoodie",
        images: ["img1", "img2", "img3"],
        sizes: ["M", "L"],
      },
    };

    const merch = resolveMerch(tt, "Test Event");
    expect(merch.name).toBe("Multi-image Hoodie");
    expect(merch.images).toEqual(["img1", "img2", "img3"]);
  });

  it("resolves inline merch with string[] images (new format)", () => {
    const tt: MockTicketType = {
      id: "tt-7",
      includes_merch: true,
      merch_name: "New Array Merch",
      merch_images: ["front_new", "back_new"],
      merch_sizes: ["S", "M"],
    };

    const merch = resolveMerch(tt, "Test Event");
    expect(merch.name).toBe("New Array Merch");
    expect(merch.images).toEqual(["front_new", "back_new"]);
  });
});

// ─── Product data shape ────────────────────────────────────────────────

describe("Product data shape", () => {
  it("validates a complete product object", () => {
    const product = {
      id: "prod-1",
      org_id: "feral",
      name: "Summer Drop Tee",
      description: "Limited edition",
      type: "T-Shirt",
      sizes: ["S", "M", "L", "XL"],
      price: 25.0,
      images: { front: "key_front", back: "key_back" },
      status: "active",
      sku: "TEE-SUM-2026",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    expect(product.id).toBeTruthy();
    expect(product.org_id).toBe("feral");
    expect(VALID_PRODUCT_TYPES).toContain(product.type);
    expect(VALID_PRODUCT_STATUSES).toContain(product.status);
    expect(product.sizes).toBeInstanceOf(Array);
    expect(product.price).toBeGreaterThanOrEqual(0);
    expect(product.images).toHaveProperty("front");
    expect(product.images).toHaveProperty("back");
  });

  it("validates a minimal product object", () => {
    const product = {
      id: "prod-2",
      org_id: "feral",
      name: "Quick Draft",
      type: "Other",
      sizes: [],
      price: 0,
      images: {},
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    expect(product.name).toBeTruthy();
    expect(product.sizes).toHaveLength(0);
    expect(product.price).toBe(0);
    expect(product.status).toBe("draft");
  });

  it("validates product with string[] images (new format)", () => {
    const product = {
      id: "prod-3",
      org_id: "feral",
      name: "Multi-image Hoodie",
      type: "Hoodie",
      sizes: ["M", "L"],
      price: 45.0,
      images: ["img_front", "img_back", "img_detail"],
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    expect(product.images).toBeInstanceOf(Array);
    expect(product.images).toHaveLength(3);
    expect(product.images[0]).toBe("img_front");
  });

  it("handles the confirm-order merch_name resolution", () => {
    // Simulates the pattern in confirm-order/route.ts
    const ttWithProduct = {
      merch_name: "Old Name",
      product: { name: "Product Name" },
    };
    const ttWithoutProduct = {
      merch_name: "Inline Name",
      product: undefined as { name: string } | undefined,
    };
    const ttWithNothing = {
      merch_name: undefined as string | undefined,
      product: undefined as { name: string } | undefined,
    };

    // Pattern: tt?.product?.name || tt?.merch_name || undefined
    expect(ttWithProduct.product?.name || ttWithProduct.merch_name).toBe(
      "Product Name"
    );
    expect(
      ttWithoutProduct.product?.name || ttWithoutProduct.merch_name
    ).toBe("Inline Name");
    expect(
      ttWithNothing.product?.name || ttWithNothing.merch_name || undefined
    ).toBeUndefined();
  });
});
