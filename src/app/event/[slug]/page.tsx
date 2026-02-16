import type { Metadata } from "next";
import { KompassEventPage } from "@/components/event/KompassEventPage";
import { DynamicEventPage } from "@/components/event/DynamicEventPage";
import { AuraEventPage } from "@/components/aura/AuraEventPage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getActiveTemplate } from "@/lib/themes";
import { TABLES, ORG_ID } from "@/lib/constants";

/** Force dynamic rendering — every request fetches fresh data from Supabase.
 *  This ensures admin changes (lineup, images, theme, etc.) appear immediately
 *  without needing to refresh multiple times or wait for ISR revalidation. */
export const dynamic = "force-dynamic";

/** Fetch event from DB (for admin-editable content). */
async function getEventFromDB(slug: string) {
  try {
    const supabase = await getSupabaseAdmin();
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

  const event = await getEventFromDB(slug);
  if (event) {
    const title = `FERAL — ${event.name}`;
    const description =
      event.description || event.about_text || `Get tickets for ${event.name}`;
    return {
      title,
      description,
      openGraph: {
        type: "website",
        title,
        description,
        ...(event.cover_image
          ? { images: [{ url: event.cover_image }] }
          : {}),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(event.cover_image
          ? { images: [event.cover_image] }
          : {}),
      },
      keywords: ["techno events", "rave", "FERAL", "tickets"],
    };
  }

  return { title: "FERAL PRESENTS — Event" };
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // In editor preview mode, the ?template= param tells us which theme to render.
  // This lets the admin preview non-active themes (e.g. editing Aura while Midnight is live).
  const editorTemplate = sp.editor === "1" && typeof sp.template === "string"
    ? sp.template
    : undefined;

  // Kompass uses Paylogic (external ticketing) — keep hardcoded page for now
  if (slug === "kompass-klub-7-march") {
    return <KompassEventPage />;
  }

  // Fetch event + active template in parallel
  const [event, activeTemplate] = await Promise.all([
    getEventFromDB(slug),
    getActiveTemplate(),
  ]);

  if (!event) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#fff" }}>
        <p>Event not found.</p>
      </div>
    );
  }

  // Use editor override if present, otherwise use live active template
  const template = editorTemplate || activeTemplate;

  // Aura theme: render Aura component tree (shadcn/ui based)
  if (template === "aura") {
    return <AuraEventPage event={event} />;
  }
  return <DynamicEventPage event={event} />;
}
