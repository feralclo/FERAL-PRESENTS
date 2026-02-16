-- Add email verification columns to reps table
-- email_verified defaults to TRUE so existing reps are unaffected
ALTER TABLE reps ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT true;
ALTER TABLE reps ADD COLUMN IF NOT EXISTS email_verification_token text;

-- Index on verification token for fast lookups
CREATE INDEX IF NOT EXISTS idx_reps_email_verification_token
  ON reps (email_verification_token)
  WHERE email_verification_token IS NOT NULL;
