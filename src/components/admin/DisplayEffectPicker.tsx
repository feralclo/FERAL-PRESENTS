"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CodeRainCanvas } from "@/components/midnight/CodeRainCanvas";
import type { DisplayEffect } from "@/types/products";

interface DisplayEffectPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DisplayEffect;
  onChange: (effect: DisplayEffect) => void;
}

const EFFECTS: {
  id: DisplayEffect;
  label: string;
  description: string;
}[] = [
  {
    id: "default",
    label: "Default",
    description: "Clean, standard product display",
  },
  {
    id: "system_error",
    label: "System Error",
    description: "Cyberpunk code rain background",
  },
];

function DefaultPreview() {
  return (
    <div className="w-full h-full bg-[#0e0e0e] flex items-center justify-center relative overflow-hidden">
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />
      {/* Merch icon silhouette */}
      <div className="relative flex flex-col items-center gap-2">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/20"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        <span className="text-[9px] font-mono tracking-widest uppercase text-white/15">
          Standard
        </span>
      </div>
    </div>
  );
}

function SystemErrorPreview() {
  return (
    <div className="w-full h-full relative overflow-hidden">
      <CodeRainCanvas
        className="absolute inset-0"
        fontSize={10}
        columnGap={14}
        speed={0.6}
        opacity={0.5}
        color="#ff0033"
        active
      />
      {/* Overlay for label readability */}
      <div className="absolute inset-0 bg-[#08080c]/30" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[#ff0033]/70 font-bold">
          SYSTEM_ERROR
        </span>
      </div>
    </div>
  );
}

export function DisplayEffectPicker({
  open,
  onOpenChange,
  value,
  onChange,
}: DisplayEffectPickerProps) {
  const [hoveredId, setHoveredId] = useState<DisplayEffect | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Display Effect</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Choose a visual effect for the product modal
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-2">
          {EFFECTS.map((effect) => {
            const isSelected = value === effect.id;
            const isHovered = hoveredId === effect.id;
            return (
              <button
                key={effect.id}
                type="button"
                className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer group ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/20"
                    : isHovered
                      ? "border-primary/40"
                      : "border-border hover:border-primary/20"
                }`}
                onClick={() => {
                  onChange(effect.id);
                  onOpenChange(false);
                }}
                onMouseEnter={() => setHoveredId(effect.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Preview area */}
                <div className="h-[140px] w-full">
                  {effect.id === "default" ? (
                    <DefaultPreview />
                  ) : (
                    <SystemErrorPreview />
                  )}
                </div>

                {/* Label */}
                <div className="px-3 py-2.5 bg-card border-t border-border">
                  <p className="text-xs font-medium text-foreground text-left">
                    {effect.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground text-left mt-0.5">
                    {effect.description}
                  </p>
                </div>

                {/* Selected checkmark */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
