import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

/**
 * Empty state with pulsing rings, icon, title, and subtitle.
 * Used by Sales, Points, Leaderboard, Rewards, Quests.
 */
export function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="relative inline-flex h-14 w-14 items-center justify-center mx-auto mb-4">
        <div className="rep-empty-ring" />
        <div className="rep-empty-ring" />
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Icon size={22} className="text-primary/50" />
        </div>
      </div>
      <p className="text-sm text-foreground font-medium mb-1">{title}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
