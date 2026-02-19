import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

type SortOption = "newest" | "most_spent" | "most_orders" | "oldest";

const SORT_MAP: Record<SortOption, { column: string; ascending: boolean }> = {
  newest: { column: "created_at", ascending: false },
  most_spent: { column: "total_spent", ascending: false },
  most_orders: { column: "total_orders", ascending: false },
  oldest: { column: "created_at", ascending: true },
};

/**
 * GET /api/customers — List customers with optional search, sort, and date filter
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = (page - 1) * limit;
    const sort = (searchParams.get("sort") || "newest") as SortOption;
    const since = searchParams.get("since");

    const sortConfig = SORT_MAP[sort] || SORT_MAP.newest;

    let query = supabase
      .from(TABLES.CUSTOMERS)
      .select("*", { count: "exact" })
      .eq("org_id", ORG_ID)
      .order(sortConfig.column, { ascending: sortConfig.ascending, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(
        `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
      );
    }

    if (since) {
      query = query.gte("created_at", since);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
