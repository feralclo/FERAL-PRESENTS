"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  X,
  CheckCircle2,
  DollarSign,
  Compass,
  Gift,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationPromptProps {
  onEnable: () => Promise<unknown>;
  onDismiss: () => void;
  isPending?: boolean;
}

const ACTIVE_NOTIFICATION_TYPES = [
  { icon: DollarSign, label: "When someone buys with your link", color: "#34D399" },
  { icon: Compass, label: "New quests drop", color: "#8B5CF6" },
  { icon: Gift, label: "Rewards you can claim", color: "#F59E0B" },
  { icon: TrendingUp, label: "Leaderboard position changes", color: "#38BDF8" },
];

export function NotificationPrompt({ onEnable, onDismiss, isPending }: NotificationPromptProps) {
  const [enabling, setEnabling] = useState(false);
  const [done, setDone] = useState(false);

  const handleEnable = async () => {
    setEnabling(true);
    try {
      await onEnable();
      setDone(true);
      setTimeout(onDismiss, 1500);
    } catch {
      // Permission denied or error — just dismiss
      onDismiss();
    }
    setEnabling(false);
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md rep-fade-in">
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-border bg-background overflow-hidden rep-slide-up">

        {done ? (
          <div className="p-8 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15 border border-success/20 mb-4 rep-celebrate">
              <Bell size={24} className="text-success" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">Notifications On</h3>
            <p className="text-sm text-muted-foreground">
              {isPending ? "We'll let you know the moment you're accepted" : "You won't miss a thing"}
            </p>
          </div>
        ) : isPending ? (
          /* ── Pending rep: acceptance-focused prompt ── */
          <div className="p-6">
            <button
              onClick={onDismiss}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            >
              <X size={16} />
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 border border-primary/20 mb-4 relative">
                <Bell size={28} className="text-primary" />
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary border-2 border-background animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-1">
                Know the instant you&apos;re in
              </h3>
              <p className="text-sm text-muted-foreground">
                Get a push notification the moment your application is approved
              </p>
            </div>

            {/* Primary benefit */}
            <div className="rounded-xl bg-primary/8 border border-primary/15 px-4 py-3.5 mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <CheckCircle2 size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Application accepted</p>
                <p className="text-xs text-muted-foreground">Be the first to know — start earning right away</p>
              </div>
            </div>

            {/* Secondary benefits */}
            <p className="text-[11px] text-muted-foreground/60 mb-3 uppercase tracking-wider font-medium">Plus, once you&apos;re active</p>
            <div className="space-y-1.5 mb-6">
              {ACTIVE_NOTIFICATION_TYPES.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
                    <Icon size={13} style={{ color: item.color }} className="shrink-0 opacity-60" />
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                );
              })}
            </div>

            <Button
              size="lg"
              className="w-full rounded-xl font-semibold h-12"
              onClick={handleEnable}
              disabled={enabling}
            >
              {enabling ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enabling...
                </span>
              ) : (
                <>
                  <Bell size={16} />
                  Notify Me When I&apos;m Accepted
                </>
              )}
            </Button>

            <button
              onClick={onDismiss}
              className="w-full mt-3 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-2"
            >
              I&apos;ll check back manually
            </button>
          </div>
        ) : (
          /* ── Active rep: standard notification prompt ── */
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 relative">
                  <Bell size={20} className="text-primary" />
                  <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Stay in the loop</h3>
                  <p className="text-xs text-muted-foreground">Get notified when it matters</p>
                </div>
              </div>
              <button
                onClick={onDismiss}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* What you'll get notified about */}
            <div className="space-y-2.5 mb-6">
              {ACTIVE_NOTIFICATION_TYPES.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.04] px-4 py-3"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${item.color}15` }}
                    >
                      <Icon size={14} style={{ color: item.color }} />
                    </div>
                    <p className="text-sm text-foreground/90">{item.label}</p>
                  </div>
                );
              })}
            </div>

            {/* CTA */}
            <Button
              size="lg"
              className="w-full rounded-xl font-semibold"
              onClick={handleEnable}
              disabled={enabling}
            >
              {enabling ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enabling...
                </span>
              ) : (
                <>
                  <Bell size={16} />
                  Turn On Notifications
                </>
              )}
            </Button>

            <button
              onClick={onDismiss}
              className="w-full mt-3 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-2"
            >
              Maybe later
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.getElementById("rep-portal-root") || document.body);
}
