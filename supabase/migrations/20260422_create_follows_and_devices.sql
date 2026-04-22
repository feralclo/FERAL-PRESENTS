-- ---------------------------------------------------------------------------
-- rep_promoter_follows — rep follows a promoter (soft signal, no permissions)
-- Distinct from rep_promoter_memberships. Following drives feed scope and
-- "Your Shops"; membership drives earning rights.
-- ---------------------------------------------------------------------------

CREATE TABLE public.rep_promoter_follows (
  rep_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  promoter_id UUID NOT NULL REFERENCES public.promoters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rep_id, promoter_id)
);

CREATE INDEX rpf_promoter_idx ON public.rep_promoter_follows (promoter_id);

ALTER TABLE public.rep_promoter_follows ENABLE ROW LEVEL SECURITY;

-- Tenant admins can see who follows their promoter (analytics).
CREATE POLICY rpf_tenant_read ON public.rep_promoter_follows
  FOR SELECT
  TO authenticated
  USING (
    promoter_id IN (
      SELECT id FROM public.promoters WHERE org_id = auth_user_org_id()
    )
  );

-- Maintain promoters.follower_count denormalised counter.
CREATE OR REPLACE FUNCTION public.rep_promoter_follows_update_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.promoters SET follower_count = follower_count + 1 WHERE id = NEW.promoter_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.promoters SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = OLD.promoter_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER rpf_follower_count_sync
  AFTER INSERT OR DELETE ON public.rep_promoter_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.rep_promoter_follows_update_count();

COMMENT ON TABLE public.rep_promoter_follows IS
  'Rep follows a promoter. Soft signal, drives feed scope and discovery. Maintains promoters.follower_count via trigger.';

-- ---------------------------------------------------------------------------
-- rep_follows — rep follows another rep (one-way)
-- Mutual follow = computed "friend" (no dedicated rep_friends table).
-- ---------------------------------------------------------------------------

CREATE TABLE public.rep_follows (
  follower_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE INDEX rf_followee_idx ON public.rep_follows (followee_id);

ALTER TABLE public.rep_follows ENABLE ROW LEVEL SECURITY;

-- Rep-portal endpoints use service_role (getSupabaseAdmin) which bypasses RLS,
-- so explicit rep scoping happens in route handlers. No authenticated policy
-- needed — tenants should not be reading the rep-to-rep social graph through
-- RLS. If they ever need analytics, add a specific policy then.

COMMENT ON TABLE public.rep_follows IS
  'One-way rep ↔ rep follow graph. Mutual follow (both directions present) computes to "friend" for messaging unlocks. No dedicated friends table.';

-- ---------------------------------------------------------------------------
-- device_tokens — unified APNs / FCM / web-push registration
-- Replaces rep_push_subscriptions for new devices. createNotification fans
-- out across all three platforms via the right transport.
-- ---------------------------------------------------------------------------

CREATE TABLE public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  token TEXT NOT NULL,
  app_version TEXT,
  os_version TEXT,
  device_model TEXT,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rep_id, token)
);

CREATE INDEX dt_rep_idx ON public.device_tokens (rep_id);
CREATE INDEX dt_platform_enabled_idx ON public.device_tokens (platform, push_enabled);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- No authenticated-role policies — device tokens are rep-scoped secrets.
-- All access goes through service_role via rep-portal endpoints which
-- enforce rep_id ownership at the handler level. Tenant admins do NOT
-- read device tokens (privacy — they can see reps, not the reps' devices).

COMMENT ON TABLE public.device_tokens IS
  'Unified push token registry for iOS (APNs), Android (FCM), web (VAPID). One row per rep-device pair. Fanout in lib/rep-notifications.ts.';
