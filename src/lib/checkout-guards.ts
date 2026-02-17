/**
 * Domain-level checkout restrictions.
 * Certain email domains are restricted from completing purchases.
 */
const RESTRICTED_CHECKOUT_DOMAINS = ["weeztix.com"];

export function isRestrictedCheckoutEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split("@").pop();
  return domain ? RESTRICTED_CHECKOUT_DOMAINS.includes(domain) : false;
}
