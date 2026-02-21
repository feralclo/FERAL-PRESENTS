"use client";

import {
  X, Check, Clock, Zap, BookOpen, ExternalLink,
  Camera, Share2, Sparkles, Music, Instagram,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getQuestAccent } from "@/lib/rep-quest-styles";
import { TikTokIcon } from "./TikTokIcon";
import { CurrencyIcon } from "./CurrencyIcon";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Quest {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  quest_type: string;
  platform?: "tiktok" | "instagram" | "any";
  image_url?: string;
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
}

export function QuestDetailSheet({
  quest, onClose, onSubmit, onExpandImage, currencyName = "FRL",
}: QuestDetailSheetProps) {
  const accent = getQuestAccent(quest.points_reward);
  const QuestTypeIcon = QUEST_TYPE_ICONS[quest.quest_type] || Zap;
  const questTypeLabel = quest.quest_type.replace(/_/g, " ");
  const subs = quest.my_submissions;
  const hasSubs = subs.total > 0;
  const approvedCount = subs?.approved ?? 0;
  const isCompleted = quest.max_completions ? approvedCount >= quest.max_completions : false;
  const isRepeatable = quest.max_completions && quest.max_completions > 1;
  const hasImage = !!quest.image_url;
  const hasRefUrl = !!quest.reference_url;
  const refPlatform = quest.reference_url ? getReferenceUrlPlatform(quest.reference_url) : (quest.platform !== "any" ? quest.platform : null);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={cn(
          "rep-quest-detail-sheet relative w-full max-w-md rounded-2xl max-h-[85dvh] overflow-hidden",
          hasImage && "rep-quest-has-backdrop"
        )}
        role="dialog"
        aria-label={quest.title}
        style={hasImage ? {
          boxShadow: `0 0 80px ${accent.progressColor}12, 0 25px 60px rgba(0,0,0,0.5)`,
        } : undefined}
      >
        {/* Full-bleed atmospheric backdrop */}
        {hasImage && (
          <div className="rep-quest-detail-hero-backdrop" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={quest.image_url!} alt="" />
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

        {/* Scrollable content area */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain relative z-[1]">

          {/* Quest header section */}
          <div className="px-5 pt-6 pb-2 text-center">
            {/* Quest type pill */}
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] px-3 py-1 mb-3">
              <QuestTypeIcon size={11} className="opacity-60" />
              <span className="text-[10px] font-semibold text-muted-foreground capitalize tracking-wide">{questTypeLabel}</span>
            </div>

            <h3 className={cn("text-xl font-extrabold tracking-tight leading-snug mb-1", accent.titleColor)}>
              {quest.title}
            </h3>

            {quest.description && (
              <p className="text-sm text-muted-foreground/80 leading-relaxed mt-2">
                {quest.description}
              </p>
            )}
          </div>

          {/* Tappable image — compact card (only when no reference URL) */}
          {!hasRefUrl && hasImage && (
            <div className="px-5 pt-1 pb-2">
              <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-black/20 cursor-zoom-in" onClick={onExpandImage}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={quest.image_url!}
                  alt={quest.title}
                  className="w-full max-h-[180px] object-contain"
                />
              </div>
            </div>
          )}

          {/* ── Reward Cards — prominent, glowing ── */}
          <div className="px-5 py-3">
            <div className={cn(
              "grid gap-2.5",
              quest.currency_reward > 0 ? "grid-cols-2" : "grid-cols-1 max-w-[180px] mx-auto"
            )}>
              {/* XP reward card */}
              <div
                className="relative rounded-xl border p-3.5 text-center overflow-hidden backdrop-blur-sm"
                style={{
                  borderColor: `${accent.progressColor}30`,
                  background: `linear-gradient(135deg, ${accent.progressColor}08, ${accent.progressColor}12)`,
                }}
              >
                <div
                  className="absolute inset-0 opacity-25"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${accent.progressColor}50, transparent 70%)`,
                  }}
                />
                <div className="relative">
                  <div
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full mx-auto mb-2"
                    style={{
                      backgroundColor: `${accent.progressColor}15`,
                      boxShadow: `0 0 24px ${accent.progressColor}25`,
                    }}
                  >
                    <Zap size={18} style={{ color: accent.progressColor, filter: `drop-shadow(0 0 4px ${accent.progressColor})` }} />
                  </div>
                  <p
                    className="text-2xl font-black tabular-nums"
                    style={{ color: accent.progressColor }}
                  >
                    +{quest.points_reward}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
                    XP
                  </p>
                </div>
              </div>

              {/* Currency reward card */}
              {quest.currency_reward > 0 && (
                <div className="relative rounded-xl border border-amber-400/30 p-3.5 text-center overflow-hidden backdrop-blur-sm bg-gradient-to-br from-amber-400/[0.04] to-amber-400/[0.12]">
                  <div
                    className="absolute inset-0 opacity-25"
                    style={{
                      background: "radial-gradient(circle at 50% 0%, rgba(251,191,36,0.5), transparent 70%)",
                    }}
                  />
                  <div className="relative">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full mx-auto mb-2 bg-amber-400/15" style={{ boxShadow: "0 0 24px rgba(251,191,36,0.25)" }}>
                      <CurrencyIcon size={18} className="text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,1)]" />
                    </div>
                    <p className="text-2xl font-black tabular-nums text-amber-400">
                      +{quest.currency_reward}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
                      {currencyName}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Action area — reference links, instructions ── */}
          <div className="px-5 pb-4 space-y-3">
            {/* Reference URL button + uses-sound callout */}
            {hasRefUrl && refPlatform && (
              <div className="space-y-2">
                {quest.uses_sound && refPlatform === "tiktok" && (
                  <div className="rep-quest-sound-callout">
                    <Music size={11} />
                    Uses a specific sound
                  </div>
                )}
                <a
                  href={quest.reference_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "rep-quest-reference-btn",
                    refPlatform === "tiktok" && "rep-quest-reference-btn--tiktok",
                    refPlatform === "instagram" && "rep-quest-reference-btn--instagram"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {refPlatform === "tiktok" ? <TikTokIcon size={18} /> : <Instagram size={18} />}
                  <span>View on {refPlatform === "tiktok" ? "TikTok" : "Instagram"}</span>
                  <ExternalLink size={13} className="ml-auto opacity-50" />
                </a>
              </div>
            )}

            {/* Instructions — glass card */}
            {quest.instructions && (
              <div className="rounded-xl p-4 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06]">
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
              <div className="rounded-xl bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] p-3.5">
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

        {/* Sticky CTA footer */}
        <div className="shrink-0 px-5 pb-5 pt-3 relative z-[2] bg-gradient-to-t from-black/60 via-black/30 to-transparent">
          {isCompleted ? (
            <div className="rep-quest-detail-complete">
              <Check size={16} />
              <span>Completed</span>
            </div>
          ) : (
            <button
              onClick={() => onSubmit(quest)}
              className={cn(
                "rep-quest-cta w-full flex flex-col items-center gap-1 py-4 rounded-xl text-white transition-all active:scale-[0.97]",
                accent.ctaGradient
              )}
              style={{
                boxShadow: `0 6px 30px ${accent.progressColor}35, 0 0 60px ${accent.progressColor}10`,
              }}
            >
              <div className="flex items-center gap-2">
                <Zap size={18} className="drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
                <span className="text-base font-extrabold tracking-wide">Submit Proof</span>
              </div>
              <div className="flex items-center gap-2 text-white/70 text-xs font-semibold">
                <span className="flex items-center gap-1">
                  <Zap size={10} /> +{quest.points_reward} XP
                </span>
                {quest.currency_reward > 0 && (
                  <>
                    <span className="text-white/30">|</span>
                    <span className="flex items-center gap-1">
                      <CurrencyIcon size={10} /> +{quest.currency_reward} {currencyName}
                    </span>
                  </>
                )}
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
