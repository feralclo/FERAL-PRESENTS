-- Payment events table for platform-wide payment health monitoring.
-- Stores all payment lifecycle events (successes, failures, errors, webhooks, etc.)
-- Queried by the Payment Health dashboard (platform owner only).

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  event_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_account_id TEXT,
  error_code TEXT,
  error_message TEXT,
  customer_email TEXT,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the primary query pattern: filter by time range + optional org
CREATE INDEX idx_payment_events_created_at ON payment_events (created_at DESC);
CREATE INDEX idx_payment_events_org_created ON payment_events (org_id, created_at DESC);

-- Index for unresolved events query (all-time count of open issues)
CREATE INDEX idx_payment_events_unresolved ON payment_events (resolved, severity)
  WHERE resolved = false;

-- Index for unhealthy accounts lookup
CREATE INDEX idx_payment_events_type_resolved ON payment_events (type, resolved)
  WHERE resolved = false;
