"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Flame,
  Compass,
  Trophy,
  ChevronRight,
  Zap,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "rep_onboarded";

interface WelcomeOverlayProps {
  repName: string;
  discountCode?: string;
  onDismiss: () => void;
}

const STEPS = [
  {
    icon: Zap,
    iconColor: "#8B5CF6",
    iconBg: "bg-primary/15",
    title: "Welcome to the Crew",
    subtitle: "You've been accepted into the rep program.",
    body: "Sell tickets, complete quests, and climb the leaderboard to earn real rewards.",
  },
  {
    icon: Flame,
    iconColor: "#F97316",
    iconBg: "bg-orange-500/15",
    title: "Your Weapon",
    subtitle: "Every rep gets a unique discount code.",
    body: "Share it with friends — every sale earns you XP and moves you up the ranks.",
    showCode: true,
  },
  {
    icon: Compass,
    iconColor: "#8B5CF6",
    iconBg: "bg-primary/15",
    title: "Side Quests",
    subtitle: "Bonus missions to earn extra XP.",
    body: "Post on TikTok, share stories, create content — each quest has its own reward.",
  },
  {
    icon: Trophy,
    iconColor: "#F59E0B",
    iconBg: "bg-amber-500/15",
    title: "The Arena",
    subtitle: "Compete for the top spot.",
    body: "Top-ranked reps at each event win exclusive prizes. Your position updates in real time.",
  },
  {
    icon: Rocket,
    iconColor: "#34D399",
    iconBg: "bg-success/15",
    title: "You're Ready",
    subtitle: "Let's go.",
    body: null,
    isFinal: true,
  },
];

export function WelcomeOverlay({ repName, discountCode, onDismiss }: WelcomeOverlayProps) {
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [exiting, setExiting] = useState(false);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  const advance = () => {
    if (isLast) {
      dismiss();
    } else {
      setStep((s) => s + 1);
      setStepKey((k) => k + 1);
    }
  };

  const dismiss = () => {
    setExiting(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch { /* storage unavailable */ }
    setTimeout(onDismiss, 400);
  };

  // Escape key to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Icon = current.icon;

  const content = (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md transition-opacity duration-400",
        exiting ? "opacity-0" : "opacity-100"
      )}
    >
      <div className="w-full max-w-sm mx-6 text-center">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i <= step ? "bg-primary w-6" : "bg-white/10 w-3"
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div key={stepKey} className="rep-step-in">
          {/* Icon */}
          <div className={cn(
            "inline-flex h-20 w-20 items-center justify-center rounded-2xl mb-6",
            current.iconBg
          )}>
            <Icon size={32} style={{ color: current.iconColor }} />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-foreground mb-1">
            {step === 0 ? (
              <>Welcome, {repName}</>
            ) : current.isFinal ? (
              <>You&apos;re Ready</>
            ) : (
              current.title
            )}
          </h2>

          {/* Subtitle */}
          <p className="text-sm text-muted-foreground mb-5">
            {current.subtitle}
          </p>

          {/* Discount code highlight */}
          {current.showCode && discountCode && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-6 py-4 mb-5">
              <p className="text-2xl font-black font-mono tracking-[6px] text-foreground">
                {discountCode}
              </p>
            </div>
          )}

          {/* Body text */}
          {current.body && (
            <p className="text-sm text-muted-foreground/80 leading-relaxed max-w-[280px] mx-auto mb-8">
              {current.body}
            </p>
          )}

          {/* Final step — big CTA */}
          {current.isFinal && (
            <div className="mt-6 mb-4">
              <p className="text-sm text-muted-foreground/70 mb-6">
                Your dashboard is loaded. Start sharing your code and earning points.
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          {step > 0 ? (
            <button
              onClick={() => { setStep((s) => s - 1); setStepKey((k) => k + 1); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              Back
            </button>
          ) : (
            <button
              onClick={dismiss}
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors px-3 py-2"
            >
              Skip
            </button>
          )}

          <Button
            size="lg"
            onClick={advance}
            className={cn(
              "rounded-2xl px-8 font-semibold",
              current.isFinal && "bg-success hover:bg-success/90 text-white"
            )}
          >
            {current.isFinal ? (
              <>
                <Rocket size={16} />
                Let&apos;s Go
              </>
            ) : (
              <>
                Next
                <ChevronRight size={16} />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.getElementById("rep-portal-root") || document.body);
}

/** Returns true if the rep has completed onboarding */
export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true; // fail safe — don't show onboarding if storage fails
  }
}
