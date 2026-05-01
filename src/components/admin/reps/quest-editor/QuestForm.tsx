"use client";

import { useState } from "react";
import {
  Calendar,
  Camera,
  Image as ImageLucide,
  Share2,
  Smartphone,
  Video,
} from "lucide-react";
import type { QuestFormState } from "./types";
import { QuestChip } from "./QuestChip";
import { RewardSection } from "./sections/RewardSection";
import { CoverSection, coverChipSummary } from "./sections/CoverSection";
import {
  ShareableSection,
  shareableChipSummary,
  isShareableFilled,
} from "./sections/ShareableSection";
import { WalkthroughSection } from "./sections/WalkthroughSection";
import {
  PlatformSection,
  platformChipSummary,
  isPlatformFilled,
} from "./sections/PlatformSection";
import {
  EventSection,
  eventChipSummary,
  type EventOption,
} from "./sections/EventSection";
import { ProofSection, proofChipSummary } from "./sections/ProofSection";

/**
 * Single-screen form body. The plan's "one calm vertical surface" —
 * editorial title input → reward block → row of optional `+ Add ...`
 * chips → primary actions row. Tabs are dead.
 *
 * Each chip wraps a Section component. The chip handles open/close +
 * filled/empty visual states; the section owns the content that
 * appears when the chip is expanded. New sections land as Phase 2
 * progresses; the slot is built so adding one is a small focused diff.
 */
export interface QuestFormProps {
  state: QuestFormState;
  onChange: (patch: Partial<QuestFormState>) => void;
  onClose: () => void;
  /** Events the host can anchor a quest to. Fetched in `QuestEditor` and threaded through. */
  events: EventOption[];
}

interface ChipsOpenState {
  cover: boolean;
  shareable: boolean;
  walkthrough: boolean;
  platform: boolean;
  event: boolean;
  proof: boolean;
  rules: boolean;
}

const INITIAL_CHIPS_OPEN: ChipsOpenState = {
  cover: false,
  shareable: false,
  walkthrough: false,
  platform: false,
  event: false,
  proof: false,
  rules: false,
};

export function QuestForm({ state, onChange, onClose, events }: QuestFormProps) {
  const [chipsOpen, setChipsOpen] = useState<ChipsOpenState>(INITIAL_CHIPS_OPEN);

  const toggleChip = (key: keyof ChipsOpenState) =>
    setChipsOpen((s) => ({ ...s, [key]: !s[key] }));

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        // Submit logic lands in Phase 3 (publish gate) + Phase 4 (cutover).
        // Block default form submission until then so Enter doesn't fire
        // an empty save.
        e.preventDefault();
      }}
    >
      <header className="space-y-1 pb-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {state.title.trim() ? "Edit quest" : "New quest"}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">
          {state.title.trim() || "Untitled quest"}
        </h2>
      </header>

      <div className="space-y-6">
        <Field label="Title" htmlFor="quest-title">
          <input
            id="quest-title"
            type="text"
            value={state.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="
              w-full rounded-md border border-border/60 bg-background
              px-3 py-2.5 text-base font-medium
              transition-colors
              focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30
              placeholder:text-muted-foreground/60
            "
            placeholder="Post Only Numbers to your story"
            autoFocus
          />
        </Field>

        <RewardSection state={state} onChange={onChange} />

        <div className="space-y-2">
          <QuestChip
            label="Cover image"
            icon={<ImageLucide size={14} strokeWidth={1.75} />}
            filled={!!state.cover_image_url}
            summary={coverChipSummary(state.cover_image_url)}
            open={chipsOpen.cover}
            onToggle={() => toggleChip("cover")}
            onClear={() => onChange({ cover_image_url: null })}
          >
            <CoverSection state={state} onChange={onChange} />
          </QuestChip>

          <QuestChip
            label="Shareable"
            icon={<Share2 size={14} strokeWidth={1.75} />}
            filled={isShareableFilled(
              state.asset_mode,
              state.asset_url,
              state.asset_campaign_tag
            )}
            summary={shareableChipSummary(
              state.asset_mode,
              state.asset_url,
              state.asset_campaign_tag
            )}
            open={chipsOpen.shareable}
            onToggle={() => toggleChip("shareable")}
            onClear={() =>
              onChange({
                asset_mode: "single",
                asset_url: null,
                asset_campaign_tag: null,
              })
            }
          >
            <ShareableSection state={state} onChange={onChange} />
          </QuestChip>

          <QuestChip
            label="Walkthrough"
            icon={<Video size={14} strokeWidth={1.75} />}
            filled={!!state.walkthrough_video_url}
            summary={state.walkthrough_video_url ? "video set" : undefined}
            open={chipsOpen.walkthrough}
            onToggle={() => toggleChip("walkthrough")}
            onClear={() => onChange({ walkthrough_video_url: null })}
          >
            <WalkthroughSection state={state} onChange={onChange} />
          </QuestChip>

          {state.kind === "post_on_social" ? (
            <QuestChip
              label="Platform"
              icon={<Smartphone size={14} strokeWidth={1.75} />}
              filled={isPlatformFilled(
                state.socialSubType,
                state.platform,
                state.reference_url,
                state.uses_sound
              )}
              summary={platformChipSummary(
                state.socialSubType,
                state.platform,
                state.reference_url,
                state.uses_sound
              )}
              open={chipsOpen.platform}
              onToggle={() => toggleChip("platform")}
              onClear={() =>
                onChange({
                  socialSubType: "story",
                  platform: "any",
                  reference_url: null,
                  uses_sound: false,
                })
              }
            >
              <PlatformSection state={state} onChange={onChange} />
            </QuestChip>
          ) : null}

          <QuestChip
            label="Event"
            icon={<Calendar size={14} strokeWidth={1.75} />}
            filled={!!state.event_id}
            summary={eventChipSummary(state.event_id, events)}
            open={chipsOpen.event}
            onToggle={() => toggleChip("event")}
            onClear={() => onChange({ event_id: null })}
          >
            <EventSection state={state} onChange={onChange} events={events} />
          </QuestChip>

          <QuestChip
            label="Proof"
            icon={<Camera size={14} strokeWidth={1.75} />}
            filled
            summary={proofChipSummary(state.proof_type)}
            open={chipsOpen.proof}
            onToggle={() => toggleChip("proof")}
            onClear={
              state.proof_type === "screenshot"
                ? undefined
                : () => onChange({ proof_type: "screenshot" })
            }
          >
            <ProofSection state={state} onChange={onChange} />
          </QuestChip>

          {/* Additional chips land in Phase 2.8: Rules. */}
        </div>
      </div>

      <footer className="mt-auto flex items-center justify-between gap-3 pt-8">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="
              rounded-md border border-border/60 px-4 py-2 text-sm font-medium
              text-muted-foreground
              disabled:cursor-not-allowed disabled:opacity-50
            "
            title="Save as draft — wiring lands in Phase 4"
          >
            Save
          </button>
          <button
            type="button"
            disabled
            className="
              rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground
              shadow-sm transition-colors hover:bg-primary/90
              disabled:cursor-not-allowed disabled:opacity-50
            "
            title="Publish — readiness gate wires in Phase 3"
          >
            Publish
          </button>
        </div>
      </footer>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
