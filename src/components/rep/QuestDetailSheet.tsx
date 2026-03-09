"use client";

import { useState } from "react";
import {
  X, Check, Clock, Zap, ExternalLink,
  Camera, Share2, Sparkles, Music, Instagram, Target,
  Download, Link as LinkIcon, BookOpen,
  ArrowRight, ArrowLeft, Upload, Loader2, AlertCircle,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { getQuestAccent } from "@/lib/rep-quest-styles";
import { isMuxPlaybackId, getMuxThumbnailUrl, getMuxDownloadUrl } from "@/lib/mux";
import { playSuccessSound } from "@/lib/rep-utils";
import { TikTokIcon } from "./TikTokIcon";
import { CurrencyIcon } from "./CurrencyIcon";

const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), { ssr: false });

// ─── Types ──────────────────────────────────────────────────────────────────

interface Quest {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  quest_type: string;
  platform?: "tiktok" | "instagram" | "any";
  image_url?: string;
  banner_image_url?: string;
  video_url?: string;
  reference_url?: string | null;
  uses_sound?: boolean;
  points_reward: number;
  currency_reward: number;
  expires_at?: string;
  my_submissions: { total: number; approved: number; pending: number; rejected: number };
  max_completions?: number;
  sales_target?: number;
  my_progress?: { current: number; target: number };
  event?: { id: string; name: string; slug: string } | null;
}

// ─── Steps ──────────────────────────────────────────────────────────────────

interface Step { id: string; label: string }

const QUEST_STEPS: Record<string, Step[]> = {
  social_post: [
    { id: "overview", label: "Overview" },
    { id: "create", label: "Create" },
    { id: "submit", label: "Submit" },
  ],
  story_share: [
    { id: "overview", label: "Overview" },
    { id: "share", label: "Share" },
    { id: "submit", label: "Submit" },
  ],
  content_creation: [
    { id: "overview", label: "Overview" },
    { id: "create", label: "Create" },
    { id: "submit", label: "Submit" },
  ],
  custom: [
    { id: "overview", label: "Overview" },
    { id: "instructions", label: "Instructions" },
    { id: "submit", label: "Submit" },
  ],
  sales_milestone: [
    { id: "progress", label: "Progress" },
  ],
};

const STEP_CTA: Record<string, string> = {
  overview: "Get Started",
  create: "Ready to Submit",
  share: "I've Shared It",
  instructions: "Ready to Submit",
};

// ─── Proof Types ────────────────────────────────────────────────────────────

type ProofType = "tiktok_link" | "instagram_link" | "screenshot" | "url" | "text";

const QUEST_PROOF_MAP: Record<string, { types: ProofType[]; default: ProofType }> = {
  social_post: { types: ["tiktok_link", "instagram_link"], default: "tiktok_link" },
  story_share: { types: ["screenshot", "tiktok_link", "instagram_link"], default: "screenshot" },
  content_creation: { types: ["tiktok_link", "instagram_link", "screenshot"], default: "tiktok_link" },
  custom: { types: ["tiktok_link", "instagram_link", "screenshot"], default: "tiktok_link" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getReferenceUrlPlatform(url: string): "tiktok" | "instagram" | null {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  return null;
}

function getExpiryInfo(expiresAt: string): { text: string; urgent: boolean } | null {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return { text: "Expires today", urgent: true };
  if (diffDays <= 3) return { text: `Expires in ${diffDays} days`, urgent: true };
  if (diffDays <= 7) return { text: `Expires in ${diffDays} days`, urgent: false };
  return { text: `Expires ${expiry.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, urgent: false };
}

const QUEST_TYPE_ICONS: Record<string, typeof Camera> = {
  social_post: Camera,
  story_share: Share2,
  content_creation: Sparkles,
  custom: Zap,
  sales_milestone: Target,
};

// ─── Component ──────────────────────────────────────────────────────────────

interface QuestDetailSheetProps {
  quest: Quest;
  onClose: () => void;
  onSubmitted: () => void;
  onExpandImage: () => void;
  currencyName?: string;
  discountCode?: string;
  shareLink?: string;
}

export function QuestDetailSheet({
  quest, onClose, onSubmitted, onExpandImage,
  currencyName = "FRL", discountCode, shareLink,
}: QuestDetailSheetProps) {
  const [step, setStep] = useState(0);
  const accent = getQuestAccent(quest.points_reward);
  const QuestTypeIcon = QUEST_TYPE_ICONS[quest.quest_type] || Zap;
  const questTypeLabel = quest.quest_type.replace(/_/g, " ");
  const subs = quest.my_submissions;
  const hasSubs = subs.total > 0;
  const approvedCount = subs?.approved ?? 0;
  const maxComp = quest.max_completions ?? 1;
  const isCompleted = quest.quest_type === "sales_milestone"
    ? !!(quest.my_progress && quest.my_progress.current >= quest.my_progress.target)
    : approvedCount >= maxComp;
  const isRepeatable = quest.max_completions && quest.max_completions > 1;
  const hasPending = subs.pending > 0;
  const isRejected = subs.total > 0 && subs.approved === 0 && subs.pending === 0;
  const canSubmit = !isCompleted && (!hasPending || !!isRepeatable);
  // State determines which view to render
  const questState: "available" | "pending" | "completed" | "rejected" =
    isCompleted ? "completed" : hasPending ? "pending" : isRejected ? "rejected" : "available";
  const backdropImage = quest.banner_image_url || quest.image_url;
  const hasBackdrop = !!backdropImage;
  const hasImage = !!quest.image_url;
  const isStoryShare = quest.quest_type === "story_share";
  const isSocialPost = quest.quest_type === "social_post";
  const isContentCreation = quest.quest_type === "content_creation";
  const isSalesMilestone = quest.quest_type === "sales_milestone";
  const salesProgress = quest.my_progress;
  const salesCompleted = salesProgress ? salesProgress.current >= salesProgress.target : false;
  const hasRefUrl = !!quest.reference_url;
  const refPlatform = quest.reference_url ? getReferenceUrlPlatform(quest.reference_url) : (quest.platform !== "any" ? quest.platform : null);
  const hasDualReward = quest.currency_reward > 0;
  const hasVideo = !!quest.video_url;
  const hasDownloadableContent = hasImage || hasVideo;
  const hasMiddleStepContent = hasRefUrl || hasDownloadableContent || !!quest.instructions;
  const expiry = quest.expires_at ? getExpiryInfo(quest.expires_at) : null;

  // Filter out the middle step if there's nothing to show (social_post / content_creation only)
  const allSteps = QUEST_STEPS[quest.quest_type] || QUEST_STEPS.custom;
  const steps = (isSocialPost || isContentCreation) && !hasMiddleStepContent
    ? allSteps.filter((s) => s.id !== "create")
    : allSteps;
  const currentStep = steps[step];
  const isSubmitStep = step === steps.length - 1;

  // ── Submit state ──
  const mapping = QUEST_PROOF_MAP[quest.quest_type] || QUEST_PROOF_MAP.custom;
  const platform = quest.platform || "any";
  let defaultProofType = mapping.default;
  if (platform === "tiktok") defaultProofType = "tiktok_link";
  else if (platform === "instagram") defaultProofType = "instagram_link";

  const [proofType, setProofType] = useState<ProofType>(defaultProofType);
  const [proofText, setProofText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [error, setError] = useState("");

  // ── Image save state ──
  const [savingImage, setSavingImage] = useState(false);
  const [savedImage, setSavedImage] = useState(false);
  const [longPressImageUrl, setLongPressImageUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const availableProofTypes = mapping.types.filter((pt) => {
    if (pt === "tiktok_link") return platform === "tiktok" || platform === "any";
    if (pt === "instagram_link") return platform === "instagram" || platform === "any";
    return true;
  });
  const platformTypes = availableProofTypes.filter((pt) => pt === "tiktok_link" || pt === "instagram_link");
  const hasScreenshot = availableProofTypes.includes("screenshot");
  const isPlatformLink = proofType === "tiktok_link" || proofType === "instagram_link";

  // ── Handlers ──

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch { /* clipboard not available */ }
  };

  const handleSaveImage = async (url: string) => {
    setSavingImage(true);
    try {
      const proxyUrl = `/api/rep-portal/download-media?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const blob = await res.blob();
        const ext = blob.type.includes("png") ? "png" : "jpg";
        const file = new File([blob], `story.${ext}`, { type: blob.type });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            setSavedImage(true);
            setTimeout(() => setSavedImage(false), 2000);
            setSavingImage(false);
            return;
          } catch (e) {
            if (e instanceof Error && e.name === "AbortError") { setSavingImage(false); return; }
          }
        }
        if (typeof window !== "undefined" && !("ontouchstart" in window)) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `story.${ext}`;
          a.click();
          URL.revokeObjectURL(a.href);
          setSavedImage(true);
          setTimeout(() => setSavedImage(false), 2000);
          setSavingImage(false);
          return;
        }
      }
    } catch { /* fall through */ }
    setSavingImage(false);
    setLongPressImageUrl(url);
  };

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
        if (!json.key) { setError("Upload succeeded but no media key returned"); setUploading(false); return; }
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
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || "Failed to submit quest proof");
      }
    } catch {
      setError("Failed to submit — check your connection");
    }
    setSubmitting(false);
  };

  // ── Render helpers ──

  const renderDownloadContent = (sectionLabel: string) => (
    <div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{sectionLabel}</p>
      <div className="space-y-2">
        {hasImage && (
          <button
            onClick={() => handleSaveImage(quest.image_url!)}
            disabled={savingImage}
            className="w-full flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 transition-colors hover:bg-white/[0.08] active:scale-[0.98] disabled:opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={quest.image_url!} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-foreground">
                {savingImage ? "Saving..." : savedImage ? "Saved!" : "Save Image"}
              </p>
              <p className="text-[10px] text-muted-foreground">Tap to save to your device</p>
            </div>
            {savedImage ? <Check size={16} className="text-emerald-400 shrink-0" /> : <Download size={16} className="text-primary shrink-0" />}
          </button>
        )}
        {hasVideo && (
          <a
            href={quest.video_url && isMuxPlaybackId(quest.video_url) ? getMuxDownloadUrl(quest.video_url) : quest.video_url!}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 transition-colors hover:bg-white/[0.08] active:scale-[0.98]"
          >
            {quest.video_url && isMuxPlaybackId(quest.video_url) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={getMuxThumbnailUrl(quest.video_url)} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                <Camera size={16} className="text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-foreground">Save Video</p>
              <p className="text-[10px] text-muted-foreground">Hold down to save on mobile</p>
            </div>
            <Download size={16} className="text-primary shrink-0" />
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div
        className={cn(
          "rep-quest-detail-sheet relative w-full max-w-md rounded-2xl max-h-[85dvh] flex flex-col overflow-hidden",
          hasBackdrop && currentStep.id === "overview" && (questState === "available" || questState === "rejected") && "rep-quest-has-backdrop"
        )}
        role="dialog"
        aria-label={quest.title}
        style={{
          ["--quest-accent" as string]: accent.progressColor,
          boxShadow: hasBackdrop && currentStep.id === "overview" && (questState === "available" || questState === "rejected")
            ? `0 0 120px ${accent.progressColor}20, 0 0 40px ${accent.progressColor}08, 0 25px 60px rgba(0,0,0,0.7)`
            : `0 25px 60px rgba(0,0,0,0.5)`,
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-[15%] right-[15%] h-px z-10 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent.progressColor}60, transparent)`,
            boxShadow: `0 0 16px ${accent.progressColor}30`,
          }}
        />

        {/* Backdrop — overview step only, for available/rejected states */}
        {hasBackdrop && currentStep.id === "overview" && (questState === "available" || questState === "rejected") && (
          <div className="rep-quest-detail-hero-backdrop" aria-hidden="true" onClick={onExpandImage}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backdropImage!} alt="" />
          </div>
        )}

        {/* Close button */}
        <button
          onClick={() => { if (!submitting) onClose(); }}
          className="rep-quest-detail-close"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Step indicator — segmented pill bar (hidden for single-step types and non-available states) */}
        {!submitted && steps.length > 1 && (questState === "available" || questState === "rejected") && (
          <div className="shrink-0 pt-4 pb-2 px-5 relative z-[2]">
            <div className="flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/[0.06] p-1">
              {steps.map((s, i) => {
                const isActive = i === step;
                const isPast = i < step;
                return (
                  <button
                    key={s.id}
                    onClick={() => isPast && setStep(i)}
                    disabled={i > step}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[11px] font-semibold transition-all",
                      isActive && "text-white shadow-sm",
                      isPast && "text-white/40 cursor-pointer hover:text-white/60",
                      i > step && "text-white/15"
                    )}
                    style={isActive ? {
                      background: `linear-gradient(135deg, ${accent.progressColor}30, ${accent.progressColor}15)`,
                      boxShadow: `inset 0 1px 0 ${accent.progressColor}20, 0 0 12px ${accent.progressColor}10`,
                      border: `1px solid ${accent.progressColor}25`,
                    } : undefined}
                  >
                    {isPast && <Check size={10} style={{ color: accent.progressColor }} />}
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Scrollable content ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain relative z-[1] rep-quest-detail-scroll">

          {/* ═══ PENDING VIEW — Quest is awaiting review ═══ */}
          {!submitted && questState === "pending" && (
            <div className="px-5 pb-4">
              <div className="text-center pt-2 pb-4 rep-quest-reveal-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 border border-amber-400/20 px-3 py-1 mb-3">
                  <Clock size={11} className="text-amber-400" />
                  <span className="text-[10px] font-semibold text-amber-400 tracking-wide">Under Review</span>
                </div>
                <h3 className="text-2xl font-extrabold tracking-tight leading-tight text-foreground">
                  {quest.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Your submission is being reviewed by the team
                </p>
              </div>

              {/* Big pending indicator */}
              <div className="flex justify-center mb-5 rep-quest-reveal-2">
                <div className="relative h-20 w-20 rounded-full bg-amber-400/[0.08] flex items-center justify-center">
                  <Clock size={32} className="text-amber-400" />
                  <div className="absolute inset-[-4px] rounded-full border-2 border-amber-400/20 animate-pulse" />
                </div>
              </div>

              {/* Rewards you'll earn */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-4 rep-quest-reveal-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5 text-center">Rewards when approved</p>
                <div className="flex items-center justify-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/15 px-3.5 py-1.5">
                    <Zap size={13} className="text-primary" />
                    <span className="text-xs font-bold text-primary">+{quest.points_reward} XP</span>
                  </div>
                  {hasDualReward && (
                    <div className="flex items-center gap-1.5 rounded-full bg-amber-400/10 border border-amber-400/15 px-3.5 py-1.5">
                      <CurrencyIcon size={13} className="text-amber-400" />
                      <span className="text-xs font-bold text-amber-400">+{quest.currency_reward} {currencyName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Pulsing status */}
              <div className="flex items-center justify-center gap-2 rep-quest-reveal-4">
                <span className="rep-pending-dot h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-xs text-muted-foreground">Awaiting admin review</span>
              </div>
            </div>
          )}

          {/* ═══ COMPLETED VIEW — Quest is done ═══ */}
          {!submitted && questState === "completed" && !isSalesMilestone && (
            <div className="px-5 pb-4">
              <div className="text-center pt-4 pb-4 rep-quest-reveal-1">
                {/* Victory checkmark */}
                <div className="relative inline-flex items-center justify-center mb-5">
                  <div
                    className="h-20 w-20 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${accent.progressColor}12`, boxShadow: `0 0 40px ${accent.progressColor}15` }}
                  >
                    <Check size={36} style={{ color: accent.progressColor }} />
                  </div>
                </div>

                <h3 className="text-2xl font-black tracking-tight text-foreground mb-1">Quest Complete!</h3>
                <p className="text-[15px] text-muted-foreground/80 leading-relaxed mt-1 mb-5">{quest.title}</p>

                {/* Earned rewards */}
                <div className="flex items-center justify-center gap-2.5 mb-5">
                  <div
                    className="inline-flex items-center gap-1.5 rounded-2xl px-5 py-2.5"
                    style={{ backgroundColor: `${accent.progressColor}10`, border: `1px solid ${accent.progressColor}20` }}
                  >
                    <Zap size={16} style={{ color: accent.progressColor }} />
                    <span className="text-sm font-black" style={{ color: accent.progressColor }}>+{quest.points_reward} XP earned</span>
                  </div>
                  {hasDualReward && (
                    <div className="inline-flex items-center gap-1.5 rounded-2xl bg-amber-400/[0.08] border border-amber-400/15 px-5 py-2.5">
                      <CurrencyIcon size={16} className="text-amber-400" />
                      <span className="text-sm font-black text-amber-400">+{quest.currency_reward} {currencyName}</span>
                    </div>
                  )}
                </div>

                {/* Completion badge */}
                <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 px-4 py-2.5 rep-quest-reveal-2">
                  <Check size={14} className="text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-400">Submission approved</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP: Overview ═══ */}
          {(questState === "available" || questState === "rejected") && currentStep.id === "overview" && (
            <div className="px-5 pb-4">
              <div className="text-center pt-2 pb-4 rep-quest-reveal-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 mb-3">
                  <QuestTypeIcon size={11} className="text-primary" />
                  <span className="text-[10px] font-semibold text-primary capitalize tracking-wide">{questTypeLabel}</span>
                </div>
                <h3 className={cn("text-2xl font-extrabold tracking-tight leading-tight", accent.titleColor)}>
                  {quest.title}
                </h3>
                {quest.description && (
                  <p className="text-[15px] text-muted-foreground/90 leading-relaxed mt-2.5 max-w-[340px] mx-auto">
                    {quest.description}
                  </p>
                )}
              </div>

              {/* Rewards — compact pills */}
              <div className="flex items-center justify-center gap-2 mb-4 rep-quest-reveal-2">
                <div className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-4 py-2">
                  <Zap size={14} className="text-primary" />
                  <span className="text-sm font-bold text-primary">+{quest.points_reward} XP</span>
                </div>
                {hasDualReward && (
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-400/10 border border-amber-400/20 px-4 py-2">
                    <CurrencyIcon size={14} className="text-amber-400" />
                    <span className="text-sm font-bold text-amber-400">+{quest.currency_reward} {currencyName}</span>
                  </div>
                )}
              </div>

              {/* Accent divider */}
              <div className="px-3 mb-4 rep-quest-reveal-2">
                <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent.progressColor}25, transparent)` }} />
              </div>

              {/* Expiry */}
              {expiry && (
                <div className="flex items-center justify-center gap-1.5 mb-3 rep-quest-reveal-3">
                  <Clock size={12} className={expiry.urgent ? "text-amber-400" : "text-muted-foreground"} />
                  <span className={cn("text-xs font-medium", expiry.urgent ? "text-amber-400" : "text-muted-foreground")}>
                    {expiry.text}
                  </span>
                </div>
              )}

              {/* Progress (repeatable) */}
              {isRepeatable && (
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3.5 mb-3 rep-quest-reveal-3">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Progress</span>
                    <span className="text-xs font-bold text-foreground tabular-nums">
                      {approvedCount}<span className="text-muted-foreground">/{quest.max_completions}</span>
                    </span>
                  </div>
                  <div className="rep-quest-progress">
                    <div className="rep-quest-progress-fill" style={{ width: `${Math.min(100, (approvedCount / (quest.max_completions || 1)) * 100)}%`, background: accent.progressColor }} />
                  </div>
                </div>
              )}

              {/* Status badges */}
              {hasSubs && (
                <div className="flex flex-wrap justify-center gap-1.5 rep-quest-reveal-3">
                  {subs.pending > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-400">
                      <Clock size={10} /> {subs.pending} pending
                    </span>
                  )}
                  {subs.approved > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                      <Check size={10} /> {subs.approved} approved
                    </span>
                  )}
                  {subs.rejected > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-1 text-[10px] font-semibold text-red-400">
                      <X size={10} /> {subs.rejected} rejected
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP: Create (social_post / content_creation) ═══ */}
          {currentStep.id === "create" && (
            <div className="px-5 pb-4 space-y-4">
              {/* Reference post */}
              {hasRefUrl && refPlatform && (
                <div className="rep-quest-reveal-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">View the Reference</p>
                  <a
                    href={quest.reference_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "rep-quest-reference-btn rep-quest-reference-btn--hero",
                      refPlatform === "tiktok" && "rep-quest-reference-btn--tiktok",
                      refPlatform === "instagram" && "rep-quest-reference-btn--instagram"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {refPlatform === "tiktok" ? <TikTokIcon size={20} /> : <Instagram size={20} />}
                    <div className="flex flex-col min-w-0">
                      <span className="text-[15px]">
                        {quest.uses_sound && refPlatform === "tiktok" ? "Open & use this sound" : `View on ${refPlatform === "tiktok" ? "TikTok" : "Instagram"}`}
                      </span>
                      {quest.uses_sound && refPlatform === "tiktok" && (
                        <span className="flex items-center gap-1 text-[10px] opacity-60 font-normal">
                          <Music size={9} /> Sound required
                        </span>
                      )}
                    </div>
                    <ExternalLink size={14} className="ml-auto opacity-50 shrink-0" />
                  </a>
                </div>
              )}

              {/* Downloadable content */}
              {hasDownloadableContent && (
                <div className="rep-quest-reveal-2">
                  {renderDownloadContent("Download Content")}
                </div>
              )}

              {/* Instructions */}
              {quest.instructions && (
                <div className="rep-quest-reveal-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">How to Complete</p>
                  <div className="rounded-xl p-4 bg-white/[0.04] border border-white/[0.08]">
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{quest.instructions}</p>
                  </div>
                </div>
              )}

              {/* Fallback if no content */}
              {!hasRefUrl && !hasDownloadableContent && !quest.instructions && (
                <div className="text-center py-8 rep-quest-reveal-1">
                  <BookOpen size={24} className="text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Create your content and submit proof</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP: Share (story_share) ═══ */}
          {currentStep.id === "share" && (
            <div className="px-5 pb-4 space-y-4">
              {hasDownloadableContent && (
                <div className="rep-quest-reveal-1">
                  {renderDownloadContent("Download & Share")}
                </div>
              )}

              {/* Personal link — clear, human-readable UX */}
              {shareLink && (
                <div className="rep-quest-reveal-2 space-y-3">
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Your personal link</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Anyone who taps this gets your discount automatically
                    </p>
                  </div>

                  {/* Copy link — big, obvious button */}
                  <button
                    onClick={() => copyToClipboard(shareLink)}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-sm font-semibold transition-all active:scale-[0.97]",
                      copiedLink
                        ? "bg-success/15 border border-success/30 text-success"
                        : "bg-primary/10 border border-primary/25 text-primary hover:bg-primary/15"
                    )}
                  >
                    {copiedLink ? <><Check size={16} /> Link Copied!</> : <><LinkIcon size={16} /> Copy Your Link</>}
                  </button>

                  {/* Native share */}
                  {typeof navigator !== "undefined" && "share" in navigator && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.share({
                          text: `Use my code ${discountCode} for a discount!`,
                          url: shareLink,
                        }).catch(() => {});
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-semibold bg-white/[0.04] border border-white/[0.08] text-foreground hover:bg-white/[0.08] transition-all active:scale-[0.97]"
                    >
                      <Share2 size={16} /> Share
                    </button>
                  )}

                  {/* Discount code display — secondary, smaller */}
                  {discountCode && (
                    <div className="text-center pt-1">
                      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-1">Your code</p>
                      <p className="text-sm font-bold font-mono tracking-[4px] text-foreground/70">{discountCode}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Fallback: no event linked — just show the code */}
              {!shareLink && discountCode && (
                <div className="rep-quest-reveal-2 space-y-3">
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Your discount code</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Add this to your story so followers can use it
                    </p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(discountCode)}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 transition-all active:scale-[0.97]",
                      copiedLink
                        ? "bg-success/15 border border-success/30 text-success"
                        : "bg-white/[0.04] border border-white/[0.08] text-foreground hover:bg-white/[0.08]"
                    )}
                  >
                    <span className="text-lg font-black font-mono tracking-[4px]">{discountCode}</span>
                    <span className="text-xs font-medium text-muted-foreground ml-2">
                      {copiedLink ? "Copied!" : "Tap to copy"}
                    </span>
                  </button>
                </div>
              )}

              <p className="text-center text-xs text-muted-foreground rep-quest-reveal-3">
                Post to your story, then come back and submit proof
              </p>
            </div>
          )}

          {/* ═══ STEP: Instructions (custom) ═══ */}
          {currentStep.id === "instructions" && (
            <div className="px-5 pb-4 space-y-4">
              {quest.instructions ? (
                <div className="rep-quest-reveal-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">How to Complete</p>
                  <div className="rounded-xl p-4 bg-white/[0.04] border border-white/[0.08]">
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{quest.instructions}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 rep-quest-reveal-1">
                  <BookOpen size={24} className="text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Follow the quest instructions and submit your proof</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP: Progress (sales_milestone) ═══ */}
          {currentStep.id === "progress" && isSalesMilestone && salesProgress && (
            <div className="px-5 pb-4">
              <div className="text-center pt-2 pb-4 rep-quest-reveal-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 mb-3">
                  <Target size={11} className="text-primary" />
                  <span className="text-[10px] font-semibold text-primary capitalize tracking-wide">Sales Challenge</span>
                </div>
                <h3 className={cn("text-2xl font-extrabold tracking-tight leading-tight", accent.titleColor)}>
                  {quest.title}
                </h3>
                {quest.description && (
                  <p className="text-[15px] text-muted-foreground/90 leading-relaxed mt-2.5 max-w-[340px] mx-auto">
                    {quest.description}
                  </p>
                )}
                {quest.event && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {quest.event.name}
                  </p>
                )}
              </div>

              {/* Big progress ring */}
              <div className="flex flex-col items-center rep-quest-reveal-2">
                <div className="relative w-40 h-40 mb-4">
                  {/* Background ring */}
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="52" fill="none"
                      stroke={accent.progressColor}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 52}`}
                      strokeDashoffset={`${2 * Math.PI * 52 * (1 - Math.min(1, salesProgress.current / salesProgress.target))}`}
                      className="transition-all duration-1000 ease-out"
                      style={{ filter: `drop-shadow(0 0 8px ${accent.progressColor}40)` }}
                    />
                  </svg>
                  {/* Center text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {salesCompleted ? (
                      <>
                        <div
                          className="h-12 w-12 rounded-full flex items-center justify-center mb-1 rep-reward-success-ring"
                          style={{ backgroundColor: `${accent.progressColor}15` }}
                        >
                          <Check size={24} style={{ color: accent.progressColor }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-black tabular-nums text-foreground leading-none">{salesProgress.current}</span>
                        <span className="text-xs text-muted-foreground mt-0.5">of {salesProgress.target} sales</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Motivational text */}
                <p className="text-sm font-semibold text-foreground mb-1">
                  {salesCompleted
                    ? "Challenge Complete!"
                    : salesProgress.current === 0
                      ? "Make your first sale to get started"
                      : salesProgress.current >= salesProgress.target - 1
                        ? "Almost there — one more!"
                        : `${salesProgress.target - salesProgress.current} more sale${salesProgress.target - salesProgress.current !== 1 ? "s" : ""} to go`
                  }
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {salesCompleted
                    ? "Your reward has been automatically applied"
                    : "Progress updates automatically with each sale"
                  }
                </p>
              </div>

              {/* Accent divider */}
              <div className="px-3 my-4 rep-quest-reveal-3">
                <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent.progressColor}25, transparent)` }} />
              </div>

              {/* Rewards */}
              <div className="flex items-center justify-center gap-2 rep-quest-reveal-3">
                <div className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-4 py-2">
                  <Zap size={14} className="text-primary" />
                  <span className="text-sm font-bold text-primary">
                    {salesCompleted ? "" : "Earn "}{quest.points_reward > 0 ? `+${quest.points_reward} XP` : ""}
                  </span>
                </div>
                {quest.currency_reward > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-400/10 border border-amber-400/20 px-4 py-2">
                    <CurrencyIcon size={14} className="text-amber-400" />
                    <span className="text-sm font-bold text-amber-400">
                      {salesCompleted ? "" : "Earn "}{`+${quest.currency_reward} ${currencyName}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Expiry */}
              {expiry && (
                <div className="flex items-center justify-center gap-1.5 mt-3 rep-quest-reveal-4">
                  <Clock size={12} className={expiry.urgent ? "text-amber-400" : "text-muted-foreground"} />
                  <span className={cn("text-xs font-medium", expiry.urgent ? "text-amber-400" : "text-muted-foreground")}>
                    {expiry.text}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP: Submit ═══ */}
          {(questState === "available" || questState === "rejected") && isSubmitStep && !submitted && !isSalesMilestone && (
            <div className="px-5 pb-4 space-y-4">
              {isCompleted ? (
                <div className="text-center py-8 rep-quest-reveal-1">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 mb-4">
                    <Check size={28} className="text-emerald-400" />
                  </div>
                  <p className="text-lg font-extrabold text-foreground mb-1">Quest Completed</p>
                  <p className="text-sm text-muted-foreground">You&apos;ve reached the maximum completions</p>
                </div>
              ) : hasPending && !isRepeatable ? (
                <div className="text-center py-8 rep-quest-reveal-1">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-400/10 mb-4">
                    <Clock size={28} className="text-amber-400" />
                  </div>
                  <p className="text-lg font-extrabold text-foreground mb-1">Submission Pending</p>
                  <p className="text-sm text-muted-foreground">Your proof is being reviewed</p>
                </div>
              ) : (
                <>
                  {/* Platform selector */}
                  {platformTypes.length > 1 && isPlatformLink && (
                    <div className="rep-quest-reveal-1">
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
                                "relative rounded-xl p-3.5 border-2 text-center transition-all",
                                selected
                                  ? isTikTok
                                    ? "bg-[#25F4EE]/5 border-[#25F4EE]/30"
                                    : "bg-[#E1306C]/5 border-[#E1306C]/30"
                                  : "bg-white/[0.02] border-white/[0.08] hover:border-white/[0.15]"
                              )}
                            >
                              <div className={cn(
                                "mx-auto mb-1.5 w-9 h-9 rounded-lg flex items-center justify-center",
                                isTikTok ? "bg-[#25F4EE]/10" : "bg-[#E1306C]/10"
                              )}>
                                {isTikTok ? <Music size={18} className="text-[#25F4EE]" /> : <Camera size={18} className="text-[#E1306C]" />}
                              </div>
                              <span className="text-sm font-bold text-foreground block">{isTikTok ? "TikTok" : "Instagram"}</span>
                              <span className="text-[10px] text-muted-foreground">{isTikTok ? "Video link" : "Post or reel"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Link input */}
                  {isPlatformLink && (
                    <div className="rep-quest-reveal-2">
                      <label className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-widest">
                        <LinkIcon size={11} />
                        Paste your {proofType === "tiktok_link" ? "TikTok" : "Instagram"} link
                      </label>
                      <input
                        value={proofText}
                        onChange={(e) => setProofText(e.target.value)}
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-white/[0.05] focus:outline-none transition-all"
                        placeholder={proofType === "tiktok_link" ? "Paste your TikTok video URL..." : "Paste your Instagram post/reel URL..."}
                        autoFocus
                      />
                      {proofType === "tiktok_link" && proofText && !/tiktok\.com\//.test(proofText) && (
                        <p className="mt-2 text-[10px] text-amber-400 flex items-center gap-1">
                          <AlertCircle size={10} /> Must be a TikTok URL
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
                    <div className="space-y-3 rep-quest-reveal-2">
                      {isStoryShare && !uploadedUrl && (
                        <p className="text-[11px] text-muted-foreground text-center">Screenshot your story showing the shared content</p>
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
                          "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-white/[0.10] bg-white/[0.02] py-8 cursor-pointer transition-all hover:border-primary/40",
                          uploading && "opacity-50 pointer-events-none"
                        )}>
                          {uploading ? <Loader2 size={22} className="animate-spin text-primary" /> : <Upload size={22} className="text-muted-foreground" />}
                          <span className="text-xs text-muted-foreground font-medium">{uploading ? "Uploading..." : "Tap to upload a screenshot"}</span>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }} />
                        </label>
                      )}
                    </div>
                  )}

                  {/* Toggle: screenshot vs link */}
                  {hasScreenshot && (
                    <button
                      type="button"
                      onClick={() => {
                        if (proofType === "screenshot") setProofType(platformTypes[0] || "tiktok_link");
                        else setProofType("screenshot");
                        setProofText(""); setUploadedUrl("");
                      }}
                      className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      {proofType === "screenshot" ? "Paste a link instead" : "Or upload a screenshot"}
                    </button>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                      <p className="text-xs text-red-400">{error}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══ Success celebration ═══ */}
          {submitted && (
            <div className="relative text-center py-10 px-6 overflow-hidden">
              {/* Confetti burst */}
              <div className="rep-confetti-burst pointer-events-none absolute inset-0 flex items-start justify-center" style={{ top: "80px" }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="rep-confetti-piece" />
                ))}
              </div>

              {/* Animated checkmark with victory ring */}
              <div className="relative inline-flex items-center justify-center mb-6">
                <div
                  className="rep-victory-ring h-20 w-20 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${accent.progressColor}15`, color: accent.progressColor }}
                >
                  <svg className="rep-check-draw" width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke={accent.progressColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              <p className="rep-victory-title text-xl font-black text-foreground tracking-tight mb-1">Quest Submitted!</p>
              <p className="rep-victory-title text-sm text-muted-foreground mb-6" style={{ animationDelay: "0.4s" }}>Your proof is being reviewed</p>

              {/* Reward badges with staggered reveal */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <div
                  className="rep-reward-reveal-1 rep-reward-shimmer inline-flex items-center gap-2 rounded-2xl px-5 py-3"
                  style={{ backgroundColor: `${accent.progressColor}12`, border: `1px solid ${accent.progressColor}30`, boxShadow: `0 4px 24px ${accent.progressColor}15` }}
                >
                  <Zap size={18} style={{ color: accent.progressColor }} />
                  <span className="rep-xp-counter text-lg font-black" style={{ color: accent.progressColor }}>+{quest.points_reward} XP</span>
                </div>
                {hasDualReward && (
                  <div
                    className="rep-reward-reveal-2 rep-reward-shimmer inline-flex items-center gap-2 rounded-2xl px-5 py-3"
                    style={{ backgroundColor: "rgba(251, 191, 36, 0.08)", border: "1px solid rgba(251, 191, 36, 0.2)", boxShadow: "0 4px 24px rgba(251, 191, 36, 0.1)" }}
                  >
                    <CurrencyIcon size={18} className="text-amber-400" />
                    <span className="rep-xp-counter text-lg font-black text-amber-400">+{quest.currency_reward} {currencyName}</span>
                  </div>
                )}
              </div>

              {/* Pending status card */}
              <div className="rep-status-card-reveal mx-auto max-w-[260px] rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 mb-6">
                <div className="flex items-center justify-center gap-2">
                  <span className="rep-pending-dot h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-xs font-semibold text-muted-foreground">Awaiting admin review</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Rewards are granted once approved</p>
              </div>

              {/* Dismiss CTA */}
              <button
                onClick={onSubmitted}
                className="rep-victory-cta w-full max-w-[260px] mx-auto rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 py-3 text-sm font-bold text-foreground transition-all hover:bg-white/[0.08] active:scale-[0.97]"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* ── Footer navigation ── */}
        {!submitted && (
          <div className="shrink-0 px-5 pb-5 pt-2 relative z-[2]">
            <div className="absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />

            {/* Pending / Completed — simple close */}
            {questState === "pending" ? (
              <button onClick={onClose} className="w-full py-3.5 rounded-xl text-sm font-bold text-foreground bg-white/[0.06] border border-white/[0.08] transition-all hover:bg-white/[0.10]">
                Close
              </button>
            ) : questState === "completed" && !isSalesMilestone ? (
              <button onClick={onClose} className="w-full py-3.5 rounded-xl text-sm font-bold text-foreground bg-white/[0.06] border border-white/[0.08] transition-all hover:bg-white/[0.10]">
                Done
              </button>
            ) : isSalesMilestone ? (
              <button onClick={onClose} className="w-full py-3.5 rounded-xl text-sm font-bold text-foreground bg-white/[0.06] border border-white/[0.08] transition-all hover:bg-white/[0.10]">
                Close
              </button>
            ) : isSubmitStep && isCompleted ? (
              <button onClick={onClose} className="w-full py-3.5 rounded-xl text-sm font-bold text-foreground bg-white/[0.06] border border-white/[0.08] transition-all hover:bg-white/[0.10]">
                Done
              </button>
            ) : isSubmitStep && hasPending && !isRepeatable ? (
              <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06]">
                <Clock size={16} className="text-amber-400" />
                <span className="text-sm font-bold text-amber-400">Submission Pending</span>
              </div>
            ) : isSubmitStep ? (
              <div className="flex gap-2">
                <button onClick={() => setStep(step - 1)} className="flex items-center gap-1.5 px-4 py-3.5 rounded-xl text-sm font-medium text-muted-foreground bg-white/[0.04] border border-white/[0.08] transition-all hover:bg-white/[0.08]">
                  <ArrowLeft size={14} /> Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (!proofText.trim() && !uploadedUrl)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.97] disabled:opacity-30",
                    accent.ctaGradient
                  )}
                  style={{ boxShadow: `0 4px 20px ${accent.progressColor}30` }}
                >
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <><Zap size={16} /> Submit Proof</>}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {step > 0 && (
                  <button onClick={() => setStep(step - 1)} className="flex items-center gap-1.5 px-4 py-3.5 rounded-xl text-sm font-medium text-muted-foreground bg-white/[0.04] border border-white/[0.08] transition-all hover:bg-white/[0.08]">
                    <ArrowLeft size={14} /> Back
                  </button>
                )}
                <button
                  onClick={canSubmit ? () => setStep(step + 1) : onClose}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.97]",
                    canSubmit ? accent.ctaGradient : "bg-white/[0.06] !text-foreground border border-white/[0.08]"
                  )}
                  style={canSubmit ? { boxShadow: `0 4px 20px ${accent.progressColor}30` } : undefined}
                >
                  {canSubmit ? (
                    <>{STEP_CTA[currentStep.id] || "Next"} <ArrowRight size={14} /></>
                  ) : (
                    "Done"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hold-to-save overlay */}
      {longPressImageUrl && (
        <div
          className="fixed inset-0 z-[250] bg-black/95 flex flex-col items-center justify-center p-6"
          onClick={() => setLongPressImageUrl(null)}
        >
          <button
            onClick={() => setLongPressImageUrl(null)}
            className="absolute top-4 right-4 w-9 h-9 bg-white/8 border border-white/12 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/15"
            aria-label="Close"
          >
            <X size={16} />
          </button>
          <p className="text-white/70 text-sm font-medium mb-4 text-center">Hold down on image to save to your photos</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={longPressImageUrl}
            alt="Content"
            className="max-w-[85vw] max-h-[65vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={() => setLongPressImageUrl(null)}
          />
          <p className="text-white/40 text-xs mt-4 text-center">Tap anywhere to close</p>
        </div>
      )}
    </div>
  );
}
