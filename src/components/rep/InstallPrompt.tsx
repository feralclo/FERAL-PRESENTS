"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Share,
  Plus,
  Bell,
  Zap,
  Wifi,
  X,
  Smartphone,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InstallPromptProps {
  platform: "ios" | "android" | "desktop" | "unknown";
  onInstall: () => Promise<boolean>;
  onDismiss: () => void;
  onEnableNotifications?: () => Promise<unknown>;
}

const BENEFITS = [
  { icon: Bell, label: "Push notifications for sales & quests", color: "#8B5CF6" },
  { icon: Zap, label: "Instant access from home screen", color: "#F59E0B" },
  { icon: Wifi, label: "Works offline — check stats anywhere", color: "#34D399" },
];

export function InstallPrompt({ platform, onInstall, onDismiss, onEnableNotifications }: InstallPromptProps) {
  const [step, setStep] = useState<"benefits" | "ios-guide" | "done">("benefits");
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    if (platform === "ios") {
      setStep("ios-guide");
      return;
    }

    setInstalling(true);
    const accepted = await onInstall();
    setInstalling(false);

    if (accepted) {
      setStep("done");
      setTimeout(onDismiss, 2000);
    }
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-md rep-fade-in">
      <div className="w-full max-w-sm mx-4 mb-4 md:mb-0 rounded-2xl border border-border bg-background overflow-hidden rep-slide-up">

        {/* ── Benefits screen ── */}
        {step === "benefits" && (
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
                  <Smartphone size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Get the App</h3>
                  <p className="text-xs text-muted-foreground">Install for the full experience</p>
                </div>
              </div>
              <button
                onClick={onDismiss}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Benefits */}
            <div className="space-y-3 mb-6">
              {BENEFITS.map((b, i) => {
                const Icon = b.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.04] px-4 py-3"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${b.color}15` }}
                    >
                      <Icon size={14} style={{ color: b.color }} />
                    </div>
                    <p className="text-sm text-foreground/90">{b.label}</p>
                  </div>
                );
              })}
            </div>

            {/* CTA */}
            <Button
              size="lg"
              className="w-full rounded-xl font-semibold"
              onClick={handleInstall}
              disabled={installing}
            >
              {installing ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Installing...
                </span>
              ) : platform === "ios" ? (
                <>
                  <Download size={16} />
                  Install on iPhone
                </>
              ) : (
                <>
                  <Download size={16} />
                  Install App
                </>
              )}
            </Button>

            <button
              onClick={onDismiss}
              className="w-full mt-3 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-2"
            >
              Not now
            </button>
          </div>
        )}

        {/* ── iOS step-by-step guide ── */}
        {step === "ios-guide" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground">Add to Home Screen</h3>
              <button
                onClick={onDismiss}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {/* Step 1 */}
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  1
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm text-foreground font-medium">
                    Tap the <Share size={14} className="inline text-primary mx-0.5" /> share button
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    At the bottom of Safari (or top on iPad)
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  2
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm text-foreground font-medium">
                    Scroll down and tap <span className="inline-flex items-center gap-1 text-primary"><Plus size={12} /> Add to Home Screen</span>
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-xs font-bold text-success">
                  3
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm text-foreground font-medium">
                    Tap <span className="text-success font-bold">Add</span> in the top right
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The app will appear on your home screen
                  </p>
                </div>
              </div>
            </div>

            {/* Visual hint — Safari share icon */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-5">
              <div className="flex items-center justify-center gap-3 text-muted-foreground">
                <span className="text-xs">Look for</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                  <Share size={18} className="text-primary" />
                </div>
                <ChevronRight size={14} />
                <div className="flex h-10 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3">
                  <Plus size={14} className="text-primary" />
                  <span className="text-xs font-medium text-primary">Add to Home Screen</span>
                </div>
              </div>
            </div>

            <button
              onClick={onDismiss}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              Got it
            </button>
          </div>
        )}

        {/* ── Success ── */}
        {step === "done" && (
          <div className="p-8 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15 border border-success/20 mb-4 rep-celebrate">
              <Download size={24} className="text-success" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">App Installed</h3>
            <p className="text-sm text-muted-foreground">Find it on your home screen</p>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.getElementById("rep-portal-root") || document.body);
}
