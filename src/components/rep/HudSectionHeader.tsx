import { cn } from "@/lib/utils";

interface HudSectionHeaderProps {
  label: string;
  /** Optional right-side extra text (e.g. "3 sales") */
  extra?: string;
  className?: string;
}

/**
 * Diamond + label + horizontal line section header.
 * Used by Dashboard and Sales pages.
 */
export function HudSectionHeader({ label, extra, className }: HudSectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-2.5 mb-3", className)}>
      <div className="size-2 rotate-45 rounded-[1px] bg-primary shadow-[0_0_8px_rgba(139,92,246,0.4)] shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      {extra && (
        <span className="text-[10px] font-mono text-muted-foreground ml-1">
          {extra}
        </span>
      )}
      <div className="flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent" />
    </div>
  );
}
