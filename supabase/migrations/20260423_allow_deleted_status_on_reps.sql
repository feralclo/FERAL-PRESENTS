-- Soft-delete (Phase 5.5, App Store guideline 5.1.1(v)) writes
-- reps.status='deleted'. The existing CHECK constraint only permitted
-- pending | active | suspended | deactivated, so DELETE /api/rep-portal/me
-- threw 23514 "new row for relation reps violates check constraint".
-- Adding 'deleted' closes the loop; also makes mobile-login's
-- status==='deleted' bypass into a real guard rather than dead code.

ALTER TABLE public.reps DROP CONSTRAINT reps_status_check;

ALTER TABLE public.reps ADD CONSTRAINT reps_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'active'::text,
    'suspended'::text,
    'deactivated'::text,
    'deleted'::text
  ]));
