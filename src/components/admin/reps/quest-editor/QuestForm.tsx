"use client";

import type { QuestFormState } from "./types";
import { RewardSection } from "./sections/RewardSection";

/**
 * Single-screen form body. The plan's "one calm vertical surface" —
 * editorial title input → reward block → row of optional `+ Add ...`
 * chips → primary actions row. Tabs are dead.
 *
 * Phase 1.3 lays out the structure: title input, reward slot
 * (RewardSection — populated in Phase 2.1), chip slot (Phase 2 wires
 * the chips), action row (Phase 3 attaches the publish gate). Each
 * future phase fills one slice without rearranging the shell.
 */
export interface QuestFormProps {
  state: QuestFormState;
  onChange: (patch: Partial<QuestFormState>) => void;
  onClose: () => void;
}

export function QuestForm({ state, onChange, onClose }: QuestFormProps) {
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

        {/* Optional chips land in Phase 2 — one per section.
            The slot exists now so the layout reserves room. */}
        <div className="space-y-2" data-quest-editor-chips />
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
