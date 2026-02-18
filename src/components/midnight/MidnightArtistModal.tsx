"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { isMuxPlaybackId, getMuxThumbnailUrl } from "@/lib/mux";
import type { Artist } from "@/types/artists";

// One-shot swipe hint — shows once per session
let hasShownEdgeHint = false;

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

type SwipePhase = "idle" | "dragging" | "snapping" | "pre-exit" | "exiting" | "hint-out" | "hint-back" | "crossfade-out" | "crossfade-in";

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
  const [videoReady, setVideoReady] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoWrapperRef = useRef<HTMLDivElement>(null);

  // Synchronous reset — ensures thumbnail overlay is visible on the FIRST
  // render with a new artist (before paint). No flash of stale state.
  const lastArtistIdRef = useRef(artist?.id);
  if (artist?.id !== lastArtistIdRef.current) {
    lastArtistIdRef.current = artist?.id;
    if (videoReady) setVideoReady(false);
  }

  // ── Swipe state ──
  const [phase, setPhase] = useState<SwipePhase>("idle");
  const [dragOffset, setDragOffset] = useState(0);
  const [exitDir, setExitDir] = useState<"left" | "right">("left");
  const pendingRef = useRef<number | null>(null);
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lockRef = useRef<"h" | "v" | null>(null);
  const fromSwipeRef = useRef(false);

  // Callback ref — guarantees touch listener attaches after Radix portal mount
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < artists.length - 1;
  const multi = artists.length > 1;
  const CARD_W = 380;
  const GAP = 20;

  // ── Preload next artist's video after current settles ──
  const [preloadNext, setPreloadNext] = useState(false);
  const nextArtist = canGoNext ? artists[currentIndex + 1] : null;
  const nextHasMuxVideo = !!nextArtist?.video_url && isMuxPlaybackId(nextArtist.video_url);

  useEffect(() => {
    setPreloadNext(false);
    if (!isOpen || !nextHasMuxVideo || phase !== "idle") return;
    // Wait for current video to start loading before preloading next
    const t = setTimeout(() => setPreloadNext(true), 2500);
    return () => clearTimeout(t);
  }, [isOpen, nextHasMuxVideo, phase, currentIndex]);

  // ── Reset on artist change / modal close ──
  useEffect(() => {
    if (!isOpen) {
      setPhase("idle");
      setDragOffset(0);
      touchRef.current = null;
      lockRef.current = null;
      pendingRef.current = null;
      return;
    }
    setVideoError(false);
    setIsMuted(true);
  }, [artist?.id, isOpen]);

  // ── Swipe hint — physically nudge card left to show next artist peeking ──
  // Desktop has visible arrow buttons, so hint is mobile-only.
  useEffect(() => {
    const isTouch = typeof window !== "undefined" && "ontouchstart" in window;
    if (isTouch && isOpen && multi && canGoNext && !hasShownEdgeHint && phase === "idle") {
      hasShownEdgeHint = true;
      // Delay until open animation settles
      const t = setTimeout(() => {
        setDragOffset(-50);
        setPhase("hint-out");
      }, 600);
      // Safety: return to idle even if transitionEnd doesn't fire (reduced-motion)
      const safety = setTimeout(() => {
        setPhase(p => (p === "hint-out" || p === "hint-back") ? "idle" : p);
        setDragOffset(d => d !== 0 ? 0 : d);
      }, 3000);
      return () => { clearTimeout(t); clearTimeout(safety); };
    }
  }, [isOpen, multi, canGoNext, phase]);

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
      interval = setInterval(() => {
        if (setup()) clearInterval(interval);
      }, 200);
    }
    return () => {
      clearInterval(interval);
      if (el) el.removeEventListener("volumechange", handleVol);
    };
  }, [isOpen, artist?.id, artist?.video_url]);

  const toggleMute = useCallback(() => {
    const mux = videoWrapperRef.current?.querySelector(
      "mux-player"
    ) as unknown as HTMLMediaElement | null;
    if (mux) {
      mux.muted = !mux.muted;
      setIsMuted(mux.muted);
    }
    const vid = videoWrapperRef.current?.querySelector("video");
    if (vid) {
      vid.muted = !vid.muted;
      setIsMuted(vid.muted);
    }
  }, []);

  // ── Navigation (button/keyboard) ──
  // Desktop: quick crossfade (no sliding — arrows provide context).
  // Mobile: slide animation via pre-exit → exiting.
  const navigateTo = useCallback(
    (idx: number, dir: "left" | "right") => {
      if (idx < 0 || idx >= artists.length || phase !== "idle") return;
      pendingRef.current = idx;

      const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
      if (isDesktop) {
        setPhase("crossfade-out");
        return;
      }

      fromSwipeRef.current = false;
      setExitDir(dir);
      setPhase("pre-exit");
    },
    [artists.length, phase]
  );

  // Swipe-triggered navigation (skip pre-exit — cards already at drag positions)
  // Uses faster transition since user's finger already moved the card partway.
  const navigateFromSwipe = useCallback(
    (idx: number, dir: "left" | "right") => {
      if (idx < 0 || idx >= artists.length) return;
      pendingRef.current = idx;
      fromSwipeRef.current = true;
      setExitDir(dir);
      setPhase("exiting");
    },
    [artists.length]
  );

  const goPrev = useCallback(
    () => canGoPrev && navigateTo(currentIndex - 1, "right"),
    [canGoPrev, currentIndex, navigateTo]
  );
  const goNext = useCallback(
    () => canGoNext && navigateTo(currentIndex + 1, "left"),
    [canGoNext, currentIndex, navigateTo]
  );

  // ── Pre-exit → exiting (2-frame setup for mobile slide nav) ──
  useEffect(() => {
    if (phase !== "pre-exit") return;
    const id = requestAnimationFrame(() => setPhase("exiting"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  // ── Crossfade safety (reduced-motion kills transitions → transitionEnd won't fire) ──
  useEffect(() => {
    if (phase !== "crossfade-out") return;
    const t = setTimeout(() => {
      if (pendingRef.current !== null) {
        onNavigate(pendingRef.current);
        pendingRef.current = null;
      }
      setPhase("idle");
    }, 300);
    return () => clearTimeout(t);
  }, [phase, onNavigate]);

  // ── Transition end → commit navigation ──
  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.target !== e.currentTarget) return;

      // Crossfade: listen for opacity transitions (desktop nav)
      if (e.propertyName === "opacity") {
        if (phase === "crossfade-out" && pendingRef.current !== null) {
          onNavigate(pendingRef.current);
          pendingRef.current = null;
          setPhase("crossfade-in");
        } else if (phase === "crossfade-in") {
          setPhase("idle");
        }
        return;
      }

      // Slide: listen for transform transitions (mobile swipe)
      if (e.propertyName !== "transform") return;
      if (phase === "exiting" && pendingRef.current !== null) {
        onNavigate(pendingRef.current);
        pendingRef.current = null;
        setPhase("idle");
        setDragOffset(0);
      } else if (phase === "snapping") {
        setPhase("idle");
      } else if (phase === "hint-out") {
        setTimeout(() => {
          setDragOffset(0);
          setPhase("hint-back");
        }, 250);
      } else if (phase === "hint-back") {
        setPhase("idle");
      }
    },
    [phase, onNavigate]
  );

  // ── Touch start (React event — captures start position) ──
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (phase !== "idle" || !multi) return;
      const t = e.touches[0];
      touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      lockRef.current = null;
    },
    [phase, multi]
  );

  // ── Touch move — NATIVE listener with passive:false for preventDefault ──
  // Uses cardEl (state-based callback ref) to guarantee attachment after portal mount.
  // React synthetic touch events are passive by default and can't call preventDefault.
  useEffect(() => {
    if (!cardEl || !isOpen || !multi) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - touchRef.current.x;
      const dy = t.clientY - touchRef.current.y;

      if (!lockRef.current) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        lockRef.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (lockRef.current === "h") setPhase("dragging");
      }
      if (lockRef.current !== "h") return;

      e.preventDefault(); // Block scroll for horizontal swipe

      const atEdge = (dx > 0 && !canGoPrev) || (dx < 0 && !canGoNext);
      setDragOffset(atEdge ? dx * 0.3 : dx);
    };

    cardEl.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => cardEl.removeEventListener("touchmove", handleTouchMove);
  }, [cardEl, isOpen, multi, canGoPrev, canGoNext]);

  // ── Touch end ──
  const onTouchEnd = useCallback(() => {
    if (!touchRef.current || lockRef.current !== "h") {
      touchRef.current = null;
      lockRef.current = null;
      if (phase === "dragging") {
        setPhase("snapping");
        setDragOffset(0);
      }
      return;
    }

    const dx = dragOffset;
    const elapsed = Date.now() - touchRef.current.t;
    const velocity = Math.abs(dx) / elapsed;
    touchRef.current = null;
    lockRef.current = null;

    const past = Math.abs(dx) > CARD_W * 0.25;
    const flick = velocity > 0.25;

    if ((past || flick) && dx < 0 && canGoNext) {
      navigateFromSwipe(currentIndex + 1, "left");
    } else if ((past || flick) && dx > 0 && canGoPrev) {
      navigateFromSwipe(currentIndex - 1, "right");
    } else {
      setPhase("snapping");
      setDragOffset(0);
    }
  }, [
    dragOffset,
    canGoNext,
    canGoPrev,
    currentIndex,
    navigateFromSwipe,
    phase,
  ]);

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
  let adjArtist: Artist | null = null;
  let adjIdx: number | null = null;

  if (phase === "pre-exit" || phase === "exiting") {
    adjIdx = pendingRef.current;
    adjArtist = adjIdx !== null ? (artists[adjIdx] ?? null) : null;
  } else if (phase === "dragging") {
    if (dragOffset < 0 && canGoNext) {
      adjIdx = currentIndex + 1;
      adjArtist = artists[adjIdx];
    } else if (dragOffset > 0 && canGoPrev) {
      adjIdx = currentIndex - 1;
      adjArtist = artists[adjIdx];
    }
  } else if (phase === "hint-out" || phase === "hint-back") {
    adjIdx = currentIndex + 1;
    adjArtist = artists[adjIdx] ?? null;
  }

  // Current card position — no opacity fade, just slide (like iOS)
  let currentX = 0;

  if (phase === "dragging") {
    currentX = dragOffset;
  } else if (phase === "snapping") {
    currentX = 0;
  } else if (phase === "pre-exit") {
    currentX = 0;
  } else if (phase === "exiting") {
    currentX = exitDir === "left" ? -(CARD_W + GAP) : CARD_W + GAP;
  } else if (phase === "hint-out") {
    currentX = dragOffset; // -50
  }

  // Adjacent card position
  let adjX = 0;
  if (phase === "dragging") {
    adjX =
      dragOffset < 0
        ? CARD_W + GAP + dragOffset
        : -(CARD_W + GAP) + dragOffset;
  } else if (phase === "pre-exit") {
    adjX = exitDir === "left" ? CARD_W + GAP : -(CARD_W + GAP);
  } else if (phase === "exiting") {
    adjX = 0;
  } else if (phase === "hint-out") {
    adjX = CARD_W + GAP + dragOffset; // peeks in from right
  } else if (phase === "hint-back") {
    adjX = CARD_W + GAP; // slides back off-screen right
  }

  // Transition class
  let txClass = "";
  if (phase === "dragging") txClass = "midnight-artist-dragging";
  else if (phase === "exiting") txClass = fromSwipeRef.current ? "midnight-artist-swipe-fast" : "midnight-artist-swipe";
  else if (phase === "snapping") txClass = "midnight-artist-snapback";
  else if (phase === "hint-out") txClass = "midnight-artist-hint";
  else if (phase === "hint-back") txClass = "midnight-artist-snapback";
  else if (phase === "crossfade-out" || phase === "crossfade-in") txClass = "midnight-artist-crossfade";

  // Card opacity — only used for desktop crossfade (mobile uses transform only)
  const cardOpacity = phase === "crossfade-out" ? 0 : 1;

  const showAdj =
    adjArtist !== null &&
    (phase === "dragging" || phase === "pre-exit" || phase === "exiting" || phase === "hint-out" || phase === "hint-back");

  if (!artist) return null;

  const hasVideo = !!artist.video_url;
  const hasMuxVideo = hasVideo && isMuxPlaybackId(artist.video_url!);
  const adjHasVideo = !!adjArtist?.video_url;
  const adjIsMux =
    adjHasVideo && isMuxPlaybackId(adjArtist!.video_url!);
  const adjThumbnail = adjIsMux
    ? getMuxThumbnailUrl(adjArtist!.video_url!)
    : null;

  // Shared card visual treatment — constant shadow (no pop between states)
  const cardVisual =
    "w-full rounded-2xl overflow-hidden border border-white/[0.08]";
  const cardBg = "#0d0d0d";
  const cardShadow =
    "0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02)";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-theme="midnight"
        className="midnight-artist-dialog p-0 gap-0"
      >
        <DialogTitle className="sr-only">{artist.name}</DialogTitle>
        <DialogDescription className="sr-only">
          Artist profile for {artist.name}
        </DialogDescription>

        {/* Positioning wrapper for cards + desktop chevrons */}
        <div className="relative max-w-[380px] w-full mx-auto">
          {/* ═══ CURRENT CARD — full visual card that moves on swipe ═══ */}
          <div
            ref={setCardEl}
            className={`${cardVisual} ${txClass} relative`}
            style={{
              transform: `translateX(${currentX}px)`,
              opacity: cardOpacity,
              willChange: "transform",
              background: cardBg,
              touchAction: "pan-y",
              boxShadow: cardShadow,
            }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTransitionEnd={handleTransitionEnd}
          >
            {/* Close button (custom — Radix default is hidden via CSS) */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 z-30 w-9 h-9 flex items-center justify-center rounded-[10px] bg-white/[0.06] border border-white/[0.10] hover:bg-white/[0.12] hover:border-white/[0.20] transition-all cursor-pointer"
              aria-label="Close"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white/70"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="px-6 pt-7 pb-5 max-[380px]:px-5 max-[380px]:pt-6 max-[380px]:pb-4">
              {/* ── Video section ── */}
              {hasVideo && !videoError && (
                <div className="mb-5" ref={videoWrapperRef}>
                  <div
                    className="relative rounded-2xl overflow-hidden border border-foreground/[0.10] shadow-[0_0_30px_rgba(255,255,255,0.03),inset_0_1px_0_rgba(255,255,255,0.06)]"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
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
                          onError={() => setVideoError(true)}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          {...({
                            autoPlay: "any",
                            onPlaying: () => setVideoReady(true),
                            style: {
                              width: "100%",
                              height: "100%",
                              position: "absolute",
                              inset: 0,
                              "--controls": "none",
                              "--media-object-fit": "cover",
                              "--media-object-position": "center",
                            },
                          } as any)}
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
                          onPlaying={() => setVideoReady(true)}
                          onError={() => setVideoError(true)}
                        />
                      )}

                      {/* Thumbnail overlay — masks MuxPlayer initialization jank.
                          Shows the exact first frame (time=0) on top of the player.
                          Fades out only when the video is genuinely playing. */}
                      {hasMuxVideo && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={getMuxThumbnailUrl(artist.video_url!)}
                          alt=""
                          className={`absolute inset-0 w-full h-full object-cover z-[5] transition-opacity duration-300 ${
                            videoReady ? "opacity-0 pointer-events-none" : "opacity-100"
                          }`}
                        />
                      )}

                      {/* ── Mute toggle ── */}
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="absolute bottom-3 right-3 z-20 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 backdrop-blur-md bg-black/35 border border-white/[0.10] hover:bg-black/55 hover:border-white/[0.18] active:scale-[0.92] touch-manipulation"
                        aria-label={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-white/75"
                          >
                            <path d="M11 5L6 9H2v6h4l5 4V5z" />
                            <line x1="23" y1="9" x2="17" y2="15" />
                            <line x1="17" y1="9" x2="23" y2="15" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-white/75"
                          >
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
                  </div>
                </div>
              )}

              {/* ── Artist identity ── */}
              <div
                className={`flex items-center gap-3 ${hasVideo ? "mb-3" : "mb-4"}`}
              >
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
                  <div
                    className={`rounded-full bg-foreground/[0.05] border border-foreground/[0.08] flex items-center justify-center shrink-0 ${
                      hasVideo
                        ? "w-9 h-9"
                        : "w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16"
                    }`}
                  >
                    <span
                      className={`font-[family-name:var(--font-sans)] font-bold text-foreground/30 ${
                        hasVideo ? "text-xs" : "text-xl"
                      }`}
                    >
                      {artist.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <h3
                  className={`font-[family-name:var(--font-sans)] font-bold tracking-[0.01em] text-foreground/90 leading-tight ${
                    hasVideo
                      ? "text-[15px]"
                      : "text-lg max-[380px]:text-base"
                  }`}
                >
                  {artist.name}
                </h3>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent mb-4" />

              {/* Bio — line-clamp on mobile, full on desktop. No scrollbar. */}
              {artist.description && (
                <p className="font-[family-name:var(--font-sans)] text-[13px] max-[380px]:text-[12px] leading-relaxed text-foreground/60 line-clamp-5 lg:line-clamp-none">
                  {artist.description}
                </p>
              )}

              {/* Instagram handle */}
              {artist.instagram_handle && (
                <a
                  href={`https://instagram.com/${artist.instagram_handle.replace("@", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 font-[family-name:var(--font-sans)] text-[12px] text-foreground/40 hover:text-foreground/60 transition-colors"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                  </svg>
                  @{artist.instagram_handle.replace("@", "")}
                </a>
              )}

              {/* ── Counter + inline nav arrows ── */}
              {multi && (
                <div className="flex items-center justify-center gap-3 pt-5">
                  <button
                    type="button"
                    onClick={goPrev}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all touch-manipulation ${
                      canGoPrev
                        ? "bg-white/[0.06] border border-white/[0.10] text-white/50 hover:bg-white/[0.10] hover:text-white/70 cursor-pointer active:scale-90"
                        : "text-white/[0.08] cursor-default"
                    }`}
                    disabled={!canGoPrev}
                    aria-label="Previous artist"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="15,18 9,12 15,6" />
                    </svg>
                  </button>

                  <span className="font-[family-name:var(--font-sans)] text-[11px] text-white/25 tracking-[0.12em] tabular-nums min-w-[3ch] text-center select-none">
                    {currentIndex + 1} / {artists.length}
                  </span>

                  <button
                    type="button"
                    onClick={goNext}
                    className={`w-7 h-7 rounded-full flex items-center justify-center touch-manipulation ${
                      canGoNext
                        ? "bg-white/[0.06] border border-white/[0.10] text-white/50 hover:bg-white/[0.10] hover:text-white/70 cursor-pointer active:scale-90"
                        : "text-white/[0.08] cursor-default"
                    } transition-all`}
                    disabled={!canGoNext}
                    aria-label="Next artist"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9,6 15,12 9,18" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* ═══ ADJACENT CARD — preview that slides in during drag/transition ═══ */}
          {showAdj && adjArtist && (
            <div
              className={`absolute top-0 left-0 ${cardVisual} ${txClass} pointer-events-none`}
              style={{
                transform: `translateX(${adjX}px)`,
                willChange: "transform",
                background: cardBg,
                boxShadow: cardShadow,
              }}
            >
              <div className="px-6 pt-7 pb-5 max-[380px]:px-5 max-[380px]:pt-6 max-[380px]:pb-4">
                {/* Video placeholder — matches current card's glass frame treatment */}
                {adjHasVideo && (
                  <div className="mb-5">
                    <div
                      className="relative rounded-2xl overflow-hidden border border-foreground/[0.10] shadow-[0_0_30px_rgba(255,255,255,0.03),inset_0_1px_0_rgba(255,255,255,0.06)]"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                      }}
                    >
                      <div
                        className="relative w-full"
                        style={{ aspectRatio: "4 / 5", maxHeight: "320px" }}
                      >
                        {adjThumbnail ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={adjThumbnail}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : adjArtist.image ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={adjArtist.image}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover opacity-60"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-foreground/[0.03]" />
                        )}
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent pointer-events-none z-10" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Identity */}
                <div
                  className={`flex items-center gap-3 ${adjHasVideo ? "mb-3" : "mb-4"}`}
                >
                  {adjArtist.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={adjArtist.image}
                      alt={adjArtist.name}
                      className={`rounded-full object-cover border border-foreground/[0.08] shrink-0 ${
                        adjHasVideo
                          ? "w-9 h-9"
                          : "w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16"
                      }`}
                    />
                  ) : (
                    <div
                      className={`rounded-full bg-foreground/[0.05] border border-foreground/[0.08] flex items-center justify-center shrink-0 ${
                        adjHasVideo
                          ? "w-9 h-9"
                          : "w-[72px] h-[72px] max-[380px]:w-16 max-[380px]:h-16"
                      }`}
                    >
                      <span
                        className={`font-[family-name:var(--font-sans)] font-bold text-foreground/30 ${
                          adjHasVideo ? "text-xs" : "text-xl"
                        }`}
                      >
                        {adjArtist.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <h3
                    className={`font-[family-name:var(--font-sans)] font-bold tracking-[0.01em] text-foreground/90 leading-tight ${
                      adjHasVideo
                        ? "text-[15px]"
                        : "text-lg max-[380px]:text-base"
                    }`}
                  >
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
                  <div className="flex items-center justify-center gap-3 pt-5">
                    <div className="w-7 h-7" />
                    <span className="font-[family-name:var(--font-sans)] text-[11px] text-white/25 tracking-[0.12em] tabular-nums min-w-[3ch] text-center select-none">
                      {adjIdx + 1} / {artists.length}
                    </span>
                    <div className="w-7 h-7" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Desktop chevron buttons (outside card) ── */}
          {multi && canGoPrev && (
            <button
              type="button"
              className="hidden lg:flex absolute left-[-52px] top-1/2 -translate-y-1/2 w-9 h-9 bg-black/30 border border-white/10 rounded-lg items-center justify-center text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white/90 transition-all cursor-pointer"
              onClick={goPrev}
              aria-label="Previous artist"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </button>
          )}
          {multi && canGoNext && (
            <button
              type="button"
              className="hidden lg:flex absolute right-[-52px] top-1/2 -translate-y-1/2 w-9 h-9 bg-black/30 border border-white/10 rounded-lg items-center justify-center text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white/90 transition-all cursor-pointer"
              onClick={goNext}
              aria-label="Next artist"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9,6 15,12 9,18" />
              </svg>
            </button>
          )}

          {/* Hidden preloader — buffers next artist's video while viewing current */}
          {preloadNext && nextArtist && nextHasMuxVideo && (
            <div
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: "none" as const }}
              aria-hidden="true"
            >
              <MuxPlayer
                playbackId={nextArtist.video_url!}
                streamType="on-demand"
                preload="auto"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                {...({
                  autoPlay: false,
                  muted: true,
                  style: { width: 1, height: 1 },
                  "--controls": "none",
                } as any)}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
