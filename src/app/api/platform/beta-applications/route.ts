import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface BetaApplication {
  id: string;
  company_name: string;
  email: string;
  event_types: string[];
  monthly_events: string | null;
  audience_size: string | null;
  status: "pending" | "accepted" | "rejected";
  invite_code?: string;
  applied_at: string;
  reviewed_at?: string;
}

/** GET — list all beta applications */
export async function GET() {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data } = await supabase
    .from("site_settings")
    .select("data")
    .eq("key", "platform_beta_applications")
    .single();

  const applications = ((data?.data as BetaApplication[]) || []).sort(
    (a, b) =>
      new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
  );

  const stats = {
    total: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    accepted: applications.filter((a) => a.status === "accepted").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };

  return NextResponse.json({ applications, stats });
}

/** POST — accept or reject an application */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { id, action } = await request.json();

  if (!id || !["accept", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid request — need id and action (accept/reject)" },
      { status: 400 }
    );
  }

  // Load applications
  const { data: existing } = await supabase
    .from("site_settings")
    .select("data")
    .eq("key", "platform_beta_applications")
    .single();

  const applications = (existing?.data as BetaApplication[]) || [];
  const appIndex = applications.findIndex((a) => a.id === id);

  if (appIndex === -1) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 }
    );
  }

  const app = applications[appIndex];

  if (action === "accept") {
    // Generate a unique invite code for this applicant
    const code = `ENTRY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    app.status = "accepted";
    app.invite_code = code;
    app.reviewed_at = new Date().toISOString();

    // Also store the code in the invite codes list so it can be verified
    const { data: codesData } = await supabase
      .from("site_settings")
      .select("data")
      .eq("key", "platform_beta_invite_codes")
      .single();

    const codes = ((codesData?.data as Record<string, unknown>[]) || []);
    codes.push({
      code,
      created_for: app.email,
      created_at: new Date().toISOString(),
      used: false,
    });

    await supabase.from("site_settings").upsert(
      {
        key: "platform_beta_invite_codes",
        data: codes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  } else {
    app.status = "rejected";
    app.reviewed_at = new Date().toISOString();
  }

  applications[appIndex] = app;

  await supabase.from("site_settings").upsert(
    {
      key: "platform_beta_applications",
      data: applications,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  return NextResponse.json({
    success: true,
    application: app,
  });
}
