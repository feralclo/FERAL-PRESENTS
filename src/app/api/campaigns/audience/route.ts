import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

interface AudienceMember {
  email: string;
  first_name: string;
  last_name: string;
}

type FilterType =
  | "popup_signups"
  | "abandoned_carts"
  | "interest_signups"
  | "all_customers"
  | "purchased"
  | "guest_list";

/**
 * GET /api/campaigns/audience — Build audience with include/exclude filters
 *
 * Query params:
 *   include  — comma-separated filters to union (popup_signups,abandoned_carts,...)
 *   exclude  — comma-separated filters to subtract (purchased,guest_list,...)
 *   event_id — required for event-specific filters
 *   format   — "json" (default) | "csv"
 *
 * Legacy support:
 *   segment  — single segment name (old API, still works)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get("event_id");
    const format = searchParams.get("format") || "json";

    // Parse include/exclude filters (new API) or single segment (legacy)
    const legacySegment = searchParams.get("segment");
    const includeParam = searchParams.get("include");
    const excludeParam = searchParams.get("exclude");

    let includeFilters: FilterType[];
    let excludeFilters: FilterType[];

    if (includeParam) {
      includeFilters = includeParam.split(",").filter(Boolean) as FilterType[];
      excludeFilters = excludeParam ? excludeParam.split(",").filter(Boolean) as FilterType[] : [];
    } else if (legacySegment) {
      // Legacy: map old segment names to include/exclude
      if (legacySegment === "non_purchasers") {
        includeFilters = ["all_customers"];
        excludeFilters = ["purchased"];
      } else {
        includeFilters = [legacySegment as FilterType];
        excludeFilters = [];
      }
    } else {
      return NextResponse.json({ error: "include or segment param required" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    // Resolve event slug (needed for popup_signups)
    let eventSlug: string | null = null;
    if (eventId) {
      const { data: ev } = await supabase
        .from(TABLES.EVENTS)
        .select("slug")
        .eq("id", eventId)
        .eq("org_id", orgId)
        .single();
      eventSlug = ev?.slug || null;
    }

    // Fetch all requested filter sets in parallel
    const filterResults = await Promise.all(
      [...includeFilters, ...excludeFilters].map((f) =>
        fetchFilterEmails(supabase, orgId, f, eventId, eventSlug)
      )
    );

    // Split into include and exclude sets
    const includeSets = filterResults.slice(0, includeFilters.length);
    const excludeSets = filterResults.slice(includeFilters.length);

    // Union all include sets
    const includeMap = new Map<string, AudienceMember>();
    for (const set of includeSets) {
      for (const member of set) {
        const key = member.email.toLowerCase();
        if (!includeMap.has(key)) {
          includeMap.set(key, member);
        }
      }
    }

    // Build exclude email set
    const excludeEmails = new Set<string>();
    for (const set of excludeSets) {
      for (const member of set) {
        excludeEmails.add(member.email.toLowerCase());
      }
    }

    // Fetch all emails with marketing consent (GDPR compliance)
    const { data: consentedCustomers } = await supabase
      .from(TABLES.CUSTOMERS)
      .select("email")
      .eq("org_id", orgId)
      .eq("marketing_consent", true);

    const consentedEmails = new Set(
      (consentedCustomers || []).map((c: { email: string }) => c.email?.toLowerCase())
    );

    // Final audience = include minus exclude, filtered to marketing consent only
    const audience = [...includeMap.values()].filter(
      (m) => !excludeEmails.has(m.email.toLowerCase()) && consentedEmails.has(m.email.toLowerCase())
    );

    // CSV format
    if (format === "csv") {
      const header = "email,first_name,last_name";
      const rows = audience.map(
        (a) => `${csvEscape(a.email)},${csvEscape(a.first_name)},${csvEscape(a.last_name)}`
      );
      const csv = [header, ...rows].join("\n");
      const filename = includeFilters.join("+") + (excludeFilters.length ? `_minus_${excludeFilters.join("+")}` : "");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}_${eventId || "all"}.csv"`,
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

/**
 * Fetch emails for a single filter type.
 */
async function fetchFilterEmails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  filter: FilterType,
  eventId: string | null,
  eventSlug: string | null,
): Promise<AudienceMember[]> {
  switch (filter) {
    case "all_customers": {
      const { data } = await supabase
        .from(TABLES.CUSTOMERS)
        .select("email, first_name, last_name")
        .eq("org_id", orgId)
        .eq("marketing_consent", true);

      return dedup(
        (data || []).map((c: { email: string; first_name: string; last_name: string }) => ({
          email: c.email,
          first_name: c.first_name || "",
          last_name: c.last_name || "",
        }))
      );
    }

    case "popup_signups": {
      if (!eventSlug) return [];

      const { data } = await supabase
        .from(TABLES.POPUP_EVENTS)
        .select("email")
        .eq("org_id", orgId)
        .eq("event_type", "conversions")
        .like("page", `%${eventSlug}%`)
        .not("email", "is", null)
        .neq("email", "");

      const uniqueEmails = dedup(
        (data || []).map((p: { email: string }) => ({ email: p.email, first_name: "", last_name: "" }))
      );

      // Enrich with customer names
      if (uniqueEmails.length > 0) {
        const { data: customers } = await supabase
          .from(TABLES.CUSTOMERS)
          .select("email, first_name, last_name")
          .eq("org_id", orgId)
          .in("email", uniqueEmails.map((m) => m.email));

        const nameMap = new Map<string, { email: string; first_name: string; last_name: string }>(
          (customers || []).map((c: { email: string; first_name: string; last_name: string }) => [
            c.email.toLowerCase(),
            c,
          ])
        );

        return uniqueEmails.map((m) => {
          const c = nameMap.get(m.email.toLowerCase());
          return { email: m.email, first_name: c?.first_name || "", last_name: c?.last_name || "" };
        });
      }
      return [];
    }

    case "abandoned_carts": {
      if (!eventId) return [];
      const { data } = await supabase
        .from(TABLES.ABANDONED_CARTS)
        .select("email, first_name, last_name")
        .eq("org_id", orgId)
        .eq("event_id", eventId)
        .eq("status", "abandoned");

      return dedup(
        (data || []).map((c: { email: string; first_name: string; last_name: string }) => ({
          email: c.email,
          first_name: c.first_name || "",
          last_name: c.last_name || "",
        }))
      );
    }

    case "interest_signups": {
      if (!eventId) return [];
      const { data } = await supabase
        .from(TABLES.EVENT_INTEREST_SIGNUPS)
        .select("email, first_name")
        .eq("org_id", orgId)
        .eq("event_id", eventId)
        .is("unsubscribed_at", null);

      return dedup(
        (data || []).map((s: { email: string; first_name: string }) => ({
          email: s.email,
          first_name: s.first_name || "",
          last_name: "",
        }))
      );
    }

    case "purchased": {
      if (!eventId) return [];
      // Orders link to customers via customer_id, not email directly
      const { data } = await supabase
        .from(TABLES.ORDERS)
        .select("customer:customers(email, first_name, last_name)")
        .eq("org_id", orgId)
        .eq("event_id", eventId)
        .in("status", ["completed", "confirmed"]);

      return dedup(
        (data || [])
          .filter((o: { customer: { email: string } | null }) => o.customer?.email)
          .map((o: { customer: { email: string; first_name: string; last_name: string } }) => ({
            email: o.customer.email,
            first_name: o.customer.first_name || "",
            last_name: o.customer.last_name || "",
          }))
      );
    }

    case "guest_list": {
      if (!eventId) return [];
      const { data } = await supabase
        .from(TABLES.GUEST_LIST)
        .select("email")
        .eq("org_id", orgId)
        .eq("event_id", eventId)
        .not("email", "is", null);

      return dedup(
        (data || []).map((g: { email: string }) => ({
          email: g.email,
          first_name: "",
          last_name: "",
        }))
      );
    }

    default:
      return [];
  }
}

function dedup(members: AudienceMember[]): AudienceMember[] {
  const seen = new Set<string>();
  return members.filter((m) => {
    const key = m.email?.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function csvEscape(value: string): string {
  if (!value) return "";
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
