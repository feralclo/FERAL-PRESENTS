"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, X } from "lucide-react";
import type { PlatformXPConfig, RepQuest } from "@/types/reps";
import { DEFAULT_PLATFORM_XP_CONFIG } from "@/types/reps";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { assessQuest } from "@/lib/quest-readiness";
import {
  EMPTY_QUEST_FORM_STATE,
  mapStateToPayload,
  questToFormState,
  questTypeFor,
  type QuestFormState,
} from "./types";
import { QuestTypeStep } from "./QuestTypeStep";
import { QuestForm } from "./QuestForm";
import { QuestPreview, QuestPreviewSurface } from "./QuestPreview";
import { QuestLiveSheet } from "./QuestLiveSheet";
import type { EventOption } from "./sections/EventSection";

/**
 * Orchestrator for the redesigned quest editor.
 *
 * - Picker step (`QuestTypeStep`) when no kind is set
 * - Two-column shell (form left, sticky phone-frame preview right) on
 *   md+ breakpoints
 * - Single-column with a floating "Preview" pill on mobile
 * - "You're live" success sheet when a quest publishes
 *
 * Wraps itself in a Dialog so callers (e.g. `QuestsTab.tsx`) just
 * mount it with `open` / `onClose` — no Dialog wiring required.
 *
 * Save semantics: Save = `status: "draft"`, Publish = `status: "active"`.
 * The publish path additionally surfaces the QuestLiveSheet on success.
 */
export interface QuestEditorProps {
  open: boolean;
  /** Quest id when editing; null when creating. */
  editId: string | null;
  /** Pre-loaded quest row when editing — hydrates the form state. */
  initialQuest?: RepQuest | null;
  onClose: () => void;
  /** Fired after every successful save so the parent list refreshes. */
  onSaved: (quest: RepQuest) => void;
}

export function QuestEditor({
  open,
  editId,
  initialQuest,
  onClose,
  onSaved,
}: QuestEditorProps) {
  const [state, setState] = useState<QuestFormState>(EMPTY_QUEST_FORM_STATE);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [platformConfig, setPlatformConfig] = useState<PlatformXPConfig>(
    DEFAULT_PLATFORM_XP_CONFIG
  );
  const [events, setEvents] = useState<EventOption[]>([]);
  const [publishedQuest, setPublishedQuest] = useState<RepQuest | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Hydrate form state from initialQuest when editing; reset to empty
  // when the dialog closes so the next "+ New quest" starts fresh.
  useEffect(() => {
    if (!open) {
      setState(EMPTY_QUEST_FORM_STATE);
      setPublishedQuest(null);
      setSaveError("");
      setMobilePreviewOpen(false);
      return;
    }
    if (initialQuest) {
      setState(questToFormState(initialQuest));
    } else {
      setState(EMPTY_QUEST_FORM_STATE);
    }
  }, [open, initialQuest]);

  // Fetch the platform XP config + events. Falls back to the defaults so
  // the editor still works offline / on first paint.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/platform/xp-config")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.data) setPlatformConfig(json.data);
      })
      .catch(() => {});
    fetch("/api/events")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !Array.isArray(json?.data)) return;
        const mapped: EventOption[] = json.data.map(
          (e: { id: string; name: string; date_start?: string | null }) => ({
            id: e.id,
            name: e.name,
            date_start: e.date_start ?? null,
          })
        );
        setEvents(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close the mobile preview sheet when the picker is showing.
  useEffect(() => {
    if (!state.kind && mobilePreviewOpen) setMobilePreviewOpen(false);
  }, [state.kind, mobilePreviewOpen]);

  const readiness = useMemo(
    () =>
      assessQuest({
        title: state.title,
        kind: state.kind,
        asset_mode: state.asset_mode,
        asset_campaign_tag: state.asset_campaign_tag,
        sales_target: state.sales_target,
      }),
    [
      state.title,
      state.kind,
      state.asset_mode,
      state.asset_campaign_tag,
      state.sales_target,
    ]
  );

  // Intercept socialSubType changes so the XP reward re-prefills to the
  // platform default for the new resulting quest_type. Mirrors the
  // legacy editor's "type changed → reset XP" behaviour.
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

  const onPickKind = (kind: NonNullable<QuestFormState["kind"]>) => {
    const questType = questTypeFor(kind, EMPTY_QUEST_FORM_STATE.socialSubType);
    const xp =
      platformConfig.xp_per_quest_type[questType] ??
      platformConfig.xp_per_quest_type.custom;
    // Sales-target quests need a target to publish — seed a sensible
    // default (25 tickets) so the host sees the input prefilled rather
    // than empty. The host overrides freely.
    const sales_target = kind === "sales_target" ? 25 : null;
    onChange({ kind, xp_reward: xp, sales_target });
  };

  // Save (status="draft") closes the dialog. Publish (status="active")
  // shows the QuestLiveSheet first; the host dismisses to close.
  const submit = async (status: "draft" | "active") => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = mapStateToPayload(state, status);
      const url = editId
        ? `/api/reps/quests/${editId}`
        : "/api/reps/quests";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Save failed");
      }
      const quest = json.data as RepQuest;
      onSaved(quest);
      if (status === "active") {
        setPublishedQuest(quest);
      } else {
        onClose();
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
        {/* DialogTitle satisfies Radix's accessibility requirement. We
            visually hide it because the form / picker / sheet each show
            their own headline. */}
        <DialogTitle className="sr-only">Quest editor</DialogTitle>
        <div className="max-h-[92vh] overflow-y-auto">
          {publishedQuest ? (
            <QuestLiveSheet
              quest={publishedQuest}
              onDismiss={() => {
                setPublishedQuest(null);
                onClose();
              }}
            />
          ) : !state.kind ? (
            <div className="px-6 py-8">
              <QuestTypeStep onPick={onPickKind} onClose={onClose} />
            </div>
          ) : (
            <div className="grid gap-8 px-6 py-8 md:grid-cols-[minmax(0,1fr)_320px]">
              <QuestForm
                state={state}
                onChange={onChange}
                onClose={onClose}
                events={events}
                readiness={readiness}
                saving={saving}
                saveError={saveError}
                onSave={() => submit("draft")}
                onPublish={() => submit("active")}
              />
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
                <div
                  className="fixed inset-0 z-50 md:hidden"
                  role="dialog"
                  aria-modal="true"
                >
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
