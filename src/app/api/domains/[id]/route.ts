import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { removeDomainFromVercel } from "@/lib/vercel-domains";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/domains/[id] — Set a domain as primary (or unset primary).
 * Only active domains can be set as primary.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const isPrimary = body.is_primary === true;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Verify domain belongs to this org
  const { data: domain } = await supabase
    .from(TABLES.DOMAINS)
    .select("*")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .single();

  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  if (isPrimary && domain.status !== "active") {
    return NextResponse.json(
      { error: "Only verified (active) domains can be set as primary" },
      { status: 400 }
    );
  }

  if (isPrimary) {
    // Unset previous primary
    await supabase
      .from(TABLES.DOMAINS)
      .update({ is_primary: false })
      .eq("org_id", auth.orgId)
      .eq("is_primary", true);
  }

  // Set new value
  const { data: updated, error } = await supabase
    .from(TABLES.DOMAINS)
    .update({ is_primary: isPrimary })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ domain: updated });
}

/**
 * DELETE /api/domains/[id] — Remove a custom domain.
 * Cannot delete subdomain (default) domains.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Verify domain belongs to this org
  const { data: domain } = await supabase
    .from(TABLES.DOMAINS)
    .select("*")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .single();

  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  if (domain.type === "subdomain") {
    return NextResponse.json(
      { error: "Cannot delete the default subdomain" },
      { status: 400 }
    );
  }

  // Remove from Vercel (best-effort — still delete from DB even if Vercel fails)
  try {
    await removeDomainFromVercel(domain.hostname);
  } catch {
    // Log but continue — domain should be removed from our DB regardless
  }

  const { error } = await supabase
    .from(TABLES.DOMAINS)
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
