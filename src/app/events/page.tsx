import { getOrgId } from "@/lib/org";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey } from "@/lib/constants";
import type { Metadata } from "next";
import type { BrandingSettings } from "@/types/settings";
import type { ListingEvent } from "@/types/events";
import { EventsListPage } from "@/components/events/EventsListPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();
  let orgName = "Entry";
  let faviconUrl: string | undefined;

  if (supabase) {
    try {
      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", brandingKey(orgId))
        .single();
      const branding = data?.data as BrandingSettings | undefined;
      if (branding?.org_name) orgName = branding.org_name;
      if (branding?.favicon_url) faviconUrl = branding.favicon_url;
    } catch {
      // Use default
    }
  }

  return {
    title: `Events | ${orgName}`,
    description: `Browse all upcoming events from ${orgName}. Live music, experiences, and more.`,
    ...(faviconUrl ? { icons: { icon: faviconUrl, apple: faviconUrl } } : {}),
  };
}

export default async function EventsPage() {
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();

  let events: ListingEvent[] = [];

  if (supabase) {
    try {
      // Fetch events and ticket types in parallel
      const [eventsResult, ticketTypesResult] = await Promise.all([
        supabase
          .from(TABLES.EVENTS)
          .select(
            "id, slug, name, date_start, date_end, venue_name, city, cover_image, hero_image, tag_line, doors_time, payment_method, external_link, about_text, age_restriction, currency"
          )
          .eq("org_id", orgId)
          .eq("status", "live")
          .eq("visibility", "public")
          .order("date_start", { ascending: true }),
        supabase
          .from(TABLES.TICKET_TYPES)
          .select("event_id, price, capacity, sold, status")
          .eq("org_id", orgId)
          .eq("status", "active"),
      ]);

      if (eventsResult.data) {
        // Build ticket stats per event
        const ticketsByEvent = new Map<string, Array<{ price: number; capacity?: number; sold: number }>>();
        if (ticketTypesResult.data) {
          for (const tt of ticketTypesResult.data) {
            const arr = ticketsByEvent.get(tt.event_id) || [];
            arr.push({ price: tt.price, capacity: tt.capacity, sold: tt.sold });
            ticketsByEvent.set(tt.event_id, arr);
          }
        }

        events = eventsResult.data.map((event) => {
          const tickets = ticketsByEvent.get(event.id) || [];

          // Compute min_price from active tickets
          const prices = tickets.map((t) => t.price).filter((p) => p > 0);
          const min_price = prices.length > 0 ? Math.min(...prices) : undefined;

          // Compute status_label
          let status_label: string | null = null;
          if (tickets.length > 0) {
            const totalCapacity = tickets.reduce((sum, t) => sum + (t.capacity || 0), 0);
            const totalSold = tickets.reduce((sum, t) => sum + t.sold, 0);

            if (totalCapacity > 0) {
              const percentSold = totalSold / totalCapacity;
              if (percentSold >= 1) {
                status_label = "Sold Out";
              } else if (percentSold >= 0.85) {
                status_label = "Limited";
              } else if (percentSold >= 0.6) {
                status_label = "Selling Fast";
              }
            }
          }

          return {
            ...event,
            min_price,
            status_label,
          } as ListingEvent;
        });
      }
    } catch {
      // Fall through with empty events
    }
  }

  return <EventsListPage events={events} />;
}
