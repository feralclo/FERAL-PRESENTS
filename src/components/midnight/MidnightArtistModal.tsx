"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Hls from "hls.js";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Artist } from "@/types/artists";

/** Check if a video_url is a Mux playback ID (not a full URL) */
function isMuxId(videoUrl: string): boolean {
  return !!videoUrl && !videoUrl.startsWith("http");
}

/** Get the HLS stream URL for a Mux playback ID */
function getMuxHlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

/** Get Mux thumbnail from a playback ID */
function getMuxThumbnail(playbackId: string): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1`;
}

interface MidnightArtistModalProps {
  artist: Artist | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Detect if the user is on a mobile device (for Instagram deep-linking).
 * We check for touch support + mobile UA patterns.
 */
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Open Instagram — native app on mobile, new tab on desktop.
 * On mobile, try the instagram:// deep link first. If the app isn't
 * installed, the browser will fall back to the web URL after a brief delay.
 */
function openInstagram(handle: string) {
  const webUrl = `https://instagram.com/${handle}`;

  if (isMobileDevice()) {
    // Try native app URI — falls back to web if app not installed
    const appUrl = `instagram://user?username=${handle}`;
    const start = Date.now();
    window.location.href = appUrl;

    // If we're still here after 1.5s, the app didn't open — go to web
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [showNameOverlay, setShowNameOverlay] = useState(false);
  const nameOverlayTimeout = useRef<NodeJS.Timeout>(undefined);

  // Load video source — HLS.js for Mux in Chrome, native for Safari/legacy URLs
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isOpen || !artist?.video_url) return;

    // Clean up any previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsPlaying(false);
    setVideoReady(false);
    setVideoError(false);
    setShowNameOverlay(false);
    if (nameOverlayTimeout.current) clearTimeout(nameOverlayTimeout.current);

    if (isMuxId(artist.video_url)) {
      const hlsUrl = getMuxHlsUrl(artist.video_url);

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari — native HLS support
        video.src = hlsUrl;
      } else if (Hls.isSupported()) {
        // Chrome/Firefox — use hls.js
        const hls = new Hls();
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setVideoError(true);
            setIsPlaying(false);
          }
        });
        hlsRef.current = hls;
      } else {
        setVideoError(true);
      }
    } else {
      // Legacy direct URL (e.g. old Supabase storage)
      video.src = artist.video_url;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isOpen, artist?.id, artist?.video_url]);

  // Clean up when modal closes
  useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isOpen]);

  // When metadata loads, seek to 0.1s to display first frame
  // (more reliable than #t= URL fragment across browsers)
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0.1;
    }
  }, []);

  // Video has enough data to display the current frame
  const handleCanPlay = useCallback(() => {
    setVideoReady(true);
  }, []);

  const handleVideoTap = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.currentTime = 0; // Start from beginning on first play
      video.play().catch(() => {
        // Autoplay rejected — user needs to interact first (edge case)
      });
      setIsPlaying(true);

      // Show name overlay briefly on play
      setShowNameOverlay(true);
      if (nameOverlayTimeout.current) clearTimeout(nameOverlayTimeout.current);
      nameOverlayTimeout.current = setTimeout(() => {
        setShowNameOverlay(false);
      }, 2200);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleVideoError = useCallback(() => {
    setVideoError(true);
    setIsPlaying(false);
  }, []);

  if (!artist) return null;

  const hasVideo = !!artist.video_url;

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
          {hasVideo && (
            <div className="mb-5">
              {/* Glass frame container */}
              <div
                className="relative rounded-2xl overflow-hidden border border-foreground/[0.10] shadow-[0_0_30px_rgba(255,255,255,0.03),inset_0_1px_0_rgba(255,255,255,0.06)]"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                }}
              >
                {/* Video viewport — CSS crops to max 4:5 (object-fit: cover).
                    Wider ratios (16:9, etc.) display at native ratio.
                    Taller ratios (9:16) get center-cropped to 4:5. */}
                <div
                  className={`relative w-full ${videoReady && !videoError ? "cursor-pointer" : ""}`}
                  style={{
                    aspectRatio: "4 / 5",
                    maxHeight: "380px",
                  }}
                  onClick={videoReady && !videoError ? handleVideoTap : undefined}
                >
                  {/* Video element — hidden until ready, removed on error */}
                  {!videoError && (
                    /* eslint-disable-next-line jsx-a11y/media-has-caption */
                    <video
                      ref={videoRef}
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                        videoReady ? "opacity-100" : "opacity-0"
                      }`}
                      playsInline
                      muted
                      preload="metadata"
                      poster={isMuxId(artist.video_url!) ? getMuxThumbnail(artist.video_url!) : (artist.image || undefined)}
                      onLoadedMetadata={handleLoadedMetadata}
                      onCanPlay={handleCanPlay}
                      onEnded={handleVideoEnded}
                      onError={handleVideoError}
                    />
                  )}

                  {/* Loading skeleton — visible while video metadata loads */}
                  {!videoReady && !videoError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-foreground/[0.04]">
                      <div className="w-14 h-14 rounded-full bg-foreground/[0.06] flex items-center justify-center animate-pulse">
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="ml-1 text-foreground/20"
                        >
                          <polygon points="5,3 19,12 5,21" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Error state — clearly visible fallback */}
                  {videoError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
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
                      <div className="relative z-10 flex flex-col items-center gap-2.5">
                        <div className="w-12 h-12 rounded-full bg-black/30 border border-foreground/[0.08] flex items-center justify-center">
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-foreground/25"
                          >
                            <rect x="2" y="2" width="20" height="20" rx="2" />
                            <path d="M10 9l5 3-5 3V9z" />
                          </svg>
                        </div>
                        <span className="font-[family-name:var(--font-sans)] text-[11px] text-foreground/35 tracking-[0.01em]">
                          Video unavailable
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Play button overlay — fades out when playing */}
                  {videoReady && (
                    <div
                      className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
                        isPlaying ? "opacity-0 pointer-events-none" : "opacity-100 cursor-pointer"
                      }`}
                    >
                      <div className="w-14 h-14 rounded-full bg-black/40 border border-white/15 backdrop-blur-sm flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.4)]">
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="white"
                          className="ml-1"
                        >
                          <polygon points="5,3 19,12 5,21" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Artist name overlay — appears briefly on play */}
                  <div
                    className={`absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 via-black/20 to-transparent transition-all duration-700 ${
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
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
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
              {/* Instagram SVG icon */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
              <span className="font-[family-name:var(--font-sans)] text-[13px] font-medium tracking-[0.01em]">
                @{artist.instagram_handle}
              </span>
              {/* Arrow */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-40"
              >
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
