import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  label: string;
  /** Optional right-side extra text (e.g. "3 sales") */
  extra?: string;
  className?: string;
}

/**
 * Dot + label + horizontal line section header.
 * Used by Dashboard and Sales pages.
 */
export function SectionHeader({ label, extra, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-2.5 mb-3", className)}>
      <div className="size-[3px] rounded-full bg-primary shrink-0" />
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

/** @deprecated Use SectionHeader instead */
export const HudSectionHeader = SectionHeader;
