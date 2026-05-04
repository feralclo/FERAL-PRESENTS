import { describe, it, expect } from "vitest";
import {
  smartMix,
  deriveAffinity,
  POPULARITY_FLOOR,
  IMPRESSION_DROP_THRESHOLD,
  COLD_START_THRESHOLD,
  type PoolTrack,
  type RepImpression,
} from "@/lib/music/track-mix";
import type { SpotifyTrack } from "@/lib/spotify/client";

// ─── Builders ──────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-04T12:00:00Z");

function track(
  id: string,
  artistId = "artist-default",
  artistName = "Default Artist"
): SpotifyTrack {
  return {
    id,
    name: `Track ${id}`,
    artists: [{ id: artistId, name: artistName }],
    album: { name: "Album", image_url: null },
    preview_url: null,
    duration_ms: 200_000,
    external_url: `https://open.spotify.com/track/${id}`,
    isrc: null,
  };
}

function pool(
  id: string,
  playlistId: string,
  opts: {
    daysAddedAgo?: number;
    popularity?: number;
    position?: number;
    artistId?: string;
    artistName?: string;
  } = {}
): PoolTrack {
  const addedAt = new Date(
    NOW.getTime() - (opts.daysAddedAgo ?? 30) * 86_400_000
  ).toISOString();
  return {
    playlist_id: playlistId,
    track_id: id,
    added_at_spotify: addedAt,
    first_seen_at: addedAt,
    popularity: opts.popularity ?? 50,
    position: opts.position ?? 50,
    track_data: track(id, opts.artistId, opts.artistName),
  };
}

function imp(track_id: string, count: number): RepImpression {
  return { track_id, count, last_shown_at: NOW.toISOString() };
}

// ─── Filtering ─────────────────────────────────────────────────────────────

describe("smartMix — filtering", () => {
  it(`drops tracks below popularity floor (${POPULARITY_FLOOR})`, () => {
    const result = smartMix(
      [
        pool("low", "p1", { popularity: POPULARITY_FLOOR - 1 }),
        pool("ok", "p1", { popularity: POPULARITY_FLOOR }),
      ],
      {},
      [],
      { now: NOW }
    );
    expect(result.map((r) => r.track.id)).toEqual(["ok"]);
  });

  it(`drops tracks shown ≥${IMPRESSION_DROP_THRESHOLD} times to this rep`, () => {
    const result = smartMix(
      [pool("a", "p1"), pool("b", "p1")],
      {},
      [imp("a", IMPRESSION_DROP_THRESHOLD)],
      { now: NOW }
    );
    expect(result.map((r) => r.track.id)).toEqual(["b"]);
  });

  it("keeps tracks shown 1–4 times but ranks them lower", () => {
    const result = smartMix(
      [
        // both tracks identical except impression count
        pool("seen", "p1", { popularity: 50, position: 50 }),
        pool("unseen", "p1", { popularity: 50, position: 50, artistId: "x" }),
      ],
      {},
      [imp("seen", 3)],
      { now: NOW }
    );
    expect(result[0].track.id).toBe("unseen");
    expect(result.map((r) => r.track.id)).toContain("seen");
  });
});

// ─── Recency ───────────────────────────────────────────────────────────────

describe("smartMix — recency", () => {
  it("boosts tracks added in the last 14 days above older tracks", () => {
    const result = smartMix(
      [
        pool("old", "p1", { daysAddedAgo: 60, popularity: 80, position: 0 }),
        pool("fresh", "p1", {
          daysAddedAgo: 3,
          popularity: 50,
          position: 50,
          artistId: "x",
        }),
      ],
      {},
      [],
      { now: NOW }
    );
    expect(result[0].track.id).toBe("fresh");
  });

  it("flags tracks added in the last 7 days as is_fresh", () => {
    const result = smartMix(
      [
        pool("very-fresh", "p1", { daysAddedAgo: 2 }),
        pool("just-out-of-window", "p1", {
          daysAddedAgo: 8,
          artistId: "x",
        }),
      ],
      {},
      [],
      { now: NOW }
    );
    const veryFresh = result.find((r) => r.track.id === "very-fresh");
    const older = result.find((r) => r.track.id === "just-out-of-window");
    expect(veryFresh?.is_fresh).toBe(true);
    expect(older?.is_fresh).toBe(false);
  });
});

// ─── Cross-playlist co-occurrence ─────────────────────────────────────────

describe("smartMix — cross-playlist", () => {
  it("dedupes a track that's in multiple playlists into one entry with playlist_count > 1", () => {
    const result = smartMix(
      [
        pool("shared", "p1", { popularity: 60, position: 10 }),
        pool("shared", "p2", { popularity: 60, position: 10 }),
        pool("solo", "p1", { popularity: 60, position: 10, artistId: "x" }),
      ],
      {},
      [],
      { now: NOW }
    );
    const shared = result.find((r) => r.track.id === "shared");
    expect(shared?.playlist_count).toBe(2);
    // shared should only appear once
    expect(result.filter((r) => r.track.id === "shared").length).toBe(1);
  });

  it("ranks a multi-playlist track above a single-playlist track of equal base score", () => {
    const result = smartMix(
      [
        pool("everywhere", "p1", { popularity: 50, position: 50 }),
        pool("everywhere", "p2", { popularity: 50, position: 50 }),
        pool("only-here", "p1", {
          popularity: 50,
          position: 50,
          artistId: "x",
        }),
      ],
      // Set affinity so both playlists feed equally — otherwise stratified
      // sampling could rotate one to first by chance.
      { p1: 0.5, p2: 0.5 },
      [],
      { now: NOW, limit: 2 }
    );
    expect(result[0].track.id).toBe("everywhere");
  });
});

// ─── Position weighting ────────────────────────────────────────────────────

describe("smartMix — curator position", () => {
  it("ranks top-of-playlist tracks above mid-list tracks", () => {
    const result = smartMix(
      [
        pool("top", "p1", { position: 2 }),
        pool("mid", "p1", { position: 100, artistId: "x" }),
      ],
      {},
      [],
      { now: NOW }
    );
    expect(result[0].track.id).toBe("top");
  });
});

// ─── Affinity ──────────────────────────────────────────────────────────────

describe("smartMix — affinity", () => {
  it("with cold-start (empty affinity), returns tracks from all playlists in the pool", () => {
    const result = smartMix(
      [
        pool("a", "schranz"),
        pool("b", "schranz", { artistId: "x" }),
        pool("c", "groove", { artistId: "y" }),
        pool("d", "hard-techno", { artistId: "z" }),
      ],
      {},
      [],
      { now: NOW, limit: 4 }
    );
    const sources = new Set(result.map((r) => r.source_playlist_id));
    expect(sources.size).toBe(3); // all three playlists represented
  });

  it("with affinity skewed to schranz, returns more schranz tracks", () => {
    // 6 tracks each, even artists, identical scores — affinity is the
    // only differentiator.
    const items: PoolTrack[] = [];
    for (let i = 0; i < 6; i++) {
      items.push(pool(`s${i}`, "schranz", { artistId: `as${i}` }));
      items.push(pool(`g${i}`, "groove", { artistId: `ag${i}` }));
    }
    const result = smartMix(
      items,
      { schranz: 0.8, groove: 0.2 },
      [],
      { now: NOW, limit: 10 }
    );
    const schranzCount = result.filter(
      (r) => r.source_playlist_id === "schranz"
    ).length;
    const grooveCount = result.filter(
      (r) => r.source_playlist_id === "groove"
    ).length;
    expect(schranzCount).toBeGreaterThan(grooveCount);
  });
});

// ─── Artist diversity ─────────────────────────────────────────────────────

describe("smartMix — artist diversity", () => {
  it("never places two tracks by the same primary artist back-to-back", () => {
    const items: PoolTrack[] = [];
    // Three tracks by the same artist + interleaving filler.
    for (let i = 0; i < 3; i++) {
      items.push(
        pool(`same-${i}`, "p1", {
          artistId: "duplicate-artist",
          popularity: 80,
          position: i, // top positions so they rank high
        })
      );
    }
    items.push(pool("filler-a", "p1", { artistId: "fa", popularity: 40 }));
    items.push(pool("filler-b", "p1", { artistId: "fb", popularity: 40 }));

    const result = smartMix(items, {}, [], { now: NOW, limit: 5 });
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1].track.artists[0]?.id;
      const cur = result[i].track.artists[0]?.id;
      // Adjacent same-artist allowed only if there's no alternative left.
      if (prev === cur) {
        const remainingArtists = new Set(
          result.slice(i).map((r) => r.track.artists[0]?.id)
        );
        expect(remainingArtists.size).toBe(1);
      }
    }
  });
});

// ─── Limit ─────────────────────────────────────────────────────────────────

describe("smartMix — limit", () => {
  it("respects the limit", () => {
    const items: PoolTrack[] = [];
    for (let i = 0; i < 30; i++) {
      items.push(pool(`t${i}`, "p1", { artistId: `a${i}` }));
    }
    const result = smartMix(items, {}, [], { now: NOW, limit: 5 });
    expect(result).toHaveLength(5);
  });

  it("returns empty when the pool is empty", () => {
    expect(smartMix([], {}, [], { now: NOW })).toEqual([]);
  });
});

// ─── Affinity derivation ──────────────────────────────────────────────────

describe("deriveAffinity", () => {
  it(`returns empty when picks < ${COLD_START_THRESHOLD} (cold-start)`, () => {
    const samplePool = [pool("a", "schranz")];
    const result = deriveAffinity(["a", "a"], samplePool);
    expect(result).toEqual({});
  });

  it("weights playlists by pick frequency once over the threshold", () => {
    const samplePool = [
      pool("s1", "schranz"),
      pool("s2", "schranz"),
      pool("g1", "groove"),
    ];
    // 4 schranz picks + 1 groove pick over the 5-pick threshold.
    const picks = ["s1", "s2", "s1", "s2", "g1"];
    const result = deriveAffinity(picks, samplePool);
    expect(result.schranz).toBeCloseTo(4 / 5);
    expect(result.groove).toBeCloseTo(1 / 5);
  });

  it("splits a pick's vote across playlists when the track is in multiple", () => {
    const samplePool = [
      pool("shared", "schranz"),
      pool("shared", "groove"),
      pool("g-only", "groove"),
      pool("s-only", "schranz"),
      pool("h-only", "hard-techno"),
    ];
    // 5 picks: shared shared shared g-only s-only
    // shared votes 0.5/0.5 each → schranz gets 1.5+1=2.5, groove gets 1.5+1=2.5
    const picks = ["shared", "shared", "shared", "g-only", "s-only"];
    const result = deriveAffinity(picks, samplePool);
    expect(result.schranz).toBeCloseTo(0.5);
    expect(result.groove).toBeCloseTo(0.5);
    expect(result["hard-techno"]).toBeUndefined();
  });

  it("ignores picks for tracks no longer in any pool playlist", () => {
    const samplePool = [pool("in-pool", "schranz")];
    const picks = [
      "in-pool",
      "in-pool",
      "in-pool",
      "in-pool",
      "deleted-track",
    ];
    const result = deriveAffinity(picks, samplePool);
    // Only in-pool counts; all weight goes to schranz.
    expect(result.schranz).toBeCloseTo(1);
  });
});
