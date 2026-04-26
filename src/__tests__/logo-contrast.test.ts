/**
 * Pure-helper tests for the smart logo contrast recommendation engine.
 *
 * Browser-only `analyzeLogo` is not covered here (it needs canvas + DOM);
 * the threshold logic in `recommendLogoFilter` is what makes the call
 * about whether to flip a logo, and that's what we lock down.
 */

import { describe, it, expect } from "vitest";
import { recommendLogoFilter, type LogoAnalysis } from "@/lib/logo-contrast";

const BLACK_MONO: LogoAnalysis = { luminance: 0.05, saturation: 0.02, alphaCoverage: 0.3 };
const WHITE_MONO: LogoAnalysis = { luminance: 0.92, saturation: 0.0, alphaCoverage: 0.3 };
const MID_GREY: LogoAnalysis = { luminance: 0.5, saturation: 0.05, alphaCoverage: 0.3 };
const VIVID_RED: LogoAnalysis = { luminance: 0.3, saturation: 0.85, alphaCoverage: 0.3 };
const VIVID_BLUE: LogoAnalysis = { luminance: 0.4, saturation: 0.6, alphaCoverage: 0.3 };
const ALMOST_EMPTY: LogoAnalysis = { luminance: 0.1, saturation: 0.0, alphaCoverage: 0.005 };

describe("recommendLogoFilter — dark surface", () => {
  it("inverts a black wordmark on a dark bg (the FERAL case)", () => {
    expect(recommendLogoFilter(BLACK_MONO, "dark")).toBe("brightness(0) invert(1)");
  });

  it("leaves a vivid coloured logo alone on dark", () => {
    expect(recommendLogoFilter(VIVID_RED, "dark")).toBeNull();
    expect(recommendLogoFilter(VIVID_BLUE, "dark")).toBeNull();
  });

  it("leaves a white logo alone on dark (already legible)", () => {
    expect(recommendLogoFilter(WHITE_MONO, "dark")).toBeNull();
  });

  it("leaves a mid-luminance logo alone on dark (legible enough)", () => {
    expect(recommendLogoFilter(MID_GREY, "dark")).toBeNull();
  });
});

describe("recommendLogoFilter — light surface", () => {
  it("flattens a white-on-white wordmark to black", () => {
    expect(recommendLogoFilter(WHITE_MONO, "light")).toBe("brightness(0)");
  });

  it("leaves vivid colour logos alone on light", () => {
    expect(recommendLogoFilter(VIVID_RED, "light")).toBeNull();
  });

  it("leaves a black logo alone on light (already legible)", () => {
    expect(recommendLogoFilter(BLACK_MONO, "light")).toBeNull();
  });
});

describe("recommendLogoFilter — defensive fall-throughs", () => {
  it("returns null for tightly-cropped / mostly-transparent inputs", () => {
    expect(recommendLogoFilter(ALMOST_EMPTY, "dark")).toBeNull();
  });

  it("treats saturation 0.22 as the colour/monochrome boundary", () => {
    // Just over the boundary → vivid → leave alone.
    const justColourful: LogoAnalysis = {
      luminance: 0.1,
      saturation: 0.23,
      alphaCoverage: 0.3,
    };
    expect(recommendLogoFilter(justColourful, "dark")).toBeNull();

    // Just under → still monochrome enough to invert.
    const justMono: LogoAnalysis = {
      luminance: 0.1,
      saturation: 0.2,
      alphaCoverage: 0.3,
    };
    expect(recommendLogoFilter(justMono, "dark")).toBe("brightness(0) invert(1)");
  });
});
