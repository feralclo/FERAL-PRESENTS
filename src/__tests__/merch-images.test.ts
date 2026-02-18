import { describe, it, expect } from "vitest";
import { normalizeMerchImages, hasMerchImages } from "@/lib/merch-images";

describe("normalizeMerchImages", () => {
  it("returns empty array for null", () => {
    expect(normalizeMerchImages(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(normalizeMerchImages(undefined)).toEqual([]);
  });

  it("returns empty array for empty object", () => {
    expect(normalizeMerchImages({})).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(normalizeMerchImages([])).toEqual([]);
  });

  it("normalizes legacy {front, back} to ordered array", () => {
    expect(
      normalizeMerchImages({ front: "img_front", back: "img_back" })
    ).toEqual(["img_front", "img_back"]);
  });

  it("normalizes legacy {front} only", () => {
    expect(normalizeMerchImages({ front: "img_front" })).toEqual([
      "img_front",
    ]);
  });

  it("normalizes legacy {back} only", () => {
    expect(normalizeMerchImages({ back: "img_back" })).toEqual(["img_back"]);
  });

  it("passes through a string array unchanged", () => {
    const arr = ["img1", "img2", "img3"];
    expect(normalizeMerchImages(arr)).toEqual(arr);
  });

  it("filters empty strings from arrays", () => {
    expect(normalizeMerchImages(["img1", "", "img3", ""])).toEqual([
      "img1",
      "img3",
    ]);
  });

  it("filters empty strings from legacy object", () => {
    expect(normalizeMerchImages({ front: "", back: "img_back" })).toEqual([
      "img_back",
    ]);
  });

  it("handles legacy object with both empty strings", () => {
    expect(normalizeMerchImages({ front: "", back: "" })).toEqual([]);
  });
});

describe("hasMerchImages", () => {
  it("returns false for null", () => {
    expect(hasMerchImages(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasMerchImages(undefined)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(hasMerchImages({})).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasMerchImages([])).toBe(false);
  });

  it("returns true for legacy object with front", () => {
    expect(hasMerchImages({ front: "img" })).toBe(true);
  });

  it("returns true for non-empty array", () => {
    expect(hasMerchImages(["img1"])).toBe(true);
  });

  it("returns false for array of empty strings", () => {
    expect(hasMerchImages(["", ""])).toBe(false);
  });
});
