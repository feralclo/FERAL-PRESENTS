"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, walletPassesKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import type { WalletPassSettings } from "@/types/email";
import { DEFAULT_WALLET_PASS_SETTINGS } from "@/types/email";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/ui/color-picker";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ChevronLeft,
  CheckCircle2,
  QrCode,
  ImageIcon,
  Pencil,
  Trash2,
  Smartphone,
  Shield,
  AlertCircle,
  Ticket,
} from "lucide-react";

/* ── Logo processing (shared with PDF ticket editor) ── */

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
          if (top > bottom || left > right) { top = 0; bottom = src.height - 1; left = 0; right = src.width - 1; }
          top = Math.max(0, top - 2); left = Math.max(0, left - 2);
          bottom = Math.min(src.height - 1, bottom + 2); right = Math.min(src.width - 1, right + 2);
          const cropW = right - left + 1, cropH = bottom - top + 1;
          let outW = cropW, outH = cropH;
          if (outW > maxWidth) { outH = Math.round((outH * maxWidth) / outW); outW = maxWidth; }
          const out = document.createElement("canvas");
          out.width = outW; out.height = outH;
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

/* ═══════════════════════════════════════════════════════════
   WALLET PASS PREVIEW — Mimics an iOS Wallet pass
   ═══════════════════════════════════════════════════════════ */

function WalletPassPreview({ settings: s, large }: { settings: WalletPassSettings; large?: boolean }) {
  const accent = s.accent_color || "#8B5CF6";
  const bg = s.bg_color || "#08080c";
  const text = s.text_color || "#ffffff";
  const label = s.label_color || "#8B5CF6";
  const maxW = large ? 420 : 320;

  const hasMerch = true; // Preview always shows merch example

  return (
    <div className="mx-auto" style={{ maxWidth: maxW }}>
      {/* Pass card */}
      <div
        className="relative overflow-hidden rounded-2xl shadow-2xl"
        style={{
          backgroundColor: bg,
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header strip */}
        <div
          className="relative px-5 pt-5 pb-4"
          style={{ minHeight: 56 }}
        >
          {/* Logo + Org name */}
          <div className="flex items-center gap-3">
            {s.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={s.logo_url}
                alt="Logo"
                style={{ height: 28, width: "auto", maxWidth: 120, objectFit: "contain" }}
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: accent }}>
                <Ticket size={16} className="text-white" />
              </div>
            )}
            <span
              className="text-xs font-semibold uppercase tracking-[1.5px]"
              style={{ color: `${text}99` }}
            >
              {s.organization_name}
            </span>
          </div>
        </div>

        {/* Primary field — Event name */}
        <div className="px-5 pb-3">
          <div
            className="text-[10px] font-bold uppercase tracking-[2px]"
            style={{ color: label, marginBottom: 4 }}
          >
            EVENT
          </div>
          <div
            className="text-lg font-bold tracking-wide"
            style={{ color: text }}
          >
            Summer Festival
          </div>
        </div>

        {/* Secondary fields — Venue + Date */}
        <div className="flex gap-6 px-5 pb-3">
          <div className="flex-1">
            <div
              className="text-[9px] font-bold uppercase tracking-[1.5px]"
              style={{ color: label, marginBottom: 2 }}
            >
              VENUE
            </div>
            <div className="text-xs font-medium" style={{ color: text }}>
              Invisible Wind Factory
            </div>
          </div>
          <div className="flex-1">
            <div
              className="text-[9px] font-bold uppercase tracking-[1.5px]"
              style={{ color: label, marginBottom: 2 }}
            >
              DATE
            </div>
            <div className="text-xs font-medium" style={{ color: text }}>
              Thu 27 Mar 2026 · Doors 9pm
            </div>
          </div>
        </div>

        {/* Auxiliary fields — Ticket type + Merch */}
        <div className="flex gap-6 px-5 pb-4">
          <div className="flex-1">
            <div
              className="text-[9px] font-bold uppercase tracking-[1.5px]"
              style={{ color: label, marginBottom: 2 }}
            >
              TICKET
            </div>
            <div className="text-xs font-medium" style={{ color: text }}>
              General Release
            </div>
          </div>
          {hasMerch && (
            <div className="flex-1">
              <div
                className="text-[9px] font-bold uppercase tracking-[1.5px]"
                style={{ color: label, marginBottom: 2 }}
              >
                MERCH
              </div>
              <div className="text-xs font-medium" style={{ color: text }}>
                Includes Event Tee (L)
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-5" style={{ height: 1, backgroundColor: `${text}15` }} />

        {/* QR Code */}
        <div className="flex flex-col items-center py-5">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: large ? 160 : 120,
              height: large ? 160 : 120,
              backgroundColor: "#ffffff",
              padding: 8,
            }}
          >
            <QrCode style={{ width: "85%", height: "85%", color: "#000" }} />
          </div>
          <div
            className="mt-3 font-mono text-xs font-bold tracking-[1.5px]"
            style={{ color: accent }}
          >
            DEMO-A1B2C3D4
          </div>
        </div>
      </div>

      {/* Caption */}
      <p className="mt-3 text-center text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
        Wallet Pass Preview — approximate rendering
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   WALLET PASSES EDITOR PAGE
   ═══════════════════════════════════════════════════════════ */

export default function WalletPassesPage() {
  const orgId = useOrgId();
  const [settings, setSettings] = useState<WalletPassSettings>(DEFAULT_WALLET_PASS_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const [stripProcessing, setStripProcessing] = useState(false);
  const [stripDragging, setStripDragging] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const stripFileRef = useRef<HTMLInputElement>(null);

  // Provider configuration status
  const [configStatus, setConfigStatus] = useState<{
    apple: { configured: boolean; hasCertificate: boolean; hasWwdr: boolean; hasPassTypeId: boolean; hasTeamId: boolean };
    google: { configured: boolean; hasServiceAccount: boolean; hasIssuerId: boolean };
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) { setLoading(false); return; }
        const { data } = await supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", walletPassesKey(orgId)).single();
        if (data?.data && typeof data.data === "object") {
          setSettings((prev) => ({ ...prev, ...(data.data as Partial<WalletPassSettings>) }));
        }
      } catch { /* defaults are fine */ }
      setLoading(false);
    })();

    // Fetch provider config status
    fetch("/api/wallet/status")
      .then((r) => r.json())
      .then((json) => {
        if (json.apple && json.google) setConfigStatus(json);
      })
      .catch(() => {});
  }, []);

  const update = <K extends keyof WalletPassSettings>(key: K, value: WalletPassSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setStatus("");
  };

  const handleSave = useCallback(async () => {
    setSaving(true); setStatus("");
    try {
      const supabase = getSupabaseClient();
      if (!supabase) { setStatus("Error: Database not configured"); setSaving(false); return; }
      const { error } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .upsert({ key: walletPassesKey(orgId), data: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
      setStatus(error ? `Error: ${error.message}` : "Settings saved");
    } catch { setStatus("Error: Failed to save"); }
    setSaving(false);
  }, [settings]);

  const handleLogoFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    setLogoProcessing(true);
    const result = await trimAndResizeLogo(file, 400);
    if (!result) { setLogoProcessing(false); return; }
    try {
      const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageData: result, key: "wallet-pass-logo" }) });
      const json = await res.json();
      if (res.ok && json.url) update("logo_url", json.url);
    } catch { /* upload failed */ }
    setLogoProcessing(false);
  }, []);

  const handleStripFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    setStripProcessing(true);
    const result = await trimAndResizeLogo(file, 1000);
    if (!result) { setStripProcessing(false); return; }
    try {
      const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageData: result, key: "wallet-pass-strip" }) });
      const json = await res.json();
      if (res.ok && json.url) update("strip_url", json.url);
    } catch { /* upload failed */ }
    setStripProcessing(false);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <span className="font-mono text-xs tracking-[2px] text-muted-foreground uppercase">Loading...</span>
    </div>
  );

  return (
    <div>
      {/* Breadcrumb + title */}
      <div className="mb-8">
        <Link href="/admin/communications/" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground">
          <ChevronLeft size={14} />
          Communications
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-sm font-semibold tracking-[2px] text-foreground uppercase">Wallet Passes</h1>
          <Badge variant={settings.apple_wallet_enabled || settings.google_wallet_enabled ? "success" : "secondary"} className="text-[10px]">
            {settings.apple_wallet_enabled || settings.google_wallet_enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Let customers add their tickets to Apple Wallet or Google Wallet for quick access at the door.
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="editor">
        <div className="flex items-center justify-between border-b border-border mb-6">
          <TabsList variant="line">
            <TabsTrigger value="editor" className="text-sm">Editor</TabsTrigger>
            <TabsTrigger value="preview" className="text-sm">Full Preview</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 pb-1">
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
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

        {/* Editor tab */}
        <TabsContent value="editor">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8">
            {/* Left — settings */}
            <div className="space-y-6">

              {/* Provider Toggles */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone size={16} />
                    Wallet Providers
                  </CardTitle>
                  <CardDescription>Enable Apple Wallet and Google Wallet passes for your customers. Each provider requires separate configuration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Apple Wallet */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">Apple Wallet</p>
                        {configStatus?.apple.configured ? (
                          <Badge variant="success" className="text-[9px]">Configured</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px]">Setup Required</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Generates .pkpass files that customers can add to Apple Wallet on iOS.
                      </p>
                      {!configStatus?.apple.configured && settings.apple_wallet_enabled && (
                        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-warning">
                          <AlertCircle size={12} className="mt-0.5 shrink-0" />
                          <span>
                            Missing:
                            {!configStatus?.apple.hasCertificate && " Pass Certificate (env var)"}
                            {!configStatus?.apple.hasPassTypeId && " Pass Type ID"}
                            {!configStatus?.apple.hasTeamId && " Team ID"}
                            . Run the setup script or configure manually.
                          </span>
                        </div>
                      )}
                    </div>
                    <Switch
                      checked={settings.apple_wallet_enabled}
                      onCheckedChange={(v) => update("apple_wallet_enabled", v)}
                    />
                  </div>

                  <Separator />

                  {/* Google Wallet */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">Google Wallet</p>
                        {configStatus?.google.configured ? (
                          <Badge variant="success" className="text-[9px]">Configured</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px]">Setup Required</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Creates passes that customers can save to Google Wallet on Android.
                      </p>
                      {!configStatus?.google.configured && settings.google_wallet_enabled && (
                        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-warning">
                          <AlertCircle size={12} className="mt-0.5 shrink-0" />
                          <span>
                            Missing:
                            {!configStatus?.google.hasServiceAccount && " Service Account Key (env var)"}
                            {!configStatus?.google.hasIssuerId && " Issuer ID"}
                            . Run the setup script or configure manually.
                          </span>
                        </div>
                      )}
                    </div>
                    <Switch
                      checked={settings.google_wallet_enabled}
                      onCheckedChange={(v) => update("google_wallet_enabled", v)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Only show customization when at least one provider is enabled */}
              {(settings.apple_wallet_enabled || settings.google_wallet_enabled) && (
                <>
                  {/* Branding */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Branding</CardTitle>
                      <CardDescription>Customise how your passes look in Apple Wallet and Google Wallet</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Organisation name */}
                      <div className="space-y-2">
                        <Label>Organisation Name</Label>
                        <Input
                          value={settings.organization_name}
                          onChange={(e) => update("organization_name", e.target.value)}
                          placeholder="Your Brand Name"
                          className="max-w-sm font-mono uppercase"
                        />
                        <p className="text-[11px] text-muted-foreground">Shown on the pass header and in Wallet app listings.</p>
                      </div>

                      <Separator />

                      {/* Logo upload */}
                      <div className="space-y-3">
                        <Label>Pass Logo</Label>
                        <p className="text-[11px] text-muted-foreground">Displayed in the pass header. Transparent PNGs work best.</p>

                        {settings.logo_url ? (
                          <div
                            className="group relative inline-block cursor-pointer rounded-lg border border-border bg-[#08080c] p-4"
                            onClick={() => logoFileRef.current?.click()}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={settings.logo_url}
                              alt="Logo"
                              style={{ height: 36, width: "auto", maxWidth: 200, objectFit: "contain" }}
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
                                onClick={(e) => { e.stopPropagation(); update("logo_url", undefined); }}
                                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-red-500/30 hover:text-red-400"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                            <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = ""; }} />
                          </div>
                        ) : (
                          <div
                            className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all max-w-xs ${
                              logoDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                            }`}
                            onClick={() => logoFileRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setLogoDragging(true); }}
                            onDragLeave={() => setLogoDragging(false)}
                            onDrop={(e) => { e.preventDefault(); setLogoDragging(false); const f = e.dataTransfer.files[0]; if (f) handleLogoFile(f); }}
                          >
                            <ImageIcon size={16} className="mx-auto mb-1.5 text-muted-foreground/50" />
                            <p className="text-xs text-muted-foreground">{logoProcessing ? "Processing..." : "Drop image or click to upload"}</p>
                            <p className="text-[10px] text-muted-foreground/40 mt-0.5">PNG, JPG or WebP</p>
                            <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = ""; }} />
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Strip/banner image */}
                      <div className="space-y-3">
                        <Label>Strip Image <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <p className="text-[11px] text-muted-foreground">A banner image shown behind the pass content. Recommended: 1125 x 432px.</p>

                        {settings.strip_url ? (
                          <div
                            className="group relative inline-block cursor-pointer rounded-lg border border-border bg-[#08080c] overflow-hidden"
                            onClick={() => stripFileRef.current?.click()}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={settings.strip_url}
                              alt="Strip"
                              style={{ height: 60, width: "auto", maxWidth: 280, objectFit: "cover" }}
                            />
                            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); stripFileRef.current?.click(); }}
                                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); update("strip_url", undefined); }}
                                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-red-500/30 hover:text-red-400"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                            <input ref={stripFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleStripFile(f); e.target.value = ""; }} />
                          </div>
                        ) : (
                          <div
                            className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all max-w-xs ${
                              stripDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                            }`}
                            onClick={() => stripFileRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setStripDragging(true); }}
                            onDragLeave={() => setStripDragging(false)}
                            onDrop={(e) => { e.preventDefault(); setStripDragging(false); const f = e.dataTransfer.files[0]; if (f) handleStripFile(f); }}
                          >
                            <ImageIcon size={16} className="mx-auto mb-1.5 text-muted-foreground/50" />
                            <p className="text-xs text-muted-foreground">{stripProcessing ? "Processing..." : "Drop image or click to upload"}</p>
                            <p className="text-[10px] text-muted-foreground/40 mt-0.5">PNG, JPG or WebP · 1125×432px recommended</p>
                            <input ref={stripFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleStripFile(f); e.target.value = ""; }} />
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Colours */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Accent / Label</Label>
                          <ColorPicker value={settings.accent_color} onChange={(v) => update("accent_color", v)} />
                          <p className="text-[10px] text-muted-foreground">Field labels, ticket code</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Background</Label>
                          <ColorPicker value={settings.bg_color} onChange={(v) => update("bg_color", v)} />
                          <p className="text-[10px] text-muted-foreground">Pass background</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Text</Label>
                          <ColorPicker value={settings.text_color} onChange={(v) => update("text_color", v)} />
                          <p className="text-[10px] text-muted-foreground">Primary text</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Label Color</Label>
                          <ColorPicker value={settings.label_color} onChange={(v) => update("label_color", v)} />
                          <p className="text-[10px] text-muted-foreground">Section headers</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Content */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Content</CardTitle>
                      <CardDescription>Control which fields are shown on the pass</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="space-y-2">
                        <Label>Pass Description</Label>
                        <Input
                          value={settings.description}
                          onChange={(e) => update("description", e.target.value)}
                          placeholder="Event Ticket"
                          className="max-w-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">Accessibility label and Wallet app listing subtitle.</p>
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <ToggleRow
                          label="Show Holder Name"
                          description="Display the ticket holder's name on the back of the pass"
                          checked={settings.show_holder}
                          onChange={(v) => update("show_holder", v)}
                        />
                        <ToggleRow
                          label="Show Order Number"
                          description="Display the order reference on the back of the pass"
                          checked={settings.show_order_number}
                          onChange={(v) => update("show_order_number", v)}
                        />
                        <ToggleRow
                          label="Show Terms"
                          description="Display terms and conditions on the back of the pass"
                          checked={settings.show_terms}
                          onChange={(v) => update("show_terms", v)}
                        />
                      </div>

                      {settings.show_terms && (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <Label>Terms Text</Label>
                            <Textarea
                              value={settings.terms_text}
                              onChange={(e) => update("terms_text", e.target.value)}
                              placeholder="This ticket is valid for one entry only..."
                              className="max-w-lg"
                              rows={3}
                            />
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Provider Configuration */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield size={16} />
                        Provider Configuration
                      </CardTitle>
                      <CardDescription>
                        Apple and Google Wallet require certificates and API keys configured as environment variables.
                        The fields below are optional overrides — leave blank to use environment variable values.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {settings.apple_wallet_enabled && (
                        <>
                          <div className="space-y-1 mb-3">
                            <p className="text-xs font-semibold text-foreground">Apple Wallet</p>
                            <p className="text-[11px] text-muted-foreground">Requires <code className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-foreground/70">APPLE_PASS_CERTIFICATE</code> env var. The WWDR G4 certificate is fetched automatically from Apple.</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs">Pass Type ID</Label>
                              <Input
                                value={settings.apple_pass_type_id || ""}
                                onChange={(e) => update("apple_pass_type_id", e.target.value || undefined)}
                                placeholder="pass.com.example.ticket"
                                className="font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Team ID</Label>
                              <Input
                                value={settings.apple_team_id || ""}
                                onChange={(e) => update("apple_team_id", e.target.value || undefined)}
                                placeholder="XXXXXXXXXX"
                                className="font-mono text-xs"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {settings.apple_wallet_enabled && settings.google_wallet_enabled && <Separator />}

                      {settings.google_wallet_enabled && (
                        <>
                          <div className="space-y-1 mb-3">
                            <p className="text-xs font-semibold text-foreground">Google Wallet</p>
                            <p className="text-[11px] text-muted-foreground">Requires <code className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-foreground/70">GOOGLE_WALLET_SERVICE_ACCOUNT_KEY</code> env var</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs">Issuer ID</Label>
                              <Input
                                value={settings.google_issuer_id || ""}
                                onChange={(e) => update("google_issuer_id", e.target.value || undefined)}
                                placeholder="3388000000012345678"
                                className="font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Class Suffix</Label>
                              <Input
                                value={settings.google_class_suffix || ""}
                                onChange={(e) => update("google_class_suffix", e.target.value || undefined)}
                                placeholder="event_ticket"
                                className="font-mono text-xs"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {!settings.apple_wallet_enabled && !settings.google_wallet_enabled && (
                        <p className="text-sm text-muted-foreground">Enable at least one provider above to configure credentials.</p>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Right — live preview */}
            <div className="xl:sticky xl:top-20 xl:self-start">
              {settings.apple_wallet_enabled || settings.google_wallet_enabled ? (
                <WalletPassPreview settings={settings} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Smartphone size={40} className="mb-3 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">Enable a wallet provider to see the pass preview</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Full preview tab */}
        <TabsContent value="preview">
          <div className="flex justify-center py-6">
            {settings.apple_wallet_enabled || settings.google_wallet_enabled ? (
              <WalletPassPreview settings={settings} large />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Smartphone size={48} className="mb-4 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">Enable a wallet provider to see the pass preview</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Reusable inline components ── */

function ToggleRow({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
