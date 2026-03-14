/**
 * Integration test helpers — seed data, cleanup, and shared Supabase client.
 *
 * Uses the REAL Supabase database (service role key from .env.local).
 * All test data is scoped to org_id = '__test_integration__' to isolate
 * from production data completely.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env.local ──────────────────────────────────────────────────────────
// Must run before any module reads process.env for Supabase config.
// This block is idempotent — skips vars that are already set.
try {
  const envPath = resolve(__dirname, "../../../.env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    let value = trimmed.slice(eqIdx + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local not found — env vars must be provided externally
}

// ── Constants ────────────────────────────────────────────────────────────────

export const TEST_ORG_ID = "__test_integration__";

// ── Supabase client (for seed/cleanup — service role, bypasses RLS) ─────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Integration tests require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  serviceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Seed data shape ─────────────────────────────────────────────────────────

export interface SeedData {
  eventId: string;
  ticketTypeId: string;
  ticketTypeLargeId: string;
  discountId: string;
  maxedDiscountId: string;
}

// ── Seed ─────────────────────────────────────────────────────────────────────

export async function seedTestData(): Promise<SeedData> {
  // Event
  const { data: event, error: eventErr } = await supabase
    .from("events")
    .insert({
      org_id: TEST_ORG_ID,
      slug: "test-integration-event",
      name: "Integration Test Event",
      payment_method: "stripe",
      currency: "GBP",
      status: "live",
      date_start: "2099-12-31T22:00:00Z",
      venue_name: "Test Venue",
    })
    .select("id")
    .single();

  if (eventErr || !event) {
    throw new Error(`Failed to seed event: ${eventErr?.message}`);
  }

  // Ticket type — small capacity (for sold-out tests)
  const { data: tt1, error: tt1Err } = await supabase
    .from("ticket_types")
    .insert({
      org_id: TEST_ORG_ID,
      event_id: event.id,
      name: "General Admission",
      price: 25,
      capacity: 10,
      sold: 0,
      status: "active",
      sort_order: 0,
    })
    .select("id")
    .single();

  if (tt1Err || !tt1) {
    throw new Error(`Failed to seed ticket type 1: ${tt1Err?.message}`);
  }

  // Ticket type — large capacity
  const { data: tt2, error: tt2Err } = await supabase
    .from("ticket_types")
    .insert({
      org_id: TEST_ORG_ID,
      event_id: event.id,
      name: "VIP",
      price: 50,
      capacity: 1000,
      sold: 0,
      status: "active",
      sort_order: 1,
    })
    .select("id")
    .single();

  if (tt2Err || !tt2) {
    throw new Error(`Failed to seed ticket type 2: ${tt2Err?.message}`);
  }

  // Active discount — 10% off, no restrictions
  const { data: discount, error: discErr } = await supabase
    .from("discounts")
    .insert({
      org_id: TEST_ORG_ID,
      code: "INTTEST10",
      type: "percentage",
      value: 10,
      status: "active",
      max_uses: null,
      used_count: 0,
      starts_at: null,
      expires_at: null,
      applicable_event_ids: null,
      min_order_amount: null,
    })
    .select("id")
    .single();

  if (discErr || !discount) {
    throw new Error(`Failed to seed discount: ${discErr?.message}`);
  }

  // Maxed-out discount
  const { data: maxedDiscount, error: maxErr } = await supabase
    .from("discounts")
    .insert({
      org_id: TEST_ORG_ID,
      code: "INTMAXED",
      type: "percentage",
      value: 15,
      status: "active",
      max_uses: 1,
      used_count: 1,
      starts_at: null,
      expires_at: null,
      applicable_event_ids: null,
      min_order_amount: null,
    })
    .select("id")
    .single();

  if (maxErr || !maxedDiscount) {
    throw new Error(`Failed to seed maxed discount: ${maxErr?.message}`);
  }

  return {
    eventId: event.id,
    ticketTypeId: tt1.id,
    ticketTypeLargeId: tt2.id,
    discountId: discount.id,
    maxedDiscountId: maxedDiscount.id,
  };
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

/** Delete ALL test data (seed + transactional). Call in afterAll. */
export async function cleanupAllTestData(): Promise<void> {
  // FK order: tickets → order_items → orders → customers, then ticket_types → events, then discounts
  await supabase.from("tickets").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("order_items").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("orders").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("customers").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("ticket_types").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("events").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("discounts").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("traffic_events").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("abandoned_carts").delete().eq("org_id", TEST_ORG_ID);
  await supabase
    .from("site_settings")
    .delete()
    .like("key", `${TEST_ORG_ID}%`);
}

/**
 * Clean up only transactional data created during individual tests.
 * Preserves seed data (events, ticket_types, discounts).
 * Call in beforeEach/afterEach.
 */
export async function cleanupTransactionalData(): Promise<void> {
  await supabase.from("tickets").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("order_items").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("orders").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("customers").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("traffic_events").delete().eq("org_id", TEST_ORG_ID);
  await supabase.from("abandoned_carts").delete().eq("org_id", TEST_ORG_ID);
}

/** Reset ticket_type sold counts back to 0. */
export async function resetSoldCounts(ticketTypeIds: string[]): Promise<void> {
  for (const id of ticketTypeIds) {
    await supabase.from("ticket_types").update({ sold: 0 }).eq("id", id);
  }
}

/** Reset discount used_count back to its original value. */
export async function resetDiscountUsedCount(
  discountId: string,
  usedCount: number
): Promise<void> {
  await supabase
    .from("discounts")
    .update({ used_count: usedCount })
    .eq("id", discountId);
}
