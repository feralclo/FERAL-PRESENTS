"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Loader2,
  Dices,
  Check,
  Download,
  Bell,
  Zap,
  Wifi,
  Share,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CropModal } from "./CropModal";
import { cn } from "@/lib/utils";

const TAG_ADJECTIVES = [
  "Electric", "Cosmic", "Neon", "Shadow", "Hyper", "Turbo", "Stealth",
  "Lunar", "Solar", "Phantom", "Rogue", "Mystic", "Nova", "Storm",
  "Blaze", "Frost", "Cyber", "Atomic", "Rapid", "Wild", "Ultra",
  "Nitro", "Echo", "Vivid", "Prism",
];
const TAG_NOUNS = [
  "Wolf", "Fox", "Hawk", "Phoenix", "Viper", "Panther", "Tiger",
  "Lynx", "Raven", "Falcon", "Spark", "Flash", "Bolt", "Rider",
  "Scout", "Ace", "Maven", "Ghost", "Drift", "Rebel",
];

function generateGamertag(): string {
  const adj = TAG_ADJECTIVES[Math.floor(Math.random() * TAG_ADJECTIVES.length)];
  const noun = TAG_NOUNS[Math.floor(Math.random() * TAG_NOUNS.length)];
  return `${adj}${noun}`;
}

interface WelcomeOverlayProps {
  repName: string;
  displayName: string;
  photoUrl: string;
  onDismiss: () => void;
}

/**
 * Read a file as a data URL (for crop modal source).
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// Total steps: name + photo + install app
const TOTAL_STEPS = 3;

export function WelcomeOverlay({
  repName,
  displayName: initialDisplayName,
  photoUrl: initialPhotoUrl,
  onDismiss,
}: WelcomeOverlayProps) {
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Profile setup state — start empty with a fun generated suggestion
  const [generatedTag] = useState(() => generateGamertag());
  const [editedName, setEditedName] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
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

  // File selected → open crop modal
  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCropSrc(dataUrl);
    } catch { /* ignore */ }
  }, []);

  // Crop confirmed → upload
  const handleCropConfirm = useCallback(async (croppedDataUrl: string) => {
    setCropSrc(null);
    setPhotoPreview(croppedDataUrl);
    setUploading(true);
    try {
      const key = `rep-avatar-onboard-${Date.now()}`;
      const uploadRes = await fetch("/api/rep-portal/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: croppedDataUrl, key }),
      });
      if (uploadRes.ok) {
        const { url } = await uploadRes.json();
        setUploadedPhotoUrl(url);
      }
    } catch { /* upload failed — not blocking */ }
    setUploading(false);
  }, []);

  const saveAndDismiss = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { onboarding_completed: true };
      // Use what they typed, or the generated tag as fallback, or the placeholder tag
      const finalName = editedName.trim() || generatedTag;
      if (finalName && finalName !== initialDisplayName) {
        payload.display_name = finalName;
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

  // Escape key to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") saveAndDismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render step content ──

  const renderStep = () => {
    // Step 0: Choose your nickname
    if (step === 0) {
      const handleRandomize = () => {
        setEditedName(generateGamertag());
      };
      return (
        <div key={stepKey} className="rep-step-in">
          {/* User's avatar or initial */}
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full overflow-hidden mx-auto mb-5 ring-2 ring-primary/30">
            {initialPhotoUrl ? (
              <img src={initialPhotoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-primary/10">
                <span className="text-3xl font-bold text-primary">
                  {(repName || "?").charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">
            Choose your nickname
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            This is how you&apos;ll appear on the leaderboard
          </p>

          <div className="w-full max-w-[280px] mx-auto mb-4">
            <div className="relative">
              <input
                ref={nameInputRef}
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                maxLength={50}
                placeholder={generatedTag}
                className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-5 py-4 pr-12 text-center text-xl font-bold font-mono tracking-wide text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleRandomize}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                aria-label="Generate random name"
              >
                <Dices size={18} />
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground/50 max-w-[240px] mx-auto">
            Type anything or tap the dice — change it anytime in your profile
          </p>
        </div>
      );
    }

    // Step 1: Add your photo
    if (step === 1) {
      const triggerUpload = () => {
        if (!uploading) fileInputRef.current?.click();
      };
      return (
        <div key={stepKey} className="rep-step-in">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
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
            onClick={triggerUpload}
            disabled={uploading}
            className="relative inline-block mb-4 cursor-pointer active:scale-95 transition-transform"
            aria-label="Upload profile photo"
          >
            <div className={cn(
              "h-28 w-28 rounded-full overflow-hidden mx-auto border-2 transition-all",
              uploading ? "border-primary/30 animate-pulse" : "border-white/[0.15] border-dashed"
            )}>
              {photoSrc ? (
                <img src={photoSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center bg-primary/10 gap-1">
                  <Camera size={24} className="text-primary/60" />
                </div>
              )}
            </div>
            {uploading && (
              <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50">
                <Loader2 size={24} className="text-white animate-spin" />
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={triggerUpload}
            disabled={uploading}
            className="text-sm text-primary font-semibold mb-2 active:opacity-70 transition-opacity cursor-pointer"
          >
            {photoSrc ? "Change photo" : "Tap to upload"}
          </button>
          <p className="text-xs text-muted-foreground/50 max-w-[240px] mx-auto">
            Optional — you can skip this and add one later
          </p>
        </div>
      );
    }

    // Step 2: Install the app — compelling, urgent
    const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = typeof window !== "undefined" && (
      window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true)
    );

    if (isStandalone) {
      return (
        <div key={stepKey} className="rep-step-in">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-success/15 border-2 border-success/25 mb-5">
            <Check size={36} className="text-success" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-1">
            You&apos;re all set!
          </h2>
          <p className="text-sm text-muted-foreground">
            App installed — push notifications are ready
          </p>
        </div>
      );
    }

    return (
      <div key={stepKey} className="rep-step-in">
        {/* Attention-grabbing animated icon */}
        <div className="relative inline-block mb-5">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/20 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(139,92,246,0.15)]">
            <Download size={32} className="text-primary" />
          </div>
          {/* Pulsing notification dot */}
          <span className="absolute -top-1 -right-1 flex h-5 w-5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40" />
            <span className="relative inline-flex rounded-full h-5 w-5 bg-primary items-center justify-center">
              <Bell size={10} className="text-white" />
            </span>
          </span>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-1">
          One last thing
        </h2>
        <p className="text-base font-medium text-primary mb-2">
          Don&apos;t miss your acceptance!
        </p>
        <p className="text-sm text-muted-foreground mb-6 max-w-[260px] mx-auto leading-relaxed">
          Install the app to get a <strong className="text-foreground">push notification</strong> the moment you&apos;re approved — plus alerts for every sale you make.
        </p>

        {/* iOS instructions — large, clear, step-by-step */}
        {isIOS ? (
          <div className="space-y-3 max-w-[280px] mx-auto">
            <div className="rounded-xl bg-primary/[0.06] border border-primary/15 p-4">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-3">How to install</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">1</div>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    Tap <div className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/30 bg-primary/10"><Share size={13} className="text-primary" /></div> below
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">2</div>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    Tap <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"><Plus size={10} /> Add to Home Screen</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/15 text-xs font-bold text-success">3</div>
                  <p className="text-sm text-foreground">Tap <strong className="text-success">Add</strong> — done!</p>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Takes 5 seconds. Open the app from your home screen after.
            </p>
          </div>
        ) : (
          <div className="max-w-[280px] mx-auto">
            <p className="text-xs text-muted-foreground/70 text-center mb-2">
              Your browser will prompt you to install — or use your browser&apos;s menu to add to home screen
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
              onClick={saveAndDismiss}
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
                <Check size={16} />
                Done
              </>
            ) : (
              "Next"
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return (
    <>
      {createPortal(content, document.getElementById("rep-portal-root") || document.body)}
      {cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </>
  );
}
