/**
 * Beta mode configuration.
 *
 * When BETA_MODE is true:
 * - /admin/signup/ redirects to /admin/beta/ (beta application form)
 * - Login page shows "Request beta access" instead of "Get started for free"
 * - Marketing site "Get Started" button goes to the beta application page
 *
 * To disable beta mode and restore normal signup:
 * 1. Set BETA_MODE = false below
 * 2. In entry-marketing/src/lib/constants.ts, change EXTERNAL_LINKS.signup
 *    back to "https://admin.entry.events/admin/signup/"
 *
 * That's it. Two changes, beta is off.
 */
export const BETA_MODE = true;
