-- Bring rep_quests up to the iOS contract (§5.8 + §6.5) — additively.
-- Several columns (instructions, platform, sales_target, currency_reward,
-- banner_image_url, image_url) already exist from the v1 web rep portal.
-- We add the remaining pieces and keep the legacy columns in place.

ALTER TABLE public.rep_quests
  ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES public.promoters(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subtitle TEXT,
  ADD COLUMN IF NOT EXISTS proof_type TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS accent_hex INT,
  ADD COLUMN IF NOT EXISTS accent_hex_secondary INT,
  ADD COLUMN IF NOT EXISTS xp_reward INT,
  ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN NOT NULL DEFAULT false;

-- Normalise platform values before tightening the CHECK constraint.
UPDATE public.rep_quests
SET platform = 'any'
WHERE platform IS NULL
   OR platform NOT IN ('tiktok', 'instagram', 'any');

-- Add CHECK constraint on platform if it doesn't already have one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.rep_quests'::regclass
      AND conname = 'rep_quests_platform_check'
  ) THEN
    ALTER TABLE public.rep_quests
      ADD CONSTRAINT rep_quests_platform_check
      CHECK (platform IN ('tiktok', 'instagram', 'any'));
  END IF;
END $$;

-- Constrain proof_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.rep_quests'::regclass
      AND conname = 'rep_quests_proof_type_check'
  ) THEN
    ALTER TABLE public.rep_quests
      ADD CONSTRAINT rep_quests_proof_type_check
      CHECK (proof_type IN ('screenshot', 'url', 'text', 'instagram_link', 'tiktok_link', 'none'));
  END IF;
END $$;

-- Backfill xp_reward from the legacy points_reward.
UPDATE public.rep_quests
SET xp_reward = points_reward
WHERE xp_reward IS NULL AND points_reward IS NOT NULL;

-- Backfill cover_image_url from the legacy image_url.
UPDATE public.rep_quests
SET cover_image_url = image_url
WHERE cover_image_url IS NULL AND image_url IS NOT NULL;

-- Backfill promoter_id from the owning org's promoter row.
UPDATE public.rep_quests q
SET promoter_id = p.id
FROM public.promoters p
WHERE q.promoter_id IS NULL AND p.org_id = q.org_id;

-- ---------------------------------------------------------------------------
-- rep_quest_submissions: allow 'requires_revision' as a terminal status
-- distinct from outright rejection.
-- ---------------------------------------------------------------------------

ALTER TABLE public.rep_quest_submissions
  ADD COLUMN IF NOT EXISTS requires_revision BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.rep_quest_submissions
  DROP CONSTRAINT IF EXISTS rep_quest_submissions_status_check;
ALTER TABLE public.rep_quest_submissions
  ADD CONSTRAINT rep_quest_submissions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'requires_revision'));

-- ---------------------------------------------------------------------------
-- rep_quest_acceptances — UX flag ("accepted" quests move from New → Your)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rep_quest_acceptances (
  rep_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  quest_id UUID NOT NULL REFERENCES public.rep_quests(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rep_id, quest_id)
);

CREATE INDEX IF NOT EXISTS rep_quest_acceptances_quest_idx
  ON public.rep_quest_acceptances (quest_id);

ALTER TABLE public.rep_quest_acceptances ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rep_quest_acceptances IS
  'Lightweight UX flag: rep tapped Accept on a quest. Does not gate submissions. Drives the "New / Your quests" partitioning on iOS.';
