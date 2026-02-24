-- Add resolution_notes column for audit trail when resolving payment events.
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
