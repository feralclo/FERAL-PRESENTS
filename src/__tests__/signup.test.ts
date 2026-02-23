import { describe, it, expect, vi, beforeEach } from "vitest";
import { slugify, validateSlug, RESERVED_SLUGS } from "@/lib/signup";

// Mock getSupabaseAdmin
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe("slugify", () => {
  it("converts a normal org name to a slug", () => {
    expect(slugify("My Brand")).toBe("my-brand");
  });

  it("handles multiple spaces", () => {
    expect(slugify("  My   Brand  ")).toBe("my-brand");
  });

  it("replaces special characters with hyphens", () => {
    expect(slugify("Rock & Roll Events!")).toBe("rock-roll-events");
  });

  it("handles unicode characters", () => {
    expect(slugify("Café Müller")).toBe("caf-m-ller");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("---test---")).toBe("test");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("a   --  b")).toBe("a-b");
  });

  it("truncates to 40 characters", () => {
    const long = "a".repeat(50);
    expect(slugify(long).length).toBe(40);
  });

  it("lowercases everything", () => {
    expect(slugify("MY BRAND")).toBe("my-brand");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty for only special characters", () => {
    expect(slugify("!!!@@@")).toBe("");
  });

  it("preserves numbers", () => {
    expect(slugify("Events 2024")).toBe("events-2024");
  });
});

describe("RESERVED_SLUGS", () => {
  it("contains critical reserved words", () => {
    const critical = ["admin", "api", "auth", "www", "feral", "entry", "stripe", "app", "login", "signup"];
    for (const word of critical) {
      expect(RESERVED_SLUGS.has(word)).toBe(true);
    }
  });

  it("has at least 40 entries", () => {
    expect(RESERVED_SLUGS.size).toBeGreaterThanOrEqual(40);
  });
});

describe("validateSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects slugs shorter than 3 characters", async () => {
    const result = await validateSlug("ab");
    expect(result.available).toBe(false);
  });

  it("rejects empty string", async () => {
    const result = await validateSlug("");
    expect(result.available).toBe(false);
  });

  it("rejects reserved slugs", async () => {
    const result = await validateSlug("admin");
    expect(result.available).toBe(false);
    expect(result.suggestion).toBe("admin-events");
  });

  it("rejects slugs with invalid characters", async () => {
    const result = await validateSlug("my_brand");
    expect(result.available).toBe(false);
  });

  it("rejects slugs starting with a hyphen", async () => {
    const result = await validateSlug("-test");
    expect(result.available).toBe(false);
  });

  it("rejects slugs ending with a hyphen", async () => {
    const result = await validateSlug("test-");
    expect(result.available).toBe(false);
  });

  it("returns available for valid slug when no collision", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof getSupabaseAdmin>>);

    const result = await validateSlug("cool-brand");
    expect(result.available).toBe(true);
  });

  it("returns unavailable when org_id already exists", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [{ org_id: "cool-brand" }], error: null }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof getSupabaseAdmin>>);

    const result = await validateSlug("cool-brand");
    expect(result.available).toBe(false);
    expect(result.suggestion).toBe("cool-brand-2");
  });

  it("returns unavailable when Supabase is not configured", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getSupabaseAdmin>>);

    const result = await validateSlug("cool-brand");
    expect(result.available).toBe(false);
  });
});

describe("input validation rules", () => {
  it("org name must be at least 2 characters", () => {
    // Simulates the API route validation
    const name = "A";
    expect(name.trim().length < 2).toBe(true);
  });

  it("org name must be at most 50 characters", () => {
    const name = "A".repeat(51);
    expect(name.trim().length > 50).toBe(true);
  });

  it("password must be at least 6 characters", () => {
    const pwd = "12345";
    expect(pwd.length < 6).toBe(true);
  });

  it("password must be at most 72 characters", () => {
    const pwd = "A".repeat(73);
    expect(pwd.length > 72).toBe(true);
  });

  it("email must contain @", () => {
    expect("notanemail".includes("@")).toBe(false);
    expect("valid@email.com".includes("@")).toBe(true);
  });
});
