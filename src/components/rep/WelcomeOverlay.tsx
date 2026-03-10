"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Flame,
  Compass,
  Trophy,
  ChevronRight,
  Zap,
  Rocket,
  Camera,
  Loader2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WelcomeOverlayProps {
  repName: string;
  displayName: string;
  photoUrl: string;
  discountCode?: string;
  onDismiss: () => void;
}

/**
 * Crop and resize an image file to a 400x400 square JPEG.
 */
function processProfileImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const x = (img.width - size) / 2;
        const y = (img.height - size) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));

        ctx.drawImage(img, x, y, size, size, 0, 0, 400, 400);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// Steps after the interactive profile setup
const INFO_STEPS = [
  {
    icon: Flame,
    iconColor: "#F97316",
    iconBg: "bg-orange-500/15",
    title: "Your Discount Code",
    subtitle: "Every rep gets a unique discount code.",
    body: "Share it with friends — every sale earns you XP and moves you up the ranks.",
    showCode: true,
  },
  {
    icon: Compass,
    iconColor: "#8B5CF6",
    iconBg: "bg-primary/15",
    title: "Bonus Quests",
    subtitle: "Complete tasks to earn bonus points.",
    body: "Post on TikTok, share stories, create content — each quest has its own reward.",
  },
  {
    icon: Trophy,
    iconColor: "#F59E0B",
    iconBg: "bg-amber-500/15",
    title: "Leaderboard",
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

// Total steps: 2 interactive + 4 info
const TOTAL_STEPS = 2 + INFO_STEPS.length;

export function WelcomeOverlay({
  repName,
  displayName: initialDisplayName,
  photoUrl: initialPhotoUrl,
  discountCode,
  onDismiss,
}: WelcomeOverlayProps) {
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Profile setup state
  const [editedName, setEditedName] = useState(initialDisplayName || "");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const photoSrc = photoPreview || uploadedPhotoUrl || initialPhotoUrl;
  const isLast = step === TOTAL_STEPS - 1;
  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  // Focus name input on step 0
  useEffect(() => {
    if (step === 0) {
      setTimeout(() => nameInputRef.current?.focus(), 300);
    }
  }, [step]);

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    try {
      const imageData = await processProfileImage(file);
      setPhotoPreview(imageData);

      const key = `rep-avatar-onboard-${Date.now()}`;
      const uploadRes = await fetch("/api/rep-portal/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData, key }),
      });

      if (uploadRes.ok) {
        const { url } = await uploadRes.json();
        setUploadedPhotoUrl(url);
      }
    } catch {
      // Photo upload failed — not blocking, they can do it later
    }
    setUploading(false);
  }, []);

  const saveAndDismiss = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { onboarding_completed: true };
      if (editedName.trim() && editedName.trim() !== initialDisplayName) {
        payload.display_name = editedName.trim();
      }
      if (uploadedPhotoUrl) {
        payload.photo_url = uploadedPhotoUrl;
      }

      await fetch("/api/rep-portal/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Save failed — still dismiss (they can edit profile later)
    }

    // Clean up legacy localStorage key
    try { localStorage.removeItem("rep_onboarded"); } catch { /* noop */ }

    setExiting(true);
    setTimeout(onDismiss, 400);
  };

  const advance = () => {
    if (isLast) {
      saveAndDismiss();
    } else {
      setStep((s) => s + 1);
      setStepKey((k) => k + 1);
    }
  };

  const skip = () => {
    saveAndDismiss();
  };

  // Escape key to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render step content ──

  const renderStep = () => {
    // Step 0: Choose your name
    if (step === 0) {
      return (
        <div key={stepKey} className="rep-step-in">
          <div className={cn("inline-flex h-20 w-20 items-center justify-center rounded-2xl mb-6 bg-primary/15")}>
            <User size={32} style={{ color: "#8B5CF6" }} />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">
            Choose your name
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            This is how you&apos;ll appear on the leaderboard
          </p>

          <div className="w-full max-w-[260px] mx-auto mb-6">
            <input
              ref={nameInputRef}
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              maxLength={50}
              placeholder={repName || "Your display name"}
              className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-5 py-4 text-center text-xl font-bold font-mono tracking-wide text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <p className="text-xs text-muted-foreground/50 max-w-[240px] mx-auto">
            You can always change this later in your profile
          </p>
        </div>
      );
    }

    // Step 1: Add your photo
    if (step === 1) {
      return (
        <div key={stepKey} className="rep-step-in">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />

          <h2 className="text-2xl font-bold text-foreground mb-1">
            Add your photo
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Show everyone who you are
          </p>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative inline-block group mb-6"
            aria-label="Upload profile photo"
          >
            <div className={cn(
              "h-28 w-28 rounded-full overflow-hidden mx-auto border-2 border-white/[0.1] transition-all",
              uploading && "animate-pulse"
            )}>
              {photoSrc ? (
                <img src={photoSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-primary/10">
                  <span className="text-4xl font-bold text-primary">
                    {(editedName || repName || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            {/* Camera overlay */}
            <div className={cn(
              "absolute inset-0 rounded-full flex items-center justify-center bg-black/50 transition-opacity duration-200",
              uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-active:opacity-100"
            )}>
              {uploading ? (
                <Loader2 size={24} className="text-white animate-spin" />
              ) : (
                <Camera size={24} className="text-white" />
              )}
            </div>
          </button>

          <p className="text-sm text-primary font-medium mb-2">
            Tap to upload
          </p>
          <p className="text-xs text-muted-foreground/50 max-w-[240px] mx-auto">
            Optional — you can skip this and add one later
          </p>
        </div>
      );
    }

    // Steps 2+: Info slides
    const infoIndex = step - 2;
    const current = INFO_STEPS[infoIndex];
    if (!current) return null;

    const Icon = current.icon;

    return (
      <div key={stepKey} className="rep-step-in">
        <div className={cn(
          "inline-flex h-20 w-20 items-center justify-center rounded-2xl mb-6",
          current.iconBg
        )}>
          <Icon size={32} style={{ color: current.iconColor }} />
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-1">
          {current.isFinal ? <>You&apos;re Ready</> : current.title}
        </h2>

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

        {/* Final step — big CTA text */}
        {current.isFinal && (
          <div className="mt-6 mb-4">
            <p className="text-sm text-muted-foreground/70 mb-6">
              Your dashboard is loaded. Start sharing your code and earning points.
            </p>
          </div>
        )}
      </div>
    );
  };

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
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
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
        {renderStep()}

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
              onClick={skip}
              disabled={saving}
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors px-3 py-2"
            >
              Skip
            </button>
          )}

          <Button
            size="lg"
            onClick={advance}
            disabled={saving || uploading}
            className={cn(
              "rounded-2xl px-8 font-semibold",
              isLast && "bg-success hover:bg-success/90 text-white"
            )}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </span>
            ) : isLast ? (
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
