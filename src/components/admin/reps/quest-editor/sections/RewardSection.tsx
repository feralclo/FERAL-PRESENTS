"use client";

import { Coins, Zap } from "lucide-react";
import type { SectionProps } from "../types";

/**
 * XP + EP reward inputs. Visible by default — every quest needs a
 * reward, so this section never hides behind a chip.
 *
 * Prefill of XP from `getPlatformXPConfig().xp_per_quest_type[questType]`
 * happens in `QuestEditor` whenever the kind or sub-toggle changes; this
 * section is purely presentational so its render stays cheap and the
 * preview pane updates without re-fetching anything.
 *
 * EP defaults to 0 — the host opts in. 1 EP = £0.01 to the rep at
 * payout (10% platform cut applied at the tenant payout step).
 */
export function RewardSection({ state, onChange }: SectionProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <RewardInput
        id="quest-xp"
        label="XP"
        icon={<Zap size={12} strokeWidth={2.25} />}
        value={state.xp_reward}
        onChange={(value) => onChange({ xp_reward: value })}
      />
      <RewardInput
        id="quest-ep"
        label="EP"
        helper="optional"
        icon={<Coins size={12} strokeWidth={2.25} />}
        value={state.ep_reward}
        onChange={(value) => onChange({ ep_reward: value })}
      />
    </div>
  );
}

interface RewardInputProps {
  id: string;
  label: string;
  helper?: string;
  icon: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
}

function RewardInput({ id, label, helper, icon, value, onChange }: RewardInputProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[13px] font-medium text-foreground"
      >
        <span className="text-primary">{icon}</span>
        {label}
        {helper ? (
          <span className="font-normal text-muted-foreground/70">· {helper}</span>
        ) : null}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="
          mt-2 w-full rounded-md border border-border/60 bg-background
          px-3 py-2 font-mono text-sm tabular-nums
          focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30
        "
      />
    </div>
  );
}
