import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/campaigns/audience — Build audience segments for campaign targeting
 *
 * Returns a list of { email, first_name, last_name } for the selected segment.
 *
 * Query params:
 *   segment  — required: "all_customers" | "non_purchasers" | "abandoned_carts" | "popup_signups" | "interest_signups"
 *   event_id — required for all segments except "all_customers"
 *   format   — optional: "json" (default) | "csv"
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { searchParams } = request.nextUrl;
    const segment = searchParams.get("segment");
    const eventId = searchParams.get("event_id");
    const format = searchParams.get("format") || "json";

    if (!segment) {
      return NextResponse.json({ error: "segment is required" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    interface AudienceMember {
      email: string;
      first_name: string;
      last_name: string;
    }

    let audience: AudienceMember[] = [];

    switch (segment) {
      case "all_customers": {
        const { data } = await supabase
          .from(TABLES.CUSTOMERS)
          .select("email, first_name, last_name")
          .eq("org_id", orgId)
          .eq("marketing_consent", true)
          .order("created_at", { ascending: false });

        audience = (data || []).map((c: { email: string; first_name: string; last_name: string }) => ({
          email: c.email,
          first_name: c.first_name || "",
          last_name: c.last_name || "",
        }));
        break;
      }

      case "non_purchasers": {
        if (!eventId) {
          return NextResponse.json({ error: "event_id required for non_purchasers" }, { status: 400 });
        }

        // Get all customers, then exclude those who have orders for this event
        const [customersRes, ordersRes] = await Promise.all([
          supabase
            .from(TABLES.CUSTOMERS)
            .select("email, first_name, last_name")
            .eq("org_id", orgId)
            .eq("marketing_consent", true),
          supabase
            .from(TABLES.ORDERS)
            .select("customer_email")
            .eq("org_id", orgId)
            .eq("event_id", eventId)
            .in("status", ["completed", "confirmed"]),
        ]);

        const purchaserEmails = new Set(
          (ordersRes.data || []).map((o: { customer_email: string }) => o.customer_email?.toLowerCase())
        );

        audience = (customersRes.data || [])
          .filter((c: { email: string }) => !purchaserEmails.has(c.email?.toLowerCase()))
          .map((c: { email: string; first_name: string; last_name: string }) => ({
            email: c.email,
            first_name: c.first_name || "",
            last_name: c.last_name || "",
          }));
        break;
      }

      case "abandoned_carts": {
        if (!eventId) {
          return NextResponse.json({ error: "event_id required for abandoned_carts" }, { status: 400 });
        }

        const { data } = await supabase
          .from(TABLES.ABANDONED_CARTS)
          .select("email, first_name, last_name")
          .eq("org_id", orgId)
          .eq("event_id", eventId)
          .eq("status", "abandoned");

        // Deduplicate by email
        const seen = new Set<string>();
        audience = (data || [])
          .filter((c: { email: string }) => {
            const key = c.email?.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((c: { email: string; first_name: string; last_name: string }) => ({
            email: c.email,
            first_name: c.first_name || "",
            last_name: c.last_name || "",
          }));
        break;
      }

      case "popup_signups": {
        if (!eventId) {
          return NextResponse.json({ error: "event_id required for popup_signups" }, { status: 400 });
        }

        // Popup events capture emails on event pages — filter by page path containing the event slug
        // First get the event slug
        const { data: event } = await supabase
          .from(TABLES.EVENTS)
          .select("slug")
          .eq("id", eventId)
          .eq("org_id", orgId)
          .single();

        if (!event?.slug) {
          return NextResponse.json({ audience: [], count: 0 });
        }

        const { data } = await supabase
          .from(TABLES.POPUP_EVENTS)
          .select("email")
          .eq("org_id", orgId)
          .like("page", `%${event.slug}%`)
          .not("email", "is", null)
          .neq("email", "");

        // Deduplicate and join with customers for names
        const seen = new Set<string>();
        const uniqueEmails = (data || [])
          .filter((p: { email: string }) => {
            const key = p.email?.toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((p: { email: string }) => p.email);

        if (uniqueEmails.length > 0) {
          // Try to enrich with customer names
          const { data: customers } = await supabase
            .from(TABLES.CUSTOMERS)
            .select("email, first_name, last_name")
            .eq("org_id", orgId)
            .in("email", uniqueEmails);

          const customerMap = new Map(
            (customers || []).map((c: { email: string; first_name: string; last_name: string }) => [
              c.email.toLowerCase(),
              c,
            ])
          );

          audience = uniqueEmails.map((email: string) => {
            const customer = customerMap.get(email.toLowerCase());
            return {
              email,
              first_name: customer?.first_name || "",
              last_name: customer?.last_name || "",
            };
          });
        }
        break;
      }

      case "interest_signups": {
        if (!eventId) {
          return NextResponse.json({ error: "event_id required for interest_signups" }, { status: 400 });
        }

        const { data } = await supabase
          .from(TABLES.EVENT_INTEREST_SIGNUPS)
          .select("email, first_name")
          .eq("org_id", orgId)
          .eq("event_id", eventId)
          .is("unsubscribed_at", null);

        // Deduplicate by email
        const seen = new Set<string>();
        audience = (data || [])
          .filter((s: { email: string }) => {
            const key = s.email?.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((s: { email: string; first_name: string }) => ({
            email: s.email,
            first_name: s.first_name || "",
            last_name: "",
          }));
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown segment: ${segment}` }, { status: 400 });
    }

    // CSV format
    if (format === "csv") {
      const header = "email,first_name,last_name";
      const rows = audience.map(
        (a) => `${csvEscape(a.email)},${csvEscape(a.first_name)},${csvEscape(a.last_name)}`
      );
      const csv = [header, ...rows].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${segment}_${eventId || "all"}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ audience, count: audience.length });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function csvEscape(value: string): string {
  if (!value) return "";
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
