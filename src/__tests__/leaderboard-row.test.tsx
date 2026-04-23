/**
 * LeaderboardRow — render coverage for the rank-delta chip that the Dashboard
 * pulls from rep_rank_snapshots.
 *
 * The 5 states to prove:
 *   positive  → up arrow + number + success color
 *   negative  → down arrow + abs(number) + destructive color
 *   zero      → minus + "0"
 *   null      → "new" badge (no historical baseline yet)
 *   undefined → nothing (all-time mode, delta doesn't apply)
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LeaderboardEntry } from "@/components/admin/reps/LeaderboardRow";
import { LeaderboardRow } from "@/components/admin/reps/LeaderboardRow";

function base(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    id: "r1",
    display_name: "Amy",
    first_name: "Amy",
    last_name: null,
    photo_url: null,
    level: 6,
    total_sales: 12,
    total_revenue: 780,
    points_balance: 300,
    ...overrides,
  };
}

describe("LeaderboardRow rank delta", () => {
  it("shows an up arrow and the positive delta in success colour", () => {
    const rep = base({ rank: 1, delta_week: 3 });
    const { container } = render(<LeaderboardRow rank={1} rep={rep} />);
    const arrow = container.querySelector("svg.lucide-arrow-up");
    expect(arrow).toBeTruthy();
    const chipSpan = arrow!.closest("span");
    expect(chipSpan?.className).toContain("text-success");
    expect(chipSpan?.textContent).toContain("3");
  });

  it("shows a down arrow and the absolute delta in destructive colour", () => {
    const rep = base({ rank: 4, delta_week: -2 });
    const { container } = render(<LeaderboardRow rank={4} rep={rep} />);
    const arrow = container.querySelector("svg.lucide-arrow-down");
    expect(arrow).toBeTruthy();
    const chipSpan = arrow!.closest("span");
    expect(chipSpan?.className).toContain("text-destructive");
    // Chip renders abs(-2) = "2", not "-2"
    expect(chipSpan?.textContent).toContain("2");
    expect(chipSpan?.textContent).not.toContain("-");
  });

  it("shows '=' for zero delta (rank unchanged)", () => {
    const rep = base({ rank: 2, delta_week: 0 });
    const { container } = render(<LeaderboardRow rank={2} rep={rep} />);
    expect(container.querySelector("svg.lucide-minus")).toBeTruthy();
    expect(container.textContent).toContain("0");
  });

  it("shows 'new' badge when delta_week is null (no baseline snapshot yet)", () => {
    const rep = base({ rank: 5, delta_week: null });
    render(<LeaderboardRow rank={5} rep={rep} />);
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("renders no delta chip when delta_week is undefined (all-time mode)", () => {
    const rep = base({ delta_week: undefined });
    const { container } = render(<LeaderboardRow rank={1} rep={rep} />);
    expect(screen.queryByText("new")).toBeNull();
    expect(container.querySelector("svg.lucide-arrow-up")).toBeFalsy();
    expect(container.querySelector("svg.lucide-arrow-down")).toBeFalsy();
    expect(container.querySelector("svg.lucide-minus")).toBeFalsy();
  });

  it("prefers server-sent rank over the positional prop", () => {
    // positional says 1, but server says this rep is actually rank 7
    const rep = base({ rank: 7, delta_week: null });
    render(<LeaderboardRow rank={1} rep={rep} />);
    // rank column shows 7, not 1
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("falls back to positional rank when server rank is absent", () => {
    const rep = base(); // no rank field
    render(<LeaderboardRow rank={3} rep={rep} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
