/**
 * One-off: insert a real quest under FERAL PRESENTS and fire a reward_drop
 * push at EntryReviewer using the same createNotification → fanoutPush
 * code path the production API uses.
 *
 * Run: `dotenv -e .env.production-test -- npx tsx scripts/fire-test-quest-push.ts`
 *   (or set the env vars however you prefer)
 *
 * Why this exists: the admin POST /api/reps/quests endpoint requires
 * `requireAuth()` (admin Supabase session). We don't have an easy way to
 * forge that from a CLI, so we replicate the relevant slice of the route
 * handler here against the prod env. The DB writes + APNs delivery hit the
 * same prod resources as a real admin would.
 */

// Load .env.production-test via dotenv so escape sequences inside quoted
// values (e.g. \n in APNS_AUTH_KEY_P8) decode to real newlines, the way
// Node + Vercel's runtime does. `bash source` doesn't do this and loads
// literal "\n" text — which makes the PEM unparseable and the JWT
// signing throws "DECODER routines::unsupported".
//
// IMPORTANT: ESM hoists static `import` above all other code, so we have
// to dynamic-import the project modules INSIDE main() — otherwise
// lib/constants.ts evaluates SUPABASE_URL = process.env.NEXT_PUBLIC_…
// before dotenv has run, and getSupabaseAdmin() comes back null.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.production-test" });

const REP_ID = "acf9ba3a-f7d3-422e-ac09-3d038360c2e6"; // EntryReviewer
const PROMOTER_ID = "102191df-ba1c-4a7a-ad68-2bae0451db86"; // FERAL PRESENTS
const ORG_ID = "feral";

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { createNotification } = await import("../src/lib/rep-notifications");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Insert the quest. Mirrors the shape POST /api/reps/quests writes,
  // minus the platform XP lookup (we hardcode small rewards).
  const { data: quest, error: qErr } = await db
    .from("rep_quests")
    .insert({
      org_id: ORG_ID,
      promoter_id: PROMOTER_ID,
      title: "Welcome — first push test",
      subtitle: "Tap to confirm pushes are landing",
      description:
        "This quest exists to verify APNs delivery end-to-end. No action required — your phone should buzz when this is created.",
      quest_type: "custom",
      platform: "instagram",
      proof_type: "none",
      points_reward: 25,
      xp_reward: 25,
      currency_reward: 0,
      ep_reward: 0,
      auto_approve: false,
      max_completions: null,
      max_total: null,
      total_completed: 0,
      status: "active",
      notify_reps: true,
    })
    .select()
    .single();

  if (qErr || !quest) {
    throw new Error(`quest insert failed: ${qErr?.message}`);
  }
  console.log(`[ok] quest inserted: ${quest.id} — "${quest.title}"`);

  // 2. Fire the push (and write the in-app rep_notifications row) — same
  // call the API route makes for each targeted rep.
  await createNotification({
    repId: REP_ID,
    orgId: ORG_ID,
    type: "reward_drop",
    title: quest.title,
    body: quest.subtitle ?? quest.description ?? undefined,
    link: `/rep/quests/${quest.id}`,
    metadata: {
      quest_id: quest.id,
      promoter_id: PROMOTER_ID,
      xp_reward: quest.xp_reward ?? quest.points_reward ?? 0,
      ep_reward: quest.ep_reward ?? quest.currency_reward ?? 0,
    },
  });

  console.log(`[ok] createNotification dispatched for rep ${REP_ID}`);
  console.log(
    `[ok] check Supabase: SELECT * FROM notification_deliveries WHERE notification_id IN (SELECT id FROM rep_notifications WHERE rep_id='${REP_ID}' ORDER BY created_at DESC LIMIT 1);`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
