-- Rep rewards overhaul (ENTRY-IOS-BACKEND-SPEC §5.11, Phase 3.2).
-- Cleanly splits what the v1 schema conflated:
--   • rep_rewards.points_cost meant BOTH "XP threshold to unlock" (for
--     milestone rewards) AND "in-tenant currency price" (for shop rewards).
--     Split into dedicated xp_threshold + ep_cost columns.
--   • reward_type 'points_shop' → 'shop' (iOS contract name).
-- Also adds stock, fulfillment_kind, fulfillment_payload — Phase 3 reward
-- claim flow depends on these.
--
-- Order matters: DROP constraints before UPDATE so we can UPDATE to values
-- the old constraint didn't allow. Re-ADD after.

-- ---------------------------------------------------------------------------
-- rep_rewards
-- ---------------------------------------------------------------------------

ALTER TABLE public.rep_rewards
  ADD COLUMN IF NOT EXISTS ep_cost INT,
  ADD COLUMN IF NOT EXISTS xp_threshold INT,
  ADD COLUMN IF NOT EXISTS stock INT,
  ADD COLUMN IF NOT EXISTS fulfillment_kind TEXT;

-- Backfill new columns from the legacy points_cost
UPDATE public.rep_rewards
SET ep_cost = points_cost
WHERE reward_type = 'points_shop' AND ep_cost IS NULL;

UPDATE public.rep_rewards
SET xp_threshold = points_cost
WHERE reward_type = 'milestone' AND xp_threshold IS NULL;

-- Carry stock across from total_available where present
UPDATE public.rep_rewards
SET stock = total_available
WHERE stock IS NULL AND total_available IS NOT NULL;

-- Drop old reward_type CHECK BEFORE renaming values (otherwise UPDATE fails)
ALTER TABLE public.rep_rewards DROP CONSTRAINT IF EXISTS rep_rewards_reward_type_check;

-- Rename reward_type value: 'points_shop' → 'shop'
UPDATE public.rep_rewards SET reward_type = 'shop' WHERE reward_type = 'points_shop';

-- New reward_type CHECK. 'manual' retained for rewards tenants grant
-- directly (no cost, no unlock threshold).
ALTER TABLE public.rep_rewards ADD CONSTRAINT rep_rewards_reward_type_check
  CHECK (reward_type IN ('milestone', 'shop', 'manual'));

-- Constrain fulfillment_kind — digital_ticket issues a PKPass, guest_list
-- adds to the door list, merch goes to physical fulfillment (tenant ships),
-- custom is tenant-defined manual.
ALTER TABLE public.rep_rewards DROP CONSTRAINT IF EXISTS rep_rewards_fulfillment_kind_check;
ALTER TABLE public.rep_rewards ADD CONSTRAINT rep_rewards_fulfillment_kind_check
  CHECK (fulfillment_kind IS NULL OR fulfillment_kind IN ('digital_ticket', 'guest_list', 'merch', 'custom'));

-- Shop rewards must have an ep_cost > 0
ALTER TABLE public.rep_rewards DROP CONSTRAINT IF EXISTS rep_rewards_shop_has_cost;
ALTER TABLE public.rep_rewards ADD CONSTRAINT rep_rewards_shop_has_cost
  CHECK (reward_type <> 'shop' OR (ep_cost IS NOT NULL AND ep_cost > 0));

-- Milestone rewards must have an xp_threshold > 0
ALTER TABLE public.rep_rewards DROP CONSTRAINT IF EXISTS rep_rewards_milestone_has_threshold;
ALTER TABLE public.rep_rewards ADD CONSTRAINT rep_rewards_milestone_has_threshold
  CHECK (reward_type <> 'milestone' OR (xp_threshold IS NOT NULL AND xp_threshold > 0));

COMMENT ON COLUMN public.rep_rewards.ep_cost IS
  'EP price for shop-kind rewards. Tenant-set. Replaces the overloaded points_cost for this reward_type.';
COMMENT ON COLUMN public.rep_rewards.xp_threshold IS
  'XP level at which a milestone-kind reward unlocks. Replaces the overloaded points_cost for this reward_type.';
COMMENT ON COLUMN public.rep_rewards.stock IS
  'Available units for shop rewards. NULL = unlimited. total_available kept for v1 web read-compat.';
COMMENT ON COLUMN public.rep_rewards.fulfillment_kind IS
  'How a claim is satisfied: digital_ticket (auto PKPass), guest_list (auto door add), merch (tenant ships), custom (tenant-defined manual step).';

-- ---------------------------------------------------------------------------
-- rep_reward_claims
-- ---------------------------------------------------------------------------

ALTER TABLE public.rep_reward_claims
  ADD COLUMN IF NOT EXISTS ep_spent INT,
  ADD COLUMN IF NOT EXISTS fulfillment_payload JSONB,
  ADD COLUMN IF NOT EXISTS fulfillment_reference TEXT;

-- Backfill ep_spent from points_spent
UPDATE public.rep_reward_claims
SET ep_spent = points_spent
WHERE ep_spent IS NULL AND points_spent IS NOT NULL;

-- Drop claim_type CHECK before renaming values
ALTER TABLE public.rep_reward_claims DROP CONSTRAINT IF EXISTS rep_reward_claims_claim_type_check;

-- Rename claim_type 'points_shop' → 'shop' for consistency with rep_rewards
UPDATE public.rep_reward_claims SET claim_type = 'shop' WHERE claim_type = 'points_shop';

ALTER TABLE public.rep_reward_claims ADD CONSTRAINT rep_reward_claims_claim_type_check
  CHECK (claim_type IN ('milestone', 'shop', 'manual'));

-- Expand status to cover the full fulfillment lifecycle
ALTER TABLE public.rep_reward_claims DROP CONSTRAINT IF EXISTS rep_reward_claims_status_check;
ALTER TABLE public.rep_reward_claims ADD CONSTRAINT rep_reward_claims_status_check
  CHECK (status IN ('claimed', 'fulfilling', 'fulfilled', 'cancelled', 'failed'));

COMMENT ON COLUMN public.rep_reward_claims.ep_spent IS
  'EP deducted from rep at claim time. Mirrors points_spent during rollout. Ledger entry ep_amount matches this value.';
COMMENT ON COLUMN public.rep_reward_claims.fulfillment_payload IS
  'Structured fulfillment data — e.g. {kind:"guest_list", guest_name:"Sascha", door_note:"VIP"}, {kind:"digital_ticket", pkpass_url:"..."}, {kind:"merch", tracking_number:"..."}';
COMMENT ON COLUMN public.rep_reward_claims.fulfillment_reference IS
  'External reference created by synchronous fulfillment (ticket_id for digital_ticket, guest_list_id for guest_list).';
