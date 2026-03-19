"use client";

import { Scan, Package, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScanMode = "entry" | "merch" | "guest-list";

interface ModeToggleProps {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
  hasMerch: boolean;
  hasGuestList: boolean;
}

const MODES = [
  { value: "entry" as const, label: "Entry", icon: Scan },
  { value: "merch" as const, label: "Merch", icon: Package },
  { value: "guest-list" as const, label: "Guests", icon: ClipboardList },
];

export function ModeToggle({ mode, onChange, hasMerch, hasGuestList }: ModeToggleProps) {
  const visibleModes = MODES.filter((m) => {
    if (m.value === "merch" && !hasMerch) return false;
    if (m.value === "guest-list" && !hasGuestList) return false;
    return true;
  });

  if (visibleModes.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/80 backdrop-blur p-1">
      {visibleModes.map((m) => {
        const Icon = m.icon;
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
              active
                ? "bg-primary/15 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={14} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
