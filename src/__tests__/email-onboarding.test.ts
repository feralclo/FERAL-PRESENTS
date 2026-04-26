/**
 * Pure-helper tests for the welcome email body builder.
 *
 * The welcome email is fired exactly once per tenant at /api/onboarding/
 * complete. Its content drifted twice already (firstEventSlug field
 * went stale, the heading copy got rewritten). Locking the bullet-list
 * shape down stops silent regressions to a transactional email we
 * can't easily preview.
 */

import { describe, it, expect } from "vitest";
import { buildWelcomeNextSteps } from "@/lib/email-onboarding";

const SITE = "https://entry.events";
const ACCENT = "#8B5CF6";

describe("buildWelcomeNextSteps", () => {
  it("always includes the dashboard line", () => {
    const lines = buildWelcomeNextSteps({ siteUrl: SITE, accent: ACCENT });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/dashboard/i);
    expect(lines[0]).toMatch(/setup checklist/i);
  });

  it("hoists the Stripe action to the top when outstanding", () => {
    const lines = buildWelcomeNextSteps({
      siteUrl: SITE,
      accent: ACCENT,
      outstanding: { stripe: true },
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/connect stripe/i);
    expect(lines[0]).toContain(`${SITE}/admin/payments/`);
    // Dashboard line stays second
    expect(lines[1]).toMatch(/dashboard/i);
  });

  it("uses the org's accent colour on the Stripe link", () => {
    const lines = buildWelcomeNextSteps({
      siteUrl: SITE,
      accent: "#FF66B2",
      outstanding: { stripe: true },
    });
    expect(lines[0]).toContain("color:#FF66B2");
  });

  it("appends the domain-pending line at the end (informational, lowest priority)", () => {
    const lines = buildWelcomeNextSteps({
      siteUrl: SITE,
      accent: ACCENT,
      outstanding: { domain: true },
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/dashboard/i);
    expect(lines[1]).toMatch(/custom domain/i);
  });

  it("orders Stripe → dashboard → domain when both are outstanding", () => {
    const lines = buildWelcomeNextSteps({
      siteUrl: SITE,
      accent: ACCENT,
      outstanding: { stripe: true, domain: true },
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/connect stripe/i);
    expect(lines[1]).toMatch(/dashboard/i);
    expect(lines[2]).toMatch(/custom domain/i);
  });

  it("falls back to the dashboard-only line when nothing is outstanding", () => {
    const lines = buildWelcomeNextSteps({
      siteUrl: SITE,
      accent: ACCENT,
      outstanding: { stripe: false, domain: false },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/dashboard/i);
  });

  it("does NOT mention firstEventSlug or draft events (regression for the removed wizard step)", () => {
    const lines = buildWelcomeNextSteps({
      siteUrl: SITE,
      accent: ACCENT,
      outstanding: { stripe: true, domain: true },
    });
    const joined = lines.join("\n");
    expect(joined).not.toMatch(/draft event/i);
    expect(joined).not.toMatch(/preview your first event/i);
    expect(joined).not.toMatch(/pick up where you left off/i);
  });

  it("escapes accent colours that contain HTML-significant characters (defensive)", () => {
    // Not realistic accent input, but the builder uses escapeHtml for safety.
    const lines = buildWelcomeNextSteps({
      siteUrl: SITE,
      accent: '"><script>',
      outstanding: { stripe: true },
    });
    expect(lines[0]).not.toContain('"><script>');
    expect(lines[0]).toContain("&quot;");
  });
});
