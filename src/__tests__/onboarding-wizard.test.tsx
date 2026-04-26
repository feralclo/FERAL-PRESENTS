/**
 * Render + behaviour tests for the new 3-step onboarding wizard.
 *
 * The wizard previously shipped 9 sections with patches like "remove
 * Step N of 9 eyebrows" landing days apart — exactly the drift these
 * tests guard against. Each test seeds a realistic fetch + supabase
 * stub and asserts the section renders + reacts correctly without
 * pulling in the full /admin/onboarding page orchestration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { IdentitySection } from "@/app/admin/onboarding/_components/sections/IdentitySection";
import { BrandingSection } from "@/app/admin/onboarding/_components/sections/BrandingSection";
import { BrandPreview } from "@/app/admin/onboarding/_components/BrandPreview";
import { OnboardingChecklist } from "@/components/admin/OnboardingChecklist";
import type { OnboardingApi } from "@/app/admin/onboarding/_state";
import type { OnboardingWizardState, WizardSection } from "@/types/settings";

// ───────────────────────────────────────────────────────── stub helpers

function makeApi(overrides: Partial<OnboardingApi> = {}): OnboardingApi {
  return {
    state: { sections: {} },
    sectionIndex: 0,
    current: "identity",
    isFirstSection: true,
    isLastSection: false,
    loading: false,
    hasOrg: false,
    orgId: null,
    saving: false,
    saveError: null,
    getSection: () => undefined,
    updateSectionData: vi.fn(),
    completeAndAdvance: vi.fn(async () => {}),
    skipAndAdvance: vi.fn(async () => {}),
    goTo: vi.fn(),
    setOrgId: vi.fn(),
    ...overrides,
  };
}

type FetchResponse = { ok: boolean; status?: number; json: () => Promise<unknown> };

function stubFetch(map: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request): Promise<FetchResponse> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
      for (const [pattern, body] of Object.entries(map)) {
        if (url.includes(pattern)) {
          return { ok: true, json: async () => body };
        }
      }
      return { ok: true, json: async () => ({ data: [] }) };
    })
  );
}

// Default supabase stub: unauthenticated. Override per test.
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }),
}));

// Most sections also call useRouter on submit; stub it so the import doesn't
// throw when rendered outside the App Router runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ───────────────────────────────────────────────────────── IdentitySection

describe("IdentitySection", () => {
  beforeEach(() => {
    stubFetch({
      "/api/auth/check-slug": { available: true, slug: "night-shift" },
    });
  });

  it("renders the welcome heading + name + brand fields", () => {
    render(<IdentitySection api={makeApi()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /welcome to entry/i
    );
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/brand name/i)).toBeInTheDocument();
    // Country is a custom Radix select; assert by label
    expect(screen.getByText(/country/i, { selector: "label, span" })).toBeInTheDocument();
  });

  it("does NOT show the binary VAT question (regression)", () => {
    render(<IdentitySection api={makeApi()} />);
    expect(screen.queryByText(/are you vat registered/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not registered/i)).not.toBeInTheDocument();
  });

  it("does NOT show the URL-paste brand import card (regression)", () => {
    render(<IdentitySection api={makeApi()} />);
    expect(screen.queryByText(/got a website/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/paste your URL/i)).not.toBeInTheDocument();
  });

  it("derives a slug from the brand name and shows it underneath", async () => {
    render(<IdentitySection api={makeApi()} />);
    const brandInput = screen.getByLabelText(/brand name/i);
    fireEvent.change(brandInput, { target: { value: "Night Shift Events" } });

    await waitFor(() => {
      expect(screen.getByText(/night-shift/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/\.entry\.events/i)).toBeInTheDocument();
  });

  it("renders a locked-state alert when the user has already provisioned", () => {
    const apiWithOrg = makeApi({
      hasOrg: true,
      orgId: "night-shift",
      getSection: (s: WizardSection) =>
        s === "identity"
          ? {
              data: {
                first_name: "Alex",
                last_name: "Morgan",
                brand_name: "Night Shift",
                slug: "night-shift",
                country: "GB",
              },
            }
          : undefined,
    });
    render(<IdentitySection api={apiWithOrg} />);
    expect(screen.getByText(/your account is set up/i)).toBeInTheDocument();
    expect(screen.getAllByText(/night-shift\.entry\.events/i).length).toBeGreaterThan(0);
  });

  it("does not crash when stored data already has names (pre-fill is a no-op)", () => {
    const apiWithStored = makeApi({
      getSection: (s: WizardSection) =>
        s === "identity"
          ? {
              data: {
                first_name: "Alex",
                last_name: "Morgan",
                brand_name: "Night Shift",
              },
            }
          : undefined,
    });
    render(<IdentitySection api={apiWithStored} />);
    expect(screen.getByLabelText(/first name/i)).toHaveValue("Alex");
    expect(screen.getByLabelText(/last name/i)).toHaveValue("Morgan");
    expect(screen.getByLabelText(/brand name/i)).toHaveValue("Night Shift");
  });
});

// ───────────────────────────────────────────────────────── BrandingSection

describe("BrandingSection", () => {
  it("renders six accent presets + custom hex input", () => {
    render(<BrandingSection api={makeApi()} />);
    // Each vibe button is a button[title="Violet"] etc.
    expect(screen.getByRole("button", { name: /violet/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rose/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mint/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /blue/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /gold/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crimson/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/custom hex/i)).toBeInTheDocument();
  });

  it("offers logo upload + wallet sync toggle", () => {
    render(<BrandingSection api={makeApi()} />);
    expect(screen.getByText(/upload logo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mirror to apple/i)).toBeInTheDocument();
  });

  it("propagates accent changes through api.updateSectionData", () => {
    const api = makeApi();
    render(<BrandingSection api={api} />);
    fireEvent.click(screen.getByRole("button", { name: /rose/i }));
    expect(api.updateSectionData).toHaveBeenCalledWith(
      "branding",
      expect.objectContaining({ accent_hex: "#FF66B2", vibe: "rose-glow" })
    );
  });
});

// ───────────────────────────────────────────────────────── BrandPreview

describe("BrandPreview", () => {
  it("renders fallback brand name when no identity is set", () => {
    render(<BrandPreview state={null} />);
    // Header shows fallback uppercase brand
    expect(screen.getAllByText(/your brand/i).length).toBeGreaterThan(0);
    // Footer shows the placeholder slug
    expect(screen.getByText(/your-brand\.entry\.events/i)).toBeInTheDocument();
  });

  it("applies user's brand name + slug live", () => {
    const state: OnboardingWizardState = {
      sections: {
        identity: {
          data: { brand_name: "Night Shift", slug: "night-shift", country: "GB" },
        },
        branding: {
          data: { accent_hex: "#FF66B2" },
        },
      },
    };
    render(<BrandPreview state={state} />);
    expect(screen.getAllByText(/NIGHT SHIFT/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/night-shift\.entry\.events/i)).toBeInTheDocument();
  });

  it("uses the country's currency symbol in sample prices", () => {
    const state: OnboardingWizardState = {
      sections: {
        identity: { data: { brand_name: "X", country: "US" } },
      },
    };
    render(<BrandPreview state={state} />);
    // Sample tickets price 18 + currency symbol $
    expect(screen.getAllByText(/\$18/).length).toBeGreaterThan(0);
  });

  it("does NOT render the invented 'Get tickets' card from the old preview (regression)", () => {
    render(<BrandPreview state={null} />);
    // The old PreviewPane hardcoded a single "Get tickets" button on a fake card.
    // The new preview's CTA matches MidnightHero and reads "Get Tickets" once
    // inside the hero section — but the surrounding "Sat 14 Jun · 9pm" placeholder
    // and "This is roughly how your event page card will look" copy should be gone.
    expect(screen.queryByText(/this is roughly how/i)).not.toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────── OnboardingChecklist

describe("OnboardingChecklist", () => {
  it("renders nothing while still loading", () => {
    stubFetch({});
    const { container } = render(<OnboardingChecklist />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Connect Stripe + Create event when both outstanding", async () => {
    stubFetch({
      "/api/onboarding/state": { state: { sections: {} }, org_id: "feral", has_org: true },
      "/api/stripe/connect/my-account": { connected: false, charges_enabled: false },
      "/api/domains": { data: [] },
      "/api/branding": { data: { logo_url: "" } },
      "/api/events": { data: [] },
      "/api/team": { data: [{ status: "active" }] },
    });
    render(<OnboardingChecklist />);
    await waitFor(() => {
      expect(screen.getByText(/connect stripe/i)).toBeInTheDocument();
      expect(screen.getByText(/create your first event/i)).toBeInTheDocument();
    });
    // Solo team → invite item should also surface
    expect(screen.getByText(/invite your team/i)).toBeInTheDocument();
  });

  it("hides the Stripe item when charges_enabled is true", async () => {
    stubFetch({
      "/api/onboarding/state": { state: { sections: {} }, org_id: "feral", has_org: true },
      "/api/stripe/connect/my-account": { connected: true, charges_enabled: true },
      "/api/domains": { data: [] },
      "/api/branding": { data: { logo_url: "https://example.com/logo.png" } },
      "/api/events": { data: [{ id: "evt-1" }] },
      "/api/team": { data: [{ status: "active" }, { status: "active" }] },
    });
    render(<OnboardingChecklist />);
    await waitFor(() => {
      // With nothing outstanding the widget hides entirely.
      expect(screen.queryByText(/connect stripe/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/finish setting up/i)).not.toBeInTheDocument();
    });
  });

  it("does NOT reference the removed wizard.payments section (regression)", async () => {
    stubFetch({
      "/api/onboarding/state": {
        state: {
          sections: {
            // Pre-rebuild shape — the new checklist must not crash on it.
            payments: { data: { method: "external" }, skipped: true },
          },
        },
        org_id: "feral",
        has_org: true,
      },
      "/api/stripe/connect/my-account": { connected: false, charges_enabled: false },
      "/api/domains": { data: [] },
      "/api/branding": { data: { logo_url: "" } },
      "/api/events": { data: [] },
      "/api/team": { data: [{ status: "active" }] },
    });
    render(<OnboardingChecklist />);
    // Always shows Connect Stripe when charges_enabled is false — the old
    // "isExternal" short-circuit is gone (per-event setting now).
    await waitFor(() => {
      expect(screen.getByText(/connect stripe/i)).toBeInTheDocument();
    });
  });
});
