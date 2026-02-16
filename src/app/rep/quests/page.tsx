"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Compass, Upload, Link as LinkIcon, Type, X, Loader2, Check,
  Clock, ChevronDown, ChevronUp, AlertCircle, ExternalLink,
  Camera, Share2, Sparkles, Zap, ChevronRight,
} from "lucide-react";

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

  // View submissions
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);
  const [questSubmissions, setQuestSubmissions] = useState<Record<string, Submission[]>>({});
  const [loadingSubs, setLoadingSubs] = useState<string | null>(null);

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
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="h-12 w-12 rounded-2xl bg-[var(--rep-surface)] animate-pulse" />
          <div className="h-6 w-24 rounded bg-[var(--rep-surface)] animate-pulse" />
          <div className="h-4 w-48 rounded bg-[var(--rep-surface)] animate-pulse" />
        </div>
        <div className="h-10 rounded-xl bg-[var(--rep-surface)] animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[160px] rounded-2xl bg-[var(--rep-surface)] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && quests.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 mb-4">
            <Compass size={22} className="text-red-400" />
          </div>
          <p className="text-sm text-white font-medium mb-1">Failed to load quests</p>
          <p className="text-xs text-[var(--rep-text-muted)] mb-4">{error}</p>
          <button
            onClick={() => { setError(""); setLoading(true); loadQuests(); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rep-border)] px-4 py-2 text-xs text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 hover:text-white transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const displayQuests = tab === "active" ? activeQuests : completedQuests;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center text-center pt-2">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--rep-accent)]/10 border border-[var(--rep-accent)]/20 mb-3">
          <Compass size={22} className="text-[var(--rep-accent)]" />
        </div>
        <h1 className="text-xl font-bold text-white">Side Quests</h1>
        <p className="text-sm text-[var(--rep-text-muted)] mt-1">
          Complete tasks to earn bonus points
        </p>
        {totalAvailableXP > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--rep-accent)]/10 border border-[var(--rep-accent)]/15 px-4 py-1.5">
            <Zap size={13} className="text-[var(--rep-accent)]" />
            <span className="text-xs font-bold text-[var(--rep-accent)]">{totalAvailableXP} XP available</span>
          </div>
        )}
      </div>

      {/* Inline error */}
      {error && quests.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Tab bar — uses rep-tab-bar for consistency with leaderboard/rewards */}
      <div className="rep-tab-bar">
        <button
          onClick={() => setTab("active")}
          className={`rep-tab ${tab === "active" ? "active" : ""}`}
        >
          Active
          {activeQuests.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-white/10 px-1.5 text-[10px] font-bold min-w-[18px]">{activeQuests.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab("completed")}
          className={`rep-tab ${tab === "completed" ? "active" : ""}`}
        >
          Completed
          {completedQuests.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-white/10 px-1.5 text-[10px] font-bold min-w-[18px]">{completedQuests.length}</span>
          )}
        </button>
      </div>

      {/* Quest Cards */}
      {displayQuests.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--rep-accent)]/10 mb-4">
            <Compass size={22} className="text-[var(--rep-accent)]" />
          </div>
          <p className="text-sm text-white font-medium mb-1">
            {tab === "active" ? "No active quests" : "No completed quests"}
          </p>
          <p className="text-xs text-[var(--rep-text-muted)]">
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
                className={`rep-quest-card ${tier.cardClass}${quest.image_url ? " rep-quest-has-image" : ""}`}
                style={{ animationDelay: `${index * 60}ms` }}
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className={tier.badgeClass}>{tier.label}</span>
                    <span className={tier.xpBadgeClass}>+{quest.points_reward} XP</span>
                  </div>

                  {/* Spacer — lets the image breathe */}
                  <div className="rep-quest-spacer" />

                  {/* ═══ Info zone — centered, on the dark gradient ═══ */}
                  {expiry?.urgent && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", margin: "0 auto 8px", padding: "4px 12px", borderRadius: "8px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
                      <Clock size={11} className="text-amber-400" />
                      <span style={{ fontSize: "11px", fontWeight: 500, color: "#FBBF24" }}>{expiry.text}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "2px" }}>
                    <QuestTypeIcon size={13} style={{ opacity: 0.5 }} />
                    <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>{quest.title}</h3>
                  </div>
                  {quest.description && (
                    <p style={{ fontSize: "12px", color: "var(--rep-text-muted)", lineHeight: 1.5, marginBottom: "10px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{quest.description}</p>
                  )}

                  {/* Progress bar for repeatable quests */}
                  {isRepeatable && (
                    <div style={{ marginBottom: "10px", textAlign: "left" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "10px", color: "var(--rep-text-muted)" }}>Progress</span>
                        <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--rep-text-muted)" }}>
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
                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px", marginBottom: "10px" }}>
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

                  {/* CTA button — full width, tier-themed */}
                  {tab === "active" && (
                    <button
                      onClick={() => openSubmitModal(quest)}
                      className={tier.ctaClass}
                    >
                      <Zap size={14} />
                      Accept Quest
                    </button>
                  )}

                  {/* Non-urgent expiry */}
                  {expiry && !expiry.urgent && (
                    <p style={{ fontSize: "10px", color: "var(--rep-text-muted)", marginTop: "8px" }}>{expiry.text}</p>
                  )}

                  {/* History toggle */}
                  {hasSubs && (
                    <button
                      onClick={() => toggleSubmissions(quest.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: "4px", margin: "8px auto 0", padding: "4px 0", background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "var(--rep-text-muted)", transition: "color 0.2s" }}
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {isExpanded ? "Hide history" : "View history"}
                    </button>
                  )}

                  {/* Expanded submissions */}
                  {isExpanded && (
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "left" }}>
                      {loadingSubs === quest.id ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                          <div className="animate-spin" style={{ width: "16px", height: "16px", border: "2px solid var(--rep-accent)", borderTopColor: "transparent", borderRadius: "50%" }} />
                        </div>
                      ) : !questSubmissions[quest.id]?.length ? (
                        <p style={{ fontSize: "12px", color: "var(--rep-text-muted)", textAlign: "center", padding: "12px 0" }}>No submissions yet</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {questSubmissions[quest.id].map((sub) => (
                            <div
                              key={sub.id}
                              style={{ borderRadius: "10px", background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.05)", padding: "12px" }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                <span style={{ fontSize: "10px", color: "var(--rep-text-muted)" }}>
                                  {formatDate(sub.created_at)}
                                </span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                  sub.status === "approved"
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : sub.status === "rejected"
                                    ? "bg-red-500/10 text-red-400"
                                    : "bg-amber-500/10 text-amber-400"
                                }`}>
                                  {sub.status}
                                  {sub.status === "approved" && sub.points_awarded > 0 && (
                                    <span className="ml-1">+{sub.points_awarded} pts</span>
                                  )}
                                </span>
                              </div>
                              <div style={{ fontSize: "12px", color: "var(--rep-text-muted)" }}>
                                {sub.proof_type === "screenshot" && sub.proof_url && (
                                  <img src={sub.proof_url} alt="Proof" style={{ maxHeight: "80px", borderRadius: "6px", marginTop: "4px" }} />
                                )}
                                {(sub.proof_type === "tiktok_link" || sub.proof_type === "instagram_link" || sub.proof_type === "url") && (sub.proof_url || sub.proof_text) && (
                                  <a
                                    href={sub.proof_url || sub.proof_text || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "var(--rep-accent)", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                  >
                                    <ExternalLink size={10} />
                                    {sub.proof_type === "tiktok_link" ? "TikTok" : sub.proof_type === "instagram_link" ? "Instagram" : "Link"}
                                  </a>
                                )}
                                {sub.proof_type === "text" && sub.proof_text && (
                                  <p style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: "2px" }}>{sub.proof_text}</p>
                                )}
                              </div>
                              {sub.status === "rejected" && sub.rejection_reason && (
                                <div style={{ marginTop: "8px", borderRadius: "6px", background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.1)", padding: "8px 10px" }}>
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                                    <AlertCircle size={10} className="text-red-400" style={{ marginTop: "2px", flexShrink: 0 }} />
                                    <p style={{ fontSize: "10px", color: "#F43F5E" }}>{sub.rejection_reason}</p>
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

      {/* Submit Proof Modal */}
      {submitQuestId && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4"
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setSubmitQuestId(null); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-bg)] p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-white">Submit Proof</h3>
              <button
                onClick={() => { if (!submitting) setSubmitQuestId(null); }}
                className="text-[var(--rep-text-muted)] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            {submitQuest && (
              <p className="text-xs text-[var(--rep-text-muted)] mb-4 line-clamp-1">{submitQuest.title}</p>
            )}

            {submitted ? (
              <div className="text-center py-6">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--rep-success)]/10 mb-3">
                  <Check size={20} className="text-[var(--rep-success)]" />
                </div>
                <p className="text-sm text-white font-medium">Submitted for review!</p>
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
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                          proofType === pt
                            ? "bg-[var(--rep-accent)]/10 text-[var(--rep-accent)] border border-[var(--rep-accent)]/30"
                            : "bg-[var(--rep-surface)] text-[var(--rep-text-muted)] border border-[var(--rep-border)]"
                        }`}
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
                    className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors resize-none"
                    placeholder={PROOF_TYPE_CONFIG[proofType].placeholder}
                    rows={4}
                    autoFocus
                  />
                ) : proofType === "screenshot" ? (
                  <div className="space-y-3">
                    {uploadedUrl ? (
                      <div className="relative rounded-xl overflow-hidden border border-[var(--rep-border)]">
                        <img src={uploadedUrl} alt="Proof" className="w-full max-h-48 object-contain bg-[var(--rep-surface)]" />
                        <button
                          onClick={() => { setUploadedUrl(""); setProofText(""); }}
                          className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <label className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--rep-border)] bg-[var(--rep-surface)] py-8 cursor-pointer transition-colors hover:border-[var(--rep-accent)]/50 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                        {uploading ? (
                          <Loader2 size={20} className="animate-spin text-[var(--rep-accent)]" />
                        ) : (
                          <Upload size={20} className="text-[var(--rep-text-muted)]" />
                        )}
                        <span className="text-xs text-[var(--rep-text-muted)]">
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
                    <p className="text-[10px] text-center text-[var(--rep-text-muted)]">or paste a URL</p>
                    <input
                      value={uploadedUrl ? "" : proofText}
                      onChange={(e) => { setProofText(e.target.value); setUploadedUrl(""); }}
                      className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                      placeholder={PROOF_TYPE_CONFIG[proofType].placeholder}
                      disabled={!!uploadedUrl}
                    />
                  </div>
                ) : (
                  /* tiktok_link, instagram_link, url — all are URL inputs */
                  <input
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
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
                  className="w-full mt-4 rounded-xl bg-[var(--rep-accent)] px-4 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
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
