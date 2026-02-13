"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";
import type { PdfTicketSettings } from "@/types/email";
import { DEFAULT_PDF_TICKET_SETTINGS } from "@/types/email";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ChevronLeft,
  CheckCircle2,
  QrCode,
  ImageIcon,
  Pencil,
  Trash2,
} from "lucide-react";

/* ── Logo processing ── */

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

/* ── Live PDF ticket preview (pure HTML/CSS) ── */
function TicketPreview({ settings: s, large }: { settings: PdfTicketSettings; large?: boolean }) {
  const accent = s.accent_color || "#ff0033";
  const bg = s.bg_color || "#0e0e0e";
  const text = s.text_color || "#ffffff";
  const secondary = s.secondary_color || "#969696";
  const qrPct = Math.round((s.qr_size / 148) * 100);
  // Logo height scales: mm on A5 → percentage of 210mm height
  const logoHPct = s.logo_url ? `${Math.round((s.logo_height / 210) * 100)}%` : undefined;

  return (
    <div className="mx-auto" style={{ maxWidth: large ? 680 : 340 }}>
      <div
        className="relative overflow-hidden rounded-lg shadow-2xl"
        style={{
          backgroundColor: bg,
          aspectRatio: "148 / 210",
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <div className="absolute inset-x-0 top-0" style={{ height: "1%", backgroundColor: accent }} />

        <div className="flex h-full flex-col items-center justify-between px-[12%] py-[8%]">
          {/* Top: Brand — logo or text */}
          <div className="w-full text-center">
            {s.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.logo_url}
                alt="Brand"
                style={{ height: logoHPct, width: "auto", maxWidth: "70%", objectFit: "contain", margin: "0 auto" }}
              />
            ) : (
              <div
                style={{
                  fontFamily: "'Space Mono', 'Courier New', monospace",
                  fontSize: "clamp(10px, 3.5vw, 16px)",
                  fontWeight: 700,
                  color: text,
                  letterSpacing: 2,
                }}
              >
                {s.brand_name}
              </div>
            )}
            <div className="mx-auto mt-[4%]" style={{ height: 1, backgroundColor: "#282828", width: "70%" }} />
          </div>

          {/* Event info */}
          <div className="w-full text-center" style={{ marginTop: "-2%" }}>
            <div style={{ fontFamily: "'Space Mono', 'Courier New', monospace", fontSize: "clamp(10px, 3vw, 14px)", fontWeight: 700, color: text, letterSpacing: 1, textTransform: "uppercase" }}>
              FERAL LIVERPOOL
            </div>
            <div style={{ fontSize: "clamp(7px, 2vw, 9px)", color: secondary, marginTop: 4 }}>Invisible Wind Factory</div>
            <div style={{ fontSize: "clamp(7px, 2vw, 9px)", color: secondary, marginTop: 2 }}>Thursday 27 March 2026</div>
            <div style={{ fontFamily: "'Space Mono', 'Courier New', monospace", fontSize: "clamp(8px, 2.4vw, 11px)", fontWeight: 700, color: accent, marginTop: 8, textTransform: "uppercase" }}>
              GENERAL RELEASE
            </div>
          </div>

          {/* QR Code placeholder */}
          <div
            className="flex items-center justify-center rounded-md"
            style={{ width: `${qrPct}%`, aspectRatio: "1 / 1", backgroundColor: "#ffffff", padding: "3%" }}
          >
            <QrCode style={{ width: "80%", height: "80%", color: "#000" }} />
          </div>

          {/* Ticket code */}
          <div className="w-full text-center">
            <div style={{ fontFamily: "'Space Mono', 'Courier New', monospace", fontSize: "clamp(10px, 3vw, 14px)", fontWeight: 700, color: accent, letterSpacing: 1 }}>
              FERAL-A1B2C3D4
            </div>
            {s.show_holder && (
              <div style={{ fontSize: "clamp(7px, 2.2vw, 10px)", color: `${text}cc`, marginTop: 6 }}>Alex Test</div>
            )}
            {s.show_order && (
              <div style={{ fontFamily: "'Space Mono', 'Courier New', monospace", fontSize: "clamp(5px, 1.6vw, 7px)", color: "#646464", marginTop: 4 }}>
                ORDER: FERAL-00042
              </div>
            )}
          </div>

          {/* Bottom */}
          <div className="w-full text-center">
            <div className="mx-auto mb-[3%]" style={{ height: 1, backgroundColor: "#282828", width: "70%" }} />
            {s.show_disclaimer && (
              <>
                <div style={{ fontSize: "clamp(4px, 1.3vw, 6px)", color: "#505050", letterSpacing: 0.5, textTransform: "uppercase" }}>{s.disclaimer_line1}</div>
                <div style={{ fontSize: "clamp(4px, 1.3vw, 6px)", color: "#505050", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 3 }}>{s.disclaimer_line2}</div>
              </>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0" style={{ height: "1%", backgroundColor: accent }} />
      </div>
      <p className="mt-3 text-center text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
        A5 Ticket Preview
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   PDF TICKET EDITOR PAGE
   ════════════════════════════════════════════════════════ */

export default function PdfTicketPage() {
  const [settings, setSettings] = useState<PdfTicketSettings>(DEFAULT_PDF_TICKET_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) { setLoading(false); return; }
        const { data } = await supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", "feral_pdf_ticket").single();
        if (data?.data && typeof data.data === "object") {
          setSettings((prev) => ({ ...prev, ...(data.data as Partial<PdfTicketSettings>) }));
        }
      } catch { /* defaults are fine */ }
      setLoading(false);
    })();
  }, []);

  const update = <K extends keyof PdfTicketSettings>(key: K, value: PdfTicketSettings[K]) => {
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
        .upsert({ key: "feral_pdf_ticket", data: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
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
      const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageData: result, key: "pdf-ticket-logo" }) });
      const json = await res.json();
      if (res.ok && json.url) update("logo_url", json.url);
    } catch { /* upload failed */ }
    setLogoProcessing(false);
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
        <div>
          <h1 className="font-mono text-sm font-semibold tracking-[2px] text-foreground uppercase">PDF Ticket</h1>
          <p className="mt-1 text-sm text-muted-foreground">Customise the PDF ticket that gets attached to order confirmation emails.</p>
        </div>
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

        {/* Editor tab — settings + live preview side by side */}
        <TabsContent value="editor">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8">
            {/* Left — settings */}
            <div className="space-y-6">
              {/* Brand Identity */}
              <Card>
                <CardHeader>
                  <CardTitle>Brand Identity</CardTitle>
                  <CardDescription>Logo or text shown at the top of every ticket</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Logo upload */}
                  <div className="space-y-3">
                    <Label>Ticket Logo</Label>
                    <p className="text-[11px] text-muted-foreground">Upload a logo to replace the brand name text. Transparent PNGs are auto-cropped.</p>

                    {settings.logo_url ? (
                      <div
                        className="group relative inline-block cursor-pointer rounded-lg border border-border bg-[#0e0e0e] p-4"
                        onClick={() => logoFileRef.current?.click()}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={settings.logo_url}
                          alt="Logo"
                          style={{ height: 40, width: "auto", maxWidth: 200, objectFit: "contain" }}
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

                  {/* Logo size slider — only when logo is set */}
                  {settings.logo_url && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Logo Size</Label>
                        <span className="font-mono text-xs text-muted-foreground">{settings.logo_height}mm</span>
                      </div>
                      <Slider
                        min={8}
                        max={40}
                        step={1}
                        value={[settings.logo_height]}
                        onValueChange={([v]) => update("logo_height", v)}
                      />
                    </div>
                  )}

                  <Separator />

                  {/* Brand name — always editable (fallback when no logo) */}
                  <div className="space-y-2">
                    <Label>Brand Name {settings.logo_url && <span className="text-muted-foreground font-normal">(fallback)</span>}</Label>
                    <Input
                      value={settings.brand_name}
                      onChange={(e) => update("brand_name", e.target.value)}
                      placeholder="FERAL PRESENTS"
                      className="max-w-sm font-mono uppercase"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {settings.logo_url ? "Used when the logo can't be rendered" : "Displayed at the top of every ticket"}
                    </p>
                  </div>

                  <Separator />

                  {/* Color grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <ColorPicker label="Accent Color" value={settings.accent_color} onChange={(v) => update("accent_color", v)} hint="Bars, ticket codes" />
                    <ColorPicker label="Background" value={settings.bg_color} onChange={(v) => update("bg_color", v)} hint="Ticket background" />
                    <ColorPicker label="Primary Text" value={settings.text_color} onChange={(v) => update("text_color", v)} hint="Brand, event name" />
                    <ColorPicker label="Secondary Text" value={settings.secondary_color} onChange={(v) => update("secondary_color", v)} hint="Venue, date" />
                  </div>
                </CardContent>
              </Card>

              {/* Layout */}
              <Card>
                <CardHeader>
                  <CardTitle>Layout</CardTitle>
                  <CardDescription>Control the size and visibility of ticket elements</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>QR Code Size</Label>
                      <span className="font-mono text-xs text-muted-foreground">{settings.qr_size}mm</span>
                    </div>
                    <Slider
                      min={30}
                      max={70}
                      step={2}
                      value={[settings.qr_size]}
                      onValueChange={([v]) => update("qr_size", v)}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <ToggleRow label="Show Holder Name" description="Display the ticket holder's name" checked={settings.show_holder} onChange={(v) => update("show_holder", v)} />
                    <ToggleRow label="Show Order Number" description="Display the order reference" checked={settings.show_order} onChange={(v) => update("show_order", v)} />
                    <ToggleRow label="Show Disclaimer" description="Entry and scanning instructions" checked={settings.show_disclaimer} onChange={(v) => update("show_disclaimer", v)} />
                  </div>
                </CardContent>
              </Card>

              {/* Disclaimer text */}
              {settings.show_disclaimer && (
                <Card>
                  <CardHeader>
                    <CardTitle>Disclaimer Text</CardTitle>
                    <CardDescription>Small print shown at the bottom of each ticket</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Line 1</Label>
                      <Input
                        value={settings.disclaimer_line1}
                        onChange={(e) => update("disclaimer_line1", e.target.value)}
                        placeholder="THIS TICKET IS VALID FOR ONE ENTRY ONLY"
                        className="max-w-lg font-mono text-xs uppercase"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Line 2</Label>
                      <Input
                        value={settings.disclaimer_line2}
                        onChange={(e) => update("disclaimer_line2", e.target.value)}
                        placeholder="PRESENT THIS QR CODE AT THE DOOR FOR SCANNING"
                        className="max-w-lg font-mono text-xs uppercase"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right — live preview */}
            <div className="xl:sticky xl:top-20 xl:self-start">
              <TicketPreview settings={settings} />
            </div>
          </div>
        </TabsContent>

        {/* Full preview tab — much bigger */}
        <TabsContent value="preview">
          <div className="flex justify-center py-6">
            <TicketPreview settings={settings} large />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Reusable inline components ── */

function ColorPicker({ label, value, onChange, hint }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="relative h-8 w-8 shrink-0 rounded-md border border-border cursor-pointer transition-all hover:ring-2 hover:ring-ring/30"
          style={{ backgroundColor: value }}
        >
          <input
            ref={ref}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            tabIndex={-1}
          />
        </button>
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="w-24 font-mono text-xs" />
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

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
