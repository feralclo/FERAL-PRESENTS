import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchBrandFromUrl, normaliseUrl } from "@/lib/brand-fetch";

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function htmlResponse(html: string) {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function imageResponse(bytes: number[] = [0x89, 0x50, 0x4e, 0x47]) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

describe("normaliseUrl", () => {
  it("adds https:// when scheme is missing", () => {
    expect(normaliseUrl("brand.com")).toBe("https://brand.com/");
  });
  it("preserves https URLs", () => {
    expect(normaliseUrl("https://brand.com/path")).toBe("https://brand.com/path");
  });
  it("preserves http URLs", () => {
    expect(normaliseUrl("http://brand.com")).toBe("http://brand.com/");
  });
  it("trims whitespace", () => {
    expect(normaliseUrl("  brand.com  ")).toBe("https://brand.com/");
  });
  it("rejects empty input", () => {
    expect(normaliseUrl("")).toBeNull();
    expect(normaliseUrl("   ")).toBeNull();
  });
  it("rejects non-http(s) schemes", () => {
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("ftp://brand.com")).toBeNull();
  });
});

describe("fetchBrandFromUrl", () => {
  it("returns error when input URL is invalid", async () => {
    const result = await fetchBrandFromUrl("");
    expect(result).toEqual({ error: "Invalid URL" });
  });

  it("returns error when fetch fails", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network down"));
    const result = await fetchBrandFromUrl("brand.com");
    expect("error" in result && result.error).toBe("Could not reach that URL");
  });

  it("extracts name from og:site_name + accent from theme-color", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        htmlResponse(`
          <html><head>
            <title>ACME Tickets</title>
            <meta property="og:site_name" content="ACME Events" />
            <meta name="theme-color" content="#FF0066" />
            <link rel="icon" href="/favicon.png" />
          </head><body></body></html>
        `)
      )
      .mockResolvedValueOnce(imageResponse());

    const result = await fetchBrandFromUrl("https://brand.com");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.name).toBe("ACME Events");
    expect(result.accent_hex).toBe("#ff0066");
    expect(result.logo_url).toMatch(/^data:image\/png;base64,/);
    expect(result.partial).toBe(true);
  });

  it("falls back to <title> when og:site_name is missing", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        htmlResponse(`<html><head><title>The Brand</title></head><body></body></html>`)
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const result = await fetchBrandFromUrl("https://brand.com");
    if ("error" in result) throw new Error("expected success");
    expect(result.name).toBe("The Brand");
    expect(result.logo_url).toBeUndefined();
  });

  it("ignores invalid theme-color values", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        htmlResponse(`
          <html><head>
            <title>X</title>
            <meta name="theme-color" content="hsl(120, 50%, 50%)" />
          </head></html>
        `)
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const result = await fetchBrandFromUrl("https://brand.com");
    if ("error" in result) throw new Error("expected success");
    expect(result.accent_hex).toBeUndefined();
  });

  it("prefers apple-touch-icon over plain icon", async () => {
    let appleTouchHit = false;
    fetchSpy.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("apple-touch-icon")) {
        appleTouchHit = true;
        return imageResponse([0x89, 0x50, 0x4e, 0x47, 0x01]);
      }
      if (url.includes("favicon.ico")) {
        return imageResponse([0x00, 0x00, 0x01, 0x00]);
      }
      return htmlResponse(`
        <html><head>
          <title>X</title>
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        </head></html>
      `);
    });

    const result = await fetchBrandFromUrl("https://brand.com");
    if ("error" in result) throw new Error("expected success");
    expect(appleTouchHit).toBe(true);
    expect(result.logo_url).toMatch(/^data:image\/png;base64,/);
  });

  it("extracts og:image as a separate field from logo", async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("og.jpg") || url.includes("favicon")) {
        return imageResponse();
      }
      return htmlResponse(`
        <html><head>
          <title>X</title>
          <meta property="og:image" content="https://cdn.brand.com/og.jpg" />
        </head></html>
      `);
    });

    const result = await fetchBrandFromUrl("https://brand.com");
    if ("error" in result) throw new Error("expected success");
    expect(result.og_image_url).toBe("https://cdn.brand.com/og.jpg");
  });

  it("returns partial:false when nothing usable is found", async () => {
    fetchSpy
      .mockResolvedValueOnce(htmlResponse(`<html><head></head><body></body></html>`))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const result = await fetchBrandFromUrl("https://brand.com");
    if ("error" in result) throw new Error("expected success");
    expect(result.partial).toBe(false);
    expect(result.logo_url).toBeUndefined();
    expect(result.name).toBeUndefined();
  });

  it("rejects non-image content-type for icons", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        htmlResponse(`
          <html><head>
            <title>X</title>
            <link rel="icon" href="/favicon.ico" />
          </head></html>
        `)
      )
      .mockResolvedValueOnce(
        new Response("<html>oops 404</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );

    const result = await fetchBrandFromUrl("https://brand.com");
    if ("error" in result) throw new Error("expected success");
    expect(result.logo_url).toBeUndefined();
  });
});
