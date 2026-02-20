"use client";

import {
  X, Check, Clock, Zap, Play, BookOpen, ExternalLink,
  Camera, Share2, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getQuestAccent } from "@/lib/rep-quest-styles";
import { isMuxPlaybackId } from "@/lib/mux";
import { MuxVideoPreview } from "./MuxVideoPreview";

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
  points_reward: number;
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

// ─── Component ──────────────────────────────────────────────────────────────

interface QuestDetailSheetProps {
  quest: Quest;
  onClose: () => void;
  onSubmit: (quest: Quest) => void;
  onExpandVideo: () => void;
  onExpandImage: () => void;
}

export function QuestDetailSheet({
  quest, onClose, onSubmit, onExpandVideo, onExpandImage,
}: QuestDetailSheetProps) {
  const accent = getQuestAccent(quest.points_reward);
  const QuestTypeIcon = QUEST_TYPE_ICONS[quest.quest_type] || Zap;
  const questTypeLabel = quest.quest_type.replace(/_/g, " ");
  const subs = quest.my_submissions;
  const hasSubs = subs.total > 0;
  const approvedCount = subs?.approved ?? 0;
  const isCompleted = quest.max_completions ? approvedCount >= quest.max_completions : false;
  const isRepeatable = quest.max_completions && quest.max_completions > 1;
  const hasMuxVideo = quest.video_url && isMuxPlaybackId(quest.video_url);
  const hasLegacyVideoUrl = quest.video_url && !hasMuxVideo;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rep-quest-detail-sheet relative w-full max-w-md rounded-t-2xl md:rounded-2xl max-h-[80dvh] md:max-h-[85dvh] overflow-hidden"
        role="dialog"
        aria-label={quest.title}
      >
        {/* Drag handle (mobile) */}
        <div className="rep-quest-drag-handle-zone md:hidden shrink-0">
          <div className="rep-quest-drag-handle" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="rep-quest-detail-close"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Scrollable content area */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {/* Media section */}
          {(quest.video_url || quest.image_url) && (
            <div className="rep-quest-detail-media pt-2">
              {hasMuxVideo ? (
                <MuxVideoPreview playbackId={quest.video_url!} onExpand={onExpandVideo} />
              ) : hasLegacyVideoUrl ? (
                <a
                  href={quest.video_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rep-quest-video-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Play size={24} />
                  <span>View Video</span>
                  <ExternalLink size={14} className="ml-auto opacity-50" />
                </a>
              ) : quest.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={quest.image_url}
                  alt={quest.title}
                  onClick={onExpandImage}
                />
              ) : null}
            </div>
          )}

          {/* Quest info */}
          <div className="px-5 pt-4 pb-3 space-y-3">
            {/* XP badge — prominent, centered */}
            <div className="flex items-center justify-center">
              <span className={cn("flex items-center gap-1 text-base font-extrabold", accent.color)}>
                <Zap size={16} />
                +{quest.points_reward} XP
              </span>
            </div>

            {/* Quest type + title */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <QuestTypeIcon size={13} className="opacity-50" />
                <span className="text-xs text-muted-foreground capitalize">{questTypeLabel}</span>
              </div>
              <h3 className={cn("text-xl font-extrabold tracking-tight leading-snug", accent.titleColor)}>
                {quest.title}
              </h3>
            </div>

            {/* Full description */}
            {quest.description && (
              <p className="text-sm text-muted-foreground leading-relaxed text-center">
                {quest.description}
              </p>
            )}

            {/* Instructions */}
            {quest.instructions && (
              <div className="rep-quest-detail-instructions rounded-xl p-4">
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
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Progress</span>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {approvedCount}/{quest.max_completions}
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
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                    <Clock size={10} /> {subs.pending} pending
                  </span>
                )}
                {subs.approved > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <Check size={10} /> {subs.approved} approved
                  </span>
                )}
                {subs.rejected > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400">
                    <X size={10} /> {subs.rejected} rejected
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sticky CTA footer */}
        <div className="shrink-0 px-5 pb-5 pt-3 bg-gradient-to-t from-[var(--color-card)] via-[var(--color-card)] to-transparent">
          {isCompleted ? (
            <div className="rep-quest-detail-complete">
              <Check size={16} />
              <span>Completed</span>
            </div>
          ) : (
            <button
              onClick={() => onSubmit(quest)}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98]",
                accent.ctaGradient
              )}
            >
              <Zap size={16} />
              Submit Proof
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
