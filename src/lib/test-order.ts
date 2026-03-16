/**
 * Test Order mode — run a real payment without polluting analytics,
 * marketing, or customer communications.
 *
 * Activate:  add ?testorder=1 to any event or checkout URL
 * Deactivate: ?testorder=0  or close the tab (sessionStorage)
 *
 * What it suppresses:
 *  - Meta Pixel events (fbq calls)
 *  - Meta CAPI events (client + server)
 *  - GTM dataLayer pushes
 *  - Supabase traffic events
 *  - Order confirmation email
 *  - Server-side traffic inserts
 *
 * What still works normally:
 *  - Real Stripe charge (live keys)
 *  - Order + ticket creation
 *  - Stock decrement
 *  - Discount validation
 *  - Everything a customer would experience
 *
 * Orders are tagged with metadata.test_order = true so they're
 * easy to find and refund in the admin dashboard.
 */

const STORAGE_KEY = "entry_test_order";
const URL_PARAM = "testorder";

/**
 * Check if current browser session is in test order mode.
 * Uses sessionStorage — scoped to the current tab only, so other
 * tabs (and real customers) are never affected.
 */
export function isTestOrder(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search);

    if (params.get(URL_PARAM) === "1") {
      sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (params.get(URL_PARAM) === "0") {
      sessionStorage.removeItem(STORAGE_KEY);
      return false;
    }

    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Return the URL search param suffix to propagate test mode
 * when building internal navigation links (e.g. checkout URL).
 * Returns "" when not in test mode.
 */
export function getTestOrderParam(): string {
  if (typeof window === "undefined") return "";
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return "testorder=1";
  } catch {
    // sessionStorage blocked
  }
  return "";
}
