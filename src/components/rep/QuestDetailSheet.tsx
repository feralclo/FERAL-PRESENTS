"use client";

import { useState } from "react";
import {
  X, Check, Clock, Zap, BookOpen, ExternalLink,
  Camera, Share2, Sparkles, Music, Instagram,
  Download, Link as LinkIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { getQuestAccent } from "@/lib/rep-quest-styles";
import { isMuxPlaybackId, getMuxThumbnailUrl, getMuxDownloadUrl } from "@/lib/mux";
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
}

const QUEST_TYPE_ICONS: Record<string, typeof Camera> = {
  social_post: Camera,
  story_share: Share2,
  content_creation: Sparkles,
  custom: Zap,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getReferenceUrlPlatform(url: string): "tiktok" | "instagram" | null {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface QuestDetailSheetProps {
  quest: Quest;
  onClose: () => void;
  onSubmit: (quest: Quest) => void;
  onExpandImage: () => void;
  currencyName?: string;
  discountCode?: string;
  shareLink?: string;
}

export function QuestDetailSheet({
  quest, onClose, onSubmit, onExpandImage, currencyName = "FRL",
  discountCode, shareLink,
}: QuestDetailSheetProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const accent = getQuestAccent(quest.points_reward);
  const QuestTypeIcon = QUEST_TYPE_ICONS[quest.quest_type] || Zap;
  const questTypeLabel = quest.quest_type.replace(/_/g, " ");
  const subs = quest.my_submissions;
  const hasSubs = subs.total > 0;
  const approvedCount = subs?.approved ?? 0;
  const isCompleted = quest.max_completions ? approvedCount >= quest.max_completions : false;
  const isRepeatable = quest.max_completions && quest.max_completions > 1;
  const hasPending = subs.pending > 0;
  const backdropImage = quest.banner_image_url || quest.image_url;
  const hasBackdrop = !!backdropImage;
  const hasImage = !!quest.image_url;
  const isStoryShare = quest.quest_type === "story_share";
  const hasRefUrl = !!quest.reference_url;
  const refPlatform = quest.reference_url ? getReferenceUrlPlatform(quest.reference_url) : (quest.platform !== "any" ? quest.platform : null);
  const hasDualReward = quest.currency_reward > 0;
  const hasVideo = !!quest.video_url;
  const hasStoryMedia = isStoryShare && (hasImage || hasVideo);

  const [savingImage, setSavingImage] = useState(false);
  const [savedImage, setSavedImage] = useState(false);
  const [longPressImageUrl, setLongPressImageUrl] = useState<string | null>(null);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch { /* clipboard not available */ }
  };

  /** Save image: share sheet on mobile, download on desktop, long-press overlay as fallback */
  const handleSaveImage = async (url: string) => {
    setSavingImage(true);
    try {
      const proxyUrl = `/api/rep-portal/download-media?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const blob = await res.blob();
        const ext = blob.type.includes("png") ? "png" : "jpg";
        const file = new File([blob], `story.${ext}`, { type: blob.type });

        // Mobile: Web Share API → native share sheet with "Save Image"
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            setSavedImage(true);
            setTimeout(() => setSavedImage(false), 2000);
            setSavingImage(false);
            return;
          } catch (e) {
            // User cancelled share — not an error, just stop
            if (e instanceof Error && e.name === "AbortError") {
              setSavingImage(false);
              return;
            }
          }
        }

        // Desktop: trigger download via blob URL
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
    } catch {
      /* fetch or processing failed — fall through to long-press overlay */
    }

    // Fallback: show image in overlay so user can long-press to save (works everywhere)
    setSavingImage(false);
    setLongPressImageUrl(url);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={cn(
          "rep-quest-detail-sheet relative w-full max-w-md rounded-2xl max-h-[85dvh] overflow-hidden",
          hasBackdrop && "rep-quest-has-backdrop"
        )}
        role="dialog"
        aria-label={quest.title}
        style={{
          ["--quest-accent" as string]: accent.progressColor,
          boxShadow: hasBackdrop
            ? `0 0 120px ${accent.progressColor}20, 0 0 40px ${accent.progressColor}08, 0 25px 60px rgba(0,0,0,0.7)`
            : undefined,
        }}
      >
        {/* Top edge accent light */}
        <div
          className="absolute top-0 left-[15%] right-[15%] h-px z-10 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent.progressColor}60, transparent)`,
            boxShadow: `0 0 16px ${accent.progressColor}30`,
          }}
        />

        {/* Full-bleed atmospheric backdrop — uses banner if available, else content image */}
        {hasBackdrop && (
          <div className="rep-quest-detail-hero-backdrop" aria-hidden="true" onClick={onExpandImage}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backdropImage!} alt="" />
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="rep-quest-detail-close"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Scrollable content area — hidden scrollbar */}
        <div className="rep-quest-detail-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain relative z-[1]">

          {/* ── Header — stagger 1 ── */}
          <div className="px-5 pt-7 pb-2 text-center rep-quest-reveal-1">
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

          {/* ── Platform CTA — stagger 2 — THE hero action (not for story_share) ── */}
          {hasRefUrl && refPlatform && !isStoryShare && (
            <div className="px-5 pb-2 rep-quest-reveal-2">
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
                  <span className="text-[15px]">{quest.uses_sound && refPlatform === "tiktok" ? "Open & use this sound" : `View on ${refPlatform === "tiktok" ? "TikTok" : "Instagram"}`}</span>
                  {quest.uses_sound && refPlatform === "tiktok" && (
                    <span className="flex items-center gap-1 text-[10px] opacity-60 font-normal">
                      <Music size={9} /> Sound required for this quest
                    </span>
                  )}
                </div>
                <ExternalLink size={14} className="ml-auto opacity-50 shrink-0" />
              </a>
            </div>
          )}

          {/* ── Rewards — stagger 2 — big glowing display ── */}
          <div className={cn("px-5 rep-quest-reveal-2", isStoryShare ? "py-3" : "py-4")}>
            <div className={cn(
              "flex items-center justify-center",
              hasDualReward ? "gap-4" : ""
            )}>
              <div className="flex flex-col items-center">
                <div
                  className="rep-quest-reward-icon flex h-14 w-14 items-center justify-center rounded-full mb-2.5"
                  style={{
                    backgroundColor: `${accent.progressColor}12`,
                    boxShadow: `0 0 32px ${accent.progressColor}35, 0 0 12px ${accent.progressColor}20`,
                  }}
                >
                  <Zap size={24} style={{ color: accent.progressColor, filter: `drop-shadow(0 0 8px ${accent.progressColor})` }} />
                </div>
                <p className="text-4xl font-black tabular-nums leading-none" style={{ color: accent.progressColor, textShadow: `0 0 24px ${accent.progressColor}50` }}>
                  +{quest.points_reward}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">XP</p>
              </div>
              {hasDualReward && (
                <div className="h-16 w-px bg-gradient-to-b from-transparent via-white/[0.12] to-transparent mx-1" />
              )}
              {hasDualReward && (
                <div className="flex flex-col items-center">
                  <div className="rep-quest-reward-icon flex h-14 w-14 items-center justify-center rounded-full mb-2.5 bg-amber-400/12" style={{ boxShadow: "0 0 32px rgba(251,191,36,0.35), 0 0 12px rgba(251,191,36,0.2)" }}>
                    <CurrencyIcon size={24} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,1)]" />
                  </div>
                  <p className="text-4xl font-black tabular-nums text-amber-400 leading-none" style={{ textShadow: "0 0 24px rgba(251,191,36,0.5)" }}>
                    +{quest.currency_reward}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{currencyName}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Accent divider ── */}
          <div className="px-8 rep-quest-reveal-2">
            <div
              className="h-px"
              style={{
                background: `linear-gradient(90deg, transparent, ${accent.progressColor}25, transparent)`,
              }}
            />
          </div>

          {/* ── Story Share actions — compact, focused ── */}
          {isStoryShare && (
            <div className="px-5 pt-3 space-y-2 rep-quest-reveal-3">
              {/* Save image button */}
              {hasImage && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleSaveImage(quest.image_url!); }}
                  disabled={savingImage}
                  className="w-full flex items-center gap-3 rounded-xl bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] p-3 transition-colors hover:bg-white/[0.08] active:scale-[0.98] disabled:opacity-60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={quest.image_url!} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-foreground">
                      {savingImage ? "Saving..." : savedImage ? "Saved!" : "Save Image"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {savedImage ? "Image saved to your device" : "Tap to save to your photos"}
                    </p>
                  </div>
                  {savedImage ? (
                    <Check size={16} className="text-emerald-400 shrink-0" />
                  ) : (
                    <Download size={16} className="text-primary shrink-0" />
                  )}
                </button>
              )}

              {/* Save video button */}
              {hasVideo && (
                <a
                  href={quest.video_url && isMuxPlaybackId(quest.video_url) ? getMuxDownloadUrl(quest.video_url) : quest.video_url!}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] p-3 transition-colors hover:bg-white/[0.08] active:scale-[0.98]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {quest.video_url && isMuxPlaybackId(quest.video_url) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={getMuxThumbnailUrl(quest.video_url)} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                      <Share2 size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Save Video</p>
                    <p className="text-[10px] text-muted-foreground">Hold down to save on mobile</p>
                  </div>
                  <Download size={16} className="text-primary shrink-0" />
                </a>
              )}

              {/* Discount code display + copy event link (code auto-applies via ?ref=) */}
              {discountCode && (
                <button
                  onClick={() => copyToClipboard(shareLink || discountCode)}
                  className="w-full flex items-center gap-3 rounded-xl bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] p-3 transition-colors hover:bg-white/[0.08] active:scale-[0.98]"
                >
                  <div className="flex flex-col min-w-0 text-left">
                    <span className="text-[10px] text-muted-foreground font-medium">Your discount code</span>
                    <span className="text-base font-black font-mono tracking-[3px] text-foreground">{discountCode}</span>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-primary shrink-0 ml-auto">
                    {copiedLink ? <><Check size={10} /> Copied</> : <><LinkIcon size={10} /> Copy event link</>}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* ── Action area — stagger 3 ── */}
          <div className="px-5 py-4 space-y-3 rep-quest-reveal-3">

            {/* Instructions — glass card (hidden for story_share, the UI guides the flow) */}
            {quest.instructions && !isStoryShare && (
              <div className="rounded-xl p-4 bg-white/[0.04] backdrop-blur-sm border border-white/[0.08]">
                <div className="flex items-center gap-1.5 mb-2">
                  <BookOpen size={13} className="text-primary" />
                  <span className="text-xs font-semibold text-foreground">How to Complete</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {quest.instructions}
                </p>
              </div>
            )}

            {/* Progress bar for repeatable quests */}
            {isRepeatable && (
              <div className="rounded-xl bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] p-3.5">
                <div className="flex justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Progress</span>
                  <span className="text-xs font-bold text-foreground tabular-nums">
                    {approvedCount}<span className="text-muted-foreground">/{quest.max_completions}</span>
                  </span>
                </div>
                <div className="rep-quest-progress">
                  <div
                    className="rep-quest-progress-fill"
                    style={{
                      width: `${Math.min(100, (approvedCount / (quest.max_completions || 1)) * 100)}%`,
                      background: accent.progressColor,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Status badges */}
            {hasSubs && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {subs.pending > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 backdrop-blur-sm border border-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-400">
                    <Clock size={10} /> {subs.pending} pending
                  </span>
                )}
                {subs.approved > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 backdrop-blur-sm border border-emerald-500/20 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                    <Check size={10} /> {subs.approved} approved
                  </span>
                )}
                {subs.rejected > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 backdrop-blur-sm border border-red-500/20 px-2.5 py-1 text-[10px] font-semibold text-red-400">
                    <X size={10} /> {subs.rejected} rejected
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── CTA footer — stagger 4 ── */}
        <div className="shrink-0 px-5 pb-5 pt-2 relative z-[2] rep-quest-reveal-4">
          <div className="absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />

          {isCompleted ? (
            <div className="rep-quest-detail-complete">
              <Check size={16} />
              <span>Completed</span>
            </div>
          ) : hasPending ? (
            <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06]">
              <Clock size={16} className="text-amber-400" />
              <span className="text-sm font-bold text-amber-400 tracking-wide">Submission Pending</span>
            </div>
          ) : (
            <button
              onClick={() => onSubmit(quest)}
              className={cn(
                "rep-quest-cta w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white transition-all active:scale-[0.97]",
                accent.ctaGradient
              )}
              style={{
                boxShadow: `0 4px 20px ${accent.progressColor}30`,
              }}
            >
              <Zap size={16} className="opacity-80" />
              <span className="text-sm font-bold tracking-wide">Submit Proof</span>
            </button>
          )}
        </div>
      </div>

      {/* Hold-to-save overlay — universal mobile fallback */}
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
          <p className="text-white/70 text-sm font-medium mb-4 text-center">
            Hold down on image to save to your photos
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={longPressImageUrl}
            alt="Story content"
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
