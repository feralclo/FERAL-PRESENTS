-- Per-delivery log of push attempts — one row per (notification, device).
-- Lets us debug "why didn't my push arrive" without reading
-- rep_notifications and trying to correlate against APNs feedback.
-- Also surfaces invalid_token errors cheaply so we can auto-deactivate
-- dead devices.

CREATE TABLE public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.rep_notifications(id) ON DELETE CASCADE,
  device_token_id UUID NOT NULL REFERENCES public.device_tokens(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'invalid_token', 'skipped')),
  error_message TEXT,
  transport_response_ms INT,       -- round-trip time to the push provider
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notification_deliveries_notification_idx ON public.notification_deliveries (notification_id);
CREATE INDEX notification_deliveries_device_idx ON public.notification_deliveries (device_token_id);
CREATE INDEX notification_deliveries_status_idx ON public.notification_deliveries (status, sent_at DESC)
  WHERE status <> 'sent';

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Platform owner (and service_role, which bypasses RLS) is the only reader.
-- Tenants and reps don't see delivery logs — those are platform diagnostics.

COMMENT ON TABLE public.notification_deliveries IS
  'Per-device push delivery log. Status "invalid_token" auto-disables the corresponding device_tokens.push_enabled to stop sending to dead devices.';
