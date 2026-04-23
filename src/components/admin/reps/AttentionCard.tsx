"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";

export type AttentionTone = "pending" | "review" | "claim";

const TONE_STYLES: Record<
  AttentionTone,
  {
    border: string;
    icon: string;
    pill: string;
  }
> = {
  pending: {
    // violet — match iOS quest "pending review"
    border: "border-l-primary",
    icon: "text-primary",
    pill: "bg-primary/10 text-primary",
  },
  review: {
    // amber — team join requests needing decision
    border: "border-l-warning",
    icon: "text-warning",
    pill: "bg-warning/10 text-warning",
  },
  claim: {
    // blue — reward claims awaiting fulfilment
    border: "border-l-info",
    icon: "text-info",
    pill: "bg-info/10 text-info",
  },
};

export function AttentionCard({
  tone,
  icon: Icon,
  count,
  label,
  sublabel,
  ctaLabel,
  href,
  loading,
}: {
  tone: AttentionTone;
  icon: LucideIcon;
  count: number;
  label: string;
  sublabel?: string;
  ctaLabel: string;
  href: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-8 w-12 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">All caught up</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    );
  }

  const styles = TONE_STYLES[tone];

  return (
    <Link
      href={href}
      className={`group block rounded-xl border border-l-4 border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-primary/5 ${styles.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon
            size={14}
            strokeWidth={1.75}
            className={styles.icon}
          />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">
            {label}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums uppercase tracking-wider ${styles.pill}`}
        >
          {count === 1 ? "1 item" : `${count} items`}
        </span>
      </div>
      <p className="mt-3 font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground">
        {count}
      </p>
      {sublabel && (
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      )}
      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-foreground transition-colors group-hover:text-primary">
        {ctaLabel}
        <ArrowRight
          size={12}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
}
