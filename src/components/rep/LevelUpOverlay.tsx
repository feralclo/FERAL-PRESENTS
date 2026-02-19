"use client";

import { ArrowUp, X } from "lucide-react";
import { ConfettiOverlay } from "./ConfettiOverlay";
import { getTierFromLevel } from "@/lib/rep-tiers";

interface LevelUpOverlayProps {
  newLevel: number;
  onDismiss: () => void;
}

/**
 * Full-screen level-up celebration modal.
 * Shows confetti, animated badge, tier name, and new level.
 */
export function LevelUpOverlay({ newLevel, onDismiss }: LevelUpOverlayProps) {
  const tier = getTierFromLevel(newLevel);

  return (
    <div className="rep-level-up-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <ConfettiOverlay />

      <div className="relative flex flex-col items-center text-center px-6">
        {/* Animated ring */}
        <div
          className="rep-level-up-ring absolute w-40 h-40 rounded-full"
          style={{ border: `2px solid ${tier.color}30` }}
        />

        {/* Level badge */}
        <div
          className="rep-level-up-badge flex items-center justify-center w-24 h-24 rounded-full"
          style={{
            background: `linear-gradient(135deg, ${tier.color}25, ${tier.color}10)`,
            border: `2px solid ${tier.color}40`,
          }}
        >
          <ArrowUp size={36} style={{ color: tier.color }} />
        </div>

        {/* Text */}
        <div className="rep-level-up-text mt-6 space-y-2">
          <p className="text-xs uppercase tracking-[3px] text-muted-foreground font-bold">
            Level Up
          </p>
          <p className="text-4xl font-extrabold" style={{ color: tier.color }}>
            Level {newLevel}
          </p>
          <p className="text-sm text-muted-foreground">
            {tier.name} tier reached
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="mt-8 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-foreground bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        >
          <X size={14} />
          Continue
        </button>
      </div>
    </div>
  );
}
