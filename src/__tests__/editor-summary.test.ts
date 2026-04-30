import { describe, it, expect } from "vitest";
import { summariseEditor } from "@/lib/editor-summary";
import type {
  ReadinessReport,
  ReadinessRule,
} from "@/lib/event-readiness";

function rule(
  id: ReadinessRule["id"],
  status: ReadinessRule["status"],
  severity: ReadinessRule["severity"] = "required",
  anchor: ReadinessRule["anchor"] = "identity",
  weight = 10
): ReadinessRule {
  return {
    id,
    label: `Rule ${id}`,
    severity,
    weight,
    status,
    anchor,
  };
}

function report(rules: ReadinessRule[]): ReadinessReport {
  const blockers = rules.filter(
    (r) => r.severity === "required" && r.status !== "ok"
  );
  const score = rules
    .filter((r) => r.status === "ok")
    .reduce((acc, r) => acc + r.weight, 0);
  return {
    score,
    canPublish: blockers.length === 0,
    rules,
    blockers,
  };
}

describe("summariseEditor", () => {
  it("returns the live state when status === live", () => {
    const out = summariseEditor(
      report([
        rule("date_in_future", "ok"),
        rule("ticket_on_sale", "ok"),
        rule("payment_ready", "ok"),
        rule("cover_image", "ok"),
      ]),
      "live"
    );
    expect(out.mood).toBe("live");
    expect(out.headline).toMatch(/live/i);
  });

  it("celebrates ready-to-publish when every required rule passes", () => {
    const out = summariseEditor(
      report([
        rule("date_in_future", "ok"),
        rule("ticket_on_sale", "ok"),
        rule("payment_ready", "ok"),
        rule("cover_image", "ok"),
      ]),
      "draft"
    );
    expect(out.mood).toBe("ready");
    expect(out.headline).toMatch(/ready to publish/i);
    expect(out.blockerCount).toBe(0);
    expect(out.nextStep).toBeNull();
  });

  it("notes optional tweaks remaining when ready but recommended rules are open", () => {
    const out = summariseEditor(
      report([
        rule("date_in_future", "ok"),
        rule("ticket_on_sale", "ok"),
        rule("payment_ready", "ok"),
        rule("cover_image", "ok"),
        rule("description", "fail", "recommended", "story"),
      ]),
      "draft"
    );
    expect(out.mood).toBe("ready");
    expect(out.subline).toMatch(/optional/i);
    expect(out.nextStep?.rule.id).toBe("description");
  });

  it("uses '1 step from going live' when exactly one required blocker", () => {
    const out = summariseEditor(
      report([
        rule("date_in_future", "ok"),
        rule("ticket_on_sale", "ok"),
        rule("payment_ready", "ok"),
        rule("cover_image", "fail"),
      ]),
      "draft"
    );
    expect(out.headline).toBe("1 step from going live");
    expect(out.blockerCount).toBe(1);
    expect(out.nextStep?.rule.id).toBe("cover_image");
    expect(out.nextStep?.actionLabel).toBe("Add a cover image");
  });

  it("uses '2 steps from going live' for two required blockers", () => {
    const out = summariseEditor(
      report([
        rule("date_in_future", "ok"),
        rule("ticket_on_sale", "fail"),
        rule("payment_ready", "fail"),
        rule("cover_image", "ok"),
      ]),
      "draft"
    );
    expect(out.headline).toBe("2 steps from going live");
    expect(out.mood).toBe("in_progress");
  });

  it("falls back to early-stage messaging when 3+ required gaps remain", () => {
    const out = summariseEditor(
      report([
        rule("date_in_future", "fail"),
        rule("ticket_on_sale", "fail"),
        rule("payment_ready", "fail"),
        rule("cover_image", "fail"),
      ]),
      "draft"
    );
    expect(out.mood).toBe("early");
    expect(out.headline).toMatch(/get this set up/i);
    expect(out.blockerCount).toBe(4);
  });

  it("prioritises required failures over recommended warnings for nextStep", () => {
    const out = summariseEditor(
      report([
        rule("date_in_future", "ok"),
        rule("description", "fail", "recommended", "story"),
        rule("ticket_on_sale", "fail"),
      ]),
      "draft"
    );
    expect(out.nextStep?.rule.id).toBe("ticket_on_sale");
  });

  it("uses imperative action labels for known rule ids", () => {
    const ids: { id: import("@/lib/event-readiness").ReadinessRule["id"]; expect: RegExp }[] = [
      { id: "date_in_future", expect: /set the event date/i },
      { id: "ticket_on_sale", expect: /add a ticket/i },
      { id: "payment_ready", expect: /connect payments/i },
      { id: "cover_image", expect: /add a cover image/i },
      { id: "lineup", expect: /add the lineup/i },
    ];
    for (const { id, expect: re } of ids) {
      const r = report([rule(id, "fail")]);
      const out = summariseEditor(r, "draft");
      expect(out.nextStep?.actionLabel).toMatch(re);
    }
  });

  it("handles cancelled and archived states", () => {
    expect(
      summariseEditor(report([rule("date_in_future", "ok")]), "cancelled")
        .headline
    ).toMatch(/cancelled/i);
    expect(
      summariseEditor(report([rule("date_in_future", "ok")]), "archived")
        .headline
    ).toMatch(/archived/i);
  });
});
