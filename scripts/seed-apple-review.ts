/**
 * Seed the Apple App Review demo account + supporting data for App Store
 * Connect. Re-runnable: each invocation wipes prior seeded submissions
 * and points_log entries for the reviewer + its throwaway friends, then
 * rebuilds state so ASC reviewers land on a populated Home / Quests /
 * Leaderboard.
 *
 * Usage:
 *   pnpm tsx scripts/seed-apple-review.ts
 *
 * Env (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APPLE_REVIEW_PASSWORD   (optional — generated if unset; printed at the end)
 *
 * On success the script prints the reviewer email + password as JSON so
 * you can paste it into App Store Connect and into the team 1Password
 * sealed note. Add APPLE_REVIEW_PASSWORD to Vercel env as a follow-up.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Run with: pnpm tsx scripts/seed-apple-review.ts (loads .env.local via tsx)."
  );
  process.exit(1);
}

const REVIEW_EMAIL = "apple-review@entry.events";
const FERAL_ORG_ID = "feral";
const FERAL_PROMOTER_ID = "102191df-ba1c-4a7a-ad68-2bae0451db86";

// Public deterministic DiceBear avatar — unsigned, always-reachable, serves
// PNG so it works with iOS ImageKit decoders (no CORS concerns via SDWebImage).
const REVIEWER_PHOTO_URL =
  "https://api.dicebear.com/9.x/initials/png?seed=Entry%20Reviewer&backgroundColor=6d28d9&textColor=ffffff&radius=50";

const FRIENDS: Array<{
  email: string;
  first: string;
  last: string;
  display: string;
  initialBalance: number;
}> = [
  {
    email: "apple-review-friend-1@entry.events",
    first: "Alex",
    last: "Reviewer",
    display: "Alex (demo)",
    initialBalance: 120,
  },
  {
    email: "apple-review-friend-2@entry.events",
    first: "Jordan",
    last: "Reviewer",
    display: "Jordan (demo)",
    initialBalance: 60,
  },
];

const SEED_MARKER = "apple-review-seed";

const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function generatePassword(): string {
  // 20-ish chars, alphanumeric + a guaranteed uppercase + digit + symbol so
  // ASC's "make sure it's strong" heuristic accepts it without argument.
  const body = randomBytes(18).toString("base64").replace(/[+/=]/g, "");
  return `${body.slice(0, 18)}A9!`;
}

async function findAuthUserByEmail(email: string): Promise<string | null> {
  // supabase-js doesn't expose a filter-by-email on admin.listUsers, so we
  // page through. At our size (~low thousands) one or two pages is plenty.
  let page = 1;
  const perPage = 200;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const hit = data?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (hit) return hit.id;
    if (!data?.users || data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}

async function ensureAuthUser(email: string, password: string): Promise<string> {
  const existingId = await findAuthUserByEmail(email);
  if (existingId) {
    const { error } = await supabase.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return existingId;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

type RepInsert = {
  authUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  bio: string | null;
  instagram: string | null;
  tiktok: string | null;
  photoUrl: string | null;
  pointsBalance: number;
};

async function upsertRep(p: RepInsert): Promise<string> {
  const row = {
    auth_user_id: p.authUserId,
    email: p.email,
    first_name: p.firstName,
    last_name: p.lastName,
    display_name: p.displayName,
    bio: p.bio,
    instagram: p.instagram,
    tiktok: p.tiktok,
    photo_url: p.photoUrl,
    // reps.status enum is pending|active|suspended|deactivated|deleted —
    // "active" is the green-lit state (membership-level approval is on
    // rep_promoter_memberships.status below).
    status: "active",
    onboarding_completed: true,
    points_balance: p.pointsBalance,
    org_id: FERAL_ORG_ID,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("reps")
    .select("id")
    .eq("email", p.email)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("reps")
      .update(row)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
  const { data, error } = await supabase
    .from("reps")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureFeralMembership(repId: string) {
  const { data: existing } = await supabase
    .from("rep_promoter_memberships")
    .select("id, status")
    .eq("rep_id", repId)
    .eq("promoter_id", FERAL_PROMOTER_ID)
    .maybeSingle();

  const payload = {
    rep_id: repId,
    promoter_id: FERAL_PROMOTER_ID,
    status: "approved",
    approved_at: new Date().toISOString(),
    pitch: "Seeded account for Apple App Review. Do not remove.",
  };

  if (existing) {
    await supabase
      .from("rep_promoter_memberships")
      .update(payload)
      .eq("id", existing.id);
    return;
  }
  const { error } = await supabase
    .from("rep_promoter_memberships")
    .insert(payload);
  if (error) throw error;
}

async function clearSeededActivity(repId: string) {
  await supabase
    .from("rep_quest_submissions")
    .delete()
    .eq("rep_id", repId)
    .eq("reviewed_by", SEED_MARKER);
  await supabase
    .from("rep_points_log")
    .delete()
    .eq("rep_id", repId)
    .eq("created_by", SEED_MARKER);
}

async function seedReviewerQuestActivity(repId: string): Promise<number> {
  const { data: quests, error } = await supabase
    .from("rep_quests")
    .select("id, title, proof_type, points_reward, xp_reward")
    .eq("org_id", FERAL_ORG_ID)
    .eq("status", "active")
    .neq("proof_type", "none")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  if (!quests || quests.length < 3) {
    throw new Error(
      `Need at least 3 active FERAL quests with proof_type != 'none'; found ${quests?.length ?? 0}. ` +
        `Create more active quests in admin before re-running.`
    );
  }

  await clearSeededActivity(repId);

  let balance = 0;
  for (const q of quests) {
    const xp = q.xp_reward ?? q.points_reward ?? 25;
    balance += xp;

    const proofUrl =
      q.proof_type === "instagram_link"
        ? "https://instagram.com/p/appreviewdemo"
        : q.proof_type === "tiktok_link"
          ? "https://www.tiktok.com/@entry/video/7000000000000000000"
          : q.proof_type === "url"
            ? "https://entry.events"
            : q.proof_type === "screenshot"
              ? "https://api.dicebear.com/9.x/shapes/png?seed=appreview-proof"
              : null;

    const { error: subError } = await supabase
      .from("rep_quest_submissions")
      .insert({
        org_id: FERAL_ORG_ID,
        quest_id: q.id,
        rep_id: repId,
        proof_type: q.proof_type,
        proof_url: proofUrl,
        proof_text:
          q.proof_type === "text" ? "Completed for Apple App Review demo." : null,
        status: "approved",
        reviewed_by: SEED_MARKER,
        reviewed_at: new Date().toISOString(),
        points_awarded: xp,
      });
    if (subError) throw subError;

    const { error: logError } = await supabase
      .from("rep_points_log")
      .insert({
        org_id: FERAL_ORG_ID,
        rep_id: repId,
        points: xp,
        balance_after: balance,
        source_type: "quest",
        source_id: q.id,
        description: `Quest completed: ${q.title}`,
        created_by: SEED_MARKER,
      });
    if (logError) throw logError;
  }

  // Sync cached balance on reps so the leaderboard alltime window picks it up
  // (see computeXpForPool in /api/rep-portal/leaderboard/route.ts).
  await supabase.from("reps").update({ points_balance: balance }).eq("id", repId);
  return balance;
}

async function ensureMutualFollow(aRepId: string, bRepId: string) {
  for (const [follower, followee] of [
    [aRepId, bRepId],
    [bRepId, aRepId],
  ] as const) {
    const { data: existing } = await supabase
      .from("rep_follows")
      .select("follower_id")
      .eq("follower_id", follower)
      .eq("followee_id", followee)
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase
        .from("rep_follows")
        .insert({ follower_id: follower, followee_id: followee });
      if (error) throw error;
    }
  }
}

async function main() {
  const password = process.env.APPLE_REVIEW_PASSWORD || generatePassword();

  console.log(`→ Ensuring auth user: ${REVIEW_EMAIL}`);
  const reviewerAuthId = await ensureAuthUser(REVIEW_EMAIL, password);

  console.log(`→ Upserting rep row`);
  const reviewerRepId = await upsertRep({
    authUserId: reviewerAuthId,
    email: REVIEW_EMAIL,
    firstName: "App",
    lastName: "Review",
    displayName: "Entry Reviewer",
    bio: "Apple App Store review account. Seeded for App Review — do not delete.",
    instagram: "@entry",
    tiktok: "@entry",
    photoUrl: REVIEWER_PHOTO_URL,
    pointsBalance: 0,
  });

  console.log(`→ Approving FERAL membership`);
  await ensureFeralMembership(reviewerRepId);

  console.log(`→ Seeding approved quest submissions + points log`);
  const reviewerXp = await seedReviewerQuestActivity(reviewerRepId);

  console.log(`→ Seeding ${FRIENDS.length} mutual-follow friends`);
  const friendRepIds: string[] = [];
  for (const f of FRIENDS) {
    const authId = await ensureAuthUser(f.email, generatePassword());
    const friendRepId = await upsertRep({
      authUserId: authId,
      email: f.email,
      firstName: f.first,
      lastName: f.last,
      displayName: f.display,
      bio: "Seeded demo-friend for App Review — do not delete.",
      instagram: null,
      tiktok: null,
      photoUrl: null,
      pointsBalance: f.initialBalance,
    });
    await ensureFeralMembership(friendRepId);
    await ensureMutualFollow(reviewerRepId, friendRepId);
    friendRepIds.push(friendRepId);
  }

  const summary = {
    ok: true,
    email: REVIEW_EMAIL,
    password,
    reviewer_rep_id: reviewerRepId,
    reviewer_xp: reviewerXp,
    friend_rep_ids: friendRepIds,
  };
  console.log("\n" + JSON.stringify(summary, null, 2));
  console.log(
    "\nNext:\n" +
      "  1. Copy password into 1Password (team sealed note).\n" +
      "  2. Add APPLE_REVIEW_PASSWORD to Vercel env (prod+preview+dev).\n" +
      "  3. Paste credentials into App Store Connect → Demo Account.\n"
  );
}

main().catch((err) => {
  console.error("[seed-apple-review] Failed:", err);
  process.exit(1);
});
