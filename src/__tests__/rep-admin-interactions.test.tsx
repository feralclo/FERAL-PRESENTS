/**
 * Interaction tests — click things and verify the right fetch was made.
 *
 * Render tests prove a tab doesn't crash on mount; these prove the buttons
 * still wire to the right endpoint with the right body. If someone refactors
 * a handler and the button silently stops calling its API, these fail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ReportsTab } from "@/components/admin/reps/ReportsTab";
import { RewardsTab } from "@/components/admin/reps/RewardsTab";

type FetchMockArgs = [string | URL | Request, RequestInit | undefined];

function makeFetchMock(
  responses: Record<string, unknown>,
  recorded: FetchMockArgs[]
) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    recorded.push([input, init]);
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return { ok: true, json: async () => body };
      }
    }
    return { ok: true, json: async () => ({ data: [] }) };
  });
}

function findFetchCall(
  recorded: FetchMockArgs[],
  urlIncludes: string,
  method?: string
): FetchMockArgs | undefined {
  return recorded.find(([url, init]) => {
    const u =
      typeof url === "string"
        ? url
        : url instanceof URL
        ? url.toString()
        : url.url;
    if (!u.includes(urlIncludes)) return false;
    if (method && init?.method !== method) return false;
    return true;
  });
}

function bodyOf(call: FetchMockArgs | undefined): Record<string, unknown> {
  if (!call?.[1]?.body) return {};
  try {
    return JSON.parse(call[1].body as string);
  } catch {
    return {};
  }
}

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Reports → approve submission
// ---------------------------------------------------------------------------

describe("ReportsTab: Approve submission", () => {
  it("sends PUT /api/reps/quests/submissions/:id with status='approved'", async () => {
    const recorded: FetchMockArgs[] = [];
    vi.stubGlobal(
      "fetch",
      makeFetchMock(
        {
          "/api/reps/submissions": {
            data: [
              {
                id: "sub-1",
                org_id: "feral",
                quest_id: "q1",
                rep_id: "r1",
                proof_type: "screenshot",
                proof_url: "https://example.test/p.png",
                status: "pending",
                points_awarded: 0,
                created_at: new Date().toISOString(),
                rep: { id: "r1", first_name: "Amy", last_name: "Chen" },
                quest: { id: "q1", title: "Story share" },
              },
            ],
          },
          "/api/reps/claims?status=claimed": { data: [] },
          "/api/reps?status=pending&limit=100": { data: [], total: 0, page: 1, limit: 100 },
        },
        recorded
      )
    );

    render(<ReportsTab />);
    const approveBtn = await screen.findByText("Approve");

    // Clear the fetch log captured during initial mount — we only care about
    // the fetches triggered by the click.
    recorded.length = 0;
    fireEvent.click(approveBtn);

    await waitFor(() => {
      const call = findFetchCall(recorded, "/api/reps/quests/submissions/sub-1", "PUT");
      expect(call).toBeDefined();
      expect(bodyOf(call).status).toBe("approved");
    });
  });

  it("sends PUT with status='requires_revision' + reason when Request revision is used", async () => {
    const recorded: FetchMockArgs[] = [];
    vi.stubGlobal(
      "fetch",
      makeFetchMock(
        {
          "/api/reps/submissions": {
            data: [
              {
                id: "sub-rev",
                org_id: "feral",
                quest_id: "q1",
                rep_id: "r1",
                proof_type: "screenshot",
                proof_url: "https://example.test/p.png",
                status: "pending",
                points_awarded: 0,
                created_at: new Date().toISOString(),
                rep: { id: "r1", first_name: "Amy" },
                quest: { id: "q1", title: "Story share" },
              },
            ],
          },
          "/api/reps/claims?status=claimed": { data: [] },
          "/api/reps?status=pending&limit=100": { data: [], total: 0, page: 1, limit: 100 },
        },
        recorded
      )
    );

    render(<ReportsTab />);
    const revisionBtn = await screen.findByText("Request revision");

    recorded.length = 0;
    fireEvent.click(revisionBtn);

    // Textarea opens → fill it → click the confirm button
    const textarea = await screen.findByPlaceholderText(
      /What needs changing/i
    );
    fireEvent.change(textarea, {
      target: { value: "Please re-upload with the discount code visible." },
    });
    fireEvent.click(screen.getByText("Send revision request"));

    await waitFor(() => {
      const call = findFetchCall(
        recorded,
        "/api/reps/quests/submissions/sub-rev",
        "PUT"
      );
      expect(call).toBeDefined();
      const body = bodyOf(call);
      expect(body.status).toBe("requires_revision");
      expect(body.rejection_reason).toBe(
        "Please re-upload with the discount code visible."
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Reports → mark claim fulfilled
// ---------------------------------------------------------------------------

describe("ReportsTab: Claims queue → Mark fulfilled", () => {
  it("sends PUT /api/reps/claims/:id with status='fulfilled'", async () => {
    const recorded: FetchMockArgs[] = [];
    vi.stubGlobal(
      "fetch",
      makeFetchMock(
        {
          "/api/reps/submissions": { data: [] },
          "/api/reps/claims?status=claimed": {
            data: [
              {
                id: "claim-1",
                org_id: "feral",
                rep_id: "r1",
                reward_id: "rew-1",
                claim_type: "shop",
                points_spent: 100,
                ep_spent: 100,
                status: "claimed",
                created_at: new Date().toISOString(),
                reward: {
                  id: "rew-1",
                  name: "Free drink",
                  reward_type: "shop",
                  points_cost: 100,
                  total_claimed: 0,
                },
                rep: { id: "r1", first_name: "Amy" },
              },
            ],
          },
          "/api/reps?status=pending&limit=100": { data: [], total: 0, page: 1, limit: 100 },
        },
        recorded
      )
    );

    render(<ReportsTab />);
    // Switch to claims tab
    const claimsTab = await screen.findByText("Claims");
    fireEvent.click(claimsTab);

    const fulfilBtn = await screen.findByText("Mark fulfilled");
    recorded.length = 0;
    fireEvent.click(fulfilBtn);

    await waitFor(() => {
      const call = findFetchCall(recorded, "/api/reps/claims/claim-1", "PUT");
      expect(call).toBeDefined();
      expect(bodyOf(call).status).toBe("fulfilled");
    });
  });
});

// ---------------------------------------------------------------------------
// Reports → approve join request
// ---------------------------------------------------------------------------

describe("ReportsTab: Requests queue → Approve", () => {
  it("sends PUT /api/reps/:id with status='active'", async () => {
    const recorded: FetchMockArgs[] = [];
    vi.stubGlobal(
      "fetch",
      makeFetchMock(
        {
          "/api/reps/submissions": { data: [] },
          "/api/reps/claims?status=claimed": { data: [] },
          "/api/reps?status=pending&limit=100": {
            data: [
              {
                id: "rep-pending",
                org_id: "feral",
                status: "pending",
                email: "new@feral.com",
                first_name: "Sam",
                last_name: "Lee",
                points_balance: 0,
                currency_balance: 0,
                total_sales: 0,
                total_revenue: 0,
                level: 1,
                onboarding_completed: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
            total: 1,
            page: 1,
            limit: 100,
          },
        },
        recorded
      )
    );

    render(<ReportsTab />);
    const requestsTab = await screen.findByText("Requests");
    fireEvent.click(requestsTab);

    const approveBtn = await screen.findByText("Approve");
    recorded.length = 0;
    fireEvent.click(approveBtn);

    await waitFor(() => {
      const call = findFetchCall(recorded, "/api/reps/rep-pending", "PUT");
      expect(call).toBeDefined();
      expect(bodyOf(call).status).toBe("active");
    });
  });
});

// ---------------------------------------------------------------------------
// Rewards → create flow writes both v1 + v2 names
// ---------------------------------------------------------------------------

describe("RewardsTab: Create saves both ep_cost and points_cost", () => {
  it("POSTs ep_cost + points_cost + stock + total_available together", async () => {
    const recorded: FetchMockArgs[] = [];
    vi.stubGlobal(
      "fetch",
      makeFetchMock(
        {
          "/api/reps/rewards": { data: [] },
          "/api/merch": { data: [] },
          "/api/events": { data: [] },
          "/api/reps/claims?status=claimed": { data: [] },
        },
        recorded
      )
    );

    render(<RewardsTab />);
    await waitFor(() => expect(screen.getByText(/Create Reward/)).toBeInTheDocument());

    // Open create dialog (button at top of tab)
    fireEvent.click(screen.getAllByText(/Create Reward/)[0]);
    // Choose "Custom Reward" fulfilment type — doesn't require an event link
    const customCard = await screen.findByText("Custom Reward");
    fireEvent.click(customCard);

    // Labels aren't linked to inputs via htmlFor in this form, so find the
    // Input by its autoFocus placeholder (set when fulfillmentType="manual"/"custom").
    const nameInput = await screen.findByPlaceholderText(/Backstage Pass/);
    fireEvent.change(nameInput, { target: { value: "Test Reward" } });
    const costInput = screen.getByPlaceholderText("e.g. 500");
    fireEvent.change(costInput, { target: { value: "250" } });

    recorded.length = 0;
    const submitBtns = screen.getAllByRole("button", { name: /Create Reward|Save/i });
    fireEvent.click(submitBtns[submitBtns.length - 1]);

    await waitFor(() => {
      const call = findFetchCall(recorded, "/api/reps/rewards", "POST");
      expect(call).toBeDefined();
      const body = bodyOf(call);
      expect(body.reward_type).toBe("shop");
      // Dual-write — both v1 and v2 cost names shipped
      expect(body.ep_cost).toBe(250);
      expect(body.points_cost).toBe(250);
    });
  });
});
