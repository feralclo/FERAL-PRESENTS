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

interface MidnightArtistModalProps {
  artists: Artist[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

type SwipeState = "idle" | "dragging" | "snapping" | "pre-exit" | "exiting";

export function MidnightArtistModal({
  artists,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
}: MidnightArtistModalProps) {
  const artist = artists[currentIndex] ?? null;

  // ── Video state ──
  const [videoError, setVideoError] = useState(false);
  const [showNameOverlay, setShowNameOverlay] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const nameOverlayTimeout = useRef<NodeJS.Timeout>(undefined);
  const videoWrapperRef = useRef<HTMLDivElement>(null);

  // ── Swipe state ──
  const [swipeState, setSwipeState] = useState<SwipeState>("idle");
  const [dragOffset, setDragOffset] = useState(0);
  const [exitDir, setExitDir] = useState<"left" | "right">("left");
  const pendingRef = useRef<number | null>(null);
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lockRef = useRef<"h" | "v" | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < artists.length - 1;
  const multi = artists.length > 1;
  const getW = () => viewportRef.current?.offsetWidth || 380;
  const GAP = 20;

  // ── Reset on artist change / modal close ──
  useEffect(() => {
    if (!isOpen) {
      setShowNameOverlay(false);
      setSwipeState("idle");
      setDragOffset(0);
      touchRef.current = null;
      lockRef.current = null;
      pendingRef.current = null;
      return;
    }
    setVideoError(false);
    setIsMuted(true);
  }, [artist?.id, isOpen]);

  // ── Video sync (MuxPlayer muted state) ──
  useEffect(() => {
    if (!isOpen || !artist?.video_url) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    let el: HTMLElement | null = null;
    const handleVol = () => {
      if (el) setIsMuted((el as unknown as HTMLMediaElement).muted ?? true);
    };
    const setup = (): boolean => {
      el = videoWrapperRef.current?.querySelector("mux-player") ?? null;
      if (!el) return false;
      setIsMuted((el as unknown as HTMLMediaElement).muted ?? true);
      el.addEventListener("volumechange", handleVol);
      return true;
    };
    if (!setup()) {
      interval = setInterval(() => { if (setup()) clearInterval(interval); }, 200);
    }
    return () => {
      clearInterval(interval);
      if (el) el.removeEventListener("volumechange", handleVol);
    };
  }, [isOpen, artist?.id, artist?.video_url]);

  const handlePlay = useCallback(() => {
    setShowNameOverlay(true);
    if (nameOverlayTimeout.current) clearTimeout(nameOverlayTimeout.current);
    nameOverlayTimeout.current = setTimeout(() => setShowNameOverlay(false), 3000);
  }, []);

  useEffect(() => () => {
    if (nameOverlayTimeout.current) clearTimeout(nameOverlayTimeout.current);
  }, []);

  const toggleMute = useCallback(() => {
    const mux = videoWrapperRef.current?.querySelector("mux-player") as unknown as HTMLMediaElement | null;
    if (mux) { mux.muted = !mux.muted; setIsMuted(mux.muted); }
    const vid = videoWrapperRef.current?.querySelector("video");
    if (vid) { vid.muted = !vid.muted; setIsMuted(vid.muted); }
  }, []);

  // ── Navigation (button/keyboard-triggered — uses pre-exit for 2-frame setup) ──
  const navigateTo = useCallback((idx: number, dir: "left" | "right") => {
    if (idx < 0 || idx >= artists.length || swipeState !== "idle") return;
    pendingRef.current = idx;
    setExitDir(dir);
    setSwipeState("pre-exit");
  }, [artists.length, swipeState]);

  // Swipe-triggered navigation (skip pre-exit, already at drag positions)
  const navigateFromSwipe = useCallback((idx: number, dir: "left" | "right") => {
    if (idx < 0 || idx >= artists.length) return;
    pendingRef.current = idx;
    setExitDir(dir);
    setSwipeState("exiting");
  }, [artists.length]);

  const goPrev = useCallback(() => canGoPrev && navigateTo(currentIndex - 1, "right"), [canGoPrev, currentIndex, navigateTo]);
  const goNext = useCallback(() => canGoNext && navigateTo(currentIndex + 1, "left"), [canGoNext, currentIndex, navigateTo]);

  // ── Pre-exit → exiting (2-frame setup for button nav) ──
  useEffect(() => {
    if (swipeState !== "pre-exit") return;
    const id = requestAnimationFrame(() => setSwipeState("exiting"));
    return () => cancelAnimationFrame(id);
  }, [swipeState]);

  // ── Transition end → commit navigation ──
  const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
    if (e.propertyName !== "transform" || e.target !== e.currentTarget) return;
    if (swipeState === "exiting" && pendingRef.current !== null) {
      onNavigate(pendingRef.current);
      pendingRef.current = null;
      setSwipeState("idle");
      setDragOffset(0);
    } else if (swipeState === "snapping") {
      setSwipeState("idle");
    }
  }, [swipeState, onNavigate]);

  // ── Touch handlers (React events — works immediately, no portal timing issues) ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (swipeState !== "idle" || !multi) return;
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    lockRef.current = null;
  }, [swipeState, multi]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;

    if (!lockRef.current) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      lockRef.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (lockRef.current === "h") setSwipeState("dragging");
    }
    if (lockRef.current !== "h") return;

    const atEdge = (dx > 0 && !canGoPrev) || (dx < 0 && !canGoNext);
    setDragOffset(atEdge ? dx * 0.3 : dx);
  }, [canGoPrev, canGoNext]);

  const onTouchEnd = useCallback(() => {
    if (!touchRef.current || lockRef.current !== "h") {
      touchRef.current = null;
      lockRef.current = null;
      if (swipeState === "dragging") {
        setSwipeState("snapping");
        setDragOffset(0);
      }
      return;
    }

    const dx = dragOffset;
    const elapsed = Date.now() - touchRef.current.t;
    const velocity = Math.abs(dx) / elapsed;
    touchRef.current = null;
    lockRef.current = null;

    const w = getW();
    const past = Math.abs(dx) > w * 0.35;
    const flick = velocity > 0.3;

    if ((past || flick) && dx < 0 && canGoNext) {
      navigateFromSwipe(currentIndex + 1, "left");
    } else if ((past || flick) && dx > 0 && canGoPrev) {
      navigateFromSwipe(currentIndex - 1, "right");
    } else {
      setSwipeState("snapping");
      setDragOffset(0);
    }
  }, [dragOffset, canGoNext, canGoPrev, currentIndex, navigateFromSwipe, swipeState]);

  // ── Keyboard ──
  useEffect(() => {
    if (!isOpen || !multi) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, multi, goPrev, goNext]);

  // ── Position calculations ──
  const w = getW();

  // Which adjacent artist to show during drag/transition
  let adjArtist: Artist | null = null;
  let adjIdx: number | null = null;

  if (swipeState === "pre-exit" || swipeState === "exiting") {
    adjIdx = pendingRef.current;
    adjArtist = adjIdx !== null ? artists[adjIdx] ?? null : null;
  } else if (swipeState === "dragging") {
    if (dragOffset < 0 && canGoNext) {
      adjIdx = currentIndex + 1;
      adjArtist = artists[adjIdx];
    } else if (dragOffset > 0 && canGoPrev) {
      adjIdx = currentIndex - 1;
      adjArtist = artists[adjIdx];
    }
  }

  // Current card position
  let currentX = 0;
  let currentOpacity = 1;

  if (swipeState === "dragging") {
    currentX = dragOffset;
    const atEdge = (dragOffset > 0 && !canGoPrev) || (dragOffset < 0 && !canGoNext);
    currentOpacity = 1 - (Math.abs(dragOffset) / w) * (atEdge ? 0.4 : 0.15);
  } else if (swipeState === "snapping") {
    currentX = 0;
  } else if (swipeState === "pre-exit") {
    currentX = 0; // setup frame — stay at current position
  } else if (swipeState === "exiting") {
    currentX = exitDir === "left" ? -(w + GAP) : (w + GAP);
    currentOpacity = 0;
  }

  // Adjacent card position
  let adjX = 0;
  if (swipeState === "dragging") {
    adjX = dragOffset < 0 ? w + GAP + dragOffset : -(w + GAP) + dragOffset;
  } else if (swipeState === "pre-exit") {
    adjX = exitDir === "left" ? (w + GAP) : -(w + GAP); // setup: off-screen
  } else if (swipeState === "exiting") {
    adjX = 0; // animate to center
  }

  // Transition classes
  let txClass = "";
  if (swipeState === "dragging") txClass = "midnight-artist-dragging";
  else if (swipeState === "exiting") txClass = "midnight-artist-swipe";
  else if (swipeState === "snapping") txClass = "midnight-artist-snapback";
  // pre-exit: no transition class (setup frame, positions applied instantly)

  const showAdj = adjArtist !== null && (swipeState === "dragging" || swipeState === "pre-exit" || swipeState === "exiting");

  if (!artist) return null;

  const hasVideo = !!artist.video_url;
  const hasMuxVideo = hasVideo && isMuxPlaybackId(artist.video_url!);
  const adjHasVideo = !!adjArtist?.video_url;

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

        {/* Carousel viewport — clips the off-screen adjacent card */}
        <div ref={viewportRef} className="relative overflow-hidden">

          {/* ── Current card (full content with video) ── */}
          <div
            className={txClass}
            style={{
              transform: `translateX(${currentX}px)`,
              opacity: currentOpacity,
              touchAction: "pan-y",
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTransitionEnd={handleTransitionEnd}
          >
            <div className="px-6 pt-7 pb-6 max-[380px]:px-5 max-[380px]:pt-6 max-[380px]:pb-5">
              {/* ── Video section ── */}
              {hasVideo && !videoError && (
                <div className="mb-5" ref={videoWrapperRef}>
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

                      {/* ── Premium name reveal ── */}
                      <div
                        className={`absolute inset-0 flex items-center justify-center pointer-events-none z-10 transition-opacity duration-500 ${
                          showNameOverlay ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        <div
                          className="absolute inset-0 transition-opacity duration-1000"
                          style={{
                            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 50%, transparent 75%)",
                            opacity: showNameOverlay ? 1 : 0,
                          }}
                        />
                        <div className="relative flex flex-col items-center gap-3">
                          <div
                            className={`h-px bg-gradient-to-r from-transparent via-white/50 to-transparent transition-all ease-[cubic-bezier(0.16,1,0.3,1)] ${
                              showNameOverlay ? "w-14 opacity-100 duration-700" : "w-0 opacity-0 duration-300"
                            }`}
                          />
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
                          <div
                            className={`h-px bg-gradient-to-r from-transparent via-white/50 to-transparent transition-all ease-[cubic-bezier(0.16,1,0.3,1)] ${
                              showNameOverlay ? "w-14 opacity-100 duration-700 delay-75" : "w-0 opacity-0 duration-300"
                            }`}
                          />
                        </div>
                      </div>

                      {/* ── Mute toggle ── */}
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

                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent pointer-events-none z-10" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Video error fallback ── */}
              {hasVideo && videoError && (
                <div className="mb-5">
                  <div
                    className="relative rounded-2xl overflow-hidden border border-foreground/[0.10]"
                    style={{ aspectRatio: "4 / 5", maxHeight: "320px" }}
                  >
                    {artist.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={artist.image} alt="" className="absolute inset-0 w-full h-full object-cover brightness-[0.3]" />
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

              {/* ── Artist identity ── */}
              <div className={`flex items-center gap-3 ${hasVideo ? "mb-3" : "mb-4"}`}>
                {artist.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={artist.image}
                    alt={artist.name}
                    className={`rounded-full object-cover border border-foreground/[0.08] shrink-0 ${
                      hasVideo ? "w-9 h-9" : "w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16"
                    }`}
                  />
                ) : (
                  <div className={`rounded-full bg-foreground/[0.05] border border-foreground/[0.08] flex items-center justify-center shrink-0 ${
                    hasVideo ? "w-9 h-9" : "w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16"
                  }`}>
                    <span className={`font-[family-name:var(--font-sans)] font-bold text-foreground/30 ${hasVideo ? "text-xs" : "text-xl"}`}>
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

              <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent mb-4" />

              {/* Bio */}
              {artist.description && (
                <div className="max-h-[120px] overflow-y-auto midnight-artist-bio">
                  <p className="font-[family-name:var(--font-sans)] text-[13px] max-[380px]:text-[12px] leading-relaxed text-foreground/60">
                    {artist.description}
                  </p>
                </div>
              )}

              {/* Counter */}
              {multi && (
                <div className="flex justify-center pt-4">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] text-foreground/25 tracking-[0.15em]">
                    {currentIndex + 1} / {artists.length}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Adjacent card (carousel peek — slides in during drag/transition) ── */}
          {showAdj && adjArtist && (
            <div
              className={`absolute top-0 left-0 w-full pointer-events-none ${txClass}`}
              style={{ transform: `translateX(${adjX}px)` }}
            >
              <div className="px-6 pt-7 pb-6 max-[380px]:px-5 max-[380px]:pt-6 max-[380px]:pb-5">
                {/* Video placeholder (static image, not a player) */}
                {adjHasVideo && (
                  <div className="mb-5">
                    <div
                      className="relative rounded-2xl overflow-hidden border border-foreground/[0.10]"
                      style={{
                        aspectRatio: "4 / 5",
                        maxHeight: "320px",
                        background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                      }}
                    >
                      {adjArtist.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={adjArtist.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                      ) : (
                        <div className="absolute inset-0 bg-foreground/[0.03]" />
                      )}
                    </div>
                  </div>
                )}

                {/* Identity */}
                <div className={`flex items-center gap-3 ${adjHasVideo ? "mb-3" : "mb-4"}`}>
                  {adjArtist.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={adjArtist.image}
                      alt={adjArtist.name}
                      className={`rounded-full object-cover border border-foreground/[0.08] shrink-0 ${
                        adjHasVideo ? "w-9 h-9" : "w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16"
                      }`}
                    />
                  ) : (
                    <div className={`rounded-full bg-foreground/[0.05] border border-foreground/[0.08] flex items-center justify-center shrink-0 ${
                      adjHasVideo ? "w-9 h-9" : "w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16"
                    }`}>
                      <span className={`font-[family-name:var(--font-sans)] font-bold text-foreground/30 ${adjHasVideo ? "text-xs" : "text-xl"}`}>
                        {adjArtist.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <h3 className={`font-[family-name:var(--font-sans)] font-bold tracking-[0.01em] text-foreground/90 leading-tight ${
                    adjHasVideo ? "text-[15px]" : "text-lg max-[380px]:text-base"
                  }`}>
                    {adjArtist.name}
                  </h3>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent mb-4" />

                {adjArtist.description && (
                  <p className="font-[family-name:var(--font-sans)] text-[13px] max-[380px]:text-[12px] leading-relaxed text-foreground/60 line-clamp-5">
                    {adjArtist.description}
                  </p>
                )}

                {multi && adjIdx !== null && (
                  <div className="flex justify-center pt-4">
                    <span className="font-[family-name:var(--font-mono)] text-[10px] text-foreground/25 tracking-[0.15em]">
                      {adjIdx + 1} / {artists.length}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Navigation arrows (all devices) ── */}
          {multi && canGoPrev && (
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full flex items-center justify-center bg-black/40 border border-white/[0.10] text-white/50 hover:bg-black/60 hover:text-white/80 active:scale-[0.92] transition-all cursor-pointer touch-manipulation"
              onClick={goPrev}
              aria-label="Previous artist"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </button>
          )}
          {multi && canGoNext && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full flex items-center justify-center bg-black/40 border border-white/[0.10] text-white/50 hover:bg-black/60 hover:text-white/80 active:scale-[0.92] transition-all cursor-pointer touch-manipulation"
              onClick={goNext}
              aria-label="Next artist"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9,6 15,12 9,18" />
              </svg>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
