import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface InviteCode {
  code: string;
  label: string;
  created_at: string;
  created_for?: string; // email (from accepting applications)
  used: boolean;
  used_by?: string; // email of who signed up with it
  used_at?: string;
  source: "generated" | "application"; // how the code was created
}

/** GET — list all invite codes with usage info */
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
    .eq("key", "platform_beta_invite_codes")
    .single();

  const codes = ((data?.data as InviteCode[]) || []).sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const stats = {
    total: codes.length,
    used: codes.filter((c) => c.used).length,
    unused: codes.filter((c) => !c.used).length,
    generated: codes.filter((c) => c.source === "generated").length,
    from_applications: codes.filter((c) => c.source === "application").length,
  };

  return NextResponse.json({ codes, stats });
}

/** POST — generate new invite codes */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { label, count = 1 } = await request.json();

  if (!label || typeof label !== "string") {
    return NextResponse.json(
      { error: "Label is required" },
      { status: 400 }
    );
  }

  const generateCount = Math.min(Math.max(1, Number(count)), 20); // 1-20 at a time

  // Load existing codes
  const { data: existing } = await supabase
    .from("site_settings")
    .select("data")
    .eq("key", "platform_beta_invite_codes")
    .single();

  const codes = (existing?.data as InviteCode[]) || [];
  const newCodes: InviteCode[] = [];

  for (let i = 0; i < generateCount; i++) {
    const code = `ENTRY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const newCode: InviteCode = {
      code,
      label: label.trim(),
      created_at: new Date().toISOString(),
      used: false,
      source: "generated",
    };
    codes.push(newCode);
    newCodes.push(newCode);
  }

  await supabase.from("site_settings").upsert(
    {
      key: "platform_beta_invite_codes",
      data: codes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  return NextResponse.json({
    success: true,
    codes: newCodes,
  });
}
