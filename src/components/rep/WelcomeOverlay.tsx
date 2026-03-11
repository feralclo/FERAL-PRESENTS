"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Loader2,
  Dices,
  Check,
  Instagram,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CropModal } from "./CropModal";
import { TikTokIcon } from "./TikTokIcon";
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// Steps: nickname → photo → socials → celebration
const TOTAL_STEPS = 4;

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

  // Profile setup state
  const [generatedTag] = useState(() => generateGamertag());
  const [editedName, setEditedName] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const igInputRef = useRef<HTMLInputElement>(null);

  const photoSrc = photoPreview || uploadedPhotoUrl || initialPhotoUrl;
  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  // Focus inputs per step
  useEffect(() => {
    if (step === 0) {
      setTimeout(() => nameInputRef.current?.focus(), 300);
    } else if (step === 2) {
      setTimeout(() => igInputRef.current?.focus(), 300);
    }
  }, [step]);

  // Auto-dismiss on celebration step
  useEffect(() => {
    if (step === TOTAL_STEPS - 1) {
      const timer = setTimeout(() => {
        setExiting(true);
        setTimeout(onDismiss, 400);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [step, onDismiss]);

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

  // Save everything and advance to celebration step
  const saveAndCelebrate = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { onboarding_completed: true };
      const finalName = editedName.trim() || generatedTag;
      if (finalName && finalName !== initialDisplayName) {
        payload.display_name = finalName;
      }
      if (uploadedPhotoUrl) {
        payload.photo_url = uploadedPhotoUrl;
      }
      if (instagram.trim()) {
        payload.instagram = instagram.trim();
      }
      if (tiktok.trim()) {
        payload.tiktok = tiktok.trim();
      }

      await fetch("/api/rep-portal/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Save failed — still celebrate (they can edit profile later)
    }

    try { localStorage.removeItem("rep_onboarded"); } catch { /* noop */ }

    setSaving(false);
    setStep(TOTAL_STEPS - 1);
    setStepKey((k) => k + 1);
  };

  // Skip everything — save what we have and dismiss
  const saveAndDismiss = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { onboarding_completed: true };
      const finalName = editedName.trim() || generatedTag;
      if (finalName && finalName !== initialDisplayName) {
        payload.display_name = finalName;
      }
      if (uploadedPhotoUrl) payload.photo_url = uploadedPhotoUrl;
      if (instagram.trim()) payload.instagram = instagram.trim();
      if (tiktok.trim()) payload.tiktok = tiktok.trim();

      await fetch("/api/rep-portal/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch { /* still dismiss */ }

    try { localStorage.removeItem("rep_onboarded"); } catch { /* noop */ }

    setExiting(true);
    setTimeout(onDismiss, 400);
  };

  const advance = () => {
    if (step === 2) {
      // Last input step → save everything and celebrate
      saveAndCelebrate();
    } else if (step === TOTAL_STEPS - 1) {
      // Celebration step — manually dismiss early
      setExiting(true);
      setTimeout(onDismiss, 400);
    } else {
      setStep((s) => s + 1);
      setStepKey((k) => k + 1);
    }
  };

  // Enter key to advance on socials step
  const handleSocialsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      advance();
    }
  };

  // Escape key to skip all
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
          <div className="flex justify-center mb-5">
            <div className="h-20 w-20 rounded-full overflow-hidden ring-2 ring-primary/30">
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
                onKeyDown={(e) => { if (e.key === "Enter") advance(); }}
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
            className="hidden"
            onChange={handlePhotoSelect}
          />

          <h2 className="text-2xl font-bold text-foreground mb-1">
            Add your photo
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Show everyone who you are
          </p>

          {/* Photo circle — centered block */}
          <div className="flex justify-center mb-4">
            <button
              type="button"
              onClick={triggerUpload}
              disabled={uploading}
              className="relative cursor-pointer active:scale-95 transition-transform"
              aria-label="Upload profile photo"
            >
              <div className={cn(
                "h-32 w-32 rounded-full overflow-hidden border-2 transition-all",
                uploading ? "border-primary/30 animate-pulse" : photoSrc ? "border-primary/40" : "border-white/[0.15] border-dashed"
              )}>
                {photoSrc ? (
                  <img src={photoSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center bg-primary/[0.06] gap-2">
                    <Camera size={28} className="text-primary/50" />
                    <span className="text-[11px] font-medium text-primary/60">Tap to upload</span>
                  </div>
                )}
              </div>
              {uploading && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50">
                  <Loader2 size={24} className="text-white animate-spin" />
                </div>
              )}
            </button>
          </div>

          {/* Change photo link (only shown when photo exists) */}
          {photoSrc && (
            <button
              type="button"
              onClick={triggerUpload}
              disabled={uploading}
              className="text-sm text-primary font-semibold mb-3 active:opacity-70 transition-opacity cursor-pointer"
            >
              Change photo
            </button>
          )}

          <p className="text-xs text-muted-foreground/50 max-w-[240px] mx-auto">
            Optional — you can add one later in your profile
          </p>
        </div>
      );
    }

    // Step 2: Social handles
    if (step === 2) {
      return (
        <div key={stepKey} className="rep-step-in">
          <h2 className="text-2xl font-bold text-foreground mb-1">
            Link your socials
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Optional — helps your followers find you
          </p>

          <div className="w-full max-w-[280px] mx-auto space-y-3">
            {/* Instagram */}
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                <Instagram size={15} className="text-muted-foreground/50" />
                <span className="text-sm text-muted-foreground/40">@</span>
              </div>
              <input
                ref={igInputRef}
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value.replace("@", ""))}
                onKeyDown={handleSocialsKeyDown}
                className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl pl-[4.2rem] pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                placeholder="instagram"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {/* TikTok */}
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                <TikTokIcon size={15} className="text-muted-foreground/50" />
                <span className="text-sm text-muted-foreground/40">@</span>
              </div>
              <input
                type="text"
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value.replace("@", ""))}
                onKeyDown={handleSocialsKeyDown}
                className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl pl-[4.2rem] pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                placeholder="tiktok"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground/50 mt-4 max-w-[240px] mx-auto">
            Skip if you prefer — you can always add these later
          </p>
        </div>
      );
    }

    // Step 3: Celebration — "You're all set!"
    return (
      <div key={stepKey} className="rep-step-in">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="h-20 w-20 rounded-full bg-success/15 border-2 border-success/25 flex items-center justify-center rep-celebrate">
              <Check size={36} className="text-success" />
            </div>
            <div className="absolute -top-1 -right-1">
              <Sparkles size={18} className="text-amber-400 animate-pulse" />
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2">
          You&apos;re all set!
        </h2>
        <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
          Welcome to the team, <span className="text-foreground font-medium">{editedName.trim() || generatedTag}</span>. Let&apos;s go.
        </p>
      </div>
    );
  };

  // Don't show nav on celebration step
  const showNav = step < TOTAL_STEPS - 1;

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

        {/* Navigation — hidden on celebration step */}
        {showNav && (
          <div className="flex items-center justify-between mt-6">
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
              className="rounded-2xl px-8 font-semibold"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </span>
              ) : step === 2 ? (
                instagram.trim() || tiktok.trim() ? "Finish" : "Skip"
              ) : (
                "Next"
              )}
            </Button>
          </div>
        )}
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
