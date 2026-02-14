/**
 * Seed script — bulk-insert ambassador discount codes into the discounts table.
 *
 * Usage:
 *   node --env-file=.env.local --import=tsx scripts/seed-discount-codes.ts
 *   # or:  npx tsx scripts/seed-discount-codes.ts  (if env vars already set)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ORG_ID = "feral";
const TABLE = "discounts";

// All 27 ambassador codes — 15% off, no restrictions
const CODES = [
  "JAMES15",
  "GRACE15",
  "IZZY15",
  "KUSH15",
  "MAYA15",
  "LOLA15",
  "ANDIE15",
  "MARSHALL15",
  "JORDAN15",
  "ELLAMAY15",
  "GEORGIABELL15",
  "ANDYK15",
  "SAMENGLE15",
  "DAVID15",
  "COREY15",
  "GRACIE15",
  "CHARLI15",
  "KASEY15",
  "KSUSHA15",
  "REECEWB15",
  "JACKH15",
  "KIERENF15",
  "ANDREW15",
  "ARCHIEP15",
  "ABBEY15",
  "CAOIMHE15",
  "LEYTON15",
];

async function seed() {
  console.log(`Seeding ${CODES.length} discount codes...`);

  const rows = CODES.map((code) => ({
    org_id: ORG_ID,
    code,
    description: `Ambassador code – ${code.replace("15", "")}`,
    type: "percentage" as const,
    value: 15,
    min_order_amount: null,
    max_uses: null,
    used_count: 0,
    applicable_event_ids: null,
    starts_at: null,
    expires_at: null,
    status: "active" as const,
  }));

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "org_id,code", ignoreDuplicates: true })
    .select("id, code");

  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  console.log(`Done — ${data?.length ?? 0} codes inserted/verified:`);
  data?.forEach((d) => console.log(`  ✓ ${d.code}`));
}

seed();
