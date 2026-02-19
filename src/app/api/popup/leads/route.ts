import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/popup/leads — Captured leads from popup conversions
 *
 * Returns popup conversion events that have an email, enriched with:
 * - Event name (resolved from page slug)
 * - Customer data (matched by email)
 * - Streak (consecutive days with conversions)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    // Fetch conversion events with email
    const { data: conversions, error: convErr, count } = await supabase
      .from(TABLES.POPUP_EVENTS)
      .select("id, email, city, country, page, timestamp", { count: "exact" })
      .eq("org_id", ORG_ID)
      .eq("event_type", "conversions")
      .not("email", "is", null)
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);

    if (convErr) {
      return NextResponse.json({ error: convErr.message }, { status: 500 });
    }

    if (!conversions || conversions.length === 0) {
      // Still calculate total_captures and streak even with no paginated results
      const { count: totalCaptures } = await supabase
        .from(TABLES.POPUP_EVENTS)
        .select("*", { count: "exact", head: true })
        .eq("org_id", ORG_ID)
        .eq("event_type", "conversions")
        .not("email", "is", null);

      const streak = await calculateStreak(supabase);

      return NextResponse.json({
        leads: [],
        total: count || 0,
        total_captures: totalCaptures || 0,
        streak,
        page,
        limit,
      });
    }

    // Batch: extract unique slugs from page paths → resolve event names
    const slugs = new Set<string>();
    for (const c of conversions) {
      const match = c.page?.match(/\/event\/([^/]+)/);
      if (match) slugs.add(match[1]);
    }

    let slugNameMap: Record<string, string> = {};
    if (slugs.size > 0) {
      const { data: events } = await supabase
        .from(TABLES.EVENTS)
        .select("slug, name")
        .eq("org_id", ORG_ID)
        .in("slug", [...slugs]);
      if (events) {
        slugNameMap = Object.fromEntries(events.map((e) => [e.slug, e.name]));
      }
    }

    // Batch: collect unique emails → match customers
    const emails = [...new Set(conversions.map((c) => c.email?.toLowerCase()).filter(Boolean))];
    let emailCustomerMap: Record<string, { id: string; first_name: string | null; last_name: string | null; nickname: string | null; city: string | null; country: string | null; total_orders: number; total_spent: number }> = {};
    if (emails.length > 0) {
      const { data: customers } = await supabase
        .from(TABLES.CUSTOMERS)
        .select("id, email, first_name, last_name, nickname, city, country, total_orders, total_spent")
        .eq("org_id", ORG_ID)
        .in("email", emails);
      if (customers) {
        emailCustomerMap = Object.fromEntries(
          customers.map((c) => [c.email.toLowerCase(), {
            id: c.id,
            first_name: c.first_name || null,
            last_name: c.last_name || null,
            nickname: c.nickname || null,
            city: c.city || null,
            country: c.country || null,
            total_orders: c.total_orders,
            total_spent: c.total_spent,
          }])
        );
      }
    }

    // Calculate streak
    const streak = await calculateStreak(supabase);

    // Get total captures count (may differ from paginated count)
    const { count: totalCaptures } = await supabase
      .from(TABLES.POPUP_EVENTS)
      .select("*", { count: "exact", head: true })
      .eq("org_id", ORG_ID)
      .eq("event_type", "conversions")
      .not("email", "is", null);

    // Build enriched leads
    const leads = conversions.map((c) => {
      const slugMatch = c.page?.match(/\/event\/([^/]+)/);
      const slug = slugMatch ? slugMatch[1] : null;
      const eventName = slug ? slugNameMap[slug] || slug : null;
      const customer = c.email ? emailCustomerMap[c.email.toLowerCase()] || null : null;

      return {
        id: c.id,
        email: c.email,
        city: c.city || null,
        country: c.country || null,
        timestamp: c.timestamp,
        event_name: eventName,
        customer,
      };
    });

    return NextResponse.json({
      leads,
      total: count || 0,
      total_captures: totalCaptures || 0,
      streak,
      page,
      limit,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Calculate streak: consecutive days (backward from today) with at least one conversion.
 */
async function calculateStreak(supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>) {
  if (!supabase) return 0;

  const { data: recent } = await supabase
    .from(TABLES.POPUP_EVENTS)
    .select("timestamp")
    .eq("org_id", ORG_ID)
    .eq("event_type", "conversions")
    .not("email", "is", null)
    .order("timestamp", { ascending: false })
    .limit(200);

  if (!recent || recent.length === 0) return 0;

  // Extract unique dates (YYYY-MM-DD in local timezone approximation)
  const uniqueDates = [...new Set(
    recent.map((r) => r.timestamp.slice(0, 10))
  )].sort().reverse();

  if (uniqueDates.length === 0) return 0;

  // Count consecutive days backward from today
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  const startDate = new Date(today);

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().slice(0, 10);
    if (uniqueDates.includes(dateStr)) {
      streak++;
    } else if (i === 0) {
      // Today doesn't have conversions yet — that's ok, check yesterday
      continue;
    } else {
      break;
    }
  }

  return streak;
}
