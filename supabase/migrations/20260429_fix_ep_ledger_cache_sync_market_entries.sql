-- The trigger that keeps reps.currency_balance in sync with the append-only
-- ep_ledger was missing the two market_* entry types added when Entry Market
-- shipped. Successful market claims wrote a market_redemption row but the
-- cache never decremented, so the dashboard kept showing pre-claim balances
-- while the atomic claim RPC (which reads ep_rep_balances view = ledger sum)
-- correctly reported the post-claim balance. Drift only surfaced when a
-- redemption wasn't paired with a reversal — discovered during iOS App
-- Review smoke-testing of the claim flow.
CREATE OR REPLACE FUNCTION public.ep_ledger_maintain_rep_cache()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  rep_delta INT;
BEGIN
  IF NEW.rep_id IS NULL THEN
    RETURN NEW;
  END IF;

  rep_delta := CASE NEW.entry_type
    WHEN 'rep_quest_credit'           THEN  NEW.ep_amount
    WHEN 'rep_quest_reversal'         THEN -NEW.ep_amount
    WHEN 'rep_shop_debit'             THEN -NEW.ep_amount
    WHEN 'rep_shop_reversal'          THEN  NEW.ep_amount
    WHEN 'platform_bonus'             THEN  NEW.ep_amount
    WHEN 'market_redemption'          THEN -NEW.ep_amount
    WHEN 'market_redemption_reversal' THEN  NEW.ep_amount
    ELSE 0
  END;

  IF rep_delta <> 0 THEN
    UPDATE public.reps
    SET currency_balance = currency_balance + rep_delta,
        updated_at = now()
    WHERE id = NEW.rep_id;
  END IF;

  RETURN NEW;
END;
$function$;
