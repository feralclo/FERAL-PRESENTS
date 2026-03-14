import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/**
 * Dynamic robots.txt — resolves the sitemap URL from the request host.
 *
 * Critical for multi-tenant SEO: when Google crawls feralpresents.com/robots.txt,
 * the sitemap must point to feralpresents.com/sitemap.xml (not entry.events).
 * Cross-domain sitemap references are ignored by crawlers.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const proto =
    headersList.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const siteUrl = host
    ? `${proto}://${host}`
    : process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/rep/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
