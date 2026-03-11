import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import type { BrandingSettings } from "@/types/settings";

async function getJoinMetadata(): Promise<{
  orgName: string;
  logoUrl?: string;
  baseUrl: string;
}> {
  let orgName = "Entry";
  let logoUrl: string | undefined;
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (!supabase) return { orgName, logoUrl, baseUrl };

    // Fetch branding
    const { data: brandingRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", brandingKey(orgId))
      .single();

    if (brandingRow?.data) {
      const branding = brandingRow.data as BrandingSettings;
      if (branding.org_name) orgName = branding.org_name;
      if (branding.logo_url) logoUrl = branding.logo_url;
    }

    // Resolve tenant domain
    const { data: domain } = await supabase
      .from(TABLES.DOMAINS)
      .select("hostname")
      .eq("org_id", orgId)
      .eq("is_primary", true)
      .single();

    if (domain?.hostname) {
      baseUrl = `https://${domain.hostname}`;
    }
  } catch {
    /* defaults */
  }

  return { orgName, logoUrl, baseUrl };
}

export async function generateMetadata(): Promise<Metadata> {
  const { orgName, logoUrl, baseUrl } = await getJoinMetadata();

  const title = `Join ${orgName} Reps`;
  const description = `Become a ${orgName} rep — earn rewards, climb the leaderboard, and get exclusive perks. Sign up in seconds.`;
  const url = `${baseUrl}/rep/join`;

  // Use org logo if available, otherwise fall back to PWA cat icon
  const ogImage = logoUrl || `${baseUrl}/pwa-icon-512.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: `${orgName} Reps`,
      type: "website",
      images: [
        {
          url: ogImage,
          width: 512,
          height: 512,
          alt: `${orgName} Reps`,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
