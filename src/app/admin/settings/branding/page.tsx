"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useOrgId } from "@/components/OrgProvider";
import { emailKey } from "@/lib/constants";
import { COLOR_PRESETS } from "@/lib/color-presets";
import { FONT_PAIRINGS, buildGoogleFontsUrl } from "@/lib/font-pairings";
import type { BrandingSettings } from "@/types/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "@/components/ui/color-picker";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  CheckCircle2,
  ImageIcon,
  Pencil,
  Trash2,
  Save,
  Loader2,
  ChevronDown,
  Check,
  Plus,
  X,
  Type,
} from "lucide-react";

const DEFAULT_BRANDING: BrandingSettings = {
  org_name: "",
  logo_url: "",
  accent_color: "#8B5CF6",
  background_color: "#0e0e0e",
  card_color: "#1a1a1a",
  text_color: "#ffffff",
  heading_font: "Space Mono",
  body_font: "Inter",
  copyright_text: "",
  support_email: "",
};

/* ── Logo processing: auto-trim transparent pixels + resize ── */

function trimAndResizeLogo(file: File, maxWidth: number): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const src = document.createElement("canvas");
          const sCtx = src.getContext("2d")!;
          src.width = img.width;
          src.height = img.height;
          sCtx.drawImage(img, 0, 0);

          const pixels = sCtx.getImageData(0, 0, src.width, src.height).data;
          let top = src.height, bottom = 0, left = src.width, right = 0;
          for (let y = 0; y < src.height; y++) {
            for (let x = 0; x < src.width; x++) {
              if (pixels[(y * src.width + x) * 4 + 3] > 10) {
                if (y < top) top = y;
                if (y > bottom) bottom = y;
                if (x < left) left = x;
                if (x > right) right = x;
              }
            }
          }

          if (top > bottom || left > right) {
            top = 0; bottom = src.height - 1;
            left = 0; right = src.width - 1;
          }

          top = Math.max(0, top - 2);
          left = Math.max(0, left - 2);
          bottom = Math.min(src.height - 1, bottom + 2);
          right = Math.min(src.width - 1, right + 2);

          const cropW = right - left + 1;
          const cropH = bottom - top + 1;

          let outW = cropW, outH = cropH;
          if (outW > maxWidth) {
            outH = Math.round((outH * maxWidth) / outW);
            outW = maxWidth;
          }

          const out = document.createElement("canvas");
          out.width = outW;
          out.height = outH;
          out.getContext("2d")!.drawImage(src, left, top, cropW, cropH, 0, 0, outW, outH);
          resolve(out.toDataURL("image/png"));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function processLogoFile(file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) { alert("Image too large. Maximum is 5MB."); return null; }
  const result = await trimAndResizeLogo(file, 400);
  if (!result) alert("Failed to process image. Try a smaller file.");
  return result;
}

/* ── Favicon processing: center-crop to 180×180 square PNG ── */

function cropToSquare(file: File, size: number): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          canvas.getContext("2d")!.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL("image/png"));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function processFaviconFile(file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) { alert("Image too large. Maximum is 5MB."); return null; }
  const result = await cropToSquare(file, 180);
  if (!result) alert("Failed to process image. Try a smaller file.");
  return result;
}

/* ════════════════════════════════════════════════════════
   BRANDING SETTINGS PAGE
   ════════════════════════════════════════════════════════ */

export default function BrandingSettingsPage() {
  const orgId = useOrgId();
  const [settings, setSettings] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [logoHeight, setLogoHeight] = useState(48);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoDragging, setLogoDragging] = useState(false);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const faviconFileRef = useRef<HTMLInputElement>(null);
  const [faviconDragging, setFaviconDragging] = useState(false);
  const [faviconProcessing, setFaviconProcessing] = useState(false);

  // Load branding settings, with auto-migration from email settings
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/branding");
        if (res.ok) {
          const { data } = await res.json();
          if (data) {
            setSettings({ ...DEFAULT_BRANDING, ...data });
            if (data.logo_height) setLogoHeight(data.logo_height);
          }

          // Auto-migration: if branding has no logo, check email settings
          if (!data?.logo_url) {
            try {
              const emailRes = await fetch(`/api/settings?key=${emailKey(orgId)}`);
              if (emailRes.ok) {
                const emailJson = await emailRes.json();
                if (emailJson?.data?.logo_url) {
                  setSettings(prev => ({ ...prev, logo_url: emailJson.data.logo_url }));
                  if (emailJson.data.logo_height) setLogoHeight(emailJson.data.logo_height);
                }
              }
            } catch { /* email settings not found */ }
          }
        }
      } catch { /* use defaults */ }
      setLoading(false);
    })();
  }, [orgId]);

  const update = <K extends keyof BrandingSettings>(key: K, value: BrandingSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setStatus("");
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus("");
    try {
      const dataToSave = { ...settings, logo_height: logoHeight };
      const res = await fetch("/api/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSave),
      });

      if (!res.ok) {
        const json = await res.json();
        setStatus(`Error: ${json.error || "Failed to save"}`);
        setSaving(false);
        return;
      }

      // Sync logo to email settings (unless email has logo_override)
      try {
        const emailRes = await fetch(`/api/settings?key=${emailKey(orgId)}`);
        if (emailRes.ok) {
          const emailJson = await emailRes.json();
          const emailData = emailJson?.data || {};
          if (!emailData.logo_override && settings.logo_url) {
            const updatedEmail = {
              ...emailData,
              logo_url: settings.logo_url,
              logo_height: logoHeight,
              accent_color: settings.accent_color || emailData.accent_color,
            };
            await fetch("/api/settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key: emailKey(orgId), data: updatedEmail }),
            });
          }
        }
      } catch { /* email sync failed — non-critical */ }

      setStatus("Settings saved");
    } catch {
      setStatus("Error: Failed to save");
    }
    setSaving(false);
  }, [settings, logoHeight, orgId]);

  const handleLogoFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setLogoProcessing(true);
    const compressed = await processLogoFile(file);
    if (!compressed) { setLogoProcessing(false); return; }
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: compressed, key: "branding-logo" }),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        update("logo_url", json.url);
      }
    } catch { /* upload failed */ }
    setLogoProcessing(false);
  }, []);

  const handleFaviconFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setFaviconProcessing(true);
    const compressed = await processFaviconFile(file);
    if (!compressed) { setFaviconProcessing(false); return; }
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: compressed, key: "branding-favicon" }),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        update("favicon_url", json.url);
      }
    } catch { /* upload failed */ }
    setFaviconProcessing(false);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-mono text-sm font-semibold tracking-[2px] text-foreground uppercase">
            Branding
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your global logo and brand identity. Used across all emails, checkout, and event pages.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
            {saving ? "Saving..." : "Save"}
          </Button>
          {status && (
            <span className={`text-xs font-medium flex items-center gap-1 ${status.includes("Error") ? "text-destructive" : "text-success"}`}>
              {!status.includes("Error") && <CheckCircle2 size={12} />}
              {status}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Logo Card */}
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>
              Your logo appears across all emails, checkout headers, and event pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {settings.logo_url ? (
              <div
                className="group relative inline-block cursor-pointer rounded-lg border border-border bg-[#08080c] p-4"
                onClick={() => logoFileRef.current?.click()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={settings.logo_url}
                  alt="Logo"
                  style={{ height: Math.min(logoHeight, 100), width: "auto", maxWidth: 280, objectFit: "contain" }}
                />
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); logoFileRef.current?.click(); }}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); update("logo_url", ""); setStatus(""); }}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-red-500/30 hover:text-red-400"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoFile(file); e.target.value = ""; }}
                />
              </div>
            ) : (
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all max-w-xs ${
                  logoDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
                onClick={() => logoFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setLogoDragging(true); }}
                onDragLeave={() => setLogoDragging(false)}
                onDrop={(e) => { e.preventDefault(); setLogoDragging(false); const file = e.dataTransfer.files[0]; if (file) handleLogoFile(file); }}
              >
                <ImageIcon size={20} className="mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  {logoProcessing ? "Processing..." : "Drop image or click to upload"}
                </p>
                <p className="text-[10px] text-muted-foreground/40 mt-1">PNG, JPG or WebP · Max 5MB</p>
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoFile(file); e.target.value = ""; }}
                />
              </div>
            )}

            {/* Logo Size slider — only show when a logo is set */}
            {settings.logo_url && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label>Logo Height</Label>
                  <Slider
                    min={20}
                    max={100}
                    step={2}
                    value={[Math.min(logoHeight, 100)]}
                    onValueChange={([v]) => { setLogoHeight(v); setStatus(""); }}
                  />
                  <div className="flex justify-between">
                    <span className="text-[10px] text-muted-foreground">20px</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{logoHeight}px</span>
                    <span className="text-[10px] text-muted-foreground">100px</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Favicon Card */}
        <Card>
          <CardHeader>
            <CardTitle>Browser Tab Icon</CardTitle>
            <CardDescription>
              The small icon shown in browser tabs, bookmarks, and when saved to a phone&apos;s home screen. Works best as a simple, square image.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.favicon_url ? (
              <div className="flex items-center gap-4">
                <div
                  className="group relative inline-block cursor-pointer rounded-lg border border-border bg-[#08080c] p-3"
                  onClick={() => faviconFileRef.current?.click()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.favicon_url}
                    alt="Favicon"
                    style={{ width: 32, height: 32, objectFit: "contain" }}
                  />
                  <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); faviconFileRef.current?.click(); }}
                      className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
                    >
                      <Pencil size={9} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); update("favicon_url", ""); setStatus(""); }}
                      className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-red-500/30 hover:text-red-400"
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                  <input
                    ref={faviconFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFaviconFile(file); e.target.value = ""; }}
                  />
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
                  <span className="flex items-center gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={settings.favicon_url} alt="" style={{ width: 16, height: 16 }} />
                    16px
                  </span>
                  <span className="flex items-center gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={settings.favicon_url} alt="" style={{ width: 32, height: 32 }} />
                    32px
                  </span>
                </div>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all max-w-xs ${
                  faviconDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
                onClick={() => faviconFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setFaviconDragging(true); }}
                onDragLeave={() => setFaviconDragging(false)}
                onDrop={(e) => { e.preventDefault(); setFaviconDragging(false); const file = e.dataTransfer.files[0]; if (file) handleFaviconFile(file); }}
              >
                <ImageIcon size={18} className="mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  {faviconProcessing ? "Processing..." : "Drop image or click to upload"}
                </p>
                <p className="text-[10px] text-muted-foreground/40 mt-1">Square PNG, JPG or SVG · Max 5MB</p>
                <input
                  ref={faviconFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFaviconFile(file); e.target.value = ""; }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Brand Identity Card */}
        <Card>
          <CardHeader>
            <CardTitle>Brand Identity</CardTitle>
            <CardDescription>Your organisation name</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Organisation Name</Label>
              <Input
                value={settings.org_name || ""}
                onChange={(e) => update("org_name", e.target.value)}
                placeholder="Your Brand Name"
                className="max-w-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Color Theme Card */}
        <Card>
          <CardHeader>
            <CardTitle>Color Theme</CardTitle>
            <CardDescription>Choose a curated palette or customise individual colors</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {COLOR_PRESETS.map((preset) => {
                const isActive = settings.color_preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSettings((prev) => ({
                        ...prev,
                        accent_color: preset.colors.accent,
                        background_color: preset.colors.background,
                        card_color: preset.colors.card,
                        text_color: preset.colors.text,
                        card_border_color: preset.colors.border,
                        color_preset: preset.id,
                      }));
                      setStatus("");
                    }}
                    className={`relative rounded-lg border p-3 text-left transition-all ${
                      isActive
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-border/40 hover:border-border"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute top-2 right-2">
                        <Check size={12} className="text-primary" />
                      </div>
                    )}
                    {/* Mini-preview */}
                    <div
                      className="h-16 rounded-md mb-2 p-2 flex flex-col gap-1"
                      style={{ backgroundColor: preset.colors.background }}
                    >
                      <div
                        className="flex-1 rounded border"
                        style={{ backgroundColor: preset.colors.card, borderColor: preset.colors.border }}
                      >
                        <div className="flex items-center gap-1.5 p-1.5">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: preset.colors.accent }}
                          />
                          <div
                            className="h-1 w-8 rounded-full opacity-60"
                            style={{ backgroundColor: preset.colors.text }}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-medium block">{preset.name}</span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">{preset.mood}</span>
                  </button>
                );
              })}
            </div>

            {/* Advanced: Edit individual colors */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
                <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                Advanced: Edit individual colors
              </summary>
              <div className="mt-4 space-y-3 pl-0.5">
                <div className="space-y-2">
                  <Label className="text-xs">Accent Color</Label>
                  <ColorPicker
                    value={settings.accent_color || "#8B5CF6"}
                    onChange={(v) => { update("accent_color", v); setSettings((prev) => ({ ...prev, color_preset: undefined })); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Background</Label>
                  <ColorPicker
                    value={settings.background_color || "#0e0e0e"}
                    onChange={(v) => { update("background_color", v); setSettings((prev) => ({ ...prev, color_preset: undefined })); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Card Background</Label>
                  <ColorPicker
                    value={settings.card_color || "#1a1a1a"}
                    onChange={(v) => { update("card_color", v); setSettings((prev) => ({ ...prev, color_preset: undefined })); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Text Color</Label>
                  <ColorPicker
                    value={settings.text_color || "#ffffff"}
                    onChange={(v) => { update("text_color", v); setSettings((prev) => ({ ...prev, color_preset: undefined })); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Border Color</Label>
                  <ColorPicker
                    value={settings.card_border_color || "#2a2a2a"}
                    onChange={(v) => { update("card_border_color", v); setSettings((prev) => ({ ...prev, color_preset: undefined })); }}
                  />
                </div>
              </div>
            </details>
          </CardContent>
        </Card>

        {/* Typography Card */}
        <Card>
          <CardHeader>
            <CardTitle>Typography</CardTitle>
            <CardDescription>Choose a font pairing for headings and body text</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Load all font options */}
            {FONT_PAIRINGS.map((p) => (
              <link key={p.id} href={buildGoogleFontsUrl(p)} rel="stylesheet" />
            ))}
            <div className="grid gap-3">
              {FONT_PAIRINGS.map((pairing) => {
                const isActive = settings.heading_font === pairing.heading && settings.body_font === pairing.body;
                return (
                  <button
                    key={pairing.id}
                    type="button"
                    onClick={() => {
                      setSettings((prev) => ({
                        ...prev,
                        heading_font: pairing.heading,
                        body_font: pairing.body,
                      }));
                      setStatus("");
                    }}
                    className={`flex items-center gap-4 rounded-lg border p-4 text-left transition-all ${
                      isActive
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-border/40 hover:border-border"
                    }`}
                  >
                    <Type size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-base font-bold truncate"
                        style={{ fontFamily: `'${pairing.heading}', sans-serif` }}
                      >
                        {pairing.name}
                      </p>
                      <p
                        className="text-xs text-muted-foreground mt-0.5"
                        style={{ fontFamily: `'${pairing.body}', sans-serif` }}
                      >
                        {pairing.heading} + {pairing.body} — {pairing.style}
                      </p>
                    </div>
                    {isActive && <Check size={14} className="text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* About Section Card — hidden for FERAL org */}
        {orgId !== "feral" && (
          <Card>
            <CardHeader>
              <CardTitle>About Section</CardTitle>
              <CardDescription>Content for the about section on your landing page</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Heading Line 1</Label>
                  <Input
                    value={settings.about_section?.heading_line1 || ""}
                    onChange={(e) => {
                      const about = settings.about_section || { heading_line1: "", heading_line2: "", pillars: [], closer: "" };
                      update("about_section", { ...about, heading_line1: e.target.value });
                    }}
                    placeholder="ABOUT"
                    className="max-w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Heading Line 2</Label>
                  <Input
                    value={settings.about_section?.heading_line2 || ""}
                    onChange={(e) => {
                      const about = settings.about_section || { heading_line1: "", heading_line2: "", pillars: [], closer: "" };
                      update("about_section", { ...about, heading_line2: e.target.value });
                    }}
                    placeholder="US"
                    className="max-w-full"
                  />
                </div>
              </div>

              <Separator />

              {/* Pillars */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Pillars</Label>
                  {(settings.about_section?.pillars?.length || 0) < 3 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        const about = settings.about_section || { heading_line1: "ABOUT", heading_line2: "US", pillars: [], closer: "Join us" };
                        const pillars = [...(about.pillars || []), { title: "", text: "" }];
                        update("about_section", { ...about, pillars });
                      }}
                    >
                      <Plus size={10} className="mr-1" />
                      Add Pillar
                    </Button>
                  )}
                </div>
                {(settings.about_section?.pillars || []).map((pillar, i) => (
                  <div key={i} className="rounded-lg border border-border/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-mono">0{i + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const about = settings.about_section!;
                          const pillars = about.pillars.filter((_, idx) => idx !== i);
                          update("about_section", { ...about, pillars });
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <Input
                      value={pillar.title}
                      onChange={(e) => {
                        const about = settings.about_section!;
                        const pillars = [...about.pillars];
                        pillars[i] = { ...pillars[i], title: e.target.value };
                        update("about_section", { ...about, pillars });
                      }}
                      placeholder="Pillar title"
                      className="h-8 text-sm"
                    />
                    <Textarea
                      value={pillar.text}
                      onChange={(e) => {
                        const about = settings.about_section!;
                        const pillars = [...about.pillars];
                        pillars[i] = { ...pillars[i], text: e.target.value };
                        update("about_section", { ...about, pillars });
                      }}
                      placeholder="Describe this pillar..."
                      className="text-sm min-h-[60px]"
                    />
                  </div>
                ))}
                {(!settings.about_section?.pillars || settings.about_section.pillars.length === 0) && (
                  <p className="text-[11px] text-muted-foreground/60">
                    No pillars yet. Add up to 3 pillars to tell visitors what you&apos;re about.
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-xs">Closer Tagline</Label>
                <Input
                  value={settings.about_section?.closer || ""}
                  onChange={(e) => {
                    const about = settings.about_section || { heading_line1: "", heading_line2: "", pillars: [], closer: "" };
                    update("about_section", { ...about, closer: e.target.value });
                  }}
                  placeholder="Join us"
                  className="max-w-sm"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer Card */}
        <Card>
          <CardHeader>
            <CardTitle>Footer</CardTitle>
            <CardDescription>Shown at the bottom of emails and event pages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Copyright Text</Label>
              <Input
                value={settings.copyright_text || ""}
                onChange={(e) => update("copyright_text", e.target.value)}
                placeholder="© 2026 Your Brand Name"
                className="max-w-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Support Email</Label>
              <Input
                type="email"
                value={settings.support_email || ""}
                onChange={(e) => update("support_email", e.target.value)}
                placeholder="support@yourbrand.com"
                className="max-w-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Downstream info */}
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Changes here update your global brand identity. All emails (order confirmation, abandoned cart, announcements) will use this logo unless individually overridden. Edit email-specific settings in{" "}
            <Link href="/admin/communications/" className="text-primary hover:underline">
              Communications
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
