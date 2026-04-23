/**
 * Regression tests for the recent UX polish:
 *   - QuestCardPreview: subtitle hidden on card (iOS cards don't render it;
 *     only the full-screen detail sheet does). No heart / bookmark icon.
 *     Kind pill, title, cover cascade behaviour, reward chips, proof hint.
 *   - EP page: flow explainer strip renders with all four steps, and the
 *     Entry-Market disclaimer copy is present so tenants aren't surprised.
 *
 * If a future refactor accidentally re-adds a subtitle to the card or wires
 * in a mystery heart icon, these fail immediately rather than shipping
 * inaccuracy to production.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QuestCardPreview } from "@/components/admin/reps/QuestCardPreview";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// QuestCardPreview
// ---------------------------------------------------------------------------

describe("QuestCardPreview", () => {
  const base = {
    title: "Post a story",
    subtitle: "30-second win — takes 2 minutes",
    coverImageUrl: "",
    promoterAccentHex: 0xb845ff,
    xp: 50,
    ep: 10,
    proofType: "screenshot" as const,
  };

  it("renders the kind pill + title + reward chips + proof hint", () => {
    render(<QuestCardPreview {...base} questType="story_share" />);
    expect(screen.getByText("STORY SHARE")).toBeInTheDocument();
    expect(screen.getByText("Post a story")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText(/Upload screenshot/i)).toBeInTheDocument();
  });

  it("does NOT render the subtitle on the card (iOS cards don't — only detail view does)", () => {
    render(<QuestCardPreview {...base} questType="story_share" />);
    // If this ever starts matching, the preview is misleading tenants
    // about what reps see on their home/quest list.
    expect(screen.queryByText(base.subtitle)).not.toBeInTheDocument();
  });

  it("does NOT render any heart / bookmark / like glyph (iOS cards have none)", () => {
    const { container } = render(<QuestCardPreview {...base} questType="social_post" />);
    // We aren't asserting on lucide classnames directly — just make sure the
    // only icons present are the reward + proof-type glyphs we intend.
    // A simpler behavioural check: "Like", "Save", "Bookmark" labels absent.
    expect(screen.queryByLabelText(/like|bookmark|save/i)).not.toBeInTheDocument();
    // Class sanity — catches a rogue <Heart /> being re-added
    expect(container.querySelector("[data-lucide='heart']")).toBeNull();
  });

  it("falls back to a gradient (no image) when cover is empty", () => {
    const { container } = render(
      <QuestCardPreview {...base} coverImageUrl="" questType="social_post" />
    );
    // No <img> tag rendered — ensures the fallback branch ran.
    expect(container.querySelector("img")).toBeNull();
    // A gradient div is present (inline style contains "linear-gradient").
    const hasGradient = Array.from(container.querySelectorAll("div[style]")).some(
      (d) => (d.getAttribute("style") || "").includes("linear-gradient")
    );
    expect(hasGradient).toBe(true);
  });

  it("renders the cover image when provided (no fallback gradient)", () => {
    const { container } = render(
      <QuestCardPreview
        {...base}
        coverImageUrl="https://example.test/cover.jpg"
        questType="social_post"
      />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://example.test/cover.jpg");
  });

  it("renders the right proof hint for each proof_type", () => {
    const { rerender } = render(
      <QuestCardPreview {...base} proofType="tiktok_link" questType="social_post" />
    );
    expect(screen.getByText(/Paste TikTok link/i)).toBeInTheDocument();

    rerender(
      <QuestCardPreview {...base} proofType="instagram_link" questType="social_post" />
    );
    expect(screen.getByText(/Paste Instagram link/i)).toBeInTheDocument();

    rerender(<QuestCardPreview {...base} proofType="text" questType="custom" />);
    expect(screen.getByText(/Write short note/i)).toBeInTheDocument();
  });

  it("still renders (no crash + gradient present) when the promoter has no accent set", () => {
    // iOS default for OnDeckHero / card fallback is 0x4A1FFF. We don't
    // check the specific hex here because jsdom's CSS serialisation is
    // unpredictable; we just confirm the fallback branch renders something.
    const { container } = render(
      <QuestCardPreview
        {...base}
        promoterAccentHex={null}
        coverImageUrl=""
        questType="social_post"
      />
    );
    expect(container.querySelector("img")).toBeNull();
    const hasGradient = Array.from(container.querySelectorAll("div[style]")).some(
      (d) => (d.getAttribute("style") || "").includes("linear-gradient")
    );
    expect(hasGradient).toBe(true);
    // Title still renders — end-to-end proof the null-accent path doesn't throw
    expect(screen.getByText("Post a story")).toBeInTheDocument();
  });

  it("uses the right kind label for each QuestType", () => {
    const cases: Array<[typeof base.proofType extends never ? never : import("@/types/reps").QuestType, string]> = [
      ["social_post", "SOCIAL POST"],
      ["story_share", "STORY SHARE"],
      ["content_creation", "CREATE CONTENT"],
      ["custom", "CUSTOM"],
      ["sales_milestone", "SALES TARGET"],
    ];
    for (const [kind, label] of cases) {
      const { unmount } = render(<QuestCardPreview {...base} questType={kind} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("hides the EP chip when ep is 0 (XP-only quest)", () => {
    render(<QuestCardPreview {...base} ep={0} questType="social_post" />);
    // "50" (XP) still visible; the 10-EP chip is gone
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.queryByText("10")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// EP page flow explainer + tenant-shop clarity — we import the page component
// lazily. This isn't a deep admin integration test; it's a regression guard
// so the "only YOUR rewards flow back to you" + Entry Market disclaimer copy
// don't disappear in a future refactor.
// ---------------------------------------------------------------------------

describe("EP page: flow explainer disclaimer copy", () => {
  // Stub fetch to satisfy the page's mount-time loads with minimal shape.
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (typeof url === "string" && url.includes("/api/admin/ep/balance")) {
          return {
            ok: true,
            json: async () => ({
              data: {
                float: 5000,
                earned: 0,
                committed: 0,
                float_net_of_commitments: 5000,
                fiat_rate_pence: 1,
                float_pence: 5000,
                earned_pence_gross: 0,
                platform_cut_bps: 1000,
                earned_pence_net: 0,
                min_payout_pence: 1000,
                low_float_warning: false,
              },
            }),
          };
        }
        return { ok: true, json: async () => ({ data: [] }) };
      })
    );
  });

  it("renders the four-step flow strip with accurate language (no 'cut' jargon)", async () => {
    const mod = await import("@/app/admin/ep/page");
    const EpAdminPage = mod.default;
    render(<EpAdminPage />);

    // Four step titles must be present
    await waitFor(() => expect(screen.getByText("You buy EP")).toBeInTheDocument());
    expect(screen.getByText("Reps earn it")).toBeInTheDocument();
    expect(screen.getByText("Reps redeem")).toBeInTheDocument();
    expect(screen.getByText("You get paid")).toBeInTheDocument();

    // "cut" language was explicitly flagged by the user — the flow step now
    // says "10% Entry retains" instead of "minus our 10% cut". Guard it.
    expect(screen.getByText(/10% Entry retains/i)).toBeInTheDocument();
    expect(screen.queryByText(/10% cut/i)).not.toBeInTheDocument();
  });

  it("renders the Entry-Market disclaimer so tenants aren't surprised", async () => {
    const mod = await import("@/app/admin/ep/page");
    const EpAdminPage = mod.default;
    render(<EpAdminPage />);

    await waitFor(() =>
      expect(screen.getByText(/Entry Market/i)).toBeInTheDocument()
    );
    // Core idea that needs to be visible: Entry Market spending is not the
    // tenant's. Multiple sentences carry that meaning; assert at-least-one.
    const matches = screen.getAllByText(
      /they didn't buy from you|not shown here|not yours|Not shown here/i
    );
    expect(matches.length).toBeGreaterThan(0);
  });
});

