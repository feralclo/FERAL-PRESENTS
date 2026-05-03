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
 * Each card carries a row of concrete example chips at the bottom so a
 * first-time host can pattern-match without reading the description —
 * "oh, that's where 'first to 25 tickets' goes." Borders + soft shadows,
 * no glass, sentence-case throughout.
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
  /** Three concrete examples shown as chips at the bottom of the card. */
  examples: ReadonlyArray<string>;
}

const OPTIONS: ReadonlyArray<QuestTypeOption> = [
  {
    kind: "post_on_social",
    icon: Smartphone,
    title: "Post on social",
    description: "Reps share to TikTok or Instagram and tag your event.",
    examples: ["Story share", "TikTok post", "Recreate this reel"],
  },
  {
    kind: "sales_target",
    icon: TrendingUp,
    title: "Hit a sales target",
    description: "Reps race to sell a number of tickets. First to the line wins.",
    examples: ["First to 25", "Sell 50 tonight", "Top of the leaderboard"],
  },
  {
    kind: "something_else",
    icon: Sparkles,
    title: "Something else",
    description: "Anything that doesn't fit the other two — describe it in your own words.",
    examples: ["Group chat shoutout", "Photo of the night", "Flyer the queue"],
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
        group relative flex h-full flex-col items-start gap-4
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
          inline-flex h-11 w-11 items-center justify-center rounded-lg
          bg-primary/10 text-primary
          transition-colors group-hover:bg-primary/15
        "
      >
        <Icon size={22} strokeWidth={1.75} />
      </span>

      <div className="space-y-1.5">
        <h3 className="text-base font-semibold tracking-tight">
          {option.title}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {option.description}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {option.examples.map((example) => (
          <span
            key={example}
            className="
              rounded-full border border-border/40 bg-foreground/[0.03]
              px-2 py-0.5 font-mono text-[10px] font-medium tracking-tight
              text-muted-foreground
              transition-colors
              group-hover:border-primary/20 group-hover:text-foreground/80
            "
          >
            {example}
          </span>
        ))}
      </div>
    </button>
  );
}
