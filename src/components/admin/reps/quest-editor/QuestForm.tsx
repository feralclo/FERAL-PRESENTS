"use client";

import type { QuestFormState } from "./types";

/**
 * Single-screen form body. Phase 1.3 turns this into the canonical
 * surface: title input → reward block → row of optional `+ Add ...` chips
 * → primary actions row at the bottom (Save / Publish).
 */
export interface QuestFormProps {
  state: QuestFormState;
  onChange: (patch: Partial<QuestFormState>) => void;
  onClose: () => void;
}

export function QuestForm({ state, onChange, onClose }: QuestFormProps) {
  // Phase 1.1 stub — single title input so the preview pane can render
  // something live during 1.3 build-out. The real layout, chips, and
  // section wiring come next.
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">New quest</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <div>
        <label
          htmlFor="quest-title"
          className="block text-sm font-medium text-foreground"
        >
          Title
        </label>
        <input
          id="quest-title"
          type="text"
          value={state.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="mt-2 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="Post Only Numbers to your story"
        />
      </div>
    </div>
  );
}
