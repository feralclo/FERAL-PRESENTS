"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Compass, Upload, Link as LinkIcon, Type, X, Loader2, Check,
  Clock, ChevronDown, ChevronUp, AlertCircle, ExternalLink,
  Camera, Share2, Sparkles, Zap, Play, BookOpen,
} from "lucide-react";
import { EmptyState } from "@/components/rep";
import { cn } from "@/lib/utils";
import { isMuxPlaybackId } from "@/lib/mux";

const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface Quest {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  quest_type: string;
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

type ProofType = "tiktok_link" | "instagram_link" | "screenshot" | "url" | "text";

// ─── Quest type → proof type mapping ─────────────────────────────────────────

const QUEST_PROOF_MAP: Record<string, { types: ProofType[]; default: ProofType }> = {
  social_post: { types: ["tiktok_link", "instagram_link", "url"], default: "tiktok_link" },
  story_share: { types: ["screenshot", "url"], default: "screenshot" },
  content_creation: { types: ["tiktok_link", "instagram_link", "url", "screenshot"], default: "url" },
  custom: { types: ["tiktok_link", "instagram_link", "url", "screenshot", "text"], default: "url" },
};

const PROOF_TYPE_CONFIG: Record<ProofType, { label: string; icon: typeof LinkIcon; placeholder: string }> = {
  tiktok_link: { label: "TikTok", icon: LinkIcon, placeholder: "Paste your TikTok video URL..." },
  instagram_link: { label: "Instagram", icon: LinkIcon, placeholder: "Paste your Instagram post/reel URL..." },
  url: { label: "URL", icon: LinkIcon, placeholder: "Paste the URL..." },
  screenshot: { label: "Screenshot", icon: Upload, placeholder: "Paste screenshot URL..." },
  text: { label: "Text", icon: Type, placeholder: "Describe what you did..." },
};

// ─── Quest type icons ────────────────────────────────────────────────────────

const QUEST_TYPE_ICONS: Record<string, typeof Camera> = {
  social_post: Camera,
  story_share: Share2,
  content_creation: Sparkles,
  custom: Zap,
};

// ─── Tier system ─────────────────────────────────────────────────────────────

interface TierConfig {
  tier: "common" | "rare" | "epic" | "legendary";
  label: string;
  cardClass: string;
  badgeClass: string;
  xpBadgeClass: string;
  progressClass: string;
  actionClass: string;
  ctaClass: string;
}

function getQuestTier(points: number): TierConfig {
  if (points >= 500) {
    return {
      tier: "legendary",
      label: "LEGENDARY",
      cardClass: "rep-quest-legendary",
      badgeClass: "rep-tier-badge rep-tier-badge-legendary",
      xpBadgeClass: "rep-xp-badge rep-xp-badge-legendary",
      progressClass: "rep-quest-progress rep-quest-progress-legendary",
      actionClass: "rep-quest-action rep-quest-action-legendary",
      ctaClass: "rep-quest-cta rep-quest-cta-legendary",
    };
  }
  if (points >= 150) {
    return {
      tier: "epic",
      label: "EPIC",
      cardClass: "rep-quest-epic",
      badgeClass: "rep-tier-badge rep-tier-badge-epic",
      xpBadgeClass: "rep-xp-badge rep-xp-badge-epic",
      progressClass: "rep-quest-progress rep-quest-progress-epic",
      actionClass: "rep-quest-action rep-quest-action-epic",
      ctaClass: "rep-quest-cta rep-quest-cta-epic",
    };
  }
  if (points >= 50) {
    return {
      tier: "rare",
      label: "RARE",
      cardClass: "rep-quest-rare",
      badgeClass: "rep-tier-badge rep-tier-badge-rare",
      xpBadgeClass: "rep-xp-badge rep-xp-badge-rare",
      progressClass: "rep-quest-progress rep-quest-progress-rare",
      actionClass: "rep-quest-action rep-quest-action-rare",
      ctaClass: "rep-quest-cta rep-quest-cta-rare",
    };
  }
  return {
    tier: "common",
    label: "COMMON",
    cardClass: "rep-quest-common",
    badgeClass: "rep-tier-badge rep-tier-badge-common",
    xpBadgeClass: "rep-xp-badge rep-xp-badge-common",
    progressClass: "rep-quest-progress rep-quest-progress-common",
    actionClass: "rep-quest-action rep-quest-action-common",
    ctaClass: "rep-quest-cta rep-quest-cta-common",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function RepQuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"active" | "completed">("active");

  // Submit proof
  const [submitQuestId, setSubmitQuestId] = useState<string | null>(null);
  const [proofType, setProofType] = useState<ProofType>("url");
  const [proofText, setProofText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState("");

  // Quest detail modal
  const [detailQuest, setDetailQuest] = useState<Quest | null>(null);
  const [mediaFullscreen, setMediaFullscreen] = useState(false);

  // View submissions
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);
  const [questSubmissions, setQuestSubmissions] = useState<Record<string, Submission[]>>({});
  const [loadingSubs, setLoadingSubs] = useState<string | null>(null);

  // Detail modal / fullscreen image: Escape key + body scroll lock
  useEffect(() => {
    if (!detailQuest && !mediaFullscreen) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (mediaFullscreen) { setMediaFullscreen(false); return; }
        if (detailQuest) setDetailQuest(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [detailQuest, mediaFullscreen]);

  const loadQuests = useCallback(async () => {
    try {
      const res = await fetch("/api/rep-portal/quests");
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        setError(errJson?.error || "Failed to load quests (" + res.status + ")");
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (json.data) setQuests(json.data);
    } catch {
      setError("Failed to load quests — check your connection");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadQuests(); }, [loadQuests]);

  const loadSubmissions = useCallback(async (questId: string) => {
    setLoadingSubs(questId);
    try {
      const res = await fetch(`/api/rep-portal/quests/submissions?quest_id=${questId}`);
      if (res.ok) {
        const json = await res.json();
        setQuestSubmissions((prev) => ({ ...prev, [questId]: json.data || [] }));
      }
    } catch { /* network */ }
    setLoadingSubs(null);
  }, []);

  const toggleSubmissions = (questId: string) => {
    if (expandedQuestId === questId) {
      setExpandedQuestId(null);
    } else {
      setExpandedQuestId(questId);
      if (!questSubmissions[questId]) {
        loadSubmissions(questId);
      }
    }
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

  const openSubmitModal = (quest: Quest) => {
    const mapping = QUEST_PROOF_MAP[quest.quest_type] || QUEST_PROOF_MAP.custom;
    setSubmitQuestId(quest.id);
    setProofType(mapping.default);
    setSubmitted(false);
    setProofText("");
    setUploadedUrl("");
    setError("");
  };

  const handleSubmit = async () => {
    if (!submitQuestId) return;
    const proofValue = proofType === "screenshot" ? (uploadedUrl || proofText.trim()) : proofText.trim();
    if (!proofValue) return;
    setSubmitting(true);
    try {
      const isUrlType = ["tiktok_link", "instagram_link", "url", "screenshot"].includes(proofType);
      const res = await fetch(`/api/rep-portal/quests/${submitQuestId}/submit`, {
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
        setTimeout(() => {
          const questId = submitQuestId;
          setSubmitQuestId(null);
          setSubmitted(false);
          setProofText("");
          setUploadedUrl("");
          loadQuests();
          if (questId && expandedQuestId === questId) {
            loadSubmissions(questId);
          }
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

  const getApprovedCount = (q: Quest): number => q.my_submissions?.approved ?? 0;

  const activeQuests = quests.filter((q) =>
    !q.max_completions || getApprovedCount(q) < q.max_completions
  );
  const completedQuests = quests.filter((q) =>
    q.max_completions && getApprovedCount(q) >= q.max_completions
  );

  const totalAvailableXP = activeQuests.reduce((sum, q) => sum + q.points_reward, 0);

  // Get current quest for submit modal context
  const submitQuest = submitQuestId ? quests.find((q) => q.id === submitQuestId) : null;
  const availableProofTypes = submitQuest
    ? (QUEST_PROOF_MAP[submitQuest.quest_type] || QUEST_PROOF_MAP.custom).types
    : [];

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="h-12 w-12 rounded-2xl bg-secondary animate-pulse" />
          <div className="h-6 w-24 rounded bg-secondary animate-pulse" />
          <div className="h-4 w-48 rounded bg-secondary animate-pulse" />
        </div>
        <div className="h-10 rounded-xl bg-secondary animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[160px] rounded-2xl bg-secondary animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && quests.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-6 md:py-8">
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 mb-4">
            <Compass size={22} className="text-red-400" />
          </div>
          <p className="text-sm text-foreground font-medium mb-1">Failed to load quests</p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => { setError(""); setLoading(true); loadQuests(); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const displayQuests = tab === "active" ? activeQuests : completedQuests;

  return (
    <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center text-center pt-2">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 mb-3">
          <Compass size={22} className="text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Side Quests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete tasks to earn bonus points
        </p>
        {totalAvailableXP > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/15 px-4 py-1.5">
            <Zap size={13} className="text-primary" />
            <span className="text-xs font-bold text-primary">{totalAvailableXP} XP available</span>
          </div>
        )}
      </div>

      {/* Inline error */}
      {error && quests.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-0.5 bg-secondary rounded-xl p-[3px] border border-border">
        {([
          { id: "active" as const, label: "Active", count: activeQuests.length },
          { id: "completed" as const, label: "Completed", count: completedQuests.length },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 px-4 py-2 rounded-[10px] text-[13px] font-semibold text-muted-foreground text-center transition-all duration-200",
              "hover:text-foreground",
              tab === t.id && "bg-white/[0.10] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-white/10 px-1.5 text-[10px] font-bold min-w-[18px]">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Quest Cards */}
      {displayQuests.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Compass size={22} className="text-primary" />
          </div>
          <p className="text-sm text-foreground font-medium mb-1">
            {tab === "active" ? "No active quests" : "No completed quests"}
          </p>
          <p className="text-xs text-muted-foreground">
            {tab === "active" ? "Check back soon for new quests" : "Complete quests to earn bonus points"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayQuests.map((quest, index) => {
            const expiry = quest.expires_at ? getExpiryInfo(quest.expires_at) : null;
            const subs = quest.my_submissions;
            const hasSubs = subs.total > 0;
            const isExpanded = expandedQuestId === quest.id;
            const tier = getQuestTier(quest.points_reward);
            const QuestTypeIcon = QUEST_TYPE_ICONS[quest.quest_type] || Zap;
            const questTypeLabel = quest.quest_type.replace(/_/g, " ");
            const approvedCount = getApprovedCount(quest);
            const isRepeatable = quest.max_completions && quest.max_completions > 1;

            return (
              <div
                key={quest.id}
                className={`rep-quest-card ${tier.cardClass}${quest.image_url ? " rep-quest-has-image" : ""} cursor-pointer`}
                style={{ animationDelay: `${index * 60}ms` }}
                onClick={() => setDetailQuest(quest)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailQuest(quest); } }}
                role="button"
                tabIndex={0}
              >
                {/* Image backdrop */}
                {quest.image_url && (
                  <div className={`rep-quest-ambient rep-quest-ambient-${tier.tier}`}>
                    <img src={quest.image_url} alt="" />
                  </div>
                )}

                {/* Card content */}
                <div className="rep-quest-glass">
                  {/* ═══ Art zone — badges float over the image ═══ */}
                  <div className="flex justify-between items-center">
                    <span className={tier.badgeClass}>{tier.label}</span>
                    <span className={tier.xpBadgeClass}>+{quest.points_reward} XP</span>
                  </div>

                  {/* Spacer — lets the image breathe */}
                  <div className="rep-quest-spacer" />

                  {/* ═══ Info zone — centered, on the dark gradient ═══ */}
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
                      <div className={tier.progressClass}>
                        <div
                          className="rep-quest-progress-fill"
                          style={{ width: `${Math.min(100, (approvedCount / (quest.max_completions || 1)) * 100)}%` }}
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

                  {/* History toggle */}
                  {hasSubs && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSubmissions(quest.id); }}
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
                      ) : !questSubmissions[quest.id]?.length ? (
                        <p className="text-xs text-muted-foreground text-center py-3">No submissions yet</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {questSubmissions[quest.id].map((sub) => (
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
          })}
        </div>
      )}

      {/* Quest Detail Modal — plain overlay (no Radix Dialog) */}
      {detailQuest && (() => {
        const tier = getQuestTier(detailQuest.points_reward);
        const QuestTypeIcon = QUEST_TYPE_ICONS[detailQuest.quest_type] || Zap;
        const questTypeLabel = detailQuest.quest_type.replace(/_/g, " ");
        const subs = detailQuest.my_submissions;
        const hasSubs = subs.total > 0;
        const approvedCount = getApprovedCount(detailQuest);
        const isCompleted = detailQuest.max_completions ? approvedCount >= detailQuest.max_completions : false;
        const isRepeatable = detailQuest.max_completions && detailQuest.max_completions > 1;
        const hasMuxVideo = detailQuest.video_url && isMuxPlaybackId(detailQuest.video_url);
        const hasLegacyVideoUrl = detailQuest.video_url && !hasMuxVideo;

        const titleColorClass =
          tier.tier === "legendary" ? "rep-gradient-text-gold"
          : tier.tier === "epic" ? "rep-gradient-text"
          : tier.tier === "rare" ? "text-[#38BDF8]"
          : "text-foreground";

        return (
          <div
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => { if (e.target === e.currentTarget) setDetailQuest(null); }}
          >
            <div
              className={cn(
                "rep-quest-detail-sheet relative w-full max-w-md rounded-t-2xl md:rounded-2xl",
                "max-h-[80dvh] md:max-h-[85dvh]",
                `rep-quest-detail-${tier.tier}`,
              )}
              role="dialog"
              aria-label={detailQuest.title}
            >
              {/* Drag handle (mobile) */}
              <div className="rep-quest-drag-handle-zone md:hidden shrink-0">
                <div className="rep-quest-drag-handle" />
              </div>

              {/* Close button */}
              <button
                onClick={() => setDetailQuest(null)}
                className="rep-quest-detail-close"
                aria-label="Close"
              >
                <X size={16} />
              </button>

              {/* Scrollable content area */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                {/* Media section */}
                {(detailQuest.video_url || detailQuest.image_url) && (
                  <div className="rep-quest-detail-media pt-2">
                    {hasMuxVideo ? (
                      <MuxPlayer
                        playbackId={detailQuest.video_url!}
                        muted
                        autoPlay="muted"
                        loop
                        style={{
                          aspectRatio: "16/9",
                          maxHeight: "min(200px, 30vh)",
                          "--controls": "none",
                          "--media-object-fit": "contain",
                        } as Record<string, string>}
                        className="md:[&]:!max-h-[min(280px,35vh)]"
                      />
                    ) : hasLegacyVideoUrl ? (
                      <a
                        href={detailQuest.video_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rep-quest-video-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Play size={24} />
                        <span>View Video</span>
                        <ExternalLink size={14} className="ml-auto opacity-50" />
                      </a>
                    ) : detailQuest.image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={detailQuest.image_url}
                        alt={detailQuest.title}
                        onClick={() => setMediaFullscreen(true)}
                      />
                    ) : null}
                  </div>
                )}

                {/* Quest info */}
                <div className="px-5 pt-4 pb-3 space-y-3">
                  {/* Tier + XP badges — bigger, centered */}
                  <div className="flex items-center justify-center gap-3">
                    <span className={tier.badgeClass}>{tier.label}</span>
                    <span className={cn(tier.xpBadgeClass, "text-base font-extrabold flex items-center gap-1")}>
                      <Zap size={14} />
                      +{detailQuest.points_reward} XP
                    </span>
                  </div>

                  {/* Quest type + title — tier colored */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <QuestTypeIcon size={13} className="opacity-50" />
                      <span className="text-xs text-muted-foreground capitalize">{questTypeLabel}</span>
                    </div>
                    <h3 className={cn("text-xl font-extrabold tracking-tight leading-snug", titleColorClass)}>
                      {detailQuest.title}
                    </h3>
                  </div>

                  {/* Full description */}
                  {detailQuest.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed text-center">
                      {detailQuest.description}
                    </p>
                  )}

                  {/* Instructions */}
                  {detailQuest.instructions && (
                    <div className="rep-quest-detail-instructions rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <BookOpen size={13} className="text-primary" />
                        <span className="text-xs font-semibold text-foreground">How to Complete</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                        {detailQuest.instructions}
                      </p>
                    </div>
                  )}

                  {/* Progress bar for repeatable quests */}
                  {isRepeatable && (
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground">Progress</span>
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {approvedCount}/{detailQuest.max_completions}
                        </span>
                      </div>
                      <div className={tier.progressClass}>
                        <div
                          className="rep-quest-progress-fill"
                          style={{ width: `${Math.min(100, (approvedCount / (detailQuest.max_completions || 1)) * 100)}%` }}
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
                    onClick={() => {
                      const quest = detailQuest;
                      setDetailQuest(null);
                      setTimeout(() => openSubmitModal(quest), 150);
                    }}
                    className={cn("rep-quest-detail-cta", `rep-quest-detail-cta-${tier.tier}`)}
                  >
                    <Zap size={16} />
                    Submit Proof
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Fullscreen image overlay — plain DOM, not nested Radix Dialog */}
      {mediaFullscreen && detailQuest?.image_url && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
          onClick={() => setMediaFullscreen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 z-20 w-9 h-9 bg-white/8 border border-white/12 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/15 hover:border-white/20 hover:text-white transition-all cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setMediaFullscreen(false); }}
            aria-label="Close zoom"
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={detailQuest.image_url}
            alt={detailQuest.title}
            className="max-w-[90vw] max-h-[90vh] object-contain cursor-zoom-out"
          />
        </div>
      )}

      {/* Submit Proof Modal */}
      {submitQuestId && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setSubmitQuestId(null); }}
        >
          <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border bg-background p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-foreground">Submit Proof</h3>
              <button
                onClick={() => { if (!submitting) setSubmitQuestId(null); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            {submitQuest && (
              <p className="text-xs text-muted-foreground mb-4 line-clamp-1">{submitQuest.title}</p>
            )}

            {submitted ? (
              <div className="text-center py-6 relative">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/10 mb-3 rep-reward-success-ring relative">
                  <Check size={20} className="text-success" />
                  <div className="rep-success-particles">
                    <div className="rep-success-particle" />
                    <div className="rep-success-particle" />
                    <div className="rep-success-particle" />
                    <div className="rep-success-particle" />
                    <div className="rep-success-particle" />
                    <div className="rep-success-particle" />
                  </div>
                </div>
                <p className="text-sm text-foreground font-medium">Submitted for review!</p>
                {submitQuest && (
                  <p className="text-xs text-primary font-bold mt-1">+{submitQuest.points_reward} XP pending</p>
                )}
              </div>
            ) : (
              <>
                {/* Proof type selector */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {availableProofTypes.map((pt) => {
                    const config = PROOF_TYPE_CONFIG[pt];
                    const Icon = config.icon;
                    return (
                      <button
                        key={pt}
                        onClick={() => { setProofType(pt); setProofText(""); setUploadedUrl(""); }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors border",
                          proofType === pt
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "bg-secondary text-muted-foreground border-border"
                        )}
                      >
                        <Icon size={12} />
                        {config.label}
                      </button>
                    );
                  })}
                </div>

                {/* Proof input */}
                {proofType === "text" ? (
                  <textarea
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none transition-colors resize-none"
                    placeholder={PROOF_TYPE_CONFIG[proofType].placeholder}
                    rows={4}
                    autoFocus
                  />
                ) : proofType === "screenshot" ? (
                  <div className="space-y-3">
                    {uploadedUrl ? (
                      <div className="relative rounded-xl overflow-hidden border border-border">
                        <img src={uploadedUrl} alt="Proof" className="w-full max-h-48 object-contain bg-secondary" />
                        <button
                          onClick={() => { setUploadedUrl(""); setProofText(""); }}
                          className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <label className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary py-8 cursor-pointer transition-colors hover:border-primary/50 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                        {uploading ? (
                          <Loader2 size={20} className="animate-spin text-primary" />
                        ) : (
                          <Upload size={20} className="text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground">
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
                    <p className="text-[10px] text-center text-muted-foreground">or paste a URL</p>
                    <input
                      value={uploadedUrl ? "" : proofText}
                      onChange={(e) => { setProofText(e.target.value); setUploadedUrl(""); }}
                      className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none transition-colors"
                      placeholder={PROOF_TYPE_CONFIG[proofType].placeholder}
                      disabled={!!uploadedUrl}
                    />
                  </div>
                ) : (
                  /* tiktok_link, instagram_link, url — all are URL inputs */
                  <input
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none transition-colors"
                    placeholder={PROOF_TYPE_CONFIG[proofType].placeholder}
                    autoFocus
                  />
                )}

                {/* Inline validation hint for social links */}
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

                <button
                  onClick={handleSubmit}
                  disabled={submitting || (!proofText.trim() && !uploadedUrl)}
                  className="w-full mt-4 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Submitting...
                    </span>
                  ) : (
                    "Submit"
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
