"use client";

import { useState } from "react";
import { Play, Maximize2 } from "lucide-react";
import { getMuxThumbnailUrl } from "@/lib/mux";
import { cn } from "@/lib/utils";

interface MuxVideoPreviewProps {
  playbackId: string;
  onExpand: () => void;
}

/**
 * Animated thumbnail preview for Mux videos.
 * Uses Mux animated WebP — no video player init, zero jank.
 */
export function MuxVideoPreview({ playbackId, onExpand }: MuxVideoPreviewProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const animatedUrl = `https://image.mux.com/${playbackId}/animated.webp?width=320&fps=12&start=0&end=4`;
  const staticUrl = getMuxThumbnailUrl(playbackId);
  const [src, setSrc] = useState(animatedUrl);

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onLoad={() => setImgLoaded(true)}
        onError={() => {
          if (!imgLoaded && src === animatedUrl) {
            setSrc(staticUrl);
          } else {
            setImgError(true);
          }
        }}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-700 ease-out",
          imgLoaded ? "opacity-100" : "opacity-0"
        )}
      />

      {!imgLoaded && (
        <div className="absolute inset-0 bg-white/[0.04] animate-pulse rounded-2xl" />
      )}

      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="h-12 w-12 rounded-full bg-black/30 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg group-hover:scale-110 group-active:scale-95 transition-transform duration-200">
          <Play size={20} className="text-white ml-0.5" fill="currentColor" fillOpacity={0.9} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-1.5 pb-3 pt-10 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
        <span className="text-[11px] font-medium text-white/70 tracking-wide">Tap to watch</span>
      </div>
    </button>
  );
}
