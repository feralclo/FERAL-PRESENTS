"use client";

import { Zap, Coins, Heart, Share2, Camera, Link as LinkIcon, Type, Instagram } from "lucide-react";
import type { QuestType, QuestProofType } from "@/types/reps";

/**
 * Mini mockup of the iOS quest card, rendered in the admin so tenants see
 * exactly what their rep will see in the app before saving. The shape follows
 * Views/YourQuestCard.swift + Views/OnDeckHero.swift in the iOS repo:
 *   - cover image as the full-bleed background (or promoter-accent gradient
 *     if empty — iOS does the same cascade)
 *   - accent tint + dark readability scrim
 *   - kind pill, title, subtitle (detail-only; hidden here if blank),
 *     reward chips (XP + EP)
 *   - proof-type icon hint at bottom
 */

function intToCss(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(n))).toString(16).padStart(6, "0")}`;
}

const KIND_LABELS: Record<QuestType, string> = {
  social_post: "SOCIAL POST",
  story_share: "STORY SHARE",
  content_creation: "CREATE CONTENT",
  custom: "CUSTOM",
  sales_milestone: "SALES TARGET",
};

const PROOF_HINT: Record<QuestProofType, { label: string; icon: typeof Camera }> = {
  screenshot: { label: "Upload screenshot", icon: Camera },
  url: { label: "Paste link", icon: LinkIcon },
  instagram_link: { label: "Paste Instagram link", icon: Instagram },
  tiktok_link: { label: "Paste TikTok link", icon: LinkIcon },
  text: { label: "Write short note", icon: Type },
  none: { label: "No submission", icon: Type },
};

export interface QuestCardPreviewProps {
  title: string;
  subtitle: string;
  coverImageUrl: string;
  /** Promoter's brand accent as an int (0..0xFFFFFF). iOS derives both
   *  gradient stops from this one value — the admin doesn't let tenants
   *  pick per-quest accents anymore. */
  promoterAccentHex: number | null;
  questType: QuestType;
  xp: number;
  ep: number;
  proofType: QuestProofType;
}

export function QuestCardPreview({
  title,
  subtitle,
  coverImageUrl,
  promoterAccentHex,
  questType,
  xp,
  ep,
  proofType,
}: QuestCardPreviewProps) {
  // Mirror iOS fallbacks: accent_hex null → platform violet; per-quest accents
  // cut from the wire contract entirely, so we only consume the promoter hex.
  const accent = intToCss(promoterAccentHex) ?? "#4A1FFF";
  const proof = PROOF_HINT[proofType];
  const ProofIcon = proof.icon;

  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
        iOS preview — what your rep sees
      </p>
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
        {/* Cover image — iOS uses the promoter-accent gradient when empty */}
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${accent} 0%, ${accent}99 50%, ${accent}55 100%)`,
            }}
          />
        )}

        {/* Accent tint (lighter when cover is set — emulates the iOS hero overlay) */}
        <div
          className="absolute inset-0"
          style={{
            background: coverImageUrl
              ? `linear-gradient(135deg, ${accent}33 0%, transparent 55%)`
              : "transparent",
          }}
        />

        {/* Readability scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

        {/* Content */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <span className="rounded-full bg-white/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-white backdrop-blur-md">
            {KIND_LABELS[questType]}
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 backdrop-blur-md">
            <Heart size={12} className="text-white" />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 space-y-3 p-4 text-white">
          <div>
            <h4 className="line-clamp-2 text-lg font-bold leading-tight tracking-tight">
              {title.trim() || "Your quest title"}
            </h4>
            {subtitle.trim() && (
              <p className="mt-0.5 line-clamp-1 text-xs text-white/70">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-black">
              <Zap size={10} strokeWidth={2.5} />
              {xp}
              <span className="text-[9px] font-semibold tracking-wider text-black/60">XP</span>
            </span>
            {ep > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-white backdrop-blur-md">
                <Coins size={10} strokeWidth={2.5} />
                {ep}
                <span className="text-[9px] font-semibold tracking-wider text-white/70">EP</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-white/60">
            <ProofIcon size={10} strokeWidth={2} />
            {proof.label}
          </div>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Share2 size={10} strokeWidth={1.75} />
        Gradient uses your promoter accent. Upload a cover to override.
      </p>
    </div>
  );
}
