"use client";

import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import type { PlatformXPConfig, RepQuest } from "@/types/reps";
import { DEFAULT_PLATFORM_XP_CONFIG } from "@/types/reps";
import {
  EMPTY_QUEST_FORM_STATE,
  questTypeFor,
  type QuestFormState,
} from "./types";
import { QuestTypeStep } from "./QuestTypeStep";
import { QuestForm } from "./QuestForm";
import { QuestPreview, QuestPreviewSurface } from "./QuestPreview";

/**
 * Orchestrator for the redesigned quest editor.
 *
 * - Picker step (`QuestTypeStep`) when no kind is set
 * - Two-column shell (form left, sticky phone-frame preview right) on
 *   md+ breakpoints
 * - Single-column with a floating "Preview" pill on mobile — tapping
 *   the pill opens a full-screen sheet showing the live phone-frame
 *
 * Phase 1.3 ships the layout. Save / publish wiring lands in Phase 3
 * (readiness gate) + Phase 4 (cutover when QuestsTab.tsx mounts this).
 */
export interface QuestEditorProps {
  open: boolean;
  editId: string | null;
  initialQuest?: RepQuest | null;
  onClose: () => void;
  onSaved: (quest: RepQuest) => void;
}

export function QuestEditor({
  open,
  editId,
  initialQuest,
  onClose,
  onSaved,
}: QuestEditorProps) {
  // Suppress unused-prop warnings until later phases wire them. The
  // contract is locked so QuestsTab.tsx (Phase 4) can mount this safely.
  void editId;
  void initialQuest;
  void onSaved;

  const [state, setState] = useState<QuestFormState>(EMPTY_QUEST_FORM_STATE);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [platformConfig, setPlatformConfig] = useState<PlatformXPConfig>(
    DEFAULT_PLATFORM_XP_CONFIG
  );

  // Fetch the platform XP config so reward inputs can prefill on the
  // matching quest_type. Falls back to DEFAULT_PLATFORM_XP_CONFIG so
  // the editor still works offline / on first paint.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/platform/xp-config")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.data) setPlatformConfig(json.data);
      })
      .catch(() => {
        // Default config is fine; editor stays usable.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close the mobile preview sheet whenever the kind picker is showing
  // — there's nothing to preview yet.
  useEffect(() => {
    if (!state.kind && mobilePreviewOpen) setMobilePreviewOpen(false);
  }, [state.kind, mobilePreviewOpen]);

  if (!open) return null;

  // Intercept socialSubType changes so the XP reward re-prefills to the
  // platform default for the new resulting quest_type. Mirrors the legacy
  // editor's "type changed → reset XP" behaviour. The host can still
  // override in the reward input afterwards.
  const onChange = (patch: Partial<QuestFormState>) => {
    setState((s) => {
      let nextPatch = patch;
      if (
        "socialSubType" in patch &&
        patch.socialSubType &&
        s.kind === "post_on_social"
      ) {
        const questType = questTypeFor("post_on_social", patch.socialSubType);
        const xp =
          platformConfig.xp_per_quest_type[questType] ??
          platformConfig.xp_per_quest_type.custom;
        nextPatch = { ...patch, xp_reward: xp };
      }
      return { ...s, ...nextPatch };
    });
  };

  // Pick a kind, prefill XP from the platform default for the resulting
  // quest_type. The host can override in the input.
  const onPickKind = (kind: NonNullable<QuestFormState["kind"]>) => {
    const questType = questTypeFor(kind, EMPTY_QUEST_FORM_STATE.socialSubType);
    const xp =
      platformConfig.xp_per_quest_type[questType] ??
      platformConfig.xp_per_quest_type.custom;
    onChange({ kind, xp_reward: xp });
  };

  if (!state.kind) {
    return (
      <div className="px-6 py-8">
        <QuestTypeStep onPick={onPickKind} onClose={onClose} />
      </div>
    );
  }

  return (
    <div className="grid gap-8 px-6 py-8 md:grid-cols-[minmax(0,1fr)_320px]">
      <QuestForm state={state} onChange={onChange} onClose={onClose} />
      <QuestPreview state={state} />

      {/* Mobile: floating "Preview" pill */}
      <button
        type="button"
        onClick={() => setMobilePreviewOpen(true)}
        className="
          fixed bottom-6 right-6 z-40 inline-flex items-center gap-2
          rounded-full bg-primary px-4 py-2.5 text-sm font-semibold
          text-primary-foreground shadow-lg
          md:hidden
        "
        aria-label="Open preview"
      >
        <Eye size={14} strokeWidth={2} />
        Preview
      </button>

      {/* Mobile: preview sheet */}
      {mobilePreviewOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setMobilePreviewOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-4 pb-8 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Preview
              </p>
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close preview"
              >
                <X size={16} />
              </button>
            </div>
            <QuestPreviewSurface state={state} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
