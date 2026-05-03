"use client";

import { Target } from "lucide-react";
import type { SectionProps } from "../types";

const PRESETS: ReadonlyArray<number> = [10, 25, 50, 100];

/**
 * Sales target input — only mounted when `kind === "sales_target"`.
 * Visible by default (not chipped) because the target is the defining
 * field for this quest type.
 *
 * Reps see a progress bar in the iOS app climbing toward the target;
 * each ticket they sell ticks it up. Hitting the target completes the
 * quest and awards XP/EP.
 */
export function SalesTargetSection({ state, onChange }: SectionProps) {
  const value = state.sales_target ?? 0;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] px-5 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"
        >
          <Target size={18} strokeWidth={1.75} />
        </span>
        <div className="flex-1 space-y-3">
          <div>
            <label
              htmlFor="quest-sales-target"
              className="block text-[13px] font-semibold text-foreground"
            >
              How many tickets to hit?
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reps see a progress bar climb as they sell. The first to hit it wins.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-baseline gap-2">
              <input
                id="quest-sales-target"
                type="number"
                inputMode="numeric"
                min={1}
                value={value || ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    onChange({ sales_target: null });
                    return;
                  }
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n < 0) return;
                  onChange({ sales_target: Math.floor(n) });
                }}
                className="
                  w-24 rounded-md border border-border/60 bg-background
                  px-3 py-2 font-mono text-base font-semibold tabular-nums
                  focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30
                "
                placeholder="25"
              />
              <span className="text-xs text-muted-foreground">tickets</span>
            </div>

            <div className="flex items-center gap-1">
              {PRESETS.map((preset) => {
                const active = value === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChange({ sales_target: preset })}
                    className={[
                      "rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums transition-colors",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    ].join(" ")}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
