import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Hardcoded invite codes (always valid).
 * Add or remove codes here. Share them with promoters you want
 * to let in immediately.
 *
 * Codes are case-insensitive.
 */
const HARDCODED_CODES = new Set(
  [
    "ENTRY-FOUNDING",
    "ENTRY-VIP-2026",
    "PROMOTER-001",
  ].map((c) => c.toUpperCase())
);

const limiter = createRateLimiter("beta-verify-code", {
  limit: 10,
  windowSeconds: 300, // 10 attempts per 5 minutes
});

export async function POST(request: NextRequest) {
  const blocked = limiter(request);
  if (blocked) return blocked;

  try {
    const { code } = await request.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json({ valid: false });
    }

    const normalised = code.trim().toUpperCase();

    // Check hardcoded codes first
    if (HARDCODED_CODES.has(normalised)) {
      return NextResponse.json({ valid: true });
    }

    // Check dynamically generated codes (from accepting applications)
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from("site_settings")
        .select("data")
        .eq("key", "platform_beta_invite_codes")
        .single();

      const codes = (data?.data as { code: string; used: boolean }[]) || [];
      const match = codes.find(
        (c) => c.code.toUpperCase() === normalised && !c.used
      );

      if (match) {
        // Mark as used
        match.used = true;
        await supabase.from("site_settings").upsert(
          {
            key: "platform_beta_invite_codes",
            data: codes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
        return NextResponse.json({ valid: true });
      }
    }

    // Small delay to prevent brute force
    await new Promise((r) => setTimeout(r, 300));

    return NextResponse.json({ valid: false });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
