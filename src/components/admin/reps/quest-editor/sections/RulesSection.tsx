"use client";

import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { SectionProps } from "../types";

/**
 * Power-user rules in one place: how many times each rep can complete
 * the quest, when it expires (if ever), and whether submissions skip
 * manual review.
 *
 * Defaults: max_completions=1, expires_at=null, auto_approve=false.
 * Chip is treated as "empty" while at defaults — the closed-state shows
 * the dashed "+ Rules" affordance. Any deviation flips it to filled
 * with a compact summary.
 */
export function RulesSection({ state, onChange }: SectionProps) {
  return (
    <div className="space-y-5">
      {/* Max completions per rep */}
      <div className="space-y-2">
        <label
          htmlFor="quest-max-completions"
          className="block text-[13px] font-medium text-foreground"
        >
          Completions per rep
        </label>
        <div className="flex items-center gap-2">
          <input
            id="quest-max-completions"
            type="number"
            inputMode="numeric"
            min={0}
            value={state.max_completions ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange({ max_completions: null });
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              onChange({ max_completions: Math.max(0, Math.floor(n)) });
            }}
            className="
              w-24 rounded-md border border-border/60 bg-background
              px-3 py-2 font-mono text-sm tabular-nums
              focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30
            "
            placeholder="1"
          />
          <span className="text-xs text-muted-foreground">
            Leave blank for unlimited.
          </span>
        </div>
      </div>

      {/* Expires at */}
      <div className="space-y-2">
        <label
          htmlFor="quest-expires-at"
          className="block text-[13px] font-medium text-foreground"
        >
          Expires
          <span className="ml-1.5 font-normal text-muted-foreground/70">
            · optional
          </span>
        </label>
        <input
          id="quest-expires-at"
          type="datetime-local"
          value={toLocalInputValue(state.expires_at)}
          onChange={(e) =>
            onChange({ expires_at: fromLocalInputValue(e.target.value) })
          }
          className="
            w-full rounded-md border border-border/60 bg-background
            px-3 py-2 text-sm
            focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30
          "
        />
        <p className="text-xs text-muted-foreground">
          Reps stop seeing the quest after this date.
        </p>
      </div>

      {/* Auto-approve */}
      <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-card px-3 py-2.5 shadow-sm">
        <div className="flex min-w-0 items-start gap-2.5">
          <ShieldCheck
            size={14}
            className="mt-0.5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              Auto-approve submissions
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Skip review and award the reward as soon as a rep submits. Best for low-risk story shares.
            </p>
          </div>
        </div>
        <Switch
          checked={state.auto_approve}
          onCheckedChange={(on) => onChange({ auto_approve: on })}
        />
      </div>
    </div>
  );
}

/**
 * Closed-chip summary. Combines the three rules into a compact line:
 *   "1 completion · expires Sat 5 May · auto-approve"
 * Returns undefined when every rule is at default (no deviation).
 */
export function rulesChipSummary(
  maxCompletions: number | null,
  expiresAt: string | null,
  autoApprove: boolean
): string | undefined {
  const parts: string[] = [];
  if (maxCompletions !== 1) {
    if (maxCompletions === null || maxCompletions === 0) {
      parts.push("unlimited");
    } else {
      parts.push(`${maxCompletions} completion${maxCompletions === 1 ? "" : "s"}`);
    }
  }
  if (expiresAt) {
    parts.push(`expires ${formatExpiry(expiresAt)}`);
  }
  if (autoApprove) parts.push("auto-approve");
  return parts.length ? parts.join(" · ") : undefined;
}

export function isRulesFilled(
  maxCompletions: number | null,
  expiresAt: string | null,
  autoApprove: boolean
): boolean {
  return maxCompletions !== 1 || expiresAt !== null || autoApprove;
}

function formatExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return "set";
  }
}

/** ISO `2026-05-01T18:30:00.000Z` → datetime-local `2026-05-01T19:30` (in viewer's TZ). */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const offsetMs = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

/** datetime-local `2026-05-01T19:30` → ISO `2026-05-01T18:30:00.000Z`. */
function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}
