// @vitest-environment node
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { optimizeTenantMediaImage } from "@/lib/uploads/optimize-image";

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 60, b: 200 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe("optimizeTenantMediaImage", () => {
  it("downsizes a 4000x3000 JPEG and converts it to WebP within the 1200x1600 bounding box", async () => {
    const input = await makeJpeg(4000, 3000);
    const result = await optimizeTenantMediaImage(input);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.mime_type).toBe("image/webp");
    // 4000×3000 fit inside 1200×1600 → scaled to 1200×900 (cap on width).
    expect(result.width).toBeLessThanOrEqual(1200);
    expect(result.height).toBeLessThanOrEqual(1600);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(900);
    // WebP should be substantially smaller than the source JPEG.
    expect(result.size_bytes).toBeLessThan(input.length);
  });

  it("does not upscale a small image", async () => {
    const input = await makeJpeg(400, 600);
    const result = await optimizeTenantMediaImage(input);
    expect(result).not.toBeNull();
    if (!result) return;
    // 400×600 stays 400×600 — withoutEnlargement: true.
    expect(result.width).toBe(400);
    expect(result.height).toBe(600);
  });

  it("returns null for non-image input rather than throwing", async () => {
    const result = await optimizeTenantMediaImage(Buffer.from("not an image"));
    expect(result).toBeNull();
  });
});
