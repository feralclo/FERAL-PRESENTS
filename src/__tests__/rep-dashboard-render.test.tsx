/**
 * DashboardTab render coverage — the tab composes 8 parallel fetches across
 * 7 different endpoints and renders 6 distinct sections. Smoke-test the
 * fixture shapes that matter: rich data, all-zero, and partial-error.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DashboardTab } from "@/components/admin/reps/DashboardTab";

type FetchResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

interface ResponseOption {
  ok: boolean;
  status?: number;
  body: unknown;
}

function mockEndpoints(map: Record<string, ResponseOption | unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request): Promise<FetchResponse> => {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
      for (const [pattern, cfg] of Object.entries(map)) {
        if (urlStr.includes(pattern)) {
          if (
            cfg &&
            typeof cfg === "object" &&
            "ok" in cfg &&
            typeof cfg.ok === "boolean"
          ) {
            const opt = cfg as ResponseOption;
            return {
              ok: opt.ok,
              status: opt.status ?? (opt.ok ? 200 : 500),
              json: async () => opt.body,
            };
          }
          return { ok: true, json: async () => cfg };
        }
      }
      return { ok: true, json: async () => ({ data: [] }) };
    })
  );
}

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Data-rich fixture — every section populated, iOS-grade
// ---------------------------------------------------------------------------

describe("DashboardTab: populated state", () => {
  it("renders identity bar + attention counts + leaderboard + live quests + activity", async () => {
    mockEndpoints({
      "/api/admin/promoter": {
        data: {
          handle: "feral",
          display_name: "FERAL PRESENTS",
          tagline: "Warehouse nights across the UK",
          bio: null,
          location: "London",
          accent_hex: 0xb845ff,
          avatar_url: null,
          avatar_initials: "F",
          avatar_bg_hex: null,
          cover_image_url: null,
          follower_count: 142,
          team_size: 6,
          visibility: "public",
        },
      },
      "/api/admin/ep/balance": {
        data: {
          float: 5000,
          earned: 0,
          committed: 500,
          float_net_of_commitments: 4500,
          float_pence: 5000,
          fiat_rate_pence: 1,
          low_float_warning: false,
        },
      },
      "/api/reps/stats": {
        data: {
          total_reps: 6,
          active_reps: 5,
          pending_applications: 1,
          total_sales_via_reps: 34,
          total_revenue_via_reps: 2140,
          active_quests: 4,
          pending_submissions: 12,
        },
      },
      "/api/reps/submissions": {
        data: [
          {
            id: "s1",
            status: "pending",
            created_at: new Date(Date.now() - 4 * 3_600_000).toISOString(),
            points_awarded: 0,
            rep: { id: "r1", display_name: "Amy", first_name: "Amy" },
            quest: { id: "q1", title: "Story share" },
          },
        ],
      },
      "/api/reps/claims?status=claimed": { data: [] },
      "/api/reps?status=pending&limit=50": { data: [], total: 0, page: 1, limit: 50 },
      "/api/reps/leaderboard": {
        data: [
          {
            id: "r1",
            display_name: "Amy",
            total_sales: 12,
            total_revenue: 780,
            level: 6,
            points_balance: 300,
          },
          {
            id: "r2",
            display_name: "Jordan",
            total_sales: 9,
            total_revenue: 560,
            level: 5,
            points_balance: 240,
          },
        ],
      },
      "/api/reps/quests?status=active": {
        data: [
          {
            id: "q1",
            title: "Story share — Saturday",
            status: "active",
            points_reward: 50,
            xp_reward: 50,
            currency_reward: 10,
            ep_reward: 10,
            total_completed: 3,
            max_completions: 5,
            pending_count: 2,
            auto_approve: false,
            cover_image_url: null,
            image_url: null,
            event: { name: "Saturday 26 Apr" },
          },
        ],
      },
    });

    render(<DashboardTab />);

    // Identity bar
    await waitFor(() =>
      expect(screen.getByText("FERAL PRESENTS")).toBeInTheDocument()
    );
    expect(screen.getByText(/@feral/)).toBeInTheDocument();
    expect(screen.getByText(/Warehouse nights/)).toBeInTheDocument();

    // Pending submissions attention card shows the count of 12 alongside
    // the label. The number appears elsewhere (e.g. weekly stats), so we
    // walk up from the label to the card and check its text content.
    const pendingLabel = screen.getByText(/pending submissions/i);
    const pendingCard = pendingLabel.closest("a");
    expect(pendingCard?.textContent).toContain("12");

    // Claims card shows 0 → renders zero state "All caught up"
    expect(screen.getAllByText(/All caught up/i).length).toBeGreaterThan(0);

    // Leaderboard rows — Amy appears in both leaderboard + activity feed,
    // so assert at-least-one match rather than exactly-one.
    expect(screen.getAllByText("Amy").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Jordan")).toBeInTheDocument();

    // Live quest row — pending count shown in both the attention-sublabel
    // (Oldest: … / "X pending") and the row pending badge, so allow >=1.
    expect(screen.getByText("Story share — Saturday")).toBeInTheDocument();
    expect(screen.getAllByText(/2 pending/).length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// All-zero state — fresh tenant, nothing to show
// ---------------------------------------------------------------------------

describe("DashboardTab: zero state", () => {
  it("renders all-caught-up attention cards + empty-state copy across sections", async () => {
    mockEndpoints({
      "/api/admin/promoter": {
        data: {
          handle: "neworg",
          display_name: "New Org",
          tagline: null,
          bio: null,
          location: null,
          accent_hex: 0x8b5cf6,
          avatar_url: null,
          avatar_initials: "N",
          avatar_bg_hex: null,
          cover_image_url: null,
          follower_count: 0,
          team_size: 0,
          visibility: "public",
        },
      },
      "/api/admin/ep/balance": {
        data: {
          float: 0,
          earned: 0,
          committed: 0,
          float_net_of_commitments: 0,
          float_pence: 0,
          fiat_rate_pence: 1,
          low_float_warning: false,
        },
      },
      "/api/reps/stats": {
        data: {
          total_reps: 0,
          active_reps: 0,
          pending_applications: 0,
          total_sales_via_reps: 0,
          total_revenue_via_reps: 0,
          active_quests: 0,
          pending_submissions: 0,
        },
      },
      "/api/reps/submissions": { data: [] },
      "/api/reps/claims?status=claimed": { data: [] },
      "/api/reps?status=pending&limit=50": { data: [], total: 0, page: 1, limit: 50 },
      "/api/reps/leaderboard": { data: [] },
      "/api/reps/quests?status=active": { data: [] },
    });

    render(<DashboardTab />);

    // Identity bar renders even with empty tagline
    await waitFor(() => expect(screen.getByText("New Org")).toBeInTheDocument());

    // All three attention cards should collapse to "All caught up"
    await waitFor(() => {
      expect(screen.getAllByText(/All caught up/i).length).toBe(3);
    });

    // Empty states for leaderboard + live quests
    expect(screen.getByText(/No reps yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No live quests/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing recent/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Partial-error state — leaderboard fetch fails, rest of the page still works
// ---------------------------------------------------------------------------

describe("DashboardTab: partial failure", () => {
  it("shows per-section retry when /api/reps/leaderboard fails; other sections render normally", async () => {
    mockEndpoints({
      "/api/admin/promoter": {
        data: {
          handle: "feral",
          display_name: "FERAL",
          tagline: null,
          bio: null,
          location: null,
          accent_hex: 0xb845ff,
          avatar_url: null,
          avatar_initials: "F",
          avatar_bg_hex: null,
          cover_image_url: null,
          follower_count: 1,
          team_size: 6,
          visibility: "public",
        },
      },
      "/api/admin/ep/balance": {
        data: {
          float: 1000,
          earned: 0,
          committed: 0,
          float_net_of_commitments: 1000,
          float_pence: 1000,
          fiat_rate_pence: 1,
          low_float_warning: false,
        },
      },
      "/api/reps/stats": {
        data: {
          total_reps: 6,
          active_reps: 6,
          pending_applications: 0,
          total_sales_via_reps: 0,
          total_revenue_via_reps: 0,
          active_quests: 0,
          pending_submissions: 0,
        },
      },
      "/api/reps/submissions": { data: [] },
      "/api/reps/claims?status=claimed": { data: [] },
      "/api/reps?status=pending&limit=50": { data: [], total: 0, page: 1, limit: 50 },
      // Leaderboard returns 500 — the only section that should show an error
      "/api/reps/leaderboard": { ok: false, status: 500, body: { error: "boom" } },
      "/api/reps/quests?status=active": { data: [] },
    });

    render(<DashboardTab />);

    // Rest of the page still works
    await waitFor(() => expect(screen.getByText("FERAL")).toBeInTheDocument());
    expect(screen.getAllByText(/All caught up/i).length).toBe(3);

    // Leaderboard section shows a retry control
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });
});
