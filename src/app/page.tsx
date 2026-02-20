import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import type { LandingEvent } from "@/types/events";

/** Admin changes (new events, status updates) must appear immediately */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FERAL PRESENTS — Underground Techno & Rave Events UK",
  description:
    "FERAL PRESENTS is an underground events collective pushing the boundaries of techno, rave and electronic music. Raw, unfiltered experiences across the UK and Europe.",
  openGraph: {
    type: "website",
    title: "FERAL PRESENTS — Underground Techno & Rave Events",
    description:
      "Underground events collective pushing the boundaries of techno, rave and electronic music. Raw, unfiltered experiences.",
    images: [{ url: "https://feralpresents.com/images/banner-1.jpg" }],
    url: "https://feralpresents.com/",
  },
  twitter: {
    card: "summary_large_image",
    title: "FERAL PRESENTS — Underground Techno & Rave Events",
    description:
      "Underground events collective pushing the boundaries of techno, rave and electronic music.",
    images: ["https://feralpresents.com/images/banner-1.jpg"],
  },
  keywords: [
    "techno events",
    "rave",
    "underground music",
    "electronic music",
    "UK events",
    "warehouse rave",
    "hard techno",
    "industrial techno",
  ],
};

export default async function HomePage() {
  let events: LandingEvent[] = [];

  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.EVENTS)
        .select(
          "id, slug, name, date_start, venue_name, city, cover_image, tag_line, doors_time, payment_method, external_link"
        )
        .eq("org_id", ORG_ID)
        .eq("status", "live")
        .eq("visibility", "public")
        .order("date_start", { ascending: true });

      if (data) events = data as LandingEvent[];
    }
  } catch {
    // Fall through with empty events
  }

  return <LandingPage events={events} />;
}
