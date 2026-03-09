"use client";

import { useState } from "react";
import {
  X, Loader2, Check, Upload, AlertCircle,
  Link as LinkIcon, Zap, Camera, Music,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getQuestAccent } from "@/lib/rep-quest-styles";
import { playSuccessSound } from "@/lib/rep-utils";
import { CurrencyIcon } from "./CurrencyIcon";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Quest {
  id: string;
  title: string;
  quest_type: string;
  platform?: "tiktok" | "instagram" | "any";
  points_reward: number;
  currency_reward: number;
}

type ProofType = "tiktok_link" | "instagram_link" | "screenshot" | "url" | "text";

const QUEST_PROOF_MAP: Record<string, { types: ProofType[]; default: ProofType }> = {
  social_post: { types: ["tiktok_link", "instagram_link"], default: "tiktok_link" },
  story_share: { types: ["screenshot", "tiktok_link", "instagram_link"], default: "screenshot" },
  content_creation: { types: ["tiktok_link", "instagram_link", "screenshot"], default: "tiktok_link" },
  custom: { types: ["tiktok_link", "instagram_link", "screenshot"], default: "tiktok_link" },
};

const PROOF_TYPE_CONFIG: Record<ProofType, { placeholder: string }> = {
  tiktok_link: { placeholder: "Paste your TikTok video URL..." },
  instagram_link: { placeholder: "Paste your Instagram post/reel URL..." },
  url: { placeholder: "Paste the URL..." },
  screenshot: { placeholder: "Paste screenshot URL..." },
  text: { placeholder: "Describe what you did..." },
};

// ─── Image compression ──────────────────────────────────────────────────────
// Resize + compress images client-side before upload.
// Mobile screenshots (especially iPhone 3x Retina) can be 3-7MB as base64,
// exceeding Vercel's 4.5MB body limit. This keeps uploads under 500KB.

function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

interface QuestSubmitSheetProps {
  quest: Quest;
  onClose: () => void;
  onSubmitted: () => void;
  currencyName?: string;
}

export function QuestSubmitSheet({ quest, onClose, onSubmitted, currencyName = "FRL" }: QuestSubmitSheetProps) {
  const accent = getQuestAccent(quest.points_reward);
  const mapping = QUEST_PROOF_MAP[quest.quest_type] || QUEST_PROOF_MAP.custom;
  const platform = quest.platform || "any";

  // Determine default proof type based on quest platform
  let defaultType = mapping.default;
  if (platform === "tiktok") defaultType = "tiktok_link";
  else if (platform === "instagram") defaultType = "instagram_link";

  const [proofType, setProofType] = useState<ProofType>(defaultType);
  const [proofText, setProofText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [error, setError] = useState("");

  // Available proof types filtered by quest platform
  const availableProofTypes = mapping.types.filter((pt) => {
    if (pt === "tiktok_link") return platform === "tiktok" || platform === "any";
    if (pt === "instagram_link") return platform === "instagram" || platform === "any";
    return true;
  });

  const platformTypes = availableProofTypes.filter((pt) => pt === "tiktok_link" || pt === "instagram_link");
  const hasScreenshot = availableProofTypes.includes("screenshot");
  const isPlatformLink = proofType === "tiktok_link" || proofType === "instagram_link";
  const hasDualReward = quest.currency_reward > 0;

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      // Compress before upload — mobile screenshots can be 3-7MB raw
      const base64 = await compressImage(file);

      const body = JSON.stringify({ imageData: base64, key: `quest-proof-${Date.now()}` });

      // Try the rep endpoint first, fall back to /api/upload (which now also accepts rep auth)
      let res = await fetch("/api/rep-portal/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      // If rep endpoint 404s (old deployment), fall back to main upload endpoint
      if (res.status === 404) {
        res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      }

      if (res.ok) {
        const json = await res.json();
        const url = json.url || json.key;
        if (!url) {
          setError("Upload succeeded but no URL returned");
          setUploading(false);
          return;
        }
        setUploadedUrl(url);
        setProofText(url);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || `Upload failed (${res.status})`);
      }
    } catch {
      setError("Failed to upload image — check your connection");
    }
    setUploading(false);
  };

  const handleSubmit = async () => {
    const proofValue = proofType === "screenshot" ? (uploadedUrl || proofText.trim()) : proofText.trim();
    if (!proofValue) return;
    setError("");
    setSubmitting(true);
    try {
      const isUrlType = ["tiktok_link", "instagram_link", "url", "screenshot"].includes(proofType);
      const res = await fetch(`/api/rep-portal/quests/${quest.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof_type: proofType,
          proof_text: proofValue,
          proof_url: isUrlType ? proofValue : undefined,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setError("");
        playSuccessSound();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || "Failed to submit quest proof");
      }
    } catch {
      setError("Failed to submit quest proof — check your connection");
    }
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div className="rep-quest-submit-sheet w-full max-w-md max-h-[85dvh] overflow-hidden rounded-2xl border border-white/[0.12]">

        {/* Close button */}
        <button
          onClick={() => { if (!submitting) onClose(); }}
          className="rep-quest-detail-close"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Scrollable content — hidden scrollbar */}
        <div className="rep-quest-detail-scroll overflow-y-auto overscroll-contain max-h-[85dvh]">

          {submitted ? (
            /* ── Victory celebration ── */
            <div className="relative text-center py-10 px-6 overflow-hidden">

              {/* Confetti burst — 12 particles from center */}
              <div className="rep-confetti-burst pointer-events-none absolute inset-0 flex items-start justify-center" style={{ top: "80px" }}>
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
                <div className="rep-confetti-piece" />
              </div>

              {/* Animated checkmark with expanding victory ring */}
              <div className="relative inline-flex items-center justify-center mb-6">
                <div
                  className="rep-victory-ring h-20 w-20 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${accent.progressColor}15`, color: accent.progressColor }}
                >
                  <svg className="rep-check-draw" width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke={accent.progressColor}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              {/* Victory title */}
              <p className="rep-victory-title text-xl font-black text-foreground tracking-tight mb-1">
                Quest Submitted!
              </p>
              <p className="rep-victory-title text-sm text-muted-foreground mb-6" style={{ animationDelay: "0.4s" }}>
                Your proof is being reviewed
              </p>

              {/* Reward badges with staggered reveal + shimmer */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <div
                  className="rep-reward-reveal-1 rep-reward-shimmer inline-flex items-center gap-2 rounded-2xl px-5 py-3"
                  style={{
                    backgroundColor: `${accent.progressColor}12`,
                    border: `1px solid ${accent.progressColor}30`,
                    boxShadow: `0 4px 24px ${accent.progressColor}15`,
                  }}
                >
                  <Zap size={18} style={{ color: accent.progressColor }} />
                  <span className="rep-xp-counter text-lg font-black" style={{ color: accent.progressColor }}>
                    +{quest.points_reward} XP
                  </span>
                </div>
                {hasDualReward && (
                  <div
                    className="rep-reward-reveal-2 rep-reward-shimmer inline-flex items-center gap-2 rounded-2xl px-5 py-3"
                    style={{
                      backgroundColor: "rgba(251, 191, 36, 0.08)",
                      border: "1px solid rgba(251, 191, 36, 0.2)",
                      boxShadow: "0 4px 24px rgba(251, 191, 36, 0.1)",
                    }}
                  >
                    <CurrencyIcon size={18} className="text-amber-400" />
                    <span className="rep-xp-counter text-lg font-black text-amber-400">
                      +{quest.currency_reward} {currencyName}
                    </span>
                  </div>
                )}
              </div>

              {/* Pending review status card */}
              <div className="rep-status-card-reveal mx-auto max-w-[260px] rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 mb-6">
                <div className="flex items-center justify-center gap-2">
                  <span className="rep-pending-dot h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-xs font-semibold text-muted-foreground">Awaiting admin review</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Rewards are granted once approved
                </p>
              </div>

              {/* Dismiss CTA */}
              <button
                onClick={onSubmitted}
                className="rep-victory-cta w-full max-w-[260px] mx-auto rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 py-3 text-sm font-bold text-foreground transition-all hover:bg-white/[0.08] active:scale-[0.97]"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* ── Header ── */}
              <div className="px-5 pt-6 pb-1 text-center rep-quest-reveal-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 mb-3">
                  <Zap size={11} className="text-primary" />
                  <span className="text-[10px] font-semibold text-primary tracking-wide">Submit Proof</span>
                </div>

                <h3 className={cn("text-lg font-extrabold tracking-tight leading-snug", accent.titleColor)}>
                  {quest.title}
                </h3>

                {/* Inline reward preview */}
                <div className="flex items-center justify-center gap-3 mt-2">
                  <span className={cn("flex items-center gap-1 text-xs font-bold", accent.color)}>
                    <Zap size={12} /> +{quest.points_reward} XP
                  </span>
                  {hasDualReward && (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-400">
                      <CurrencyIcon size={12} /> +{quest.currency_reward} {currencyName}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Form ── */}
              <div className="px-5 pb-5 pt-4 space-y-4 rep-quest-reveal-2">

                {/* Platform selector */}
                {platformTypes.length > 1 && isPlatformLink && (
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-widest">Where did you post?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {platformTypes.map((pt) => {
                        const isTikTok = pt === "tiktok_link";
                        const selected = proofType === pt;
                        return (
                          <button
                            key={pt}
                            type="button"
                            onClick={() => { setProofType(pt); setProofText(""); setUploadedUrl(""); }}
                            className={cn(
                              "relative rounded-xl p-3.5 border-2 text-center transition-all duration-200 cursor-pointer",
                              selected
                                ? isTikTok
                                  ? "bg-[#25F4EE]/5 border-[#25F4EE]/30 shadow-[0_0_24px_rgba(37,244,238,0.08)]"
                                  : "bg-[#E1306C]/5 border-[#E1306C]/30 shadow-[0_0_24px_rgba(225,48,108,0.08)]"
                                : "bg-white/[0.02] border-white/[0.08] hover:border-white/[0.15]"
                            )}
                          >
                            <div className={cn(
                              "mx-auto mb-1.5 w-9 h-9 rounded-lg flex items-center justify-center",
                              isTikTok ? "bg-[#25F4EE]/10" : "bg-[#E1306C]/10"
                            )}>
                              {isTikTok
                                ? <Music size={18} className="text-[#25F4EE]" />
                                : <Camera size={18} className="text-[#E1306C]" />
                              }
                            </div>
                            <span className="text-sm font-bold text-foreground block">
                              {isTikTok ? "TikTok" : "Instagram"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {isTikTok ? "Video link" : "Post or reel"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Link input */}
                {isPlatformLink && (
                  <div>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-widest">
                      <LinkIcon size={11} />
                      Paste your {proofType === "tiktok_link" ? "TikTok" : "Instagram"} link
                    </label>
                    <input
                      value={proofText}
                      onChange={(e) => setProofText(e.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-white/[0.05] focus:outline-none transition-all"
                      placeholder={PROOF_TYPE_CONFIG[proofType].placeholder}
                      autoFocus
                    />
                    {proofType === "tiktok_link" && proofText && !/tiktok\.com\//.test(proofText) && (
                      <p className="mt-2 text-[10px] text-amber-400 flex items-center gap-1">
                        <AlertCircle size={10} /> Must be a TikTok URL (e.g. tiktok.com/@user/video/...)
                      </p>
                    )}
                    {proofType === "instagram_link" && proofText && !/instagram\.com\/(p|reel|reels|tv)\//.test(proofText) && (
                      <p className="mt-2 text-[10px] text-amber-400 flex items-center gap-1">
                        <AlertCircle size={10} /> Must be an Instagram post or reel URL
                      </p>
                    )}
                  </div>
                )}

                {/* Screenshot upload */}
                {proofType === "screenshot" && (
                  <div className="space-y-3">
                    {quest.quest_type === "story_share" && !uploadedUrl && (
                      <p className="text-[11px] text-muted-foreground text-center">
                        Screenshot your story showing the shared content
                      </p>
                    )}
                    {uploadedUrl ? (
                      <div className="relative rounded-xl overflow-hidden border border-white/[0.08]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={uploadedUrl} alt="Proof" className="w-full max-h-48 object-contain bg-white/[0.02]" />
                        <button
                          onClick={() => { setUploadedUrl(""); setProofText(""); }}
                          className="absolute top-2 right-2 h-7 w-7 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-black/80"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <label className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-white/[0.10] bg-white/[0.02] py-8 cursor-pointer transition-all hover:border-primary/40 hover:bg-white/[0.04]",
                        uploading && "opacity-50 pointer-events-none"
                      )}>
                        {uploading
                          ? <Loader2 size={22} className="animate-spin text-primary" />
                          : <Upload size={22} className="text-muted-foreground" />
                        }
                        <span className="text-xs text-muted-foreground font-medium">
                          {uploading ? "Uploading..." : "Tap to upload a screenshot"}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}

                {/* Toggle: screenshot vs link */}
                {hasScreenshot && (
                  <button
                    type="button"
                    onClick={() => {
                      if (proofType === "screenshot") {
                        setProofType(platformTypes[0] || "tiktok_link");
                      } else {
                        setProofType("screenshot");
                      }
                      setProofText("");
                      setUploadedUrl("");
                    }}
                    className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    {proofType === "screenshot" ? "Paste a link instead" : "Or upload a screenshot"}
                  </button>
                )}

                {/* Error display */}
                {error && !submitting && !submitted && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                    <p className="text-xs text-red-400">{error}</p>
                  </div>
                )}

                {/* Submit CTA */}
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (!proofText.trim() && !uploadedUrl)}
                  className={cn(
                    "rep-quest-cta w-full rounded-xl px-4 py-3.5 text-sm font-bold text-white transition-all active:scale-[0.97] disabled:opacity-30 disabled:scale-100",
                    "flex items-center justify-center gap-2",
                    accent.ctaGradient
                  )}
                  style={{ boxShadow: `0 4px 20px ${accent.progressColor}30` }}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      Submit Proof
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
