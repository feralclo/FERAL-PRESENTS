"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveSettings } from "@/lib/settings";
import { popupKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import { DEFAULT_POPUP_SETTINGS } from "@/hooks/usePopupSettings";
import type { PopupSettings } from "@/types/settings";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  ChevronLeft,
  Power,
  Check,
  AlertTriangle,
  Type,
  Timer,
  Sparkles,
  Palette,
  BarChart3,
  Plus,
  CheckCircle2,
  Loader2,
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
                Popup
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
                : "Enable to show the popup on event pages"}
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
   CODE VALIDATION — checks if the discount code is valid
   ═══════════════════════════════════════════════════════════ */
function CodeValidator({ code }: { code: string }) {
  const [status, setStatus] = useState<"idle" | "valid" | "invalid" | "checking">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!code.trim()) {
      setStatus("idle");
      return;
    }

    setStatus("checking");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/discounts/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: code.trim() }),
        });
        const json = await res.json();
        setStatus(json.valid ? "valid" : "invalid");
      } catch {
        setStatus("invalid");
      }
    }, 500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [code]);

  if (status === "idle" || status === "checking") return null;

  return (
    <span className="mt-1 flex items-center gap-1 text-[10px]">
      {status === "valid" ? (
        <>
          <CheckCircle2 size={10} className="text-emerald-400" />
          <span className="text-emerald-400">Active</span>
        </>
      ) : (
        <>
          <AlertTriangle size={10} className="text-amber-400" />
          <span className="text-amber-400">Code not found</span>
        </>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   CREATE DISCOUNT INLINE — create a new discount code
   ═══════════════════════════════════════════════════════════ */
function CreatePopupDiscount({
  onCreated,
}: {
  onCreated: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCreate = async () => {
    if (!code.trim()) {
      setError("Enter a discount code");
      return;
    }
    if (percent < 1 || percent > 100) {
      setError("Percentage must be 1\u2013100");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          description: `Popup discount (${percent}% off)`,
          type: "percentage",
          value: percent,
          status: "active",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to create discount");
        setCreating(false);
        return;
      }

      setSuccess(true);
      onCreated(code.trim().toUpperCase());

      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        setCode("");
        setPercent(10);
      }, 1200);
    } catch {
      setError("Network error");
    }
    setCreating(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-[11px] font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
      >
        <Plus size={12} />
        Create New Discount Code
      </button>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border transition-all"
      style={{
        borderColor: success ? "rgba(16,185,129,0.3)" : "rgba(139,92,246,0.2)",
        background: success ? "rgba(16,185,129,0.04)" : "rgba(139,92,246,0.04)",
      }}
    >
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-primary">
            {success ? "Discount Created" : "New Discount Code"}
          </span>
          {!success && (
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </div>

        {success ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 size={14} />
            <span className="font-mono font-bold">{code.toUpperCase()}</span> — {percent}% off
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-5 gap-3">
              <div className="col-span-3">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Code
                </Label>
                <Input
                  className="mt-1 font-mono text-xs"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
                  placeholder="POPUP10"
                  disabled={creating}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Discount %
                </Label>
                <Input
                  className="mt-1 font-mono text-xs"
                  type="number"
                  min={1}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  disabled={creating}
                />
              </div>
            </div>

            {error && (
              <p className="mt-2 text-[11px] text-red-400">{error}</p>
            )}

            <Button
              size="sm"
              className="mt-3 w-full gap-1.5"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CheckCircle2 size={12} />
              )}
              Create &amp; Apply
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PRESET SELECTOR — horizontal pill selector with custom input
   ═══════════════════════════════════════════════════════════ */
function PresetSelector({
  presets,
  value,
  onChange,
  customUnit,
  customToDisplay,
  displayToCustom,
}: {
  presets: { label: string; value: number; recommended?: boolean }[];
  value: number;
  onChange: (val: number) => void;
  /** Unit label for custom input (e.g. "seconds", "days") */
  customUnit?: string;
  /** Convert stored value → display value (e.g. ms → seconds) */
  customToDisplay?: (val: number) => number;
  /** Convert display value → stored value (e.g. seconds → ms) */
  displayToCustom?: (val: number) => number;
}) {
  const [isCustomMode, setIsCustomMode] = useState(
    () => !presets.some((p) => p.value === value)
  );

  const displayValue = customToDisplay ? customToDisplay(value) : value;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const isSelected = !isCustomMode && preset.value === value;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange(preset.value);
              }}
              className={cn(
                "h-8 px-3.5 rounded-lg text-[12px] font-medium transition-all duration-150",
                isSelected
                  ? "bg-primary text-white"
                  : "bg-transparent text-muted-foreground border border-border hover:border-primary/30 hover:text-foreground"
              )}
            >
              {preset.label}
              {preset.recommended && (
                <span className="ml-1 text-[10px] opacity-60">(Recommended)</span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setIsCustomMode(true)}
          className={cn(
            "h-8 px-3.5 rounded-lg text-[12px] font-medium transition-all duration-150",
            isCustomMode
              ? "bg-primary text-white"
              : "bg-transparent text-muted-foreground border border-border hover:border-primary/30 hover:text-foreground"
          )}
        >
          Custom
        </button>
      </div>
      {isCustomMode && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            className="h-8 w-24 font-mono text-xs"
            value={displayValue}
            min={1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n > 0) {
                const stored = displayToCustom ? displayToCustom(n) : n;
                onChange(stored);
              }
            }}
          />
          {customUnit && (
            <span className="text-[11px] text-muted-foreground">
              {customUnit}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   POPUP CONFIG PAGE
   ═══════════════════════════════════════════════════════════ */
export default function PopupConfigPage() {
  const orgId = useOrgId();
  const [settings, setSettings] = useState<PopupSettings>(DEFAULT_POPUP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load settings
  useEffect(() => {
    fetch(`/api/settings?key=${popupKey(orgId)}`)
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
        popupKey(orgId),
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
                Popup
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

          {/* Save status + Analytics button */}
          <div className="flex items-center gap-3">
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
            <Link href="/admin/popup/">
              <Button variant="outline" size="sm" className="gap-1.5">
                <BarChart3 size={13} />
                Analytics
              </Button>
            </Link>
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
            <CardContent className="space-y-6 p-5">
              {/* Discount Code */}
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Discount Code
                </Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Input
                    className="font-mono"
                    value={settings.discount_code}
                    onChange={(e) => update({ discount_code: e.target.value.toUpperCase() })}
                    placeholder="DISCOUNT10"
                  />
                </div>
                <CodeValidator code={settings.discount_code} />
                <p className="mt-1 text-[10px] text-muted-foreground/40">
                  Must match an active code in the Discounts system
                </p>

                {/* Inline discount creation */}
                <div className="mt-3">
                  <CreatePopupDiscount
                    onCreated={(code) => update({ discount_code: code })}
                  />
                </div>
              </div>

              {/* ── Screen 1: Get Attention ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                    1
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    First Impression
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* ── Screen 2: Email Capture ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                    2
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Email Capture
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Subheadline
                    </Label>
                    <Input
                      className="mt-1.5"
                      value={settings.email_subheadline}
                      onChange={(e) => update({ email_subheadline: e.target.value })}
                      placeholder="We'll send your exclusive code"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      CTA Button Text
                    </Label>
                    <Input
                      className="mt-1.5"
                      value={settings.email_cta_text}
                      onChange={(e) => update({ email_cta_text: e.target.value })}
                      placeholder="Get My Discount"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Appearance Card */}
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Palette size={15} className="text-primary" />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  CTA Button Color
                </Label>
                <p className="mt-0.5 mb-2.5 text-[10px] text-muted-foreground/40">
                  Accent color for the CTA button, timer, and labels
                </p>
                <div className="flex items-center gap-4">
                  <ColorPicker
                    value={settings.cta_color || "#8B5CF6"}
                    onChange={(color) => update({ cta_color: color })}
                  />
                  {/* Live preview — mini button swatch */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-9 rounded-lg px-4 flex items-center"
                      style={{
                        background: `linear-gradient(180deg, color-mix(in srgb, ${settings.cta_color || "#8B5CF6"} 18%, transparent) 0%, color-mix(in srgb, ${settings.cta_color || "#8B5CF6"} 8%, transparent) 100%)`,
                        border: `1px solid color-mix(in srgb, ${settings.cta_color || "#8B5CF6"} 22%, transparent)`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 0 16px color-mix(in srgb, ${settings.cta_color || "#8B5CF6"} 8%, transparent)`,
                      }}
                    >
                      <span className="text-[11px] font-bold text-white/90 whitespace-nowrap">
                        Preview
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/40">
                      Live preview
                    </span>
                  </div>
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
              {/* Display Timing */}
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  When to show the popup
                </Label>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[12px] text-muted-foreground">On mobile, show after</span>
                    <PresetSelector
                      presets={[
                        { label: "5s", value: 5000, recommended: true },
                        { label: "10s", value: 10000 },
                        { label: "15s", value: 15000 },
                      ]}
                      value={settings.mobile_delay}
                      onChange={(val) => update({ mobile_delay: val })}
                      customUnit="seconds"
                      customToDisplay={(val) => Math.round(val / 1000)}
                      displayToCustom={(val) => val * 1000}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[12px] text-muted-foreground">On desktop, show after</span>
                    <PresetSelector
                      presets={[
                        { label: "10s", value: 10000, recommended: true },
                        { label: "20s", value: 20000 },
                        { label: "30s", value: 30000 },
                      ]}
                      value={settings.desktop_delay}
                      onChange={(val) => update({ desktop_delay: val })}
                      customUnit="seconds"
                      customToDisplay={(val) => Math.round(val / 1000)}
                      displayToCustom={(val) => val * 1000}
                    />
                  </div>
                </div>
              </div>

              {/* After Dismissal */}
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  If someone closes it, don&apos;t show again for
                </Label>
                <div className="mt-3">
                  <PresetSelector
                    presets={[
                      { label: "1 day", value: 1 },
                      { label: "7 days", value: 7, recommended: true },
                      { label: "30 days", value: 30 },
                    ]}
                    value={settings.dismiss_days}
                    onChange={(val) => update({ dismiss_days: val })}
                    customUnit="days"
                  />
                </div>
              </div>

              {/* Catch leaving visitors (exit intent) */}
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">Catch leaving visitors</p>
                    <Badge variant="info" className="text-[9px] font-medium uppercase">
                      Desktop only
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/50">
                    Show the popup when someone moves to close the tab
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
        </div>
      )}
    </div>
  );
}
