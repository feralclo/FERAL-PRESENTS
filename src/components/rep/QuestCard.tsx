"use client";

import { useState } from "react";
import {
  Clock, Check, X, ChevronDown, ChevronUp, Loader2,
  ExternalLink, AlertCircle, Zap, Camera, Share2, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getQuestAccent } from "@/lib/rep-quest-styles";

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

interface Submission {
  id: string;
  quest_id: string;
  proof_type: string;
  proof_url?: string | null;
  proof_text?: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  points_awarded: number;
  created_at: string;
}

const QUEST_TYPE_ICONS: Record<string, typeof Camera> = {
  social_post: Camera,
  story_share: Share2,
  content_creation: Sparkles,
  custom: Zap,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

interface QuestCardProps {
  quest: Quest;
  index: number;
  onSelect: (quest: Quest) => void;
  /** Submissions data keyed by quest ID */
  submissions: Record<string, Submission[]>;
  expandedQuestId: string | null;
  onToggleSubmissions: (questId: string) => void;
  loadingSubs: string | null;
}

export function QuestCard({
  quest, index, onSelect, submissions, expandedQuestId, onToggleSubmissions, loadingSubs,
}: QuestCardProps) {
  const expiry = quest.expires_at ? getExpiryInfo(quest.expires_at) : null;
  const subs = quest.my_submissions;
  const hasSubs = subs.total > 0;
  const isExpanded = expandedQuestId === quest.id;
  const accent = getQuestAccent(quest.points_reward);
  const QuestTypeIcon = QUEST_TYPE_ICONS[quest.quest_type] || Zap;
  const approvedCount = subs?.approved ?? 0;
  const isRepeatable = quest.max_completions && quest.max_completions > 1;

  return (
    <div
      className={cn(
        "rep-quest-card cursor-pointer",
        accent.glowClass,
        quest.image_url && "rep-quest-has-image"
      )}
      style={{ animationDelay: `${index * 40}ms` }}
      onClick={() => onSelect(quest)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(quest); } }}
      role="button"
      tabIndex={0}
    >
      {/* Image backdrop */}
      {quest.image_url && (
        <div className="rep-quest-ambient">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={quest.image_url} alt="" />
        </div>
      )}

      {/* Card content */}
      <div className="rep-quest-glass">
        {/* XP badge — prominent, replaces tier label */}
        <div className="flex justify-end items-center">
          <span className={cn("flex items-center gap-1 text-sm font-extrabold", accent.color)}>
            <Zap size={13} />
            +{quest.points_reward} XP
          </span>
        </div>

        <div className="rep-quest-spacer" />

        {/* Info zone */}
        {expiry?.urgent && (
          <div className="inline-flex items-center gap-1.5 mx-auto mb-2 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Clock size={11} className="text-amber-400" />
            <span className="text-xs font-medium text-amber-400">{expiry.text}</span>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 mb-0.5">
          <QuestTypeIcon size={13} className="opacity-50" />
          <h3 className="text-base font-extrabold text-foreground tracking-tight">{quest.title}</h3>
        </div>
        {quest.description && (
          <p className="text-xs text-muted-foreground leading-relaxed mb-2.5 line-clamp-2">{quest.description}</p>
        )}

        {/* Progress bar for repeatable quests */}
        {isRepeatable && (
          <div className="mb-2.5 text-left">
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
          <div className="flex flex-wrap justify-center gap-1.5 mb-2.5">
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

        {/* Non-urgent expiry */}
        {expiry && !expiry.urgent && (
          <p className="text-[10px] text-muted-foreground mt-2">{expiry.text}</p>
        )}

        {/* View Quest CTA */}
        <div className="mt-3 py-2.5 rounded-xl text-center text-[11px] font-bold uppercase tracking-widest border transition-all duration-200 bg-white/[0.04] border-white/[0.08] text-white/50">
          View Quest
        </div>

        {/* History toggle */}
        {hasSubs && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSubmissions(quest.id); }}
            className="inline-flex items-center gap-1 mt-2 mx-auto py-1 bg-transparent border-none cursor-pointer text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {isExpanded ? "Hide history" : "View history"}
          </button>
        )}

        {/* Expanded submissions */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-white/[0.08] text-left" onClick={(e) => e.stopPropagation()}>
            {loadingSubs === quest.id ? (
              <div className="flex justify-center py-4">
                <Loader2 size={16} className="animate-spin text-primary" />
              </div>
            ) : !submissions[quest.id]?.length ? (
              <p className="text-xs text-muted-foreground text-center py-3">No submissions yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                {submissions[quest.id].map((sub) => (
                  <div
                    key={sub.id}
                    className="rounded-[10px] bg-black/25 border border-white/5 p-3"
                  >
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(sub.created_at)}
                      </span>
                      <span className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-md",
                        sub.status === "approved" ? "bg-emerald-500/10 text-emerald-400"
                          : sub.status === "rejected" ? "bg-red-500/10 text-red-400"
                          : "bg-amber-500/10 text-amber-400"
                      )}>
                        {sub.status}
                        {sub.status === "approved" && sub.points_awarded > 0 && (
                          <span className="ml-1">+{sub.points_awarded} pts</span>
                        )}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {sub.proof_type === "screenshot" && sub.proof_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sub.proof_url} alt="Proof" className="max-h-20 rounded-md mt-1" />
                      )}
                      {(sub.proof_type === "tiktok_link" || sub.proof_type === "instagram_link" || sub.proof_type === "url") && (sub.proof_url || sub.proof_text) && (
                        <a
                          href={sub.proof_url || sub.proof_text || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary inline-flex items-center gap-1"
                        >
                          <ExternalLink size={10} />
                          {sub.proof_type === "tiktok_link" ? "TikTok" : sub.proof_type === "instagram_link" ? "Instagram" : "Link"}
                        </a>
                      )}
                      {sub.proof_type === "text" && sub.proof_text && (
                        <p className="line-clamp-2 mt-0.5">{sub.proof_text}</p>
                      )}
                    </div>
                    {sub.status === "rejected" && sub.rejection_reason && (
                      <div className="mt-2 rounded-md bg-destructive/5 border border-destructive/10 px-2.5 py-2">
                        <div className="flex items-start gap-1.5">
                          <AlertCircle size={10} className="text-destructive mt-0.5 shrink-0" />
                          <p className="text-[10px] text-destructive">{sub.rejection_reason}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
