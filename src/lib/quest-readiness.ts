/**
 * Pure readiness scoring for a quest in the redesigned editor.
 *
 * Mirrors `event-readiness.ts` in shape — runs every keystroke,
 * deterministic, easy to unit-test. The orchestrator passes any
 * input that needs a fetch (e.g. pool asset count) so this module
 * stays pure.
 *
 * The redesigned quest editor's UX is "Save = draft, Publish = active".
 * `canPublish` gates the Publish button; failing rules surface in a
 * tooltip on hover so the host knows exactly what's missing.
 */
import type { QuestKind } from "@/components/admin/reps/quest-editor/types";

export type QuestReadinessSeverity = "required";
export type QuestReadinessStatus = "ok" | "fail";

export interface QuestReadinessRule {
  id: "title" | "quest_kind" | "sales_target" | "pool_campaign" | "pool_assets";
  label: string;
  severity: QuestReadinessSeverity;
  status: QuestReadinessStatus;
  /** Human reason shown when `status === "fail"`. */
  reason?: string;
}

export interface QuestReadinessReport {
  canPublish: boolean;
  rules: QuestReadinessRule[];
  /** Required rules failing — used for the Publish-button tooltip. */
  blockers: QuestReadinessRule[];
}

export interface QuestReadinessInput {
  title: string;
  kind: QuestKind | null;
  asset_mode: "single" | "pool";
  asset_campaign_tag: string | null;
  /**
   * Number of assets in the pool, if known. Pass `undefined` when
   * the count hasn't been fetched — the pool_assets rule is skipped
   * in that case (the orchestrator can re-check after fetching).
   */
  poolAssetCount?: number;
  sales_target: number | null;
}

export function assessQuest(input: QuestReadinessInput): QuestReadinessReport {
  const rules: QuestReadinessRule[] = [];

  // 1. Title (≥ 3 chars). The legacy editor blocked saves on this too;
  //    iOS chokes on 1-char titles in the card layout.
  const titleOk = input.title.trim().length >= 3;
  rules.push({
    id: "title",
    label: "Title at least 3 characters",
    severity: "required",
    status: titleOk ? "ok" : "fail",
    reason: titleOk ? undefined : "Add a title — three characters or more",
  });

  // 2. Quest type chosen. In the redesigned editor `kind` is set by the
  //    3-tile picker; if it's null the form isn't rendered yet, but we
  //    keep the rule explicit for future-proofing.
  rules.push({
    id: "quest_kind",
    label: "Quest type chosen",
    severity: "required",
    status: input.kind ? "ok" : "fail",
    reason: input.kind ? undefined : "Pick a quest type",
  });

  // 3. Sales target — required only when the kind is "sales_target".
  if (input.kind === "sales_target") {
    const ok = (input.sales_target ?? 0) >= 1;
    rules.push({
      id: "sales_target",
      label: "Sales target at least 1",
      severity: "required",
      status: ok ? "ok" : "fail",
      reason: ok ? undefined : "Set a target of at least 1 ticket",
    });
  }

  // 4. Pool branch — required only when asset_mode === "pool".
  if (input.asset_mode === "pool") {
    const tagOk = !!input.asset_campaign_tag;
    rules.push({
      id: "pool_campaign",
      label: "Campaign chosen",
      severity: "required",
      status: tagOk ? "ok" : "fail",
      reason: tagOk ? undefined : "Pick a campaign for the shareable pool",
    });

    if (input.poolAssetCount !== undefined) {
      const ok = input.poolAssetCount >= 1;
      rules.push({
        id: "pool_assets",
        label: "At least one asset uploaded",
        severity: "required",
        status: ok ? "ok" : "fail",
        reason: ok
          ? undefined
          : "Upload at least one image or video to the campaign",
      });
    }
  }

  const blockers = rules.filter(
    (r) => r.severity === "required" && r.status === "fail"
  );

  return {
    canPublish: blockers.length === 0,
    rules,
    blockers,
  };
}
