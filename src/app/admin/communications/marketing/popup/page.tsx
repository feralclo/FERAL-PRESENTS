"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { saveSettings } from "@/lib/settings";
import { SETTINGS_KEYS } from "@/lib/constants";
import { DEFAULT_POPUP_SETTINGS } from "@/hooks/usePopupSettings";
import type { PopupSettings } from "@/types/settings";
import {
  ChevronLeft,
  Power,
  Check,
  AlertTriangle,
  Type,
  Timer,
  Sparkles,
  ExternalLink,
  BarChart3,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   MASTER TOGGLE — big glowing power switch
   ═══════════════════════════════════════════════════════════ */
function MasterToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (val: boolean) => void;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-6 transition-all duration-500"
      style={{
        borderColor: enabled ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.15)",
        background: enabled
          ? "linear-gradient(135deg, rgba(16,185,129,0.06), rgba(52,211,153,0.03))"
          : "linear-gradient(135deg, rgba(239,68,68,0.04), rgba(245,158,11,0.02))",
        boxShadow: enabled ? "0 0 30px rgba(16,185,129,0.08)" : "none",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full transition-all duration-500"
              style={{
                backgroundColor: enabled ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.08)",
                boxShadow: enabled
                  ? "0 0 20px rgba(16,185,129,0.25), inset 0 0 0 2px rgba(16,185,129,0.3)"
                  : "inset 0 0 0 2px rgba(255,255,255,0.06)",
              }}
            >
              <Power
                size={20}
                style={{ color: enabled ? "#10b981" : "#71717a" }}
                className="transition-colors duration-300"
              />
            </div>
            {enabled && (
              <span
                className="absolute inset-0 animate-ping rounded-full opacity-15"
                style={{ backgroundColor: "#10b981" }}
              />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                Discount Popup
              </h2>
              <Badge
                variant={enabled ? "success" : "destructive"}
                className="text-[9px] font-bold uppercase"
              >
                {enabled ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {enabled
                ? "Popup is showing on event pages"
                : "Enable to show the discount popup on event pages"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {enabled ? "On" : "Off"}
          </span>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </div>

      {enabled && (
        <>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-500/5" />
          <div className="absolute -bottom-2 -right-8 h-16 w-16 rounded-full bg-emerald-500/3" />
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   POPUP CONFIG PAGE
   ═══════════════════════════════════════════════════════════ */
export default function PopupConfigPage() {
  const [settings, setSettings] = useState<PopupSettings>(DEFAULT_POPUP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load settings
  useEffect(() => {
    fetch(`/api/settings?key=${SETTINGS_KEYS.POPUP}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setSettings({ ...DEFAULT_POPUP_SETTINGS, ...json.data });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-save with debounce
  const persistSettings = useCallback((newSettings: PopupSettings) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      const { error } = await saveSettings(
        SETTINGS_KEYS.POPUP,
        newSettings as unknown as Record<string, unknown>
      );
      setSaving(false);
      setSaveStatus(error ? "error" : "saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 600);
  }, []);

  // Update helper — merges partial updates and auto-saves
  const update = useCallback(
    (patch: Partial<PopupSettings>) => {
      const updated = { ...settings, ...patch };
      setSettings(updated);
      persistSettings(updated);
    },
    [settings, persistSettings]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading popup settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb + Header */}
      <div className="mb-6">
        <Link
          href="/admin/communications/marketing/"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground no-underline"
        >
          <ChevronLeft size={14} />
          Marketing
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
                Discount Popup
              </h1>
              {settings.enabled && (
                <Badge variant="success" className="gap-1 text-[9px] font-bold uppercase">
                  <Power size={8} /> Live
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Capture emails with a timed discount popup on event pages.
            </p>
          </div>

          {/* Save status */}
          <div className="flex items-center gap-2">
            {saving && (
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <Check size={10} />
                Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1 text-[10px] text-red-400">
                <AlertTriangle size={10} />
                Save failed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Master toggle */}
      <div className="mb-6">
        <MasterToggle
          enabled={settings.enabled}
          onToggle={(val) => update({ enabled: val })}
        />
      </div>

      {/* Config cards — only visible when enabled */}
      {settings.enabled && (
        <div className="space-y-6">
          {/* Content Card */}
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Type size={15} className="text-primary" />
                Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Discount Code
                </Label>
                <Input
                  className="mt-1.5 font-mono"
                  value={settings.discount_code}
                  onChange={(e) => update({ discount_code: e.target.value.toUpperCase() })}
                  placeholder="FERALRAVER10"
                />
                <p className="mt-1 text-[10px] text-muted-foreground/40">
                  Must match an active code in the Discounts system
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Headline
                  </Label>
                  <Input
                    className="mt-1.5"
                    value={settings.headline}
                    onChange={(e) => update({ headline: e.target.value })}
                    placeholder="Unlock Feral Raver Discount"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Subheadline
                  </Label>
                  <Input
                    className="mt-1.5"
                    value={settings.subheadline}
                    onChange={(e) => update({ subheadline: e.target.value })}
                    placeholder="Save it before it's gone"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    CTA Button Text
                  </Label>
                  <Input
                    className="mt-1.5"
                    value={settings.cta_text}
                    onChange={(e) => update({ cta_text: e.target.value })}
                    placeholder="Save My Discount"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Dismiss Button Text
                  </Label>
                  <Input
                    className="mt-1.5"
                    value={settings.dismiss_text}
                    onChange={(e) => update({ dismiss_text: e.target.value })}
                    placeholder="Nah, I'll Pay Full Price"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timing & Behavior Card */}
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Timer size={15} className="text-primary" />
                Timing &amp; Behavior
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-5">
              {/* Mobile delay */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Mobile Delay
                  </Label>
                  <span className="font-mono text-xs text-foreground tabular-nums">
                    {(settings.mobile_delay / 1000).toFixed(0)}s
                  </span>
                </div>
                <Slider
                  value={[settings.mobile_delay]}
                  onValueChange={([val]) => update({ mobile_delay: val })}
                  min={1000}
                  max={30000}
                  step={1000}
                />
                <p className="mt-1 text-[10px] text-muted-foreground/40">
                  Time before popup appears on mobile devices
                </p>
              </div>

              {/* Desktop delay */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Desktop Delay
                  </Label>
                  <span className="font-mono text-xs text-foreground tabular-nums">
                    {(settings.desktop_delay / 1000).toFixed(0)}s
                  </span>
                </div>
                <Slider
                  value={[settings.desktop_delay]}
                  onValueChange={([val]) => update({ desktop_delay: val })}
                  min={1000}
                  max={60000}
                  step={1000}
                />
                <p className="mt-1 text-[10px] text-muted-foreground/40">
                  Time before popup appears on desktop
                </p>
              </div>

              {/* Dismiss days */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Dismiss Cooldown
                  </Label>
                  <span className="font-mono text-xs text-foreground tabular-nums">
                    {settings.dismiss_days} {settings.dismiss_days === 1 ? "day" : "days"}
                  </span>
                </div>
                <Slider
                  value={[settings.dismiss_days]}
                  onValueChange={([val]) => update({ dismiss_days: val })}
                  min={1}
                  max={90}
                  step={1}
                />
                <p className="mt-1 text-[10px] text-muted-foreground/40">
                  Days to suppress popup after a user dismisses it
                </p>
              </div>

              {/* Countdown timer */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Countdown Timer
                  </Label>
                  <span className="font-mono text-xs text-foreground tabular-nums">
                    {Math.floor(settings.countdown_seconds / 60)}:{String(settings.countdown_seconds % 60).padStart(2, "0")}
                  </span>
                </div>
                <Slider
                  value={[settings.countdown_seconds]}
                  onValueChange={([val]) => update({ countdown_seconds: val })}
                  min={60}
                  max={600}
                  step={30}
                />
                <p className="mt-1 text-[10px] text-muted-foreground/40">
                  Urgency countdown displayed in the popup
                </p>
              </div>

              {/* Exit intent toggle */}
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Exit Intent (Desktop)</p>
                  <p className="text-[11px] text-muted-foreground/50">
                    Show popup when the cursor leaves the viewport
                  </p>
                </div>
                <Switch
                  checked={settings.exit_intent}
                  onCheckedChange={(val) => update({ exit_intent: val })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Integrations Card */}
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles size={15} className="text-primary" />
                Integrations
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Klaviyo Email Capture</p>
                  <p className="text-[11px] text-muted-foreground/50">
                    Subscribe emails to your Klaviyo list when users enter their email
                  </p>
                </div>
                <Switch
                  checked={settings.klaviyo_enabled}
                  onCheckedChange={(val) => update({ klaviyo_enabled: val })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Link to analytics */}
          <Link
            href="/admin/popup/"
            className="inline-flex items-center gap-2 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            <BarChart3 size={13} />
            View popup analytics
            <ExternalLink size={11} />
          </Link>
        </div>
      )}
    </div>
  );
}
