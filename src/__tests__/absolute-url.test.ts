import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { absolutizeUrl, absolutizePromoterUrls } from "@/lib/absolute-url";

function fakeRequest(host: string | null, proto: string | null = "https"): NextRequest {
  const headers = new Map<string, string>();
  if (host !== null) headers.set("host", host);
  if (proto !== null) headers.set("x-forwarded-proto", proto);
  return {
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) ?? null,
    },
  } as unknown as NextRequest;
}

describe("absolutizeUrl", () => {
  const req = fakeRequest("entry.events");

  it("returns null for null / undefined / empty input", () => {
    expect(absolutizeUrl(null, req)).toBeNull();
    expect(absolutizeUrl(undefined, req)).toBeNull();
    expect(absolutizeUrl("", req)).toBeNull();
  });

  it("returns absolute http(s) URLs unchanged", () => {
    expect(absolutizeUrl("https://cdn.mux.com/abc.jpg", req)).toBe(
      "https://cdn.mux.com/abc.jpg"
    );
    expect(absolutizeUrl("http://example.com/x", req)).toBe(
      "http://example.com/x"
    );
  });

  it("returns data: URIs unchanged", () => {
    const data = "data:image/png;base64,iVBORw0KGgoAAA";
    expect(absolutizeUrl(data, req)).toBe(data);
  });

  it("returns schemeless absolute URLs (`//host/...`) unchanged", () => {
    expect(absolutizeUrl("//cdn.example.com/x", req)).toBe(
      "//cdn.example.com/x"
    );
  });

  it("prepends request origin to root-relative paths", () => {
    expect(
      absolutizeUrl("/api/media/feral_promoter-avatar?v=1", req)
    ).toBe("https://entry.events/api/media/feral_promoter-avatar?v=1");
  });

  it("uses x-forwarded-proto when present", () => {
    const local = fakeRequest("localhost:3000", "http");
    expect(absolutizeUrl("/api/media/x", local)).toBe(
      "http://localhost:3000/api/media/x"
    );
  });

  it("defaults to https when x-forwarded-proto is missing", () => {
    const noProto = fakeRequest("entry.events", null);
    expect(absolutizeUrl("/api/media/x", noProto)).toBe(
      "https://entry.events/api/media/x"
    );
  });

  it("uses NEXT_PUBLIC_SITE_URL when host header is missing", () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://prod.example.com/";
    try {
      const noHost = fakeRequest(null);
      expect(absolutizeUrl("/api/media/x", noHost)).toBe(
        "https://prod.example.com/api/media/x"
      );
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });

  it("falls back to entry.events when neither host nor env is set", () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      const noHost = fakeRequest(null);
      expect(absolutizeUrl("/api/media/x", noHost)).toBe(
        "https://entry.events/api/media/x"
      );
    } finally {
      if (original !== undefined) process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });
});

describe("absolutizePromoterUrls", () => {
  const req = fakeRequest("entry.events");

  it("rewrites both avatar_url and cover_image_url", () => {
    const out = absolutizePromoterUrls(
      {
        id: "p1",
        avatar_url: "/api/media/avatar?v=1",
        cover_image_url: "/api/media/cover?v=1",
      },
      req
    );
    expect(out.avatar_url).toBe("https://entry.events/api/media/avatar?v=1");
    expect(out.cover_image_url).toBe("https://entry.events/api/media/cover?v=1");
  });

  it("leaves other fields untouched", () => {
    const out = absolutizePromoterUrls(
      {
        id: "p1",
        handle: "feral",
        avatar_url: "/x",
        cover_image_url: null,
        accent_hex: 0x123456,
      },
      req
    );
    expect(out.id).toBe("p1");
    expect(out.handle).toBe("feral");
    expect(out.accent_hex).toBe(0x123456);
    expect(out.cover_image_url).toBeNull();
  });

  it("handles a promoter with no urls set (both null)", () => {
    const out = absolutizePromoterUrls(
      { id: "p", avatar_url: null, cover_image_url: null },
      req
    );
    expect(out.avatar_url).toBeNull();
    expect(out.cover_image_url).toBeNull();
  });
});
