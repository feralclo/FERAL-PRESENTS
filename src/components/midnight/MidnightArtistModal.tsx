"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Artist } from "@/types/artists";

// Mux Player — dynamic import to avoid SSR issues (it's a Web Component)
const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), {
  ssr: false,
});

/** Check if a video_url is a Mux playback ID (not a full URL) */
function isMuxId(videoUrl: string): boolean {
  return !!videoUrl && !videoUrl.startsWith("http");
}

interface MidnightArtistModalProps {
  artist: Artist | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Detect if the user is on a mobile device (for Instagram deep-linking).
 */
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Open Instagram — native app on mobile, new tab on desktop.
 */
function openInstagram(handle: string) {
  const webUrl = `https://instagram.com/${handle}`;

  if (isMobileDevice()) {
    const appUrl = `instagram://user?username=${handle}`;
    const start = Date.now();
    window.location.href = appUrl;

    setTimeout(() => {
      if (Date.now() - start < 2000) {
        window.open(webUrl, "_blank", "noopener,noreferrer");
      }
    }, 1500);
  } else {
    window.open(webUrl, "_blank", "noopener,noreferrer");
  }
}

export function MidnightArtistModal({
  artist,
  isOpen,
  onClose,
}: MidnightArtistModalProps) {
  const [videoError, setVideoError] = useState(false);
  const [showNameOverlay, setShowNameOverlay] = useState(false);
  const nameOverlayTimeout = useRef<NodeJS.Timeout>(undefined);

  const handlePlay = useCallback(() => {
    setShowNameOverlay(true);
    if (nameOverlayTimeout.current) clearTimeout(nameOverlayTimeout.current);
    nameOverlayTimeout.current = setTimeout(() => {
      setShowNameOverlay(false);
    }, 2200);
  }, []);

  if (!artist) return null;

  const hasVideo = !!artist.video_url;
  const hasMuxVideo = hasVideo && isMuxId(artist.video_url!);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        data-theme="midnight"
        className="midnight-artist-dialog max-w-[380px] p-0 gap-0 rounded-2xl overflow-hidden"
      >
        <DialogTitle className="sr-only">{artist.name}</DialogTitle>
        <DialogDescription className="sr-only">
          Artist profile for {artist.name}
        </DialogDescription>

        <div className="px-6 pt-7 pb-6 max-[380px]:px-5 max-[380px]:pt-6 max-[380px]:pb-5">
          {/* ── Video section ── */}
          {hasVideo && !videoError && (
            <div className="mb-5">
              {/* Glass frame container */}
              <div
                className="relative rounded-2xl overflow-hidden border border-foreground/[0.10] shadow-[0_0_30px_rgba(255,255,255,0.03),inset_0_1px_0_rgba(255,255,255,0.06)]"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                }}
              >
                <div
                  className="relative w-full"
                  style={{
                    aspectRatio: "4 / 5",
                    maxHeight: "380px",
                  }}
                >
                  {hasMuxVideo ? (
                    <MuxPlayer
                      playbackId={artist.video_url!}
                      streamType="on-demand"
                      muted
                      preload="auto"
                      onPlay={handlePlay}
                      onError={() => setVideoError(true)}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      {...{ style: {
                        width: "100%",
                        height: "100%",
                        position: "absolute",
                        inset: 0,
                        "--controls": "none",
                        "--media-object-fit": "cover",
                        "--media-object-position": "center",
                      } } as any}
                    />
                  ) : (
                    /* Legacy direct URL fallback */
                    /* eslint-disable-next-line jsx-a11y/media-has-caption */
                    <video
                      src={artist.video_url!}
                      className="absolute inset-0 w-full h-full object-cover"
                      playsInline
                      muted
                      controls
                      preload="metadata"
                      onError={() => setVideoError(true)}
                    />
                  )}

                  {/* Artist name overlay — appears briefly on play */}
                  <div
                    className={`absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 via-black/20 to-transparent transition-all duration-700 pointer-events-none z-10 ${
                      showNameOverlay
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-2"
                    }`}
                  >
                    <h3 className="font-[family-name:var(--font-sans)] text-lg font-bold tracking-[0.02em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                      {artist.name}
                    </h3>
                  </div>

                  {/* Subtle glass rim highlight (top edge) */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent pointer-events-none z-10" />
                </div>
              </div>
            </div>
          )}

          {/* ── Error state ── */}
          {hasVideo && videoError && (
            <div className="mb-5">
              <div
                className="relative rounded-2xl overflow-hidden border border-foreground/[0.10]"
                style={{ aspectRatio: "4 / 5", maxHeight: "380px" }}
              >
                {artist.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={artist.image}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover brightness-[0.3]"
                  />
                ) : (
                  <div className="absolute inset-0 bg-foreground/[0.05]" />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="relative z-10 flex flex-col items-center gap-2.5">
                    <div className="w-12 h-12 rounded-full bg-black/30 border border-foreground/[0.08] flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/25">
                        <rect x="2" y="2" width="20" height="20" rx="2" />
                        <path d="M10 9l5 3-5 3V9z" />
                      </svg>
                    </div>
                    <span className="font-[family-name:var(--font-sans)] text-[11px] text-foreground/35 tracking-[0.01em]">
                      Video unavailable
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Artist header — image + name (only show image if no video) ── */}
          <div className={`flex items-center gap-4 ${hasVideo ? "mb-3" : "mb-4"}`}>
            {!hasVideo && (
              artist.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={artist.image}
                  alt={artist.name}
                  className="w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16 rounded-full object-cover border border-foreground/[0.08] shrink-0"
                />
              ) : (
                <div className="w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16 rounded-full bg-foreground/[0.05] border border-foreground/[0.08] flex items-center justify-center shrink-0">
                  <span className="font-[family-name:var(--font-sans)] text-xl font-bold text-foreground/30">
                    {artist.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )
            )}
            <h3 className={`font-[family-name:var(--font-sans)] font-bold tracking-[0.01em] text-foreground/90 leading-tight ${
              hasVideo ? "text-base" : "text-lg max-[380px]:text-base"
            }`}>
              {artist.name}
            </h3>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent mb-4" />

          {/* Bio */}
          {artist.description && (
            <p className="font-[family-name:var(--font-sans)] text-[14px] max-[380px]:text-[13px] leading-relaxed text-foreground/60 mb-5">
              {artist.description}
            </p>
          )}

          {/* Instagram link — deep links to app on mobile */}
          {artist.instagram_handle && (
            <button
              type="button"
              onClick={() => openInstagram(artist.instagram_handle!)}
              className="flex items-center justify-center gap-2.5 w-full h-11 rounded-xl bg-foreground/[0.06] border border-foreground/[0.10] text-foreground/70 hover:bg-foreground/[0.10] hover:border-foreground/[0.16] hover:text-foreground/90 transition-all duration-200 cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
              <span className="font-[family-name:var(--font-sans)] text-[13px] font-medium tracking-[0.01em]">
                @{artist.instagram_handle}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7,7 17,7 17,17" />
              </svg>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
