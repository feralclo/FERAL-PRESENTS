"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Paintbrush, Lock, Check, Sparkles } from "lucide-react";

const THEMES = [
  {
    id: "midnight",
    name: "Midnight",
    active: true,
    description:
      "Deep dark theme designed for nightlife and events. CRT scanline effects, neon accent highlights, monospace typography, and metallic ticket tiers.",
    tags: ["Dark", "Nightlife", "Events"],
    gradient: "from-[#0e0e0e] via-[#1a0a0a] to-[#0e0e0e]",
    accent: "#ff0033",
  },
  {
    id: "daylight",
    name: "Daylight",
    active: false,
    description:
      "Clean, bright theme for daytime festivals, conferences, and community events. Warm tones with a modern editorial feel.",
    tags: ["Light", "Festivals", "Conferences"],
    gradient: "from-[#f5f5f0] via-[#e8e4de] to-[#f5f5f0]",
    accent: "#2563eb",
  },
  {
    id: "neon",
    name: "Neon",
    active: false,
    description:
      "High-energy theme with vivid gradients and glow effects. Perfect for electronic music, club nights, and immersive experiences.",
    tags: ["Vibrant", "Electronic", "Clubs"],
    gradient: "from-[#0a0014] via-[#1a0030] to-[#0a0014]",
    accent: "#a855f7",
  },
];

export default function StorefrontPage() {
  const router = useRouter();

  const activeTheme = THEMES.find((t) => t.active)!;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Storefront</h2>
        <p className="text-sm text-muted-foreground">
          Manage your event store&apos;s theme and appearance. Changes apply
          to all event pages, checkout, and emails.
        </p>
      </div>

      {/* Current theme — hero card */}
      <Card className="overflow-hidden border-border/60 py-0 gap-0">
        <div className="flex flex-col lg:flex-row">
          {/* Preview panel */}
          <div className="relative lg:w-[420px] shrink-0">
            <div
              className={`h-full min-h-[280px] bg-gradient-to-b ${activeTheme.gradient} p-6 flex flex-col justify-between`}
            >
              {/* Mini mockup of event page */}
              <div className="space-y-3">
                {/* Nav mockup */}
                <div className="flex items-center justify-between">
                  <div className="h-2 w-16 rounded-full bg-white/20" />
                  <div className="flex gap-2">
                    <div className="h-2 w-8 rounded-full bg-white/10" />
                    <div className="h-2 w-8 rounded-full bg-white/10" />
                  </div>
                </div>
                {/* Hero mockup */}
                <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-4 space-y-2">
                  <div className="h-2.5 w-32 rounded-full bg-white/20" />
                  <div className="h-2 w-48 rounded-full bg-white/10" />
                  <div className="h-2 w-24 rounded-full bg-white/8" />
                </div>
                {/* Ticket mockup */}
                <div className="flex gap-2">
                  <div className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-1.5">
                    <div className="h-2 w-16 rounded-full bg-white/15" />
                    <div className="h-2 w-10 rounded-full" style={{ backgroundColor: `${activeTheme.accent}60` }} />
                  </div>
                  <div className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-1.5">
                    <div className="h-2 w-16 rounded-full bg-white/15" />
                    <div className="h-2 w-10 rounded-full" style={{ backgroundColor: `${activeTheme.accent}60` }} />
                  </div>
                </div>
              </div>
              {/* CTA mockup */}
              <div className="mt-4">
                <div
                  className="h-8 w-28 rounded-md"
                  style={{ backgroundColor: `${activeTheme.accent}90` }}
                />
              </div>
              {/* Scanline overlay */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
                }}
              />
            </div>
          </div>

          {/* Info panel */}
          <div className="flex flex-1 flex-col justify-between p-6 lg:p-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-base font-semibold">{activeTheme.name}</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <Check size={10} />
                  Active
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {activeTheme.description}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activeTheme.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <Button
                onClick={() => router.push("/admin/storefront/editor/")}
              >
                <Paintbrush size={14} className="mr-1.5" />
                Customize
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Theme library */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={14} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold">Theme Library</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((theme) => (
            <Card
              key={theme.id}
              className={`group relative overflow-hidden py-0 gap-0 transition-all ${
                theme.active
                  ? "ring-1 ring-primary/40"
                  : "opacity-60 hover:opacity-80"
              }`}
            >
              {/* Preview */}
              <div
                className={`h-36 bg-gradient-to-b ${theme.gradient} relative`}
              >
                {/* Mini wireframe */}
                <div className="absolute inset-3 flex flex-col gap-1.5">
                  <div className="h-1.5 w-12 rounded-full bg-white/15" />
                  <div className="flex-1 rounded bg-white/[0.03] border border-white/[0.05]" />
                  <div className="flex gap-1">
                    <div className="flex-1 h-6 rounded bg-white/[0.03]" />
                    <div className="flex-1 h-6 rounded bg-white/[0.03]" />
                  </div>
                </div>
                {/* Scanlines on dark themes */}
                {theme.id !== "daylight" && (
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.03]"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
                    }}
                  />
                )}
                {/* Lock for future themes */}
                {!theme.active && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
                    <div className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[10px] font-medium text-white/70">
                      <Lock size={10} />
                      Coming Soon
                    </div>
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{theme.name}</span>
                  {theme.active && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20">
                      <Check size={10} className="text-primary" />
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {theme.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] text-muted-foreground/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
