/**
 * Brand fetcher — given a URL, extract the tenant's logo, brand name, and
 * intended accent color from public site metadata.
 *
 * Used in the onboarding wizard's identity section ("Got a website? Paste
 * the URL — we'll grab your logo and colors automatically.").
 *
 * Approach: pure HTML scraping with JSDOM. No headless browser, no third-party
 * API, no extra deps. Covers the ~70% of brands that have proper metadata
 * (favicon, apple-touch-icon, og:image, og:site_name, theme-color). For SPAs
 * that render via JS, we fall back to whatever is in the bare HTML — better
 * than nothing.
 *
 * Fields returned:
 *   - name        — from og:site_name → twitter:site → <title>
 *   - logo_url    — best-quality icon (apple-touch-icon → icon → /favicon.ico)
 *                   returned as a data URI so it works directly in a preview
 *   - accent_hex  — meta[name="theme-color"] when present (the brand's
 *                   intended accent color). NOT extracted from the favicon
 *                   (that needs a heavy native dep — sharp/canvas — and gives
 *                   noisier results than the explicit meta tag).
 *   - og_image_url — direct URL (not data URI — these can be large)
 *
 * Timeouts: 5s on HTML, 4s on each image. Hard caps: 2MB HTML, 1MB image.
 * On any partial failure we return the partial data — better UX than 500.
 */

// jsdom is in package.json (used by vitest jsdom environment) but doesn't ship types.
// We only use the public { JSDOM } API — keep this minimal local declaration.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — no @types/jsdom installed; minimal usage doesn't justify the dep.
import { JSDOM } from "jsdom";

const HTML_TIMEOUT_MS = 5_000;
const IMAGE_TIMEOUT_MS = 4_000;
const HTML_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const IMAGE_MAX_BYTES = 1 * 1024 * 1024; // 1 MB

const USER_AGENT =
  "EntryBrandFetcher/1.0 (+https://entry.events) like Mozilla/5.0";

export interface BrandFetchResult {
  name?: string;
  logo_url?: string; // data URI
  accent_hex?: string; // #RRGGBB
  og_image_url?: string; // direct URL
  source_url: string; // resolved final URL after redirects
  /** True if at least one of name/logo/accent/og was extracted */
  partial: boolean;
}

/** Normalise input URL — accept "brand.com" without scheme. */
export function normaliseUrl(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;

  // Reject explicit non-http(s) schemes (javascript:, ftp:, file:, data:)
  // before we get a chance to silently coerce them by prepending https://.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:/i.test(trimmed)) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function resolveAbsolute(possiblyRelative: string, baseUrl: string): string | null {
  try {
    return new URL(possiblyRelative, baseUrl).toString();
  } catch {
    return null;
  }
}

function isValidHex(value?: string | null): value is string {
  if (!value) return false;
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Fetch with timeout + size cap. Returns null on any failure. */
async function fetchWithCap(
  url: string,
  opts: { timeoutMs: number; maxBytes: number; accept?: string }
): Promise<{ buffer: Uint8Array; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        ...(opts.accept ? { Accept: opts.accept } : {}),
      },
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";

    // Stream into capped buffer
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (!res.body) return null;
    const reader = res.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return null;
      }
      chunks.push(value);
    }
    // Concat
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      buffer.set(c, offset);
      offset += c.byteLength;
    }
    return { buffer, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface IconCandidate {
  href: string;
  /** Larger = better. Estimated from the `sizes` attribute. */
  sizeRank: number;
  /** Higher rank wins ties. apple-touch > icon > shortcut icon */
  typeRank: number;
}

function parseIconSize(sizes?: string | null): number {
  if (!sizes) return 0;
  // Parse the largest WxH from the sizes attribute
  const matches = [...sizes.matchAll(/(\d+)x(\d+)/g)];
  if (!matches.length) return 0;
  return Math.max(...matches.map((m) => Math.max(Number(m[1]), Number(m[2]))));
}

function extractMetadata(html: string, baseUrl: string) {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;

  const meta = (selector: string): string | undefined => {
    const el = doc.querySelector(selector) as HTMLMetaElement | null;
    return el?.content?.trim() || undefined;
  };

  // Name candidates (in order of preference)
  const name =
    meta('meta[property="og:site_name"]') ||
    meta('meta[name="application-name"]') ||
    meta('meta[name="apple-mobile-web-app-title"]') ||
    meta('meta[property="og:title"]') ||
    meta('meta[name="twitter:title"]') ||
    doc.title?.trim() ||
    undefined;

  // Theme color → accent
  const themeColorRaw = meta('meta[name="theme-color"]');
  const accent_hex = isValidHex(themeColorRaw) ? themeColorRaw!.toLowerCase() : undefined;

  // OG image (separate from logo — usually a hero image)
  const ogImageHref =
    meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]');
  const og_image_url = ogImageHref ? resolveAbsolute(ogImageHref, baseUrl) ?? undefined : undefined;

  // Icon candidates
  const candidates: IconCandidate[] = [];
  const links = doc.querySelectorAll("link[rel]") as NodeListOf<HTMLLinkElement>;
  links.forEach((link) => {
    const rel = (link.getAttribute("rel") || "").toLowerCase();
    const href = link.getAttribute("href");
    if (!href) return;
    let typeRank = 0;
    if (rel.includes("apple-touch-icon")) typeRank = 3;
    else if (rel === "icon") typeRank = 2;
    else if (rel.includes("shortcut")) typeRank = 1;
    if (typeRank === 0) return;
    const absolute = resolveAbsolute(href, baseUrl);
    if (!absolute) return;
    candidates.push({
      href: absolute,
      sizeRank: parseIconSize(link.getAttribute("sizes")),
      typeRank,
    });
  });

  // Always also try /favicon.ico as a baseline
  candidates.push({
    href: resolveAbsolute("/favicon.ico", baseUrl) ?? "",
    sizeRank: 0,
    typeRank: 0,
  });

  // Sort: typeRank desc, sizeRank desc
  candidates.sort((a, b) => {
    if (b.typeRank !== a.typeRank) return b.typeRank - a.typeRank;
    return b.sizeRank - a.sizeRank;
  });

  return { name, accent_hex, og_image_url, iconCandidates: candidates };
}

async function fetchFirstWorkingIcon(
  candidates: IconCandidate[]
): Promise<{ dataUri: string } | null> {
  for (const candidate of candidates) {
    if (!candidate.href) continue;
    const got = await fetchWithCap(candidate.href, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      maxBytes: IMAGE_MAX_BYTES,
      accept: "image/png,image/svg+xml,image/x-icon,image/jpeg,image/webp,image/*",
    });
    if (!got) continue;

    // Reject if content-type isn't an image (some sites 200 with HTML)
    if (!got.contentType.startsWith("image/")) continue;

    const base64 = Buffer.from(got.buffer).toString("base64");
    const dataUri = `data:${got.contentType.split(";")[0]};base64,${base64}`;
    return { dataUri };
  }
  return null;
}

export async function fetchBrandFromUrl(rawUrl: string): Promise<BrandFetchResult | { error: string }> {
  const normalised = normaliseUrl(rawUrl);
  if (!normalised) return { error: "Invalid URL" };

  const html = await fetchWithCap(normalised, {
    timeoutMs: HTML_TIMEOUT_MS,
    maxBytes: HTML_MAX_BYTES,
    accept: "text/html,application/xhtml+xml",
  });
  if (!html) return { error: "Could not reach that URL" };

  // Decode as UTF-8; jsdom is forgiving on charset issues
  const htmlText = new TextDecoder("utf-8", { fatal: false }).decode(html.buffer);
  const { name, accent_hex, og_image_url, iconCandidates } = extractMetadata(
    htmlText,
    normalised
  );

  const icon = await fetchFirstWorkingIcon(iconCandidates);
  const partial = !!(name || accent_hex || og_image_url || icon);

  return {
    source_url: normalised,
    name,
    accent_hex,
    og_image_url,
    logo_url: icon?.dataUri,
    partial,
  };
}
