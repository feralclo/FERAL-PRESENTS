import { describe, it, expect } from "vitest";
import { pickBestAlbumImage } from "@/lib/spotify/album-image";

describe("pickBestAlbumImage", () => {
  it("returns null for missing / empty images", () => {
    expect(pickBestAlbumImage(undefined)).toBeNull();
    expect(pickBestAlbumImage([])).toBeNull();
    expect(pickBestAlbumImage([{ width: 300 }])).toBeNull(); // no url
  });

  it("picks the 300px variant when available (Spotify standard set)", () => {
    const url = pickBestAlbumImage([
      { url: "https://x/large", width: 640 },
      { url: "https://x/medium", width: 300 },
      { url: "https://x/small", width: 64 },
    ]);
    expect(url).toBe("https://x/medium");
  });

  it("picks the smallest variant >= 300 when sizes are non-standard", () => {
    const url = pickBestAlbumImage([
      { url: "https://x/huge", width: 1200 },
      { url: "https://x/medium-plus", width: 480 },
      { url: "https://x/medium", width: 320 },
      { url: "https://x/small", width: 96 },
    ]);
    expect(url).toBe("https://x/medium");
  });

  it("falls back to the largest available when nothing meets 300px", () => {
    const url = pickBestAlbumImage([
      { url: "https://x/big-thumb", width: 200 },
      { url: "https://x/small", width: 64 },
    ]);
    expect(url).toBe("https://x/big-thumb");
  });

  it("handles unknown widths by treating them as 0 (worst-case)", () => {
    const url = pickBestAlbumImage([
      { url: "https://x/known", width: 300 },
      { url: "https://x/unknown" }, // missing width
    ]);
    expect(url).toBe("https://x/known");
  });
});
