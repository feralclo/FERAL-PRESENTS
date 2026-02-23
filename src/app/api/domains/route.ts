import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { addDomainToVercel } from "@/lib/vercel-domains";

/**
 * GET /api/domains — List all domains for the authenticated org.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from(TABLES.DOMAINS)
    .select("*")
    .eq("org_id", auth.orgId)
    .order("type", { ascending: true })
    .order("hostname", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ domains: data });
}

/**
 * POST /api/domains — Add a custom domain.
 * Validates hostname, checks uniqueness, adds to Vercel, stores verification details.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await request.json();
  const hostname = (body.hostname || "").trim().toLowerCase();

  // Validate hostname format
  if (!hostname || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(hostname)) {
    return NextResponse.json(
      { error: "Invalid hostname. Use a valid domain like tickets.mybrand.com" },
      { status: 400 }
    );
  }

  // Block reserved hostnames
  if (hostname.endsWith(".entry.events")) {
    return NextResponse.json(
      { error: "Cannot add entry.events subdomains — these are managed automatically" },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Check hostname not already taken
  const { data: existing } = await supabase
    .from(TABLES.DOMAINS)
    .select("id, org_id")
    .eq("hostname", hostname)
    .limit(1);

  if (existing && existing.length > 0) {
    const owner = existing[0].org_id === auth.orgId ? "your organization" : "another organization";
    return NextResponse.json(
      { error: `This hostname is already registered by ${owner}` },
      { status: 409 }
    );
  }

  // Insert with pending status
  const { data: domain, error: insertError } = await supabase
    .from(TABLES.DOMAINS)
    .insert({
      org_id: auth.orgId,
      hostname,
      is_primary: false,
      type: "custom",
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Add to Vercel and store verification challenges
  try {
    const vercelResult = await addDomainToVercel(hostname);

    if (vercelResult.verified) {
      await supabase
        .from(TABLES.DOMAINS)
        .update({ status: "active" })
        .eq("id", domain.id);
      domain.status = "active";
    } else if (vercelResult.verification && vercelResult.verification.length > 0) {
      const v = vercelResult.verification[0];
      await supabase
        .from(TABLES.DOMAINS)
        .update({
          verification_type: v.type,
          verification_domain: v.domain,
          verification_value: v.value,
          verification_reason: v.reason,
        })
        .eq("id", domain.id);
      domain.verification_type = v.type;
      domain.verification_domain = v.domain;
      domain.verification_value = v.value;
      domain.verification_reason = v.reason;
    }
  } catch (err) {
    // Vercel API failed — keep the row but note the issue
    const message = err instanceof Error ? err.message : "Vercel API error";
    await supabase
      .from(TABLES.DOMAINS)
      .update({ status: "failed", verification_reason: message })
      .eq("id", domain.id);
    domain.status = "failed";
    domain.verification_reason = message;
  }

  return NextResponse.json({ domain }, { status: 201 });
}
