"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { isMuxPlaybackId } from "@/lib/mux";
import type { Artist } from "@/types/artists";

// Mux Player — dynamic import to avoid SSR issues (it's a Web Component)
const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), {
  ssr: false,
});

// One-shot swipe hint — shows once per session
let hasShownSwipeHint = false;

interface MidnightArtistModalProps {
  artists: Artist[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

type AnimPhase = "idle" | "exiting" | "entering";

export function MidnightArtistModal({
  artists,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
}: MidnightArtistModalProps) {
  const artist = artists[currentIndex] ?? null;

  const [videoError, setVideoError] = useState(false);
  const [showNameOverlay, setShowNameOverlay] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const nameOverlayTimeout = useRef<NodeJS.Timeout>(undefined);
  const videoWrapperRef = useRef<HTMLDivElement>(null);

  // ── Swipe state ──
  const [dragOffset, setDragOffset] = useState(0);
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");
  const [animDirection, setAnimDirection] = useState<"left" | "right">("left");
  const [showHint, setShowHint] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const directionLockRef = useRef<"h" | "v" | null>(null);
  const pendingIndexRef = useRef<number | null>(null);

  // Reset state when artist changes or modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setShowNameOverlay(false);
      setDragOffset(0);
      setAnimPhase("idle");
      return;
    }
    setVideoError(false);
    setIsMuted(true);
  }, [artist?.id, isOpen]);

  // Swipe hint — one-shot on first open when multiple artists
  useEffect(() => {
    if (isOpen && artists.length > 1 && !hasShownSwipeHint) {
      hasShownSwipeHint = true;
      setShowHint(true);
      const t = setTimeout(() => setShowHint(false), 1200);
      return () => clearTimeout(t);
    }
  }, [isOpen, artists.length]);

  // Sync muted state from MuxPlayer once it mounts
  useEffect(() => {
    if (!isOpen || !artist?.video_url) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    let el: HTMLElement | null = null;

    const handleVolumeChange = () => {
      if (el) setIsMuted((el as unknown as HTMLMediaElement).muted ?? true);
    };

    const setup = (): boolean => {
      el = videoWrapperRef.current?.querySelector("mux-player") ?? null;
      if (!el) return false;
      setIsMuted((el as unknown as HTMLMediaElement).muted ?? true);
      el.addEventListener("volumechange", handleVolumeChange);
      return true;
    };

    // Dynamic import means the element may not be in DOM yet — poll briefly
    if (!setup()) {
      interval = setInterval(() => {
        if (setup()) clearInterval(interval);
      }, 200);
    }

    return () => {
      clearInterval(interval);
      if (el) el.removeEventListener("volumechange", handleVolumeChange);
    };
  }, [isOpen, artist?.id, artist?.video_url]);

  const handlePlay = useCallback(() => {
    setShowNameOverlay(true);
    if (nameOverlayTimeout.current) clearTimeout(nameOverlayTimeout.current);
    nameOverlayTimeout.current = setTimeout(() => {
      setShowNameOverlay(false);
    }, 3000);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (nameOverlayTimeout.current) clearTimeout(nameOverlayTimeout.current);
    };
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoWrapperRef.current?.querySelector("mux-player") as unknown as HTMLMediaElement | null;
    if (el) {
      el.muted = !el.muted;
      setIsMuted(el.muted);
    }
    // Legacy <video> fallback
    const vid = videoWrapperRef.current?.querySelector("video");
    if (vid) {
      vid.muted = !vid.muted;
      setIsMuted(vid.muted);
    }
  }, []);

  // ── Navigation helpers ──
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < artists.length - 1;
  const multipleArtists = artists.length > 1;

  const navigateTo = useCallback(
    (targetIndex: number, direction: "left" | "right") => {
      if (targetIndex < 0 || targetIndex >= artists.length) return;
      if (animPhase !== "idle") return;

      pendingIndexRef.current = targetIndex;
      setAnimDirection(direction);
      setAnimPhase("exiting");
      setDragOffset(0);
    },
    [artists.length, animPhase]
  );

  const goPrev = useCallback(() => {
    if (canGoPrev) navigateTo(currentIndex - 1, "right");
  }, [canGoPrev, currentIndex, navigateTo]);

  const goNext = useCallback(() => {
    if (canGoNext) navigateTo(currentIndex + 1, "left");
  }, [canGoNext, currentIndex, navigateTo]);

  // ── Transition end handler — phase machine ──
  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      // Only react to our transform transitions on the content div
      if (e.propertyName !== "transform" || e.target !== contentRef.current) return;

      if (animPhase === "exiting" && pendingIndexRef.current !== null) {
        // Swap to new artist
        onNavigate(pendingIndexRef.current);
        pendingIndexRef.current = null;

        // Position incoming content off-screen from opposite side
        setAnimPhase("entering");
        setDragOffset(animDirection === "left" ? 60 : -60);

        // Next frame: animate to center
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setDragOffset(0);
          });
        });
      } else if (animPhase === "entering") {
        setAnimPhase("idle");
      }
    },
    [animPhase, animDirection, onNavigate]
  );

  // ── Touch handlers ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (animPhase !== "idle" || artists.length <= 1) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    directionLockRef.current = null;
  }, [animPhase, artists.length]);

  // Use native addEventListener for passive: false (needed to preventDefault)
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !isOpen || artists.length <= 1) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      // Direction lock — first 10px determines intent
      if (!directionLockRef.current) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        directionLockRef.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }

      if (directionLockRef.current === "v") return; // let modal scroll

      e.preventDefault(); // block scroll for horizontal swipe

      // 1:1 tracking with edge rubber-band
      const atEdge = (dx > 0 && !canGoPrev) || (dx < 0 && !canGoNext);
      const displayOffset = atEdge ? dx * 0.3 : dx;
      setDragOffset(displayOffset);
    };

    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", handleTouchMove);
  }, [isOpen, artists.length, canGoPrev, canGoNext]);

  const onTouchEnd = useCallback(() => {
    if (!touchStartRef.current || directionLockRef.current !== "h") {
      touchStartRef.current = null;
      return;
    }

    const dx = dragOffset;
    const elapsed = Date.now() - touchStartRef.current.t;
    const velocity = Math.abs(dx) / elapsed; // px/ms
    touchStartRef.current = null;

    const containerWidth = contentRef.current?.offsetWidth || 380;
    const pastThreshold = Math.abs(dx) > containerWidth * 0.35;
    const fastFlick = velocity > 0.3;

    if ((pastThreshold || fastFlick) && dx < 0 && canGoNext) {
      navigateTo(currentIndex + 1, "left");
    } else if ((pastThreshold || fastFlick) && dx > 0 && canGoPrev) {
      navigateTo(currentIndex - 1, "right");
    } else {
      // Snap back
      setDragOffset(0);
    }
  }, [dragOffset, canGoNext, canGoPrev, currentIndex, navigateTo]);

  // ── Keyboard navigation ──
  useEffect(() => {
    if (!isOpen || artists.length <= 1) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && canGoPrev) goPrev();
      if (e.key === "ArrowRight" && canGoNext) goNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, artists.length, canGoPrev, canGoNext, goPrev, goNext]);

  // ── Compute inline styles for the content div ──
  const isDragging = touchStartRef.current !== null && directionLockRef.current === "h";
  const isAnimating = animPhase !== "idle";

  let contentTransform = `translateX(${dragOffset}px)`;
  let contentOpacity = 1;

  if (animPhase === "exiting") {
    const exitX = animDirection === "left" ? -80 : 80;
    contentTransform = `translateX(${exitX}px)`;
    contentOpacity = 0;
  } else if (isDragging || dragOffset !== 0) {
    // Real-time drag or snap-back
    contentOpacity = 1 - (Math.abs(dragOffset) / 380) * 0.3;
    // Edge fades slightly stronger
    const atEdge = (dragOffset > 0 && !canGoPrev) || (dragOffset < 0 && !canGoNext);
    if (atEdge) contentOpacity = 1 - (Math.abs(dragOffset) / 380) * 0.5;
  }

  // CSS class for transition type
  let transitionClass = "";
  if (isDragging) {
    transitionClass = "midnight-artist-dragging";
  } else if (isAnimating) {
    transitionClass = "midnight-artist-swipe";
  } else if (dragOffset !== 0) {
    // Snap-back in progress (dragOffset just set to 0 — check actual)
    transitionClass = "midnight-artist-snapback";
  } else if (!isDragging && directionLockRef.current === "h") {
    // Just released — snap-back
    transitionClass = "midnight-artist-snapback";
  }

  // After touch end: if offset is non-zero and we're not animating, use snapback
  // If offset is 0 and we're idle, no class needed
  // Simplify: always use snapback when idle + not dragging + offset just returned to 0
  if (animPhase === "idle" && !isDragging && dragOffset === 0) {
    // Use snapback briefly after release, but it won't matter since offset is 0
    transitionClass = "";
  }

  if (!artist) return null;

  const hasVideo = !!artist.video_url;
  const hasMuxVideo = hasVideo && isMuxPlaybackId(artist.video_url!);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        data-theme="midnight"
        className="midnight-artist-dialog max-w-[380px] p-0 gap-0 rounded-2xl overflow-y-auto overflow-x-hidden"
      >
        <DialogTitle className="sr-only">{artist.name}</DialogTitle>
        <DialogDescription className="sr-only">
          Artist profile for {artist.name}
        </DialogDescription>

        {/* Swipeable content wrapper */}
        <div
          ref={contentRef}
          className={`px-6 pt-7 pb-6 max-[380px]:px-5 max-[380px]:pt-6 max-[380px]:pb-5 ${transitionClass} ${showHint && animPhase === "idle" && dragOffset === 0 ? "midnight-swipe-hint" : ""}`}
          style={{
            transform: contentTransform,
            opacity: contentOpacity,
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTransitionEnd={handleTransitionEnd}
        >
          {/* ── Video section ── */}
          {hasVideo && !videoError && (
            <div className="mb-5" ref={videoWrapperRef}>
              {/* Glass frame container */}
              <div
                className="relative rounded-2xl overflow-hidden border border-foreground/[0.10] shadow-[0_0_30px_rgba(255,255,255,0.03),inset_0_1px_0_rgba(255,255,255,0.06)]"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                }}
              >
                <div
                  className="relative w-full"
                  style={{ aspectRatio: "4 / 5", maxHeight: "320px" }}
                >
                  {hasMuxVideo ? (
                    <MuxPlayer
                      playbackId={artist.video_url!}
                      streamType="on-demand"
                      loop
                      preload="auto"
                      onPlay={handlePlay}
                      onError={() => setVideoError(true)}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      {...{
                        autoPlay: "any",
                        style: {
                          width: "100%",
                          height: "100%",
                          position: "absolute",
                          inset: 0,
                          "--controls": "none",
                          "--media-object-fit": "cover",
                          "--media-object-position": "center",
                        },
                      } as any}
                    />
                  ) : (
                    /* Legacy direct URL fallback */
                    /* eslint-disable-next-line jsx-a11y/media-has-caption */
                    <video
                      src={artist.video_url!}
                      className="absolute inset-0 w-full h-full object-cover"
                      playsInline
                      autoPlay
                      loop
                      preload="auto"
                      onPlay={handlePlay}
                      onError={() => setVideoError(true)}
                    />
                  )}

                  {/* ── Premium name reveal — dead center ── */}
                  <div
                    className={`absolute inset-0 flex items-center justify-center pointer-events-none z-10 transition-opacity duration-500 ${
                      showNameOverlay ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    {/* Radial vignette for contrast */}
                    <div
                      className="absolute inset-0 transition-opacity duration-1000"
                      style={{
                        background: "radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 50%, transparent 75%)",
                        opacity: showNameOverlay ? 1 : 0,
                      }}
                    />

                    <div className="relative flex flex-col items-center gap-3">
                      {/* Top accent line — sweeps out from center */}
                      <div
                        className={`h-px bg-gradient-to-r from-transparent via-white/50 to-transparent transition-all ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          showNameOverlay
                            ? "w-14 opacity-100 duration-700"
                            : "w-0 opacity-0 duration-300"
                        }`}
                      />

                      {/* Artist name — tracks in from wide spacing */}
                      <h3
                        className={`font-[family-name:var(--font-sans)] text-[17px] max-[380px]:text-[15px] font-semibold uppercase text-white transition-all ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          showNameOverlay
                            ? "opacity-100 translate-y-0 tracking-[0.16em] duration-800 delay-100"
                            : "opacity-0 translate-y-1 tracking-[0.3em] duration-300"
                        }`}
                        style={{
                          textShadow: "0 0 40px rgba(255,255,255,0.2), 0 0 80px rgba(255,255,255,0.08), 0 2px 12px rgba(0,0,0,0.9)",
                        }}
                      >
                        {artist.name}
                      </h3>

                      {/* Bottom accent line — sweeps out slightly after */}
                      <div
                        className={`h-px bg-gradient-to-r from-transparent via-white/50 to-transparent transition-all ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          showNameOverlay
                            ? "w-14 opacity-100 duration-700 delay-75"
                            : "w-0 opacity-0 duration-300"
                        }`}
                      />
                    </div>
                  </div>

                  {/* ── Mute / Unmute toggle ── */}
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="absolute bottom-3 right-3 z-20 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 backdrop-blur-md bg-black/35 border border-white/[0.10] hover:bg-black/55 hover:border-white/[0.18] active:scale-[0.92] touch-manipulation"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/75">
                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/75">
                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                      </svg>
                    )}
                  </button>

                  {/* Glass rim highlight (top edge) */}
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
                style={{ aspectRatio: "4 / 5", maxHeight: "320px" }}
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

          {/* ── Artist identity: profile pic + name ── */}
          <div className={`flex items-center gap-3 ${hasVideo ? "mb-3" : "mb-4"}`}>
            {artist.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={artist.image}
                alt={artist.name}
                className={`rounded-full object-cover border border-foreground/[0.08] shrink-0 ${
                  hasVideo
                    ? "w-9 h-9"
                    : "w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16"
                }`}
              />
            ) : (
              <div className={`rounded-full bg-foreground/[0.05] border border-foreground/[0.08] flex items-center justify-center shrink-0 ${
                hasVideo
                  ? "w-9 h-9"
                  : "w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16"
              }`}>
                <span className={`font-[family-name:var(--font-sans)] font-bold text-foreground/30 ${
                  hasVideo ? "text-xs" : "text-xl"
                }`}>
                  {artist.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <h3 className={`font-[family-name:var(--font-sans)] font-bold tracking-[0.01em] text-foreground/90 leading-tight ${
              hasVideo ? "text-[15px]" : "text-lg max-[380px]:text-base"
            }`}>
              {artist.name}
            </h3>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent mb-4" />

          {/* Bio — capped height to keep dialog compact on all phones */}
          {artist.description && (
            <div className="max-h-[120px] overflow-y-auto">
              <p className="font-[family-name:var(--font-sans)] text-[13px] max-[380px]:text-[12px] leading-relaxed text-foreground/60">
                {artist.description}
              </p>
            </div>
          )}

          {/* ── Dot indicators ── */}
          {multipleArtists && (
            <div className="flex justify-center items-center gap-1.5 pt-5">
              {artists.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`midnight-artist-dot h-1.5 rounded-full cursor-pointer ${
                    i === currentIndex
                      ? "w-5 bg-white/50"
                      : "w-1.5 bg-white/15"
                  }`}
                  onClick={() => {
                    if (i < currentIndex) navigateTo(i, "right");
                    else if (i > currentIndex) navigateTo(i, "left");
                  }}
                  aria-label={`Go to artist ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Desktop chevron buttons ── */}
        {multipleArtists && canGoPrev && (
          <button
            type="button"
            className="hidden lg:flex absolute left-[-52px] top-1/2 -translate-y-1/2 w-9 h-9 bg-black/30 border border-white/10 rounded-lg items-center justify-center text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white/90 transition-all cursor-pointer"
            onClick={goPrev}
            aria-label="Previous artist"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </button>
        )}
        {multipleArtists && canGoNext && (
          <button
            type="button"
            className="hidden lg:flex absolute right-[-52px] top-1/2 -translate-y-1/2 w-9 h-9 bg-black/30 border border-white/10 rounded-lg items-center justify-center text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white/90 transition-all cursor-pointer"
            onClick={goNext}
            aria-label="Next artist"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9,6 15,12 9,18" />
            </svg>
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
