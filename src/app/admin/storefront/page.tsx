"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Paintbrush,
  Check,
  Sparkles,
  Plus,
  Copy,
  Trash2,
  Loader2,
  Power,
} from "lucide-react";
import type { StoreTheme, ThemeStore } from "@/types/settings";

/* ── Template metadata (for the "New Theme" dialog) ── */
const TEMPLATES = [
  {
    id: "midnight" as const,
    name: "Midnight",
    description: "Deep dark theme designed for nightlife and events.",
    tags: ["Dark", "Nightlife", "Events"],
    gradient: "from-[#0e0e0e] via-[#1a0a0a] to-[#0e0e0e]",
    accent: "#ff0033",
  },
  {
    id: "daylight" as const,
    name: "Daylight",
    description: "Clean, bright theme for daytime festivals and conferences.",
    tags: ["Light", "Festivals", "Conferences"],
    gradient: "from-[#f5f5f0] via-[#e8e4de] to-[#f5f5f0]",
    accent: "#2563eb",
  },
  {
    id: "neon" as const,
    name: "Neon",
    description: "High-energy theme with vivid gradients and glow effects.",
    tags: ["Vibrant", "Electronic", "Clubs"],
    gradient: "from-[#0a0014] via-[#1a0030] to-[#0a0014]",
    accent: "#a855f7",
  },
];

function getTemplateGradient(template: string): string {
  return TEMPLATES.find((t) => t.id === template)?.gradient
    || "from-[#0e0e0e] via-[#1a0a0a] to-[#0e0e0e]";
}

function getAccentFromTheme(theme: StoreTheme): string {
  return theme.branding.accent_color || TEMPLATES.find((t) => t.id === theme.template)?.accent || "#ff0033";
}

export default function StorefrontPage() {
  const router = useRouter();
  const [store, setStore] = useState<ThemeStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("midnight");
  const [newThemeName, setNewThemeName] = useState("");

  /* ── Fetch themes ── */
  const fetchThemes = useCallback(async () => {
    try {
      const res = await fetch("/api/themes");
      const json = await res.json();
      if (json.data) setStore(json.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  /* ── Theme actions ── */
  const themeAction = async (body: Record<string, unknown>) => {
    const idKey = (body.id as string) || (body.action as string);
    setActionLoading(idKey);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.store) setStore(json.store);
      return json;
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreate = async () => {
    const name = newThemeName.trim() || TEMPLATES.find((t) => t.id === selectedTemplate)?.name || "New Theme";
    await themeAction({ action: "create", template: selectedTemplate, name });
    setCreateDialogOpen(false);
    setNewThemeName("");
  };

  const handleActivate = (id: string) => themeAction({ action: "activate", id });
  const handleDuplicate = (id: string) => themeAction({ action: "duplicate", id });
  const handleDelete = (id: string) => {
    if (!confirm("Delete this theme? This cannot be undone.")) return;
    themeAction({ action: "delete", id });
  };

  /* ── Loading state ── */
  if (loading || !store) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeTheme = store.themes.find((t) => t.id === store.active_theme_id);
  const otherThemes = store.themes.filter((t) => t.id !== store.active_theme_id);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Storefront</h2>
          <p className="text-sm text-muted-foreground">
            Manage your event store&apos;s themes. Changes apply to all event
            pages, checkout, and emails.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="sm">
          <Plus size={14} className="mr-1.5" />
          New Theme
        </Button>
      </div>

      {/* Active theme — hero card */}
      {activeTheme && (
        <Card className="overflow-hidden border-border/60 py-0 gap-0">
          <div className="flex flex-col lg:flex-row">
            {/* Preview panel */}
            <div className="relative lg:w-[420px] shrink-0">
              <div
                className={`h-full min-h-[280px] bg-gradient-to-b ${getTemplateGradient(activeTheme.template)} p-6 flex flex-col justify-between`}
              >
                <ThemeMockup accent={getAccentFromTheme(activeTheme)} />
                <div className="mt-4">
                  <div
                    className="h-8 w-28 rounded-md"
                    style={{ backgroundColor: `${getAccentFromTheme(activeTheme)}90` }}
                  />
                </div>
                <ScanlineOverlay />
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
                  {TEMPLATES.find((t) => t.id === activeTheme.template)?.description
                    || "Custom theme configuration."}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(TEMPLATES.find((t) => t.id === activeTheme.template)?.tags || ["Custom"]).map(
                    (tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {tag}
                      </span>
                    )
                  )}
                </div>
                {/* Color swatches */}
                <div className="flex items-center gap-2 mt-4">
                  <ColorSwatch color={activeTheme.branding.accent_color} label="Accent" />
                  <ColorSwatch color={activeTheme.branding.background_color} label="Background" />
                  <ColorSwatch color={activeTheme.branding.card_color} label="Card" />
                  <ColorSwatch color={activeTheme.branding.text_color} label="Text" />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6">
                <Button
                  onClick={() =>
                    router.push(`/admin/storefront/editor/?theme=${activeTheme.id}`)
                  }
                >
                  <Paintbrush size={14} className="mr-1.5" />
                  Customize
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDuplicate(activeTheme.id)}
                  disabled={actionLoading === activeTheme.id}
                >
                  <Copy size={12} className="mr-1" />
                  Duplicate
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Theme library */}
      {otherThemes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={14} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold">Your Themes</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherThemes.map((theme) => (
              <Card
                key={theme.id}
                className="group relative overflow-hidden py-0 gap-0 transition-all hover:ring-1 hover:ring-border/60"
              >
                <div
                  className={`h-36 bg-gradient-to-b ${getTemplateGradient(theme.template)} relative`}
                >
                  <div className="absolute inset-3 flex flex-col gap-1.5">
                    <div className="h-1.5 w-12 rounded-full bg-white/15" />
                    <div className="flex-1 rounded bg-white/[0.03] border border-white/[0.05]" />
                    <div className="flex gap-1">
                      <div className="flex-1 h-6 rounded bg-white/[0.03]" />
                      <div className="flex-1 h-6 rounded bg-white/[0.03]" />
                    </div>
                  </div>
                  <ScanlineOverlay />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{theme.name}</span>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ColorSwatch color={theme.branding.accent_color} small />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() =>
                        router.push(`/admin/storefront/editor/?theme=${theme.id}`)
                      }
                    >
                      <Paintbrush size={10} className="mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => handleActivate(theme.id)}
                      disabled={actionLoading === theme.id}
                    >
                      {actionLoading === theme.id ? (
                        <Loader2 size={10} className="mr-1 animate-spin" />
                      ) : (
                        <Power size={10} className="mr-1" />
                      )}
                      Activate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(theme.id)}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Create Theme Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-admin>
          <DialogHeader>
            <DialogTitle>Create New Theme</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Theme Name</Label>
              <Input
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
                placeholder="My Custom Theme"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Start from template
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl.id)}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      selectedTemplate === tmpl.id
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-border/40 hover:border-border"
                    }`}
                  >
                    <div
                      className={`h-12 rounded-md bg-gradient-to-b ${tmpl.gradient} mb-2`}
                    />
                    <span className="text-xs font-medium">{tmpl.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate}>
                <Plus size={12} className="mr-1" />
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Shared sub-components ── */

function ThemeMockup({ accent }: { accent: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-2 w-16 rounded-full bg-white/20" />
        <div className="flex gap-2">
          <div className="h-2 w-8 rounded-full bg-white/10" />
          <div className="h-2 w-8 rounded-full bg-white/10" />
        </div>
      </div>
      <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-4 space-y-2">
        <div className="h-2.5 w-32 rounded-full bg-white/20" />
        <div className="h-2 w-48 rounded-full bg-white/10" />
        <div className="h-2 w-24 rounded-full bg-white/8" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-1.5">
          <div className="h-2 w-16 rounded-full bg-white/15" />
          <div
            className="h-2 w-10 rounded-full"
            style={{ backgroundColor: `${accent}60` }}
          />
        </div>
        <div className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-1.5">
          <div className="h-2 w-16 rounded-full bg-white/15" />
          <div
            className="h-2 w-10 rounded-full"
            style={{ backgroundColor: `${accent}60` }}
          />
        </div>
      </div>
    </div>
  );
}

function ScanlineOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.03]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
      }}
    />
  );
}

function ColorSwatch({
  color,
  label,
  small,
}: {
  color?: string;
  label?: string;
  small?: boolean;
}) {
  const c = color || "#888";
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`rounded-full border border-white/10 ${small ? "h-4 w-4" : "h-5 w-5"}`}
        style={{ backgroundColor: c }}
      />
      {label && (
        <span className="text-[10px] text-muted-foreground/60">{label}</span>
      )}
    </div>
  );
}
