import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/discounts/seed — One-time bulk insert of ambassador discount codes.
 * Requires admin auth. Safe to run multiple times (skips existing codes).
 */
export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const CODES = [
      "JAMES15", "GRACE15", "IZZY15", "KUSH15", "MAYA15", "LOLA15",
      "ANDIE15", "MARSHALL15", "JORDAN15", "ELLAMAY15", "GEORGIABELL15",
      "ANDYK15", "SAMENGLE15", "DAVID15", "COREY15", "GRACIE15",
      "CHARLI15", "KASEY15", "KSUSHA15", "REECEWB15", "JACKH15",
      "KIERENF15", "ANDREW15", "ARCHIEP15", "ABBEY15", "CAOIMHE15",
      "LEYTON15",
    ];

    // Check which codes already exist
    const { data: existing } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("code")
      .eq("org_id", ORG_ID)
      .in("code", CODES);

    const existingCodes = new Set((existing || []).map((d) => d.code));
    const newCodes = CODES.filter((c) => !existingCodes.has(c));

    if (newCodes.length === 0) {
      return NextResponse.json({
        message: "All codes already exist",
        existing: CODES.length,
        inserted: 0,
      });
    }

    const rows = newCodes.map((code) => ({
      org_id: ORG_ID,
      code,
      description: `Ambassador code – ${code.replace("15", "")}`,
      type: "percentage",
      value: 15,
      min_order_amount: null,
      max_uses: null,
      used_count: 0,
      applicable_event_ids: null,
      starts_at: null,
      expires_at: null,
      status: "active",
    }));

    const { data, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .insert(rows)
      .select("id, code");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Inserted ${data?.length ?? 0} discount codes`,
      inserted: data?.length ?? 0,
      skipped: existingCodes.size,
      codes: data?.map((d) => d.code),
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
