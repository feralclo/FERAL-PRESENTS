import type { Metadata } from "next";
import { LiverpoolEventPage } from "@/components/event/LiverpoolEventPage";
import { KompassEventPage } from "@/components/event/KompassEventPage";
import { DynamicEventPage } from "@/components/event/DynamicEventPage";
import { AuraEventPage } from "@/components/aura/AuraEventPage";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getActiveTemplate } from "@/lib/themes";
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

/** Fetch event from DB (for admin-editable content).
 *  Returns the event record regardless of payment method.
 *  Routing decides which component to render based on payment_method. */
async function getEventFromDB(slug: string) {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) return null;

    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*, product:products(*))")
      .eq("slug", slug)
      .eq("org_id", ORG_ID)
      .single();

    return data || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  // Fetch event from DB for metadata (if it exists)
  const dynamicEvent = await getEventFromDB(slug);
  if (dynamicEvent && dynamicEvent.payment_method !== "weeztix") {
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

  // Fetch event + active template in parallel
  const [event, activeTemplate] = await Promise.all([
    getEventFromDB(slug),
    getActiveTemplate(),
  ]);

  // Stripe/test events: use dynamic page (DB-driven)
  if (event && event.payment_method !== "weeztix") {
    // Aura theme: render Aura component tree (shadcn/ui based)
    if (activeTemplate === "aura") {
      return <AuraEventPage event={event} />;
    }
    return <DynamicEventPage event={event} />;
  }

  // WeeZTix events: use hardcoded components (all features preserved)
  // Pass DB event for admin-editable content (lineup, about, images, etc.)
  if (slug === "kompass-klub-7-march") {
    return <KompassEventPage />;
  }

  return <LiverpoolEventPage slug={slug} event={event} />;
}
