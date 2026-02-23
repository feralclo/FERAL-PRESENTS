import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import type { Rep } from "@/types/reps";

/**
 * GET /api/reps — List reps with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const eventId = searchParams.get("event_id");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20", 10)), 200);
    const offset = (page - 1) * limit;

    let query = supabase
      .from(TABLES.REPS)
      .select("*", { count: "exact" })
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      // Sanitize search to prevent Supabase filter syntax injection
      const sanitized = search.replace(/[%_,().*]/g, "");
      if (sanitized.length > 0) {
        query = query.or(
          `first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,display_name.ilike.%${sanitized}%`
        );
      }
    }

    if (eventId) {
      // Get rep IDs assigned to this event, then filter
      const { data: assignments } = await supabase
        .from(TABLES.REP_EVENTS)
        .select("rep_id")
        .eq("org_id", orgId)
        .eq("event_id", eventId);

      if (assignments && assignments.length > 0) {
        const repIds = assignments.map((a: { rep_id: string }) => a.rep_id);
        query = query.in("id", repIds);
      } else {
        // No reps assigned to this event
        return NextResponse.json({ data: [], total: 0, page, limit });
      }
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: (data as Rep[]) || [],
      total: count || 0,
      page,
      limit,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/reps — Create a rep manually (admin)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const {
      email,
      first_name,
      last_name,
      display_name,
      phone,
      gender,
      instagram,
      tiktok,
      bio,
      status = "active",
    } = body;

    if (!email || !first_name) {
      return NextResponse.json(
        { error: "Missing required fields: email, first_name" },
        { status: 400 }
      );
    }

    if (!["pending", "active", "suspended", "deactivated"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'pending', 'active', 'suspended', or 'deactivated'" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Check for duplicate email
    const { data: existing } = await supabase
      .from(TABLES.REPS)
      .select("id")
      .eq("org_id", orgId)
      .ilike("email", email.trim())
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "A rep with this email already exists" },
        { status: 409 }
      );
    }

    const invite_token = crypto.randomUUID();

    const { data, error } = await supabase
      .from(TABLES.REPS)
      .insert({
        org_id: orgId,
        email: email.trim().toLowerCase(),
        first_name: first_name.trim(),
        last_name: last_name?.trim() || "",
        display_name: display_name?.trim() || null,
        phone: phone?.trim() || null,
        gender: gender || null,
        instagram: instagram?.trim() || null,
        tiktok: tiktok?.trim() || null,
        bio: bio?.trim() || null,
        status,
        invite_token,
        points_balance: 0,
        total_sales: 0,
        total_revenue: 0,
        level: 1,
        onboarding_completed: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
