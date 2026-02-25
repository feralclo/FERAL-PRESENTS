import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter("beta-apply", {
  limit: 5,
  windowSeconds: 3600, // 5 per hour
});

export async function POST(request: NextRequest) {
  const blocked = limiter(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const { company_name, email, event_types, monthly_events, audience_size } =
      body;

    if (!company_name || !email) {
      return NextResponse.json(
        { error: "Company name and email are required" },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!email.includes("@") || !email.includes(".")) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Load existing applications
    const { data: existing } = await supabase
      .from("site_settings")
      .select("data")
      .eq("key", "platform_beta_applications")
      .single();

    const applications = (existing?.data as Record<string, unknown>[]) || [];

    // Check for duplicate email
    const isDuplicate = applications.some(
      (app: Record<string, unknown>) =>
        (app.email as string)?.toLowerCase() === email.toLowerCase()
    );
    if (isDuplicate) {
      // Return success anyway — don't reveal existing applications
      return NextResponse.json({
        success: true,
        position: applications.length,
        message: "Application received",
      });
    }

    const application = {
      id: crypto.randomUUID(),
      company_name: company_name.trim(),
      email: email.toLowerCase().trim(),
      event_types: event_types || [],
      monthly_events: monthly_events || null,
      audience_size: audience_size || null,
      status: "pending",
      applied_at: new Date().toISOString(),
    };

    applications.push(application);

    // Upsert into site_settings
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
      position: applications.length,
      message: "Application received",
    });
  } catch (error) {
    console.error("Beta application error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
