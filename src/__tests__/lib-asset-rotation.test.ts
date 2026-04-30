import { describe, it, expect } from "vitest";
import {
  rotateAssets,
  rotationPositionFor,
  type AssetRankInput,
} from "@/lib/library/asset-rotation";
import {
  slugifyCampaignLabel,
  isValidCampaignTag,
} from "@/lib/library/campaign-tag";

// ---------------------------------------------------------------------------
// rotateAssets — the algorithmic core
// ---------------------------------------------------------------------------

function asset(
  id: string,
  createdDaysAgo: number,
  lastUsedDaysAgo: number | null
): AssetRankInput {
  const now = Date.now();
  const createdAt = new Date(now - createdDaysAgo * 86_400_000).toISOString();
  const lastUsedAt =
    lastUsedDaysAgo === null
      ? null
      : new Date(now - lastUsedDaysAgo * 86_400_000).toISOString();
  return {
    id,
    created_at: createdAt,
    rep_last_downloaded_at: lastUsedAt,
  };
}

describe("rotateAssets", () => {
  it("returns the newest unused first when nothing has been used", () => {
    const pool = [
      asset("oldest", 30, null),
      asset("newest", 1, null),
      asset("middle", 14, null),
    ];
    const ranked = rotateAssets(pool, 3);
    expect(ranked.map((a) => a.id)).toEqual(["newest", "middle", "oldest"]);
  });

  it("sorts unused-by-rep ahead of every used asset, regardless of upload date", () => {
    const pool = [
      asset("brand-new-but-used", 1, 0.5), // newer upload, but rep already used it
      asset("ancient-and-fresh", 100, null), // very old upload, rep has never used
    ];
    const ranked = rotateAssets(pool, 2);
    expect(ranked.map((a) => a.id)).toEqual([
      "ancient-and-fresh",
      "brand-new-but-used",
    ]);
  });

  it("orders the used bucket oldest-download-first", () => {
    const pool = [
      asset("used-recently", 10, 1),
      asset("used-long-ago", 10, 30),
      asset("used-medium", 10, 7),
    ];
    const ranked = rotateAssets(pool, 3);
    // longest-ago use surfaces first — that's what the rep is least
    // likely to remember and most useful to re-share.
    expect(ranked.map((a) => a.id)).toEqual([
      "used-long-ago",
      "used-medium",
      "used-recently",
    ]);
  });

  it("respects the limit and never returns more than asked", () => {
    const pool = Array.from({ length: 50 }, (_, i) =>
      asset(`a-${i}`, 50 - i, null)
    );
    expect(rotateAssets(pool, 10)).toHaveLength(10);
    expect(rotateAssets(pool, 5)).toHaveLength(5);
    expect(rotateAssets(pool, 100)).toHaveLength(50);
  });

  it("bubbles a brand-new upload to the top of every rep's feed", () => {
    // Rep has used 8 of the existing pool. New asset lands today.
    const pool = [
      ...Array.from({ length: 8 }, (_, i) =>
        asset(`used-${i}`, 30 + i, 1 + i)
      ),
      asset("fresh-arrival", 0, null),
      asset("old-and-unused", 60, null),
    ];
    const ranked = rotateAssets(pool, 10);
    // Fresh and unused outranks ancient and unused (newest-first within
    // the unused bucket).
    expect(ranked[0].id).toBe("fresh-arrival");
    expect(ranked[1].id).toBe("old-and-unused");
  });

  it("falls into oldest-used cycling when the rep has used everything", () => {
    const pool = [
      asset("a", 30, 1),
      asset("b", 30, 5),
      asset("c", 30, 10),
      asset("d", 30, 20),
    ];
    const ranked = rotateAssets(pool, 4);
    expect(ranked.map((a) => a.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("is stable for ties — preserves input order when equal", () => {
    const sameTime = "2026-01-01T00:00:00.000Z";
    const pool: AssetRankInput[] = [
      { id: "first", created_at: sameTime, rep_last_downloaded_at: null },
      { id: "second", created_at: sameTime, rep_last_downloaded_at: null },
      { id: "third", created_at: sameTime, rep_last_downloaded_at: null },
    ];
    const ranked = rotateAssets(pool, 3);
    expect(ranked.map((a) => a.id)).toEqual(["first", "second", "third"]);
  });

  it("treats empty input as a valid empty rotation", () => {
    expect(rotateAssets([], 10)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// rotationPositionFor — the iOS UX hint
// ---------------------------------------------------------------------------

describe("rotationPositionFor", () => {
  it("returns 'fresh' when every shown asset is unused", () => {
    expect(
      rotationPositionFor(
        [asset("a", 1, null), asset("b", 2, null)],
        50
      )
    ).toBe("fresh");
  });

  it("returns 'mixed' when some shown assets are used and some aren't", () => {
    expect(
      rotationPositionFor(
        [asset("a", 1, null), asset("b", 1, 5)],
        50
      )
    ).toBe("mixed");
  });

  it("returns 'all-used' when every shown asset has been used", () => {
    expect(
      rotationPositionFor(
        [asset("a", 1, 5), asset("b", 1, 10)],
        50
      )
    ).toBe("all-used");
  });

  it("returns 'fresh' for an empty rotation (caller decides UX)", () => {
    expect(rotationPositionFor([], 0)).toBe("fresh");
  });
});

// ---------------------------------------------------------------------------
// slugifyCampaignLabel — campaign-tag helper
// ---------------------------------------------------------------------------

describe("slugifyCampaignLabel", () => {
  it("lowercases and hyphenates basic input", () => {
    expect(slugifyCampaignLabel("Only Numbers")).toBe("only-numbers");
  });

  it("strips diacritics and special punctuation", () => {
    expect(slugifyCampaignLabel("Café — Spring '26")).toBe("cafe-spring-26");
  });

  it("collapses runs of separators into a single hyphen", () => {
    expect(slugifyCampaignLabel("foo   bar___baz")).toBe("foo-bar-baz");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyCampaignLabel("---hello---")).toBe("hello");
  });

  it("handles unicode names without exploding", () => {
    expect(slugifyCampaignLabel("Récolte d'été")).toBe("recolte-d-ete");
  });

  it("returns empty string for empty input", () => {
    expect(slugifyCampaignLabel("")).toBe("");
    expect(slugifyCampaignLabel("   ")).toBe("");
  });

  it("caps at 80 characters and never trails on a hyphen", () => {
    const long = "a".repeat(40) + " " + "b".repeat(40) + " " + "c".repeat(40);
    const slug = slugifyCampaignLabel(long);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("isValidCampaignTag", () => {
  it("accepts a freshly-slugified label", () => {
    const slug = slugifyCampaignLabel("Only Numbers — Spring 26");
    expect(isValidCampaignTag(slug)).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isValidCampaignTag("")).toBe(false);
  });

  it("rejects values that contain illegal characters", () => {
    expect(isValidCampaignTag("Only Numbers")).toBe(false); // space
    expect(isValidCampaignTag("café")).toBe(false); // diacritic
    expect(isValidCampaignTag("foo--bar")).toBe(false); // double hyphen
    expect(isValidCampaignTag("-foo")).toBe(false); // leading hyphen
    expect(isValidCampaignTag("foo-")).toBe(false); // trailing hyphen
  });

  it("rejects strings over 80 characters", () => {
    expect(isValidCampaignTag("a".repeat(81))).toBe(false);
  });
});
