"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Paintbrush,
  Loader2,
  Palette,
  Eye,
} from "lucide-react";
import type { ThemeStore } from "@/types/settings";

export default function TicketStorePage() {
  const router = useRouter();
  const [store, setStore] = useState<ThemeStore | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchThemes = useCallback(async () => {
    try {
      const res = await fetch("/api/themes");
      const json = await res.json();
      if (json.data) {
        setStore(json.data);
        // Auto-create a theme if none exist
        if (!json.data.themes || json.data.themes.length === 0) {
          const createRes = await fetch("/api/themes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create", template: "midnight", name: "My Theme" }),
          });
          const createJson = await createRes.json();
          if (createJson.store) setStore(createJson.store);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  if (loading || !store) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeTheme = store.themes.find((t) => t.id === store.active_theme_id) || store.themes[0];
  if (!activeTheme) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const accent = activeTheme.branding.accent_color || "#8B5CF6";

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.005em] text-foreground">Storefront</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize how your event pages look. Choose a color vibe, upload your logo,
          and pick fonts — all changes apply to every event page instantly.
        </p>
      </div>

      {/* Theme preview card */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        {/* Mini preview */}
        <div
          className="relative h-48 p-6"
          style={{
            background: `linear-gradient(135deg, ${activeTheme.branding.background_color || "#0e0e0e"}, ${activeTheme.branding.card_color || "#1a1a1a"}, ${activeTheme.branding.background_color || "#0e0e0e"})`,
          }}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-2 w-16 rounded-full bg-white/20" />
              <div className="flex gap-2">
                <div className="h-2 w-8 rounded-full bg-white/10" />
                <div className="h-2 w-8 rounded-full bg-white/10" />
              </div>
            </div>
            <div
              className="rounded-lg p-4 space-y-2"
              style={{
                background: `${activeTheme.branding.card_color || "#1a1a1a"}80`,
                borderColor: `${activeTheme.branding.card_border_color || "#2a2a2a"}60`,
                border: "1px solid",
              }}
            >
              <div className="h-2.5 w-32 rounded-full bg-white/20" />
              <div className="h-2 w-48 rounded-full bg-white/10" />
              <div className="h-2 w-24 rounded-full bg-white/8" />
            </div>
            <div className="flex gap-2">
              <div
                className="flex-1 rounded-lg p-3 space-y-1.5"
                style={{
                  background: `${activeTheme.branding.card_color || "#1a1a1a"}60`,
                  border: `1px solid ${activeTheme.branding.card_border_color || "#2a2a2a"}40`,
                }}
              >
                <div className="h-2 w-16 rounded-full bg-white/15" />
                <div className="h-2 w-10 rounded-full" style={{ backgroundColor: `${accent}60` }} />
              </div>
              <div
                className="flex-1 rounded-lg p-3 space-y-1.5"
                style={{
                  background: `${activeTheme.branding.card_color || "#1a1a1a"}60`,
                  border: `1px solid ${activeTheme.branding.card_border_color || "#2a2a2a"}40`,
                }}
              >
                <div className="h-2 w-16 rounded-full bg-white/15" />
                <div className="h-2 w-10 rounded-full" style={{ backgroundColor: `${accent}60` }} />
              </div>
            </div>
          </div>
          {/* Scanline overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
            }}
          />
        </div>

        {/* Info + actions */}
        <div className="p-6 space-y-5">
          {/* Color swatches */}
          <div className="flex items-center gap-3">
            <Palette size={14} className="text-muted-foreground/50" />
            <div className="flex items-center gap-2">
              {[
                { color: activeTheme.branding.accent_color, label: "Accent" },
                { color: activeTheme.branding.background_color, label: "Background" },
                { color: activeTheme.branding.card_color, label: "Card" },
                { color: activeTheme.branding.text_color, label: "Text" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div
                    className="h-5 w-5 rounded-full border border-white/10"
                    style={{ backgroundColor: color || "#888" }}
                  />
                  <span className="text-[10px] text-muted-foreground/60">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => router.push(`/admin/ticketstore/editor/?theme=${activeTheme.id}`)}
              className="gap-2"
            >
              <Paintbrush size={14} />
              Customize
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const slug = "your-event"; // Will use first event
                window.open(`/event/${slug}`, "_blank");
              }}
              className="gap-2"
            >
              <Eye size={14} />
              Preview
            </Button>
          </div>
        </div>
      </div>

      {/* Help text */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-5">
        <h3 className="text-sm font-medium text-foreground">What you can customize</h3>
        <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
          <li className="flex gap-2">
            <span className="shrink-0 text-primary/60">-</span>
            <span><strong>Vibe</strong> — Pick a color palette (Entry Dark, Rose Glow, Electric Blue, etc.)</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-primary/60">-</span>
            <span><strong>Colors</strong> — Fine-tune accent, background, card, and text colors</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-primary/60">-</span>
            <span><strong>Logo</strong> — Upload your brand logo and set its size</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-primary/60">-</span>
            <span><strong>Fonts</strong> — Choose heading and body font pairings</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
