"use client";

import { Calendar, CheckCircle2, Zap, Coins } from "lucide-react";

export interface LiveQuestRowData {
  id: string;
  title: string;
  cover_image_url?: string | null;
  image_url?: string | null;
  banner_image_url?: string | null;
  event?: { name: string; slug?: string | null } | null;
  starts_at?: string | null;
  expires_at?: string | null;
  xp_reward?: number | null;
  points_reward: number;
  ep_reward?: number | null;
  currency_reward?: number | null;
  total_completed: number;
  max_completions?: number | null;
  pending_count?: number;
  auto_approve?: boolean;
  accent_hex?: number | null;
}

function intToHex(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(n))).toString(16).padStart(6, "0")}`;
}

function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "2-digit",
  });
}

export function LiveQuestRow({ quest }: { quest: LiveQuestRowData }) {
  const cover =
    quest.cover_image_url || quest.image_url || quest.banner_image_url || null;
  const accent = intToHex(quest.accent_hex);
  const xp = quest.xp_reward ?? quest.points_reward;
  const ep = quest.ep_reward ?? quest.currency_reward ?? 0;
  const done = quest.total_completed;
  const target = quest.max_completions ?? null;
  const progressLabel =
    target != null ? `${done} / ${target} done` : `${done} done`;
  const dateLabel = formatShortDate(quest.expires_at ?? quest.starts_at);

  return (
    <div className="flex items-center gap-4 p-4 transition-colors hover:bg-primary/5">
      {/* Cover */}
      <div
        className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-border sm:h-14 sm:w-14 ${
          !cover && !accent ? "bg-gradient-to-br from-primary/30 to-primary/10" : ""
        }`}
        style={{
          background:
            !cover && accent
              ? `linear-gradient(135deg, ${accent} 0%, ${accent}55 100%)`
              : undefined,
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
      </div>

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {quest.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {quest.event?.name && (
            <span className="truncate">{quest.event.name}</span>
          )}
          {dateLabel && (
            <span className="inline-flex items-center gap-1">
              <Calendar size={10} strokeWidth={1.75} />
              <span className="font-mono tabular-nums">{dateLabel}</span>
            </span>
          )}
          {quest.auto_approve && (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 size={10} strokeWidth={1.75} />
              auto-approve
            </span>
          )}
        </div>
      </div>

      {/* Right side: progress + rewards + pending */}
      <div className="hidden min-w-[120px] shrink-0 text-right sm:block">
        <p className="font-mono text-xs font-semibold tabular-nums text-foreground">
          {progressLabel}
        </p>
        <div className="mt-1 flex items-center justify-end gap-2 text-[10px] font-mono tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <Zap size={9} strokeWidth={2} />
            {xp}
          </span>
          {ep > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Coins size={9} strokeWidth={2} />
              {ep}
            </span>
          )}
        </div>
      </div>

      {quest.pending_count && quest.pending_count > 0 ? (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums uppercase tracking-wider text-primary">
          {quest.pending_count} pending
        </span>
      ) : null}
    </div>
  );
}

export function LiveQuestRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-muted sm:h-14 sm:w-14" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
