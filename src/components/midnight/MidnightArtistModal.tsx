"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Artist } from "@/types/artists";

interface MidnightArtistModalProps {
  artist: Artist | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MidnightArtistModal({
  artist,
  isOpen,
  onClose,
}: MidnightArtistModalProps) {
  if (!artist) return null;

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
          {/* Artist header — image + name */}
          <div className="flex items-center gap-4 mb-4">
            {artist.image ? (
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
            )}
            <h3 className="font-[family-name:var(--font-sans)] text-lg max-[380px]:text-base font-bold tracking-[0.01em] text-foreground/90 leading-tight">
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

          {/* Instagram link */}
          {artist.instagram_handle && (
            <a
              href={`https://instagram.com/${artist.instagram_handle}`}
              target="_blank"
              rel="noopener noreferrer"
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
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
