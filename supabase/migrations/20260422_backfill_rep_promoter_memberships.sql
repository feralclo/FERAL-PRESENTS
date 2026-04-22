-- Backfill one approved membership per existing rep row using their current
-- org_id. After this migration, reps.org_id is no longer the source of truth —
-- memberships are. We keep the column populated during the rollout window.

INSERT INTO public.rep_promoter_memberships (rep_id, promoter_id, status, approved_at, requested_at)
SELECT
  r.id AS rep_id,
  p.id AS promoter_id,
  'approved' AS status,
  r.created_at AS approved_at,
  r.created_at AS requested_at
FROM public.reps r
JOIN public.promoters p ON p.org_id = r.org_id
WHERE r.status = 'active'
ON CONFLICT (rep_id, promoter_id) DO NOTHING;

-- Make reps.org_id nullable going forward. Existing rows keep their value;
-- new platform-level rep signups will leave it null.
ALTER TABLE public.reps ALTER COLUMN org_id DROP NOT NULL;

COMMENT ON COLUMN public.reps.org_id IS
  'Legacy per-tenant scope. Nullable — new reps are platform identities whose promoter relationships live in rep_promoter_memberships. Retained for backwards-compat during rollout; drop once all code paths read memberships.';
