"use client";

import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Gift,
  UserPlus,
  ShoppingBag,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type ActivityKind =
  | "submission_pending"
  | "submission_approved"
  | "submission_rejected"
  | "claim_pending"
  | "claim_fulfilled"
  | "join_request"
  | "milestone";

const KIND_META: Record<
  ActivityKind,
  { icon: LucideIcon; tone: string; label: string }
> = {
  submission_pending: {
    icon: Clock,
    tone: "text-primary",
    label: "submitted",
  },
  submission_approved: {
    icon: CheckCircle2,
    tone: "text-success",
    label: "approved",
  },
  submission_rejected: {
    icon: XCircle,
    tone: "text-destructive",
    label: "rejected",
  },
  claim_pending: {
    icon: ShoppingBag,
    tone: "text-info",
    label: "claimed",
  },
  claim_fulfilled: {
    icon: Gift,
    tone: "text-success",
    label: "fulfilled",
  },
  join_request: {
    icon: UserPlus,
    tone: "text-warning",
    label: "requested to join",
  },
  milestone: {
    icon: Zap,
    tone: "text-primary",
    label: "hit milestone",
  },
};

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  when: string; // ISO
  actor: string; // e.g. rep name
  subject?: string | null; // e.g. quest title
  rewardSuffix?: string | null; // e.g. "+50 XP · +10 EP"
  href?: string | null;
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;

  const body = (
    <div className="flex items-start gap-3 p-3">
      <span className="w-10 shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {formatRelative(item.when)}
      </span>
      <Icon
        size={14}
        strokeWidth={1.75}
        className={`mt-0.5 shrink-0 ${meta.tone}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          <span className="font-medium">{item.actor}</span>{" "}
          <span className="text-muted-foreground">{meta.label}</span>
          {item.subject && (
            <>
              {" "}
              <span className="font-medium text-foreground">
                &ldquo;{item.subject}&rdquo;
              </span>
            </>
          )}
        </p>
        {item.rewardSuffix && (
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            {item.rewardSuffix}
          </p>
        )}
      </div>
    </div>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="block transition-colors hover:bg-primary/5"
      >
        {body}
      </Link>
    );
  }
  return <div>{body}</div>;
}

export function ActivityFeedItemSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3">
      <span className="h-3 w-10 shrink-0 animate-pulse rounded bg-muted" />
      <span className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-muted" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-2 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
