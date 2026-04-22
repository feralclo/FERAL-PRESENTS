-- ---------------------------------------------------------------------------
-- rep_promoter_memberships — the rep ↔ promoter team relationship
-- Many-to-many: a rep can be on multiple teams, a promoter has multiple reps.
-- Status lifecycle: pending → approved / rejected / left
-- Replaces the implicit 1-org-per-rep assumption on reps.org_id.
-- ---------------------------------------------------------------------------

CREATE TABLE public.rep_promoter_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  promoter_id UUID NOT NULL REFERENCES public.promoters(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'left')),
  discount_code TEXT,
  discount_percent INT,
  pitch TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  left_at TIMESTAMPTZ,
  rejected_reason TEXT,
  UNIQUE (rep_id, promoter_id)
);

CREATE INDEX rpm_rep_idx ON public.rep_promoter_memberships (rep_id);
CREATE INDEX rpm_promoter_idx ON public.rep_promoter_memberships (promoter_id);
CREATE INDEX rpm_promoter_status_idx ON public.rep_promoter_memberships (promoter_id, status);

-- RLS
ALTER TABLE public.rep_promoter_memberships ENABLE ROW LEVEL SECURITY;

-- Tenant admins see/manage memberships for their own promoter.
CREATE POLICY rpm_tenant_all ON public.rep_promoter_memberships
  FOR ALL
  TO authenticated
  USING (
    promoter_id IN (
      SELECT id FROM public.promoters WHERE org_id = auth_user_org_id()
    )
  )
  WITH CHECK (
    promoter_id IN (
      SELECT id FROM public.promoters WHERE org_id = auth_user_org_id()
    )
  );

-- Note: rep-portal endpoints use service_role (getSupabaseAdmin), which
-- bypasses RLS. Reps reading their own memberships go through the admin
-- client with explicit rep_id filtering in the route handler.

COMMENT ON TABLE public.rep_promoter_memberships IS
  'Rep ↔ Promoter team membership with pending/approved/rejected/left lifecycle. One discount code per membership pair. Replaces the implicit one-org-per-rep constraint.';

-- ---------------------------------------------------------------------------
-- Maintain promoters.team_size on membership approve/leave/reject.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rep_promoter_memberships_update_team_size()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      UPDATE public.promoters SET team_size = team_size + 1 WHERE id = NEW.promoter_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'approved' AND NEW.status = 'approved' THEN
      UPDATE public.promoters SET team_size = team_size + 1 WHERE id = NEW.promoter_id;
    ELSIF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
      UPDATE public.promoters SET team_size = GREATEST(team_size - 1, 0) WHERE id = NEW.promoter_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' THEN
      UPDATE public.promoters SET team_size = GREATEST(team_size - 1, 0) WHERE id = OLD.promoter_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER rpm_team_size_sync
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.rep_promoter_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.rep_promoter_memberships_update_team_size();
