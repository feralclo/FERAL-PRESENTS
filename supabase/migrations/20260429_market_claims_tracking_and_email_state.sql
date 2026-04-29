-- Tracking + per-claim email send-state for Entry Market.
-- Tracking columns are populated by the Shopify orders/fulfilled webhook;
-- the email timestamps are set fire-and-forget after successful Resend send
-- and serve as idempotency guards (skip if already sent).
ALTER TABLE platform_market_claims
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS tracking_company TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_platform_market_claims_external_order_id
  ON platform_market_claims(external_order_id)
  WHERE external_order_id IS NOT NULL;

COMMENT ON COLUMN platform_market_claims.tracking_number IS
  'Carrier tracking number from Shopify fulfillment webhook.';
COMMENT ON COLUMN platform_market_claims.tracking_url IS
  'Tracking URL provided by Shopify (carrier-specific tracking page).';
COMMENT ON COLUMN platform_market_claims.dispatch_email_sent_at IS
  'Set when the dispatch email was successfully sent. Used as the
   idempotency check to prevent double-sends on webhook redeliveries.';
