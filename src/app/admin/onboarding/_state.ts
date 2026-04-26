"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  OnboardingWizardState,
  WizardSection,
  WizardSectionState,
} from "@/types/settings";

/**
 * Wizard order — drives next/back navigation and the progress dots.
 *
 * Three sections: Identity captures who/where + provisions the org, Branding
 * paints the storefront, Finish hands off to the dashboard's persistent
 * setup checklist for everything else.
 */
export const WIZARD_ORDER: WizardSection[] = ["identity", "branding", "finish"];

/** Sections the user MUST complete before reaching Finish. */
export const REQUIRED_SECTIONS: WizardSection[] = ["identity"];

/** Pretty labels for the progress indicator. */
export const SECTION_LABEL: Record<WizardSection, string> = {
  identity: "You",
  branding: "Brand",
  finish: "Done",
};

const PATCH_DEBOUNCE_MS = 600;

export interface OnboardingApi {
  /** Loaded server state (or null while initial fetch is in-flight). */
  state: OnboardingWizardState | null;
  /** Index into WIZARD_ORDER. */
  sectionIndex: number;
  current: WizardSection;
  isFirstSection: boolean;
  isLastSection: boolean;
  /** True until the first GET resolves. */
  loading: boolean;
  /** True if the user already has an org_users row (resuming post-provision). */
  hasOrg: boolean;
  /** When provisioned: the slug. */
  orgId: string | null;
  /** Whether we're currently flushing a PATCH. */
  saving: boolean;
  /** Latest save error (cleared on next successful save). */
  saveError: string | null;
  /** Section helpers. */
  getSection: (section: WizardSection) => WizardSectionState | undefined;
  /** Update section data (debounced). */
  updateSectionData: (section: WizardSection, data: Record<string, unknown>) => void;
  /** Mark current section complete and advance. Optionally persist data atomically. */
  completeAndAdvance: (section: WizardSection, data?: Record<string, unknown>) => Promise<void>;
  /** Mark current section skipped and advance. */
  skipAndAdvance: (section: WizardSection) => Promise<void>;
  /** Manual navigation (e.g., back button). */
  goTo: (section: WizardSection) => void;
  /** After org is provisioned, the wizard can read the new orgId from this setter. */
  setOrgId: (id: string) => void;
}

/**
 * Hook that owns the wizard state — local mirror + debounced autosave + resume.
 *
 * Local state is the source of truth during a session; PATCHes are fire-and-forget
 * with a tiny debounce so Continue/Skip clicks don't race against typing.
 */
export function useOnboarding(): OnboardingApi {
  const [state, setState] = useState<OnboardingWizardState | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasOrg, setHasOrg] = useState(false);
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending section data that hasn't been flushed yet — keyed by section.
  const pendingRef = useRef<Partial<Record<WizardSection, Record<string, unknown>>>>({});

  const flush = useCallback(async () => {
    const pending = pendingRef.current;
    const sections = Object.keys(pending) as WizardSection[];
    if (sections.length === 0) return;

    pendingRef.current = {};
    setSaving(true);
    try {
      for (const section of sections) {
        const data = pending[section];
        if (!data) continue;
        const res = await fetch("/api/onboarding/state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, data }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error || `PATCH failed (${res.status})`);
        }
        const json = (await res.json()) as { state: OnboardingWizardState };
        setState(json.state);
        setSaveError(null);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/state");
        if (!aborted && res.ok) {
          const json = await res.json();
          const loaded: OnboardingWizardState = json.state ?? { sections: {} };
          setState(loaded);
          setHasOrg(!!json.has_org);
          setOrgIdState(json.org_id ?? null);

          // Resume at last_section if present, else stay at 0.
          if (loaded.last_section) {
            const idx = WIZARD_ORDER.indexOf(loaded.last_section);
            if (idx >= 0) setSectionIndex(idx);
          }
        }
      } catch {
        // Non-fatal — start fresh
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  // Flush pending writes on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Best-effort flush on unmount — fire and forget; we can't await here.
      void flush();
    };
  }, [flush]);

  const updateSectionData = useCallback(
    (section: WizardSection, data: Record<string, unknown>) => {
      // Optimistic local update so the preview/UI reacts instantly.
      setState((prev) => {
        const base = prev ?? { sections: {} };
        const existing = base.sections?.[section] ?? {};
        return {
          ...base,
          sections: {
            ...(base.sections ?? {}),
            [section]: {
              ...existing,
              data: { ...(existing.data ?? {}), ...data },
            },
          },
        };
      });

      pendingRef.current[section] = {
        ...(pendingRef.current[section] ?? {}),
        ...data,
      };

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void flush(), PATCH_DEBOUNCE_MS);
    },
    [flush]
  );

  const completeAndAdvance = useCallback(
    async (section: WizardSection, data?: Record<string, unknown>) => {
      // Cancel any pending debounced flush — we're going to write synchronously.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pendingRef.current = {}; // we're going to write the whole section now

      setSaving(true);
      try {
        const mergedData = {
          ...(state?.sections?.[section]?.data ?? {}),
          ...(data ?? {}),
        };
        const res = await fetch("/api/onboarding/state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section,
            data: mergedData,
            complete: true,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error || `Save failed (${res.status})`);
        }
        const json = (await res.json()) as { state: OnboardingWizardState };
        setState(json.state);
        setSaveError(null);

        // Advance
        setSectionIndex((idx) => Math.min(idx + 1, WIZARD_ORDER.length - 1));
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Save failed");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [state]
  );

  const skipAndAdvance = useCallback(
    async (section: WizardSection) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pendingRef.current = {};

      setSaving(true);
      try {
        const res = await fetch("/api/onboarding/state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, skip: true }),
        });
        if (!res.ok) throw new Error(`Skip failed (${res.status})`);
        const json = (await res.json()) as { state: OnboardingWizardState };
        setState(json.state);
        setSaveError(null);
        setSectionIndex((idx) => Math.min(idx + 1, WIZARD_ORDER.length - 1));
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Skip failed");
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const goTo = useCallback((section: WizardSection) => {
    const idx = WIZARD_ORDER.indexOf(section);
    if (idx >= 0) setSectionIndex(idx);
  }, []);

  const getSection = useCallback(
    (section: WizardSection) => state?.sections?.[section],
    [state]
  );

  const setOrgId = useCallback((id: string) => {
    setOrgIdState(id);
    setHasOrg(true);
  }, []);

  const current = WIZARD_ORDER[sectionIndex] ?? "identity";

  return {
    state,
    sectionIndex,
    current,
    isFirstSection: sectionIndex === 0,
    isLastSection: sectionIndex === WIZARD_ORDER.length - 1,
    loading,
    hasOrg,
    orgId,
    saving,
    saveError,
    getSection,
    updateSectionData,
    completeAndAdvance,
    skipAndAdvance,
    goTo,
    setOrgId,
  };
}
