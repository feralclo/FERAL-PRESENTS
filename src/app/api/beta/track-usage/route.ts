import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface InviteCode {
  code: string;
  label?: string;
  created_at: string;
  created_for?: string;
  used: boolean;
  used_by?: string;
  used_at?: string;
  source: "generated" | "application";
}

/**
 * POST — Track invite code usage after signup.
 * Called from the signup page after a successful account creation.
 * Public endpoint (no auth required — the user just created their account).
 */
export async function POST(request: NextRequest) {
  try {
    const { code, email } = await request.json();

    if (!code || !email) {
      return NextResponse.json({ ok: true }); // fail silently
    }

    const normalised = code.trim().toUpperCase();
    const normalisedEmail = email.trim().toLowerCase();

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ ok: true });
    }

    const { data } = await supabase
      .from("site_settings")
      .select("data")
      .eq("key", "platform_beta_invite_codes")
      .single();

    const codes = (data?.data as InviteCode[]) || [];
    const match = codes.find((c) => c.code.toUpperCase() === normalised);

    if (match) {
      match.used = true;
      match.used_by = normalisedEmail;
      match.used_at = new Date().toISOString();

      await supabase.from("site_settings").upsert(
        {
          key: "platform_beta_invite_codes",
          data: codes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // never fail visibly
  }
}
