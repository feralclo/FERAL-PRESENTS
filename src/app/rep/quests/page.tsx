"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import {
  Compass, Upload, Link as LinkIcon, Type, X, Loader2, Check,
  Clock, ChevronDown, ChevronUp, AlertCircle, ExternalLink,
  Camera, Share2, Sparkles, Zap, Play, BookOpen, Maximize2,
  Volume2, VolumeX, Music,
} from "lucide-react";
import { EmptyState } from "@/components/rep";
import { cn } from "@/lib/utils";
import { isMuxPlaybackId, getMuxThumbnailUrl } from "@/lib/mux";

const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), { ssr: false });

// ─── Mux video: animated thumbnail preview (no player = zero jank) ───────────

function MuxVideoPreview({ playbackId, onExpand }: { playbackId: string; onExpand: () => void }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Mux animated thumbnail — silent looping ~4s preview, no video player needed
  const animatedUrl = `https://image.mux.com/${playbackId}/animated.webp?width=320&fps=12&start=0&end=4`;
  const staticUrl = getMuxThumbnailUrl(playbackId);

  if (imgError) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onExpand(); }}
        className="flex items-center gap-3 w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-4 text-muted-foreground hover:text-foreground hover:border-white/[0.15] transition-colors cursor-pointer"
      >
        <Play size={20} />
        <span className="text-sm font-medium">Watch Video</span>
        <Maximize2 size={14} className="ml-auto opacity-50" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onExpand(); }}
      className="group relative mx-auto block aspect-[9/16] rounded-2xl overflow-hidden bg-white/[0.03] cursor-pointer border border-white/[0.08] p-0"
      style={{ maxHeight: 260 }}
    >
      {/* Animated preview from Mux — loads as an image, no player init */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={animatedUrl}
        alt=""
        onLoad={() => setImgLoaded(true)}
        onError={() => {
          // Fallback: try static thumbnail, then give up
          if (!imgLoaded) {
            const img = new Image();
            img.onload = () => setImgLoaded(true);
            img.onerror = () => setImgError(true);
            img.src = staticUrl;
          }
        }}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-700 ease-out",
          imgLoaded ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Loading shimmer while image loads */}
      {!imgLoaded && (
        <div className="absolute inset-0 bg-white/[0.04] animate-pulse rounded-2xl" />
      )}

      {/* Center play icon — frosted glass, premium feel */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="h-12 w-12 rounded-full bg-black/30 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg group-hover:scale-110 group-active:scale-95 transition-transform duration-200">
          <Play size={20} className="text-white ml-0.5" fill="currentColor" fillOpacity={0.9} />
        </div>
      </div>

      {/* Bottom gradient with CTA */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-1.5 pb-3 pt-10 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
        <span className="text-[11px] font-medium text-white/70 tracking-wide">Tap to watch</span>
      </div>
    </button>
  );
}

// ─── Fullscreen video: thumbnail crossfade → MuxPlayer ───────────────────────

function FullscreenVideo({
  playbackId, tier, titleColorClass, title, points, platform, muted, onMuteToggle, videoRef, onClose,
}: {
  playbackId: string;
  tier: TierConfig;
  titleColorClass: string;
  title: string;
  points: number;
  platform?: "tiktok" | "instagram" | "any";
  muted: boolean;
  onMuteToggle: () => void;
  videoRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const [videoReady, setVideoReady] = useState(false);

  // Use animated thumbnail (already cached from mini preview) so overlay shows motion, not a freeze
  const animatedThumbUrl = `https://image.mux.com/${playbackId}/animated.webp?width=480&fps=12&start=0&end=4`;
  const staticThumbUrl = getMuxThumbnailUrl(playbackId);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close button */}
      <button
        type="button"
        className="absolute top-4 right-4 z-20 w-10 h-10 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white transition-all cursor-pointer backdrop-blur-sm"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close video"
      >
        <X size={20} />
      </button>

      {/* Video area */}
      <div
        ref={videoRef}
        className="flex-1 flex items-center justify-center"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="relative w-full h-full">
          <MuxPlayer
            playbackId={playbackId}
            streamType="on-demand"
            loop
            muted={muted}
            preload="auto"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({
              autoPlay: "any",
              onPlaying: () => setVideoReady(true),
              style: {
                width: "100%",
                height: "100%",
                "--controls": "none",
                "--media-object-fit": "contain",
                "--media-object-position": "center",
              },
            } as any)}
          />

          {/* Animated thumbnail overlay — uses cached animated webp so it feels alive while video loads */}
          <div
            className={cn(
              "absolute inset-0 z-[5] flex items-center justify-center transition-opacity duration-500 ease-out pointer-events-none",
              videoReady ? "opacity-0" : "opacity-100"
            )}
          >
            <picture>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={animatedThumbUrl}
                alt=""
                className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = staticThumbUrl; }}
              />
            </picture>
            {/* Subtle loading pulse so it doesn't feel frozen */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-black/30 backdrop-blur-md border border-white/15 flex items-center justify-center animate-pulse">
                <Loader2 size={22} className="text-white/70 animate-spin" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient overlay with gamification */}
      <div className="shrink-0 px-5 pb-6 pt-8 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <span className={tier.badgeClass}>{tier.label}</span>
            <span className={cn(tier.xpBadgeClass, "flex items-center gap-1")}>
              <Zap size={12} />
              +{points} XP
            </span>
          </div>
          {/* Mute toggle */}
          <button
            type="button"
            className="w-9 h-9 bg-white/8 border border-white/12 rounded-full flex items-center justify-center text-white/70 hover:bg-white/15 hover:text-white transition-all cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onMuteToggle();
              const player = videoRef.current?.querySelector("mux-player");
              if (player) (player as HTMLMediaElement).muted = !muted;
            }}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
        <h3 className={cn("text-lg font-extrabold tracking-tight", titleColorClass)}>
          {title}
        </h3>

        {/* Create Now — platform-specific deep links */}
        <div className="flex gap-2 mt-3">
          {(platform === "tiktok" || platform === "any" || !platform) && (
            <a
              href="https://www.tiktok.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.08] border border-white/[0.12] text-white/80 text-xs font-semibold hover:bg-white/[0.15] active:scale-[0.97] transition-all"
              onClick={(e) => e.stopPropagation()}
            >
              <Music size={14} />
              Create on TikTok
            </a>
          )}
          {(platform === "instagram" || platform === "any" || !platform) && (
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.08] border border-white/[0.12] text-white/80 text-xs font-semibold hover:bg-white/[0.15] active:scale-[0.97] transition-all"
              onClick={(e) => e.stopPropagation()}
            >
              <Camera size={14} />
              Create on Instagram
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Success sound (Web Audio API — no external files) ──────────────────────

function playSuccessSound() {
  try {
    const ctx = new AudioContext();
    // Ascending major arpeggio: C5 → E5 → G5 → C6
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.13, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* AudioContext not available — silent fallback */ }
}

// ─── Types ───────────────────────────────────────────────────────────────────

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

type ProofType = "tiktok_link" | "instagram_link" | "screenshot" | "url" | "text";

// ─── Quest type → proof type mapping ─────────────────────────────────────────

const QUEST_PROOF_MAP: Record<string, { types: ProofType[]; default: ProofType }> = {
  social_post: { types: ["tiktok_link", "instagram_link"], default: "tiktok_link" },
  story_share: { types: ["tiktok_link", "instagram_link", "screenshot"], default: "tiktok_link" },
  content_creation: { types: ["tiktok_link", "instagram_link", "screenshot"], default: "tiktok_link" },
  custom: { types: ["tiktok_link", "instagram_link", "screenshot"], default: "tiktok_link" },
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
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const [fullscreenMuted, setFullscreenMuted] = useState(true);
  const fullscreenVideoRef = useRef<HTMLDivElement>(null);

  // View submissions
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);
  const [questSubmissions, setQuestSubmissions] = useState<Record<string, Submission[]>>({});
  const [loadingSubs, setLoadingSubs] = useState<string | null>(null);

  // Modal stack: Escape key + body scroll lock
  useEffect(() => {
    if (!detailQuest && !mediaFullscreen && !videoFullscreen && !submitQuestId) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (submitQuestId && !submitting) { setSubmitQuestId(null); return; }
        if (videoFullscreen) { setVideoFullscreen(false); setFullscreenMuted(true); return; }
        if (mediaFullscreen) { setMediaFullscreen(false); return; }
        if (detailQuest) { setDetailQuest(null); setVideoFullscreen(false); setFullscreenMuted(true); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [detailQuest, mediaFullscreen, videoFullscreen, submitQuestId, submitting]);

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
    // Determine default proof type based on quest platform
    const platform = quest.platform || "any";
    let defaultType = mapping.default;
    if (platform === "tiktok") defaultType = "tiktok_link";
    else if (platform === "instagram") defaultType = "instagram_link";
    setSubmitQuestId(quest.id);
    setProofType(defaultType);
    setSubmitted(false);
    setProofText("");
    setUploadedUrl("");
    setError("");
  };

  const handleSubmit = async () => {
    if (!submitQuestId) return;
    const proofValue = proofType === "screenshot" ? (uploadedUrl || proofText.trim()) : proofText.trim();
    if (!proofValue) return;
    setError("");
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
        playSuccessSound();
        setTimeout(() => {
          const questId = submitQuestId;
          setSubmitQuestId(null);
          setDetailQuest(null);
          setVideoFullscreen(false);
          setFullscreenMuted(true);
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
  const availableProofTypes = (() => {
    if (!submitQuest) return [];
    const mapping = QUEST_PROOF_MAP[submitQuest.quest_type] || QUEST_PROOF_MAP.custom;
    const platform = submitQuest.platform || "any";
    // Filter platform link types based on quest platform
    return mapping.types.filter((pt) => {
      if (pt === "tiktok_link") return platform === "tiktok" || platform === "any";
      if (pt === "instagram_link") return platform === "instagram" || platform === "any";
      return true; // screenshot, etc.
    });
  })();

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
              <span className={cn(
                "ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold min-w-[18px]",
                t.id === "active"
                  ? "bg-primary/20 text-primary animate-pulse"
                  : "bg-white/10 text-muted-foreground"
              )}>{t.count}</span>
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

                  {/* View Quest CTA */}
                  <div className={cn(
                    "mt-3 py-2.5 rounded-xl text-center text-[11px] font-bold uppercase tracking-widest border transition-all duration-200",
                    tier.tier === "legendary"
                      ? "bg-amber-500/8 border-amber-500/15 text-amber-400/80"
                      : tier.tier === "epic"
                      ? "bg-purple-500/8 border-purple-500/15 text-purple-400/80"
                      : tier.tier === "rare"
                      ? "bg-sky-500/8 border-sky-500/15 text-sky-400/80"
                      : "bg-white/[0.04] border-white/[0.08] text-white/50"
                  )}>
                    View Quest
                  </div>

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

      {/* Quest Detail Modal — portalled to escape <main> stacking context */}
      {detailQuest && typeof document !== "undefined" && createPortal((() => {
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
            className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => { if (e.target === e.currentTarget) { setDetailQuest(null); setVideoFullscreen(false); setFullscreenMuted(true); } }}
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
                onClick={() => { setDetailQuest(null); setVideoFullscreen(false); setFullscreenMuted(true); }}
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
                      /* Mux video — mini preview, tap to expand fullscreen */
                      <MuxVideoPreview playbackId={detailQuest.video_url!} onExpand={() => setVideoFullscreen(true)} />
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
                    onClick={() => openSubmitModal(detailQuest)}
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
      })(), (document.getElementById("rep-portal-root") || document.body))}

      {/* Fullscreen image overlay — portalled */}
      {mediaFullscreen && detailQuest?.image_url && typeof document !== "undefined" && createPortal(
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
      , (document.getElementById("rep-portal-root") || document.body))}

      {/* Fullscreen video overlay — portalled */}
      {videoFullscreen && detailQuest?.video_url && isMuxPlaybackId(detailQuest.video_url) && typeof document !== "undefined" && createPortal((() => {
        const tier = getQuestTier(detailQuest.points_reward);
        const titleColorClass =
          tier.tier === "legendary" ? "rep-gradient-text-gold"
          : tier.tier === "epic" ? "rep-gradient-text"
          : tier.tier === "rare" ? "text-[#38BDF8]"
          : "text-foreground";

        return (
          <FullscreenVideo
            playbackId={detailQuest.video_url!}
            tier={tier}
            titleColorClass={titleColorClass}
            title={detailQuest.title}
            points={detailQuest.points_reward}
            platform={detailQuest.platform}
            muted={fullscreenMuted}
            onMuteToggle={() => {
              setFullscreenMuted((m) => !m);
            }}
            videoRef={fullscreenVideoRef}
            onClose={() => { setVideoFullscreen(false); setFullscreenMuted(true); }}
          />
        );
      })(), (document.getElementById("rep-portal-root") || document.body))}

      {/* Submit Proof Modal — gamified, portalled, stacks on top of detail modal */}
      {submitQuestId && typeof document !== "undefined" && createPortal((() => {
        const sq = submitQuest;
        const sqTier = sq ? getQuestTier(sq.points_reward) : null;
        const sqTitleColor = sqTier
          ? sqTier.tier === "legendary" ? "rep-gradient-text-gold"
            : sqTier.tier === "epic" ? "rep-gradient-text"
            : sqTier.tier === "rare" ? "text-[#38BDF8]"
            : "text-foreground"
          : "text-foreground";
        const platformTypes = availableProofTypes.filter((pt) => pt === "tiktok_link" || pt === "instagram_link");
        const hasScreenshot = availableProofTypes.includes("screenshot");
        const isPlatformLink = proofType === "tiktok_link" || proofType === "instagram_link";

        return (
          <div
            className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => { if (e.target === e.currentTarget && !submitting) setSubmitQuestId(null); }}
          >
            <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[var(--color-card)]">

              {/* ── Header: tier badge, XP, close ── */}
              <div className="flex items-center justify-between px-5 pt-5">
                <div className="flex items-center gap-2">
                  {sqTier && <span className={sqTier.badgeClass}>{sqTier.label}</span>}
                  {sq && (
                    <span className={cn(sqTier?.xpBadgeClass, "flex items-center gap-1")}>
                      <Zap size={12} /> +{sq.points_reward} XP
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { if (!submitting) setSubmitQuestId(null); }}
                  className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* ── Quest title + motivation ── */}
              {sq && (
                <div className="px-5 pt-2 pb-1">
                  <h3 className={cn("text-lg font-extrabold tracking-tight", sqTitleColor)}>
                    {sq.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Submit your proof to earn <span className="font-bold text-primary">{sq.points_reward} XP</span>
                  </p>
                </div>
              )}

              {submitted ? (
                /* ══ Success state — big celebration ══ */
                <div className="text-center py-10 px-5 relative">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mb-4 rep-reward-success-ring relative">
                    <Check size={28} className="text-success" />
                    <div className="rep-success-particles">
                      <div className="rep-success-particle" />
                      <div className="rep-success-particle" />
                      <div className="rep-success-particle" />
                      <div className="rep-success-particle" />
                      <div className="rep-success-particle" />
                      <div className="rep-success-particle" />
                    </div>
                  </div>
                  <p className="text-base font-extrabold text-foreground mb-1">Quest Submitted!</p>
                  <p className="text-xs text-muted-foreground mb-3">Your proof is being reviewed</p>
                  {sq && (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-4 py-2">
                      <Zap size={14} className="text-primary" />
                      <span className="text-sm font-bold text-primary">+{sq.points_reward} XP pending</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-5 pb-5 pt-3 space-y-4">

                  {/* ══ Platform selector — big cards (only if multiple) ══ */}
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

                  {/* ══ Link input ══ */}
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

                      {/* Validation hints */}
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

                  {/* ══ Screenshot upload (when selected) ══ */}
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

                  {/* ══ Toggle: screenshot ↔ link ══ */}
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

                  {/* ══ Error display ══ */}
                  {error && !submitting && !submitted && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                      <p className="text-xs text-red-400">{error}</p>
                    </div>
                  )}

                  {/* ══ Submit CTA — tier-colored with XP ══ */}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || (!proofText.trim() && !uploadedUrl)}
                    className={cn(
                      "w-full rounded-xl px-4 py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-30 disabled:scale-100",
                      "flex items-center justify-center gap-2",
                      sqTier?.tier === "legendary"
                        ? "bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110"
                        : sqTier?.tier === "epic"
                        ? "bg-gradient-to-r from-purple-500 to-violet-500 hover:brightness-110"
                        : sqTier?.tier === "rare"
                        ? "bg-gradient-to-r from-sky-500 to-blue-500 hover:brightness-110"
                        : "bg-primary hover:brightness-110"
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
                        Submit for +{sq?.points_reward ?? 0} XP
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })(), (document.getElementById("rep-portal-root") || document.body))}
    </div>
  );
}
