"use client";

import { Music } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { QuestPlatform } from "@/types/reps";
import type { SectionProps, SocialSubType } from "../types";

/**
 * Where the rep posts. Only rendered when `state.kind === "post_on_social"`
 * (the orchestrator gates the chip itself, not this section).
 *
 * Sub-toggle (Story / Feed / Make-your-own) drives which underlying
 * `quest_type` the row writes — XP prefill on sub-type changes is
 * handled by `QuestEditor`'s onChange interceptor so the legacy
 * "type changed → reset XP" behaviour is preserved.
 *
 * "Uses specific sound" is TikTok-only — Instagram has no equivalent
 * primitive, so the switch hides on Instagram / Either.
 */

interface SubTypeOption {
  value: SocialSubType;
  label: string;
  hint: string;
}

const SUB_TYPE_OPTIONS: ReadonlyArray<SubTypeOption> = [
  { value: "story", label: "Story", hint: "Reps share to their story" },
  { value: "feed", label: "Feed post", hint: "Reps post to their feed" },
  { value: "make_your_own", label: "Make-your-own", hint: "Reps post original content" },
];

interface PlatformOption {
  value: QuestPlatform;
  label: string;
}

const PLATFORM_OPTIONS: ReadonlyArray<PlatformOption> = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "any", label: "Either" },
];

export function PlatformSection({ state, onChange }: SectionProps) {
  return (
    <div className="space-y-5">
      {/* Sub-toggle */}
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-foreground">
          Format
        </legend>
        <div
          role="radiogroup"
          aria-label="Format"
          className="grid grid-cols-3 gap-2"
        >
          {SUB_TYPE_OPTIONS.map((option) => (
            <SegmentedButton
              key={option.value}
              selected={state.socialSubType === option.value}
              onClick={() => onChange({ socialSubType: option.value })}
              label={option.label}
              hint={option.hint}
            />
          ))}
        </div>
      </fieldset>

      {/* Platform */}
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-foreground">
          Platform
        </legend>
        <div
          role="radiogroup"
          aria-label="Platform"
          className="grid grid-cols-3 gap-2"
        >
          {PLATFORM_OPTIONS.map((option) => (
            <SegmentedButton
              key={option.value}
              selected={state.platform === option.value}
              onClick={() => onChange({ platform: option.value })}
              label={option.label}
            />
          ))}
        </div>
      </fieldset>

      {/* Reference link */}
      <div className="space-y-2">
        <label
          htmlFor="quest-reference-url"
          className="block text-[13px] font-medium text-foreground"
        >
          Reference link
          <span className="ml-1.5 font-normal text-muted-foreground/70">
            · optional
          </span>
        </label>
        <input
          id="quest-reference-url"
          type="url"
          value={state.reference_url ?? ""}
          onChange={(e) =>
            onChange({ reference_url: e.target.value.trim() || null })
          }
          placeholder="https://www.tiktok.com/@…"
          className="
            w-full rounded-md border border-border/60 bg-background
            px-3 py-2 text-sm
            focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30
            placeholder:text-muted-foreground/60
          "
        />
        <p className="text-xs text-muted-foreground">
          A post you want reps to mimic or reference. Reps see this on the quest page.
        </p>
      </div>

      {/* Uses sound (TikTok only) */}
      {state.platform === "tiktok" ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-card px-3 py-2.5 shadow-sm">
          <div className="flex min-w-0 items-start gap-2.5">
            <Music
              size={14}
              className="mt-0.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">
                Use a specific sound
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Reps see a hint to use the sound from your reference TikTok.
              </p>
            </div>
          </div>
          <Switch
            checked={state.uses_sound}
            onCheckedChange={(on) => onChange({ uses_sound: on })}
          />
        </div>
      ) : null}
    </div>
  );
}

interface SegmentedButtonProps {
  selected: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
}

function SegmentedButton({ selected, onClick, label, hint }: SegmentedButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      title={hint}
      className={[
        "rounded-md border px-3 py-2 text-xs font-medium transition-all",
        selected
          ? "border-primary bg-primary/10 text-primary shadow-sm"
          : "border-border/60 bg-card text-foreground hover:border-border",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

/**
 * Closed-chip summary. Combines the sub-type + platform + a "with reference link" hint.
 * Returns undefined when the section is at empty defaults so the chip stays in the
 * closed-empty state.
 */
export function platformChipSummary(
  socialSubType: SocialSubType,
  platform: QuestPlatform,
  referenceUrl: string | null,
  usesSound: boolean
): string | undefined {
  const parts: string[] = [];
  parts.push(SUB_TYPE_OPTIONS.find((o) => o.value === socialSubType)?.label ?? "Story");
  parts.push(PLATFORM_OPTIONS.find((o) => o.value === platform)?.label ?? "Either");
  if (referenceUrl) parts.push("with reference");
  if (usesSound) parts.push("with sound");
  return parts.join(" · ");
}

/**
 * Filled when ANY field is non-default — sub-type changed off "story",
 * platform changed off "any", reference URL set, or sound enabled.
 */
export function isPlatformFilled(
  socialSubType: SocialSubType,
  platform: QuestPlatform,
  referenceUrl: string | null,
  usesSound: boolean
): boolean {
  if (socialSubType !== "story") return true;
  if (platform !== "any") return true;
  if (referenceUrl) return true;
  if (usesSound) return true;
  return false;
}
