import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { resolvePreviewUrl, __test } from "@/lib/spotify/preview-resolver";

vi.mock("@/lib/spotify/client", () => ({
  getTrack: vi.fn(),
  isConfigured: () => false,
}));

// ─── tokensAlign helper ───────────────────────────────────────────────────

describe("tokensAlign — fuzzy artist/title match", () => {
  const { tokensAlign } = __test;

  it("matches identical strings (case + accents)", () => {
    expect(tokensAlign("HÖR Berlin", "hör berlin")).toBe(true);
    expect(tokensAlign("Hör Berlin", "hor berlin")).toBe(true);
  });

  it("strips parentheticals + brackets so 'Track (Original Mix)' matches 'Track'", () => {
    expect(tokensAlign("Underground (Original Mix)", "Underground")).toBe(true);
    expect(tokensAlign("Underground [Extended]", "Underground")).toBe(true);
  });

  it("handles featured artists in either direction", () => {
    expect(tokensAlign("O.B.I. feat. Someone", "O.B.I.")).toBe(true);
    expect(tokensAlign("O.B.I.", "O.B.I. & Verknipt")).toBe(true);
  });

  it("rejects unrelated artists", () => {
    expect(tokensAlign("Ariana Grande", "O.B.I.")).toBe(false);
    expect(tokensAlign("Coldplay", "Verknipt")).toBe(false);
  });

  it("rejects empty / undefined inputs", () => {
    expect(tokensAlign(undefined, "x")).toBe(false);
    expect(tokensAlign("x", "")).toBe(false);
    expect(tokensAlign(undefined, undefined)).toBe(false);
  });
});

// ─── End-to-end resolver behaviour ─────────────────────────────────────────

interface FetchCall {
  url: string;
}

function mockFetch(
  responses: Record<string, unknown>
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url });
    const matched = Object.entries(responses).find(([key]) =>
      url.includes(key)
    );
    const body = matched ? matched[1] : { results: [], data: [] };
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("resolvePreviewUrl — wrong-song bug fix", () => {
  let restore: () => void;
  let calls: FetchCall[];

  beforeEach(() => {
    // Clear the in-process cache between tests by using a unique track id.
  });

  afterEach(() => {
    restore?.();
  });

  it("rejects a fuzzy iTunes hit whose artist doesn't match the request", async () => {
    // Reproduces the bug: search "Underground" by O.B.I. — iTunes returns
    // a different "Underground" by some random pop artist, with a real
    // previewUrl. Old code took the first result regardless. New code
    // checks the artist alignment and rejects.
    ({ calls, restore } = mockFetch({
      "itunes.apple.com/search?term=O": {
        results: [
          {
            trackName: "Underground",
            artistName: "Some Random Pop Artist",
            previewUrl: "https://itunes-wrong-song.example/preview.m4a",
            trackTimeMillis: 30000,
          },
        ],
      },
      "itunes.apple.com/search?term=Underground": {
        results: [
          {
            trackName: "Underground",
            artistName: "Some Random Pop Artist",
            previewUrl: "https://itunes-wrong-song.example/preview.m4a",
            trackTimeMillis: 30000,
          },
        ],
      },
      "api.deezer.com/search": { data: [] },
    }));

    const hit = await resolvePreviewUrl({
      name: "Underground-unique-test-1",
      artist: "O.B.I.",
    });

    // Either null (preferred — no artist-aligned hit anywhere) or, if a
    // match path falls back to artist-only, MUST still be O.B.I.
    if (hit) {
      expect(hit.matched_artist?.toLowerCase()).toContain("o.b.i.");
    } else {
      expect(hit).toBeNull();
    }
  });

  it("accepts a strict iTunes match when the artist aligns", async () => {
    ({ calls, restore } = mockFetch({
      "itunes.apple.com/search": {
        results: [
          {
            trackName: "Underground-unique-test-2",
            artistName: "O.B.I.",
            previewUrl: "https://itunes-correct.example/preview.m4a",
            trackTimeMillis: 29500,
          },
        ],
      },
    }));

    const hit = await resolvePreviewUrl({
      name: "Underground-unique-test-2",
      artist: "O.B.I.",
    });

    expect(hit).not.toBeNull();
    expect(hit?.url).toBe("https://itunes-correct.example/preview.m4a");
    expect(hit?.matched_artist).toBe("O.B.I.");
    expect(hit?.matched_name).toBe("Underground-unique-test-2");
  });

  it("trusts ISRC lookups without artist verification (deterministic identifier)", async () => {
    ({ calls, restore } = mockFetch({
      "itunes.apple.com/lookup?isrc": {
        results: [
          {
            trackName: "Some Re-titled Version",
            artistName: "Different Label Spelling",
            previewUrl: "https://itunes-isrc.example/preview.m4a",
            trackTimeMillis: 30000,
          },
        ],
      },
    }));

    const hit = await resolvePreviewUrl({
      name: "Underground-unique-test-3",
      artist: "O.B.I.",
      isrc: "GBABC1234567",
    });

    // ISRC = recording id. Preview accepted even though artist string
    // differs, because the ISRC ties them to the same recording.
    expect(hit).not.toBeNull();
    expect(hit?.url).toBe("https://itunes-isrc.example/preview.m4a");
    expect(hit?.match_note).toBe("itunes.isrc");
  });

  it("falls back to Deezer with artist verification when iTunes returns nothing aligned", async () => {
    ({ calls, restore } = mockFetch({
      "itunes.apple.com": {
        results: [
          {
            trackName: "Underground-unique-test-4",
            artistName: "Some Pop Artist",
            previewUrl: "https://itunes-mismatch.example/preview.m4a",
          },
        ],
      },
      "api.deezer.com/search": {
        data: [
          {
            title: "Underground-unique-test-4",
            artist: { name: "O.B.I." },
            preview: "https://deezer-correct.example/preview.mp3",
            duration: 30,
          },
        ],
      },
    }));

    const hit = await resolvePreviewUrl({
      name: "Underground-unique-test-4",
      artist: "O.B.I.",
    });

    expect(hit?.source).toBe("deezer");
    expect(hit?.matched_artist).toBe("O.B.I.");
    expect(hit?.url).toBe("https://deezer-correct.example/preview.mp3");
  });

  it("returns null when no source has an artist-aligned match", async () => {
    ({ calls, restore } = mockFetch({
      "itunes.apple.com": {
        results: [
          {
            trackName: "Underground-unique-test-5",
            artistName: "Wrong Artist 1",
            previewUrl: "https://itunes-wrong.example/preview.m4a",
          },
        ],
      },
      "api.deezer.com": {
        data: [
          {
            title: "Underground-unique-test-5",
            artist: { name: "Wrong Artist 2" },
            preview: "https://deezer-wrong.example/preview.mp3",
          },
        ],
      },
    }));

    const hit = await resolvePreviewUrl({
      name: "Underground-unique-test-5",
      artist: "O.B.I.",
    });

    expect(hit).toBeNull();
  });
});
