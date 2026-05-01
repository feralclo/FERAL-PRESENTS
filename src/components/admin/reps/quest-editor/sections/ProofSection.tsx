"use client";

import { Camera, Hash, Instagram, Link as LinkIcon, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { QuestProofType } from "@/types/reps";
import type { SectionProps } from "../types";

/**
 * How reps submit proof. Default: screenshot.
 *
 * Note: `proof_type === "none"` is intentionally absent — iOS has no
 * submission UI for it (renders EmptyView), so creating one would ship
 * a dead-end quest. The admin POST handler blocks it server-side too.
 *
 * Because every quest has a proof_type, this chip is always "filled"
 * — the closed-state header reads "Proof · screenshot" by default.
 * Clearing the chip resets to screenshot rather than nulling.
 */

interface ProofOption {
  value: QuestProofType;
  label: string;
  icon: LucideIcon;
  hint: string;
}

const PROOF_OPTIONS: ReadonlyArray<ProofOption> = [
  {
    value: "screenshot",
    label: "Screenshot",
    icon: Camera,
    hint: "Rep uploads an image",
  },
  {
    value: "url",
    label: "URL",
    icon: LinkIcon,
    hint: "Rep pastes a link to their post",
  },
  {
    value: "instagram_link",
    label: "Instagram",
    icon: Instagram,
    hint: "Rep pastes their Instagram post URL",
  },
  {
    value: "tiktok_link",
    label: "TikTok",
    icon: Hash,
    hint: "Rep pastes their TikTok post URL",
  },
  {
    value: "text",
    label: "Text",
    icon: Type,
    hint: "Rep writes a short note",
  },
];

export function ProofSection({ state, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Pick how reps prove they completed the quest. Most stories work fine with a screenshot.
      </p>
      <div
        role="radiogroup"
        aria-label="Proof type"
        className="grid gap-2 sm:grid-cols-2"
      >
        {PROOF_OPTIONS.map((option) => (
          <ProofOptionButton
            key={option.value}
            option={option}
            selected={state.proof_type === option.value}
            onPick={() => onChange({ proof_type: option.value })}
          />
        ))}
      </div>
    </div>
  );
}

interface ProofOptionButtonProps {
  option: ProofOption;
  selected: boolean;
  onPick: () => void;
}

function ProofOptionButton({ option, selected, onPick }: ProofOptionButtonProps) {
  const Icon = option.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={[
        "flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary bg-primary/[0.05] shadow-sm"
          : "border-border/60 bg-card hover:border-border",
      ].join(" ")}
    >
      <span
        className={[
          "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          selected ? "bg-primary/15 text-primary" : "bg-foreground/[0.04] text-muted-foreground",
        ].join(" ")}
        aria-hidden="true"
      >
        <Icon size={14} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p
          className={[
            "text-sm font-medium",
            selected ? "text-foreground" : "text-foreground",
          ].join(" ")}
        >
          {option.label}
        </p>
        <p className="text-[11px] text-muted-foreground">{option.hint}</p>
      </div>
    </button>
  );
}

/**
 * Closed-chip summary — always returns the human label of the current
 * proof_type. Since `screenshot` is the default, the chip is always
 * "filled" with this summary visible.
 */
export function proofChipSummary(proofType: QuestProofType): string {
  return PROOF_OPTIONS.find((o) => o.value === proofType)?.label.toLowerCase() ?? "screenshot";
}
