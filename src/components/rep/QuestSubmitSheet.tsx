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
  story_share: { types: ["tiktok_link", "instagram_link", "screenshot"], default: "tiktok_link" },
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

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, key: `quest-proof-${Date.now()}` }),
      });
      if (res.ok) {
        const json = await res.json();
        if (!json.key) {
          setError("Upload succeeded but no media key returned");
          setUploading(false);
          return;
        }
        const mediaUrl = `/api/media/${json.key}`;
        setUploadedUrl(mediaUrl);
        setProofText(mediaUrl);
      } else {
        setError("Failed to upload image");
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
        setTimeout(() => {
          onSubmitted();
        }, 1500);
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
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[var(--color-card)]">

        {/* Header: rewards, close */}
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-3">
            <span className={cn("flex items-center gap-1 text-sm font-extrabold", accent.color)}>
              <Zap size={14} /> +{quest.points_reward} XP
            </span>
            {quest.currency_reward > 0 && (
              <span className="flex items-center gap-1 text-sm font-extrabold text-[#ff0033]">
                <CurrencyIcon size={14} /> +{quest.currency_reward} {currencyName}
              </span>
            )}
          </div>
          <button
            onClick={() => { if (!submitting) onClose(); }}
            className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Quest title + motivation */}
        <div className="px-5 pt-2 pb-1">
          <h3 className={cn("text-lg font-extrabold tracking-tight", accent.titleColor)}>
            {quest.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Submit your proof to earn <span className="font-bold text-primary">{quest.points_reward} XP</span>
            {quest.currency_reward > 0 && (
              <> + <span className="font-bold text-[#ff0033]">{quest.currency_reward} {currencyName}</span></>
            )}
          </p>
        </div>

        {submitted ? (
          /* Success state */
          <div className="text-center py-10 px-5 relative">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mb-4 rep-reward-success-ring relative">
              <Check size={28} className="text-success" />
              <div className="rep-success-particles">
                <div className="rep-success-particle" />
                <div className="rep-success-particle" />
                <div className="rep-success-particle" />
              </div>
            </div>
            <p className="text-base font-extrabold text-foreground mb-1">Quest Submitted!</p>
            <p className="text-xs text-muted-foreground mb-3">Your proof is being reviewed</p>
            <div className="flex items-center justify-center gap-3">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-4 py-2">
                <Zap size={14} className="text-primary" />
                <span className="text-sm font-bold text-primary">+{quest.points_reward} XP pending</span>
              </div>
              {quest.currency_reward > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#ff0033]/10 border border-[#ff0033]/20 px-4 py-2">
                  <CurrencyIcon size={14} className="text-[#ff0033]" />
                  <span className="text-sm font-bold text-[#ff0033]">+{quest.currency_reward} {currencyName}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 pb-5 pt-3 space-y-4">

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
                "w-full rounded-xl px-4 py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-30 disabled:scale-100",
                "flex items-center justify-center gap-2",
                accent.ctaGradient
              )}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Zap size={16} />
                  Submit for +{quest.points_reward} XP{quest.currency_reward > 0 ? ` +${quest.currency_reward} ${currencyName}` : ""}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
