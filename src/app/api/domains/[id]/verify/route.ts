import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { verifyDomainOnVercel } from "@/lib/vercel-domains";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/domains/[id]/verify — Recheck domain verification status.
 * Calls Vercel API to verify DNS configuration, updates domain status.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
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
      { error: "Subdomain verification is not needed" },
      { status: 400 }
    );
  }

  try {
    const result = await verifyDomainOnVercel(domain.hostname);

    if (result.verified) {
      await supabase
        .from(TABLES.DOMAINS)
        .update({
          status: "active",
          verification_reason: null,
        })
        .eq("id", id);

      return NextResponse.json({
        domain: { ...domain, status: "active", verification_reason: null },
        verified: true,
      });
    }

    // Not yet verified — update verification details
    const updates: Record<string, string | null> = { status: "pending" };
    if (result.verification && result.verification.length > 0) {
      const v = result.verification[0];
      updates.verification_type = v.type;
      updates.verification_domain = v.domain;
      updates.verification_value = v.value;
      updates.verification_reason = v.reason;
    }

    await supabase.from(TABLES.DOMAINS).update(updates).eq("id", id);

    return NextResponse.json({
      domain: { ...domain, ...updates },
      verified: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
