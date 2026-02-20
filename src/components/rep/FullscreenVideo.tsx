"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { X, Loader2, Zap, Volume2, VolumeX, Music, Camera } from "lucide-react";
import { getMuxThumbnailUrl } from "@/lib/mux";
import { cn } from "@/lib/utils";
import type { QuestAccent } from "@/lib/rep-quest-styles";

const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), { ssr: false });

interface FullscreenVideoProps {
  playbackId: string;
  accent: QuestAccent;
  title: string;
  points: number;
  platform?: "tiktok" | "instagram" | "any";
  muted: boolean;
  onMuteToggle: () => void;
  videoRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

/**
 * Fullscreen Mux video player with animated thumbnail crossfade.
 */
export function FullscreenVideo({
  playbackId, accent, title, points, platform, muted, onMuteToggle, videoRef, onClose,
}: FullscreenVideoProps) {
  const [videoReady, setVideoReady] = useState(false);

  const animatedThumbUrl = `https://image.mux.com/${playbackId}/animated.webp?width=480&fps=12&start=0&end=4`;
  const staticThumbUrl = getMuxThumbnailUrl(playbackId);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button
        type="button"
        className="absolute top-4 right-4 z-20 w-10 h-10 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white transition-all cursor-pointer backdrop-blur-sm"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close video"
      >
        <X size={20} />
      </button>

      <div
        ref={videoRef}
        className="flex-1 min-h-0 flex items-center justify-center overflow-hidden"
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
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-black/30 backdrop-blur-md border border-white/15 flex items-center justify-center animate-pulse">
                <Loader2 size={22} className="text-white/70 animate-spin" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-5 pt-8 bg-gradient-to-t from-black via-black/80 to-transparent" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between mb-2">
          <span className={cn("flex items-center gap-1 text-sm font-extrabold", accent.color)}>
            <Zap size={14} />
            +{points} XP
          </span>
          <button
            type="button"
            className="w-9 h-9 bg-white/8 border border-white/12 rounded-full flex items-center justify-center text-white/70 hover:bg-white/15 hover:text-white transition-all cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onMuteToggle();
            }}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
        <h3 className={cn("text-lg font-extrabold tracking-tight", accent.titleColor)}>
          {title}
        </h3>

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
