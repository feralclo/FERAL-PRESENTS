"use client";

import { useState } from "react";
import type { RepQuest } from "@/types/reps";
import {
  EMPTY_QUEST_FORM_STATE,
  type QuestFormState,
} from "./types";
import { QuestTypeStep } from "./QuestTypeStep";
import { QuestForm } from "./QuestForm";
import { QuestPreview } from "./QuestPreview";

/**
 * Orchestrator for the redesigned quest editor.
 *
 * Phase 1.1 scaffold — wires three children (type picker / form / preview)
 * but the real form body, picker UI, and publish-gate readiness rules
 * land in later phases (1.2 / 1.3 / 3). Doesn't fetch data yet — that's
 * Phase 4 cutover wiring.
 */
export interface QuestEditorProps {
  /** Whether the editor dialog is open. */
  open: boolean;
  /** Quest id when editing; null when creating. */
  editId: string | null;
  /** Optional pre-loaded quest row when editing. */
  initialQuest?: RepQuest | null;
  /** Close without saving. */
  onClose: () => void;
  /** Saved (draft) or published — parent refreshes the list. */
  onSaved: (quest: RepQuest) => void;
}

export function QuestEditor({
  open,
  editId,
  initialQuest,
  onClose,
  onSaved,
}: QuestEditorProps) {
  // Suppress unused-prop warnings until later phases wire them. The shape
  // is intentionally fixed now so QuestsTab.tsx (Phase 4) can mount this
  // against the contract that's locked in the plan.
  void editId;
  void initialQuest;
  void onSaved;

  const [state, setState] = useState<QuestFormState>(EMPTY_QUEST_FORM_STATE);

  if (!open) return null;

  const onChange = (patch: Partial<QuestFormState>) =>
    setState((s) => ({ ...s, ...patch }));

  // The 3-tile picker is the entry point. Once a kind is chosen, render the
  // form + preview pane. Phase 1.2 builds the real picker visuals; Phase 1.3
  // builds the form/preview shell.
  if (!state.kind) {
    return (
      <QuestTypeStep
        onPick={(kind) => onChange({ kind })}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_360px]">
      <QuestForm state={state} onChange={onChange} onClose={onClose} />
      <QuestPreview state={state} />
    </div>
  );
}
