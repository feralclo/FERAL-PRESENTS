import type { Metadata } from "next";
import { LiverpoolEventPage } from "@/components/event/LiverpoolEventPage";
import { KompassEventPage } from "@/components/event/KompassEventPage";
import { DynamicEventPage } from "@/components/event/DynamicEventPage";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

/** Force dynamic rendering — every request fetches fresh data from Supabase.
 *  This ensures admin changes (lineup, images, theme, etc.) appear immediately
 *  without needing to refresh multiple times or wait for ISR revalidation. */
export const dynamic = "force-dynamic";

// Hardcoded metadata for WeeZTix events
const EVENT_META: Record<
  string,
  { title: string; description: string; image: string; url: string }
> = {
  "liverpool-27-march": {
    title:
      "FERAL Liverpool — Invisible Wind Factory | 27 March 2026 | Techno Rave",
    description:
      "FERAL takes over Invisible Wind Factory Liverpool on 27 March 2026. Hard techno, industrial and hardstyle. Full 360° setup with immersive production. Tickets on sale now.",
    image: "https://feralpresents.com/images/liverpool-tile.jpg",
    url: "https://feralpresents.com/event/liverpool-27-march/",
  },
  "kompass-klub-7-march": {
    title: "FERAL — Kompass Klub, Ghent | 7 March 2026",
    description:
      "FERAL takes over Kompass Klub in Ghent on 7 March 2026. 11PM — 7AM. Get tickets now.",
    image: "https://feralpresents.com/images/kompass-event-banner.jpg",
    url: "https://feralpresents.com/event/kompass-klub-7-march/",
  },
};

/** Fetch event from DB if it exists and is non-WeeZTix */
async function getDynamicEvent(slug: string) {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) return null;

    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*)")
      .eq("slug", slug)
      .eq("org_id", ORG_ID)
      .single();

    if (data && data.payment_method !== "weeztix") {
      return data;
    }
  } catch {
    // Fall through
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  // Check for dynamic event first
  const dynamicEvent = await getDynamicEvent(slug);
  if (dynamicEvent) {
    const title = `FERAL — ${dynamicEvent.name}`;
    const description =
      dynamicEvent.description || dynamicEvent.about_text || `Get tickets for ${dynamicEvent.name}`;
    return {
      title,
      description,
      openGraph: {
        type: "website",
        title,
        description,
        ...(dynamicEvent.cover_image
          ? { images: [{ url: dynamicEvent.cover_image }] }
          : {}),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(dynamicEvent.cover_image
          ? { images: [dynamicEvent.cover_image] }
          : {}),
      },
      keywords: ["techno events", "rave", "FERAL", "tickets"],
    };
  }

  // Fallback to hardcoded metadata
  const meta = EVENT_META[slug];
  if (!meta) {
    return { title: "FERAL PRESENTS — Event" };
  }

  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      type: "website",
      title: meta.title,
      description: meta.description,
      images: [{ url: meta.image }],
      url: meta.url,
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [meta.image],
    },
    keywords: [
      "techno events",
      "rave",
      "FERAL",
      "tickets",
      slug.includes("liverpool")
        ? "Liverpool rave"
        : "Kompass Klub",
    ],
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Check for dynamic event (test/stripe) — render from DB
  const dynamicEvent = await getDynamicEvent(slug);
  if (dynamicEvent) {
    return <DynamicEventPage event={dynamicEvent} />;
  }

  // WeeZTix events: use hardcoded components
  if (slug === "kompass-klub-7-march") {
    return <KompassEventPage />;
  }

  // Default: Liverpool-style event page
  return <LiverpoolEventPage slug={slug} />;
}
