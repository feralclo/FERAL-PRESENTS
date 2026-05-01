"use client";

import type { QuestKind } from "./types";

/**
 * Three-tile visual quest-type picker. Phase 1.2 fills this in with
 * full-bleed cards (Post on social / Hit a sales target / Something else).
 * The DB still stores 5 underlying `quest_type` values — this layer just
 * stops asking the host to think in those terms.
 */
export interface QuestTypeStepProps {
  onPick: (kind: QuestKind) => void;
  onClose: () => void;
}

export function QuestTypeStep({ onPick, onClose }: QuestTypeStepProps) {
  // Phase 1.1 stub — minimal trio of buttons. Phase 1.2 replaces with
  // the proper picker. Wired now so the orchestrator + form pipeline
  // can be exercised end-to-end during the rebuild.
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">What kind of quest?</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => onPick("post_on_social")}
          className="rounded-lg border border-border/40 bg-card px-5 py-4 text-left hover:border-border"
        >
          <div className="text-sm font-semibold">Post on social</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Story, feed, or make-your-own
          </div>
        </button>
        <button
          type="button"
          onClick={() => onPick("sales_target")}
          className="rounded-lg border border-border/40 bg-card px-5 py-4 text-left hover:border-border"
        >
          <div className="text-sm font-semibold">Hit a sales target</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Reps race to sell N tickets
          </div>
        </button>
        <button
          type="button"
          onClick={() => onPick("something_else")}
          className="rounded-lg border border-border/40 bg-card px-5 py-4 text-left hover:border-border"
        >
          <div className="text-sm font-semibold">Something else</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Define your own task
          </div>
        </button>
      </div>
    </div>
  );
}
