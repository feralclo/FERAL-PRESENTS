"use client";

import Link from "next/link";
import { ArrowUpRight, Users, UserPlus, ImageOff } from "lucide-react";

export interface PromoterSummary {
  handle: string;
  display_name: string;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  accent_hex: number;
  avatar_url: string | null;
  avatar_initials: string | null;
  avatar_bg_hex: number | null;
  cover_image_url: string | null;
  follower_count: number;
  team_size: number;
  visibility: "public" | "private";
}

function intToHex(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(n))).toString(16).padStart(6, "0")}`;
}

export function PromoterIdentityBar({
  promoter,
  loading,
  error,
}: {
  promoter: PromoterSummary | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="relative h-[164px] overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/40 to-card" />
      </div>
    );
  }

  if (error || !promoter) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ImageOff size={16} />
          <span>{error ?? "Promoter profile not set up yet."}</span>
          <Link
            href="/admin/promoter"
            className="ml-auto text-primary hover:underline"
          >
            Set up profile →
          </Link>
        </div>
      </div>
    );
  }

  const accent = intToHex(promoter.accent_hex);
  const avatarBg = intToHex(promoter.avatar_bg_hex) ?? accent;
  const initials =
    promoter.avatar_initials?.slice(0, 2) ||
    promoter.display_name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ||
    "—";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
      {/* Cover */}
      <div className="relative h-[120px] sm:h-[144px]">
        {promoter.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={promoter.cover_image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : accent ? (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${accent} 0%, ${accent}33 55%, transparent 100%)`,
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/60 to-primary/20" />
        )}
        {/* Accent tint (dynamic per-promoter) */}
        {accent && (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${accent}4D 0%, transparent 55%)`,
            }}
          />
        )}
        {/* Readability scrim — Tailwind token, not hardcoded hex */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/35 to-transparent" />
      </div>

      {/* Identity row */}
      <div className="relative -mt-10 flex flex-col gap-4 p-5 sm:-mt-12 sm:flex-row sm:items-end sm:gap-5 sm:p-6">
        {/* Avatar */}
        <div
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl ring-4 ring-card sm:h-24 sm:w-24 ${
            !promoter.avatar_url && !avatarBg
              ? "bg-gradient-to-br from-primary/60 to-primary/25"
              : ""
          }`}
          style={{
            background:
              !promoter.avatar_url && avatarBg && accent
                ? `linear-gradient(135deg, ${avatarBg}, ${accent})`
                : undefined,
          }}
        >
          {promoter.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={promoter.avatar_url}
              alt={promoter.display_name}
              className="h-full w-full rounded-2xl object-cover"
            />
          ) : (
            <span className="font-mono text-2xl font-bold tracking-tight text-white">
              {initials}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-semibold uppercase tracking-[2px] text-muted-foreground">
            @{promoter.handle}
          </p>
          <h2 className="mt-1 truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {promoter.display_name}
          </h2>
          {promoter.tagline && (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {promoter.tagline}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Users size={12} strokeWidth={1.75} />
              <span className="font-mono tabular-nums">{promoter.team_size}</span>
              <span>reps</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserPlus size={12} strokeWidth={1.75} />
              <span className="font-mono tabular-nums">{promoter.follower_count}</span>
              <span>followers</span>
            </span>
            {promoter.visibility === "private" && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider">
                private
              </span>
            )}
          </div>
        </div>

        <Link
          href="/admin/promoter"
          className="group inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-medium text-foreground backdrop-blur transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary sm:self-end"
        >
          Edit profile
          <ArrowUpRight
            size={12}
            className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </Link>
      </div>
    </div>
  );
}
