-- Phase 2 oversight surfaced during iOS smoke testing: CLAUDE.md + the
-- /api/rep-portal/quests route assumed rep_quests.ep_reward existed alongside
-- xp_reward, but the Phase 2 migration (20260422_extend_rep_quests_for_ios.sql)
-- only added xp_reward. The route SELECTed ep_reward and 500'd silently.

ALTER TABLE public.rep_quests
  ADD COLUMN IF NOT EXISTS ep_reward INTEGER NOT NULL DEFAULT 0 CHECK (ep_reward >= 0);

COMMENT ON COLUMN public.rep_quests.ep_reward IS
  'Earnable Platform currency (1 EP = £0.01). Written to ep_ledger on quest approval via award_quest_ep RPC. Legacy currency_reward still readable for pre-v2 quests.';

-- Mirror the xp_reward ← points_reward backfill from Phase 2. Only rows
-- with a non-zero currency_reward and the default ep_reward=0 are touched,
-- so this is idempotent and won't clobber new-shape quests.
UPDATE public.rep_quests
SET ep_reward = currency_reward
WHERE ep_reward = 0 AND currency_reward IS NOT NULL AND currency_reward > 0;
