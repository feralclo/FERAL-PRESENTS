"use client";

import { Smartphone, TrendingUp, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { QuestKind } from "./types";

/**
 * Three-tile visual quest-type picker. The DB still stores 5 underlying
 * `quest_type` values — this layer collapses social_post / story_share /
 * content_creation under a single "Post on social" card and lets the
 * sub-toggle inside the form pick which.
 *
 * Design language: borders + soft shadows, no glass, hover lifts via
 * `border-primary/30` + `bg-primary/[0.03]`. Match the quality bar set
 * by `BrandPreview.tsx`. Sentence case throughout.
 */
export interface QuestTypeStepProps {
  onPick: (kind: QuestKind) => void;
  onClose: () => void;
}

interface QuestTypeOption {
  kind: QuestKind;
  icon: LucideIcon;
  title: string;
  description: string;
  hint: string;
}

const OPTIONS: ReadonlyArray<QuestTypeOption> = [
  {
    kind: "post_on_social",
    icon: Smartphone,
    title: "Post on social",
    description: "Reps share something to TikTok or Instagram — a story, a feed post, or original content.",
    hint: "Most quests live here.",
  },
  {
    kind: "sales_target",
    icon: TrendingUp,
    title: "Hit a sales target",
    description: "Reps race to sell a number of tickets. Best for promoter showdowns and event-week pushes.",
    hint: "Pick this for sales pushes.",
  },
  {
    kind: "something_else",
    icon: Sparkles,
    title: "Something else",
    description: "Define a custom task in your own words — flyering, photo-of-the-night, anything.",
    hint: "When the others don't fit.",
  },
];

export function QuestTypeStep({ onPick, onClose }: QuestTypeStepProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          New quest
        </p>
        <h2 className="text-xl font-semibold tracking-tight">
          What kind of quest?
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick the shape — you can change every detail on the next screen.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {OPTIONS.map((option) => (
          <QuestTypeCard
            key={option.kind}
            option={option}
            onPick={() => onPick(option.kind)}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface QuestTypeCardProps {
  option: QuestTypeOption;
  onPick: () => void;
}

function QuestTypeCard({ option, onPick }: QuestTypeCardProps) {
  const Icon = option.icon;
  return (
    <button
      type="button"
      onClick={onPick}
      className="
        group relative flex h-44 flex-col items-start justify-between gap-3
        rounded-lg border border-border/40 bg-card p-5 text-left
        shadow-sm transition-all
        hover:border-primary/40 hover:bg-primary/[0.03] hover:shadow
        focus-visible:border-primary focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-primary/40
      "
    >
      <span
        aria-hidden="true"
        className="
          inline-flex h-9 w-9 items-center justify-center rounded-md
          bg-primary/10 text-primary
          transition-colors group-hover:bg-primary/15
        "
      >
        <Icon size={20} strokeWidth={1.75} />
      </span>

      <div className="space-y-1">
        <h3 className="text-base font-semibold tracking-tight">
          {option.title}
        </h3>
        <p className="text-xs leading-snug text-muted-foreground">
          {option.description}
        </p>
      </div>

      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
        {option.hint}
      </span>
    </button>
  );
}
