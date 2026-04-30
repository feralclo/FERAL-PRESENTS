"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminCardContent,
  AdminSkeleton,
} from "@/components/admin/ui";
import type { CampaignLinkedQuest } from "@/types/library-campaigns";

interface CampaignLinkedQuestsProps {
  quests: CampaignLinkedQuest[];
  loading: boolean;
  /** Empty-state hint shown when the campaign has zero linked quests. */
  emptyHint: string | null;
}

/**
 * List of quests that pull shareables from the active campaign. Each row
 * is a deep-link into the quest editor.
 */
export function CampaignLinkedQuests({
  quests,
  loading,
  emptyHint,
}: CampaignLinkedQuestsProps) {
  return (
    <div>
      <h2 className="mb-3 text-[15px] font-semibold text-foreground">
        Linked quests
      </h2>

      {loading ? (
        <div className="space-y-2">
          <AdminSkeleton className="h-14 w-full rounded-lg" />
          <AdminSkeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : quests.length === 0 ? (
        <AdminCard tone="default">
          <AdminCardContent className="py-6 text-center">
            <p className="text-sm text-foreground/60">
              {emptyHint ?? "No quests yet."}
            </p>
          </AdminCardContent>
        </AdminCard>
      ) : (
        <ul className="rounded-lg border border-border/40 bg-card divide-y divide-border/30">
          {quests.map((q) => (
            <li key={q.id}>
              <Link
                href={`/admin/reps/quests/${q.id}/edit`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-foreground/[0.03] transition-colors focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
              >
                {q.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={q.cover_image_url}
                    alt=""
                    className="h-10 w-10 rounded-md object-cover bg-foreground/[0.06]"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-foreground/[0.06]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {q.title}
                  </p>
                  <p className="text-xs text-foreground/55 tabular-nums">
                    {q.xp_reward != null ? `${q.xp_reward} XP` : null}
                    {q.xp_reward != null && q.ep_reward != null ? " · " : null}
                    {q.ep_reward != null ? `${q.ep_reward} EP` : null}
                  </p>
                </div>
                <StatusPill status={q.status} />
                <ArrowRight className="h-4 w-4 text-foreground/40 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "active") {
    return <AdminBadge variant="success">Live</AdminBadge>;
  }
  if (status === "paused") {
    return <AdminBadge variant="warning">Paused</AdminBadge>;
  }
  if (status === "archived") {
    return <AdminBadge variant="default">Archived</AdminBadge>;
  }
  return <AdminBadge variant="default">{status}</AdminBadge>;
}
