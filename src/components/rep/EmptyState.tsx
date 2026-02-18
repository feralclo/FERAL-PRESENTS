import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

/**
 * Empty state with icon, title, and subtitle.
 * Wrapped in rep-surface-1 for subtle containment.
 */
export function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="rep-surface-1 rounded-2xl text-center py-12 px-4">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mx-auto mb-4">
        <Icon size={22} className="text-primary/50" />
      </div>
      <p className="text-sm text-foreground font-medium mb-1">{title}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
