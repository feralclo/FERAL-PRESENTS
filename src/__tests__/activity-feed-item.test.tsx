/**
 * ActivityFeedItem — locks in the new v2 activity kinds and the pitch-preview
 * detail line added for join-request items.
 *
 * The dashboard activity feed now routes through 11 kinds (up from 7 in v1).
 * Each mapping is trivial, but regressions here silently swap an icon or
 * mis-labels an item, so pin the contract.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ActivityFeedItem,
  type ActivityItem,
  type ActivityKind,
} from "@/components/admin/reps/ActivityFeedItem";

function item(overrides: Partial<ActivityItem> & { kind: ActivityKind }): ActivityItem {
  return {
    id: "act-1",
    when: new Date(Date.now() - 10 * 60_000).toISOString(),
    actor: "Amy",
    ...overrides,
  };
}

describe("ActivityFeedItem new kinds", () => {
  it("renders 'needs changes' label for submission_requires_revision", () => {
    render(
      <ActivityFeedItem
        item={item({
          kind: "submission_requires_revision",
          subject: "Story share",
        })}
      />
    );
    expect(screen.getByText(/needs changes/)).toBeInTheDocument();
    expect(screen.getByText(/Story share/)).toBeInTheDocument();
  });

  it("renders 'fulfilling' label + truck icon for claim_fulfilling", () => {
    const { container } = render(
      <ActivityFeedItem
        item={item({ kind: "claim_fulfilling", subject: "Free +1 entry" })}
      />
    );
    expect(screen.getByText(/fulfilling/)).toBeInTheDocument();
    expect(container.querySelector("svg.lucide-truck")).toBeTruthy();
  });

  it("renders 'claim cancelled' for claim_cancelled", () => {
    const { container } = render(
      <ActivityFeedItem item={item({ kind: "claim_cancelled" })} />
    );
    expect(screen.getByText(/claim cancelled/)).toBeInTheDocument();
    expect(container.querySelector("svg.lucide-ban")).toBeTruthy();
  });

  it("renders 'claim failed' with destructive alert icon", () => {
    const { container } = render(
      <ActivityFeedItem item={item({ kind: "claim_failed" })} />
    );
    expect(screen.getByText(/claim failed/)).toBeInTheDocument();
    const svg = container.querySelector("svg.lucide-triangle-alert")
      || container.querySelector("svg.lucide-alert-triangle");
    expect(svg).toBeTruthy();
  });
});

describe("ActivityFeedItem pitch preview", () => {
  it("renders the pitch on a join_request when detail is present", () => {
    render(
      <ActivityFeedItem
        item={item({
          kind: "join_request",
          detail: "Big fan of FERAL — would love to rep Bristol shows",
        })}
      />
    );
    expect(
      screen.getByText(/Big fan of FERAL/)
    ).toBeInTheDocument();
  });

  it("omits the pitch line when detail is null or empty", () => {
    const { container } = render(
      <ActivityFeedItem
        item={item({ kind: "join_request", detail: null })}
      />
    );
    // No italic line with quote marks should render
    expect(container.querySelector("p.italic")).toBeFalsy();
  });

  it("truncates long pitches (line-clamp) but exposes the full text in title", () => {
    const long =
      "This is a very long pitch text that should be clamped visually in the UI but still fully accessible via hover to keep the feed compact and scannable.";
    const { container } = render(
      <ActivityFeedItem
        item={item({ kind: "join_request", detail: long })}
      />
    );
    const pitchLine = container.querySelector("p.italic");
    expect(pitchLine?.className).toContain("line-clamp-2");
    expect(pitchLine?.getAttribute("title")).toBe(long);
  });
});
