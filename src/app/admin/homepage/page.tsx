"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Check, AlertTriangle, Monitor, Smartphone, Crosshair, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { saveSettings } from "@/lib/settings";
import { homepageKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import type { EventSettings, BrandingSettings, HomepageSettings } from "@/types/settings";

const DEFAULTS: HomepageSettings = {
  hero_title_line1: "BORN ON THE",
  hero_title_line2: "DANCE FLOOR",
  hero_cta_text: "SEE EVENTS",
  hero_image_url: "/images/banner-1.jpg",
  hero_focal_x: 50,
  hero_focal_y: 50,
};

type DeviceMode = "desktop" | "mobile";

export default function HomepageAdmin() {
  const orgId = useOrgId();
  const [settings, setSettings] = useState<HomepageSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Fetch on mount
  useEffect(() => {
    fetch(`/api/settings?key=${homepageKey(orgId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setSettings({ ...DEFAULTS, ...json.data });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  // Auto-save with debounce
  const persistSettings = useCallback((newSettings: HomepageSettings) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      const { error } = await saveSettings(
        homepageKey(orgId),
        newSettings as unknown as EventSettings
      );
      setSaving(false);
      setSaveStatus(error ? "error" : "saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 800);
  }, []);

  const update = useCallback(
    (patch: Partial<HomepageSettings>) => {
      const updated = { ...settings, ...patch };
      setSettings(updated);
      persistSettings(updated);
    },
    [settings, persistSettings]
  );

  // Handle focal point click on preview image
  const handleFocalClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
      update({ hero_focal_x: x, hero_focal_y: y });
    },
    [update]
  );

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-card" />
          <div className="h-64 rounded bg-card" />
        </div>
      </div>
    );
  }

  const focalX = settings.hero_focal_x ?? 50;
  const focalY = settings.hero_focal_y ?? 50;
  const imageUrl = settings.hero_image_url || "/images/banner-1.jpg";

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Homepage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure the hero banner and about section on the landing page
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving && (
            <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check size={12} /> Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle size={12} /> Save failed
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-8">
        {/* ── Left column: Settings form ── */}
        <div className="space-y-6">
          {/* Hero Image */}
          <Card className="p-5 space-y-4">
            <ImageUpload
              label="Hero Image"
              value={settings.hero_image_url}
              onChange={(v) => update({ hero_image_url: v })}
              uploadKey="homepage_hero"
            />
          </Card>

          {/* Focal Point */}
          <Card className="p-5 space-y-3">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Focal Point
            </Label>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              Click on the image below to set the focal point. This controls how the image
              crops on different screen sizes.
            </p>

            {/* Focal point picker */}
            <div
              className="relative rounded-md overflow-hidden border border-border cursor-crosshair group"
              onClick={handleFocalClick}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Focal point picker"
                className="w-full aspect-video object-cover block"
                draggable={false}
              />
              {/* Crosshair marker */}
              <div
                className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={{ left: `${focalX}%`, top: `${focalY}%` }}
              >
                <Crosshair size={32} className="text-white drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
              </div>
              {/* Crosshair lines */}
              <div
                className="absolute top-0 bottom-0 w-px bg-white/30 pointer-events-none"
                style={{ left: `${focalX}%` }}
              />
              <div
                className="absolute left-0 right-0 h-px bg-white/30 pointer-events-none"
                style={{ top: `${focalY}%` }}
              />
              {/* Hover hint */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
            </div>

            <p className="text-[10px] text-muted-foreground/50 font-mono text-center">
              {focalX}% , {focalY}%
            </p>
          </Card>

          {/* Text settings */}
          <Card className="p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="line1" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Title Line 1
              </Label>
              <Input
                id="line1"
                value={settings.hero_title_line1}
                onChange={(e) => update({ hero_title_line1: e.target.value })}
                placeholder="BORN ON THE"
                className="font-mono uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="line2" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Title Line 2
              </Label>
              <Input
                id="line2"
                value={settings.hero_title_line2}
                onChange={(e) => update({ hero_title_line2: e.target.value })}
                placeholder="DANCE FLOOR"
                className="font-mono uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cta" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                CTA Button Text
              </Label>
              <Input
                id="cta"
                value={settings.hero_cta_text}
                onChange={(e) => update({ hero_cta_text: e.target.value })}
                placeholder="SEE EVENTS"
                className="font-mono uppercase"
              />
            </div>
          </Card>
        </div>

        {/* ── Right column: Live preview ── */}
        <div className="space-y-4">
          {/* Device toggle */}
          <div className="flex items-center gap-2">
            <Button
              variant={device === "desktop" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDevice("desktop")}
              className="gap-1.5"
            >
              <Monitor size={14} />
              Desktop
            </Button>
            <Button
              variant={device === "mobile" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDevice("mobile")}
              className="gap-1.5"
            >
              <Smartphone size={14} />
              Mobile
            </Button>
          </div>

          {/* Preview container */}
          <Card className="overflow-hidden bg-black">
            {device === "desktop" ? (
              <DesktopPreview
                imageUrl={imageUrl}
                focalX={focalX}
                focalY={focalY}
                line1={settings.hero_title_line1 || "BORN ON THE"}
                line2={settings.hero_title_line2 || "DANCE FLOOR"}
                ctaText={settings.hero_cta_text || "SEE EVENTS"}
              />
            ) : (
              <MobilePreview
                imageUrl={imageUrl}
                focalX={focalX}
                focalY={focalY}
                line1={settings.hero_title_line1 || "BORN ON THE"}
                line2={settings.hero_title_line2 || "DANCE FLOOR"}
                ctaText={settings.hero_cta_text || "SEE EVENTS"}
              />
            )}
          </Card>
        </div>
      </div>

      {/* About Section — hidden for FERAL org */}
      {orgId !== "feral" && <AboutSectionEditor orgId={orgId} />}
    </div>
  );
}

/* ── About Section Editor ── */

function AboutSectionEditor({ orgId }: { orgId: string }) {
  const [about, setAbout] = useState<BrandingSettings["about_section"]>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    fetch("/api/branding")
      .then((r) => r.json())
      .then((json) => {
        if (json?.data?.about_section) {
          setAbout(json.data.about_section);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  const persistAbout = useCallback(
    (updated: BrandingSettings["about_section"]) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          const res = await fetch("/api/branding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ about_section: updated }),
          });
          setSaveStatus(res.ok ? "saved" : "error");
        } catch {
          setSaveStatus("error");
        }
        setSaving(false);
        setTimeout(() => setSaveStatus("idle"), 2000);
      }, 800);
    },
    []
  );

  const update = useCallback(
    (patch: Partial<NonNullable<BrandingSettings["about_section"]>>) => {
      const current = about || {
        heading_line1: "",
        heading_line2: "",
        pillars: [],
        closer: "",
      };
      const updated = { ...current, ...patch };
      setAbout(updated);
      persistAbout(updated);
    },
    [about, persistAbout]
  );

  if (loading) return null;

  return (
    <div className="mt-10 max-w-[780px]">
      <Separator className="mb-8" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold tracking-tight">About Section</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Content for the about section on your landing page
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-muted-foreground animate-pulse">
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check size={12} /> Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle size={12} /> Save failed
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <Card className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Heading Line 1</Label>
              <Input
                value={about?.heading_line1 || ""}
                onChange={(e) => update({ heading_line1: e.target.value })}
                placeholder="ABOUT"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Heading Line 2</Label>
              <Input
                value={about?.heading_line2 || ""}
                onChange={(e) => update({ heading_line2: e.target.value })}
                placeholder="US"
              />
            </div>
          </div>

          <Separator />

          {/* Pillars */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Pillars</Label>
              {(about?.pillars?.length || 0) < 3 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    const current = about || {
                      heading_line1: "ABOUT",
                      heading_line2: "US",
                      pillars: [],
                      closer: "Join us",
                    };
                    const pillars = [
                      ...(current.pillars || []),
                      { title: "", text: "" },
                    ];
                    update({ pillars });
                  }}
                >
                  <Plus size={10} className="mr-1" />
                  Add Pillar
                </Button>
              )}
            </div>
            {(about?.pillars || []).map((pillar, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/40 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    0{i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const pillars = (about?.pillars || []).filter(
                        (_, idx) => idx !== i
                      );
                      update({ pillars });
                    }}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
                <Input
                  value={pillar.title}
                  onChange={(e) => {
                    const pillars = [...(about?.pillars || [])];
                    pillars[i] = { ...pillars[i], title: e.target.value };
                    update({ pillars });
                  }}
                  placeholder="Pillar title"
                  className="h-8 text-sm"
                />
                <Textarea
                  value={pillar.text}
                  onChange={(e) => {
                    const pillars = [...(about?.pillars || [])];
                    pillars[i] = { ...pillars[i], text: e.target.value };
                    update({ pillars });
                  }}
                  placeholder="Describe this pillar..."
                  className="text-sm min-h-[60px]"
                />
              </div>
            ))}
            {(!about?.pillars || about.pillars.length === 0) && (
              <p className="text-[11px] text-muted-foreground/60">
                No pillars yet. Add up to 3 pillars to tell visitors what
                you&apos;re about.
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-xs">Closer Tagline</Label>
            <Input
              value={about?.closer || ""}
              onChange={(e) => update({ closer: e.target.value })}
              placeholder="Join us"
              className="max-w-sm"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Desktop Preview (16:9) ── */

interface PreviewProps {
  imageUrl: string;
  focalX: number;
  focalY: number;
  line1: string;
  line2: string;
  ctaText: string;
}

function DesktopPreview({ imageUrl, focalX, focalY, line1, line2, ctaText }: PreviewProps) {
  return (
    <div className="relative aspect-video overflow-hidden">
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="Desktop preview"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: `${focalX}% ${focalY}%` }}
      />
      {/* Dark vignette overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.65) 100%),
            linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.55) 100%)
          `,
        }}
      />
      {/* Text overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        <div className="text-center">
          <div className="font-mono text-[clamp(20px,4vw,48px)] font-bold tracking-[0.12em] leading-[1.1] uppercase text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
            <div>{line1}</div>
            <div>{line2}</div>
          </div>
          <div className="mt-6 inline-block border border-primary px-6 py-2.5 font-mono text-[10px] font-bold tracking-[3px] uppercase text-white">
            {ctaText}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mobile Preview (9:16) ── */

function MobilePreview({ imageUrl, focalX, focalY, line1, line2, ctaText }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-8 bg-[#111]">
      <div className="relative w-[280px] rounded-[32px] border-2 border-white/10 bg-black overflow-hidden shadow-2xl shadow-black/60">
        {/* Dynamic Island */}
        <div className="relative z-20 flex justify-center pt-3 pb-0">
          <div className="w-[90px] h-[26px] bg-black rounded-full" />
        </div>

        {/* Screen content — 9:16 */}
        <div className="relative aspect-[9/16] overflow-hidden -mt-4">
          {/* Background image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Mobile preview"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: `${focalX}% ${focalY}%` }}
          />
          {/* Vignette */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.65) 100%),
                linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.55) 100%)
              `,
            }}
          />
          {/* Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-4">
            <div className="text-center">
              <div className="font-mono text-[22px] font-bold tracking-[0.12em] leading-[1.1] uppercase text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
                <div>{line1}</div>
                <div>{line2}</div>
              </div>
              <div className="mt-5 inline-block border border-primary px-5 py-2 font-mono text-[8px] font-bold tracking-[3px] uppercase text-white">
                {ctaText}
              </div>
            </div>
          </div>
        </div>

        {/* Home indicator */}
        <div className="relative z-20 flex justify-center py-2 bg-black">
          <div className="w-[100px] h-[4px] bg-white/20 rounded-full" />
        </div>
      </div>
    </div>
  );
}
