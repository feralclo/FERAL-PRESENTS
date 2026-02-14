"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { Save, RotateCcw, Eye, Loader2, Check } from "lucide-react";
import type { BrandingSettings } from "@/types/settings";

const DEFAULT_BRANDING: BrandingSettings = {
  org_name: "FERAL PRESENTS",
  logo_url: "/images/FERAL%20LOGO.svg",
  accent_color: "#ff0033",
  background_color: "#0e0e0e",
  card_color: "#1a1a1a",
  text_color: "#ffffff",
  heading_font: "Space Mono",
  body_font: "Inter",
  copyright_text: "FERAL PRESENTS. ALL RIGHTS RESERVED.",
  support_email: "",
  social_links: {
    instagram: "",
    twitter: "",
    tiktok: "",
    website: "",
  },
};

const FONT_OPTIONS = [
  "Inter",
  "Space Mono",
  "Space Grotesk",
  "Roboto",
  "Roboto Mono",
  "Poppins",
  "Montserrat",
  "Oswald",
  "Raleway",
  "Playfair Display",
  "DM Sans",
  "Outfit",
  "Sora",
  "Archivo",
  "JetBrains Mono",
];

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15";

export default function BrandingPage() {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [savedBranding, setSavedBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch current branding
  useEffect(() => {
    fetch("/api/branding")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) {
          const data = { ...DEFAULT_BRANDING, ...json.data };
          setBranding(data);
          setSavedBranding(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasChanges =
    JSON.stringify(branding) !== JSON.stringify(savedBranding);

  const update = useCallback(
    (field: keyof BrandingSettings, value: unknown) => {
      setBranding((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const updateSocial = useCallback(
    (field: string, value: string) => {
      setBranding((prev) => ({
        ...prev,
        social_links: { ...prev.social_links, [field]: value },
      }));
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branding),
      });
      if (res.ok) {
        setSavedBranding({ ...branding });
        setSaved(true);
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // Network error
    }
    setSaving(false);
  };

  const handleReset = () => {
    setBranding({ ...savedBranding });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Branding</h2>
          <p className="text-sm text-muted-foreground">
            Customize how your brand appears on event pages, checkout, emails,
            and tickets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw size={14} className="mr-1.5" />
              Discard
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : saved ? (
              <Check size={14} className="mr-1.5" />
            ) : (
              <Save size={14} className="mr-1.5" />
            )}
            {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="preview">
            <Eye size={14} className="mr-1.5" />
            Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6 mt-6">
          {/* Identity */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Identity</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Organisation Name</Label>
                  <Input
                    value={branding.org_name || ""}
                    onChange={(e) => update("org_name", e.target.value)}
                    placeholder="Your brand name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Copyright Text</Label>
                  <Input
                    value={branding.copyright_text || ""}
                    onChange={(e) => update("copyright_text", e.target.value)}
                    placeholder="BRAND NAME. ALL RIGHTS RESERVED."
                  />
                  <p className="text-[10px] text-muted-foreground/60">
                    Shown in checkout and event page footers
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Support Email</Label>
                <Input
                  type="email"
                  value={branding.support_email || ""}
                  onChange={(e) => update("support_email", e.target.value)}
                  placeholder="support@yourbrand.com"
                  className="max-w-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Logo */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Logo</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              <ImageUpload
                label="Logo Image"
                value={branding.logo_url || ""}
                onChange={(v) => update("logo_url", v)}
                uploadKey="branding-logo"
              />
              <div className="space-y-2">
                <Label>Logo Width (px)</Label>
                <Input
                  type="number"
                  value={branding.logo_width ?? ""}
                  onChange={(e) =>
                    update(
                      "logo_width",
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                  placeholder="Auto"
                  className="max-w-[120px]"
                  min={20}
                  max={400}
                />
                <p className="text-[10px] text-muted-foreground/60">
                  Controls logo size in checkout header. Leave empty for auto.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Colors */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Colors</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ColorPicker
                  label="Accent"
                  value={branding.accent_color || "#ff0033"}
                  onChange={(v) => update("accent_color", v)}
                  hint="Buttons, links, highlights"
                />
                <ColorPicker
                  label="Background"
                  value={branding.background_color || "#0e0e0e"}
                  onChange={(v) => update("background_color", v)}
                  hint="Page background"
                />
                <ColorPicker
                  label="Card"
                  value={branding.card_color || "#1a1a1a"}
                  onChange={(v) => update("card_color", v)}
                  hint="Card & section backgrounds"
                />
                <ColorPicker
                  label="Text"
                  value={branding.text_color || "#ffffff"}
                  onChange={(v) => update("text_color", v)}
                  hint="Primary text color"
                />
              </div>
            </CardContent>
          </Card>

          {/* Typography */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Typography</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Heading Font</Label>
                  <select
                    className={selectClass}
                    value={branding.heading_font || "Space Mono"}
                    onChange={(e) => update("heading_font", e.target.value)}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground/60">
                    Used for headings, navigation, ticket labels
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Body Font</Label>
                  <select
                    className={selectClass}
                    value={branding.body_font || "Inter"}
                    onChange={(e) => update("body_font", e.target.value)}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground/60">
                    Used for body text, descriptions, form labels
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Social Links */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Social Links</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Instagram</Label>
                  <Input
                    value={branding.social_links?.instagram || ""}
                    onChange={(e) => updateSocial("instagram", e.target.value)}
                    placeholder="https://instagram.com/yourbrand"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Twitter / X</Label>
                  <Input
                    value={branding.social_links?.twitter || ""}
                    onChange={(e) => updateSocial("twitter", e.target.value)}
                    placeholder="https://x.com/yourbrand"
                  />
                </div>
                <div className="space-y-2">
                  <Label>TikTok</Label>
                  <Input
                    value={branding.social_links?.tiktok || ""}
                    onChange={(e) => updateSocial("tiktok", e.target.value)}
                    placeholder="https://tiktok.com/@yourbrand"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={branding.social_links?.website || ""}
                    onChange={(e) => updateSocial("website", e.target.value)}
                    placeholder="https://yourbrand.com"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-6">
          <BrandingPreview branding={branding} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Color picker with swatch ── */

function ColorPicker({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-9 w-9 cursor-pointer opacity-0"
          />
          <div
            className="h-9 w-9 rounded-md border border-border cursor-pointer"
            style={{ backgroundColor: value }}
          />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 font-mono text-xs uppercase"
          maxLength={7}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60">{hint}</p>
    </div>
  );
}

/* ── Live preview ── */

function BrandingPreview({ branding }: { branding: BrandingSettings }) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Preview how your branding appears across the platform. Changes are
        shown in real-time.
      </p>

      {/* Checkout header preview */}
      <Card className="py-0 gap-0 overflow-hidden">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-sm">Checkout Header</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{ backgroundColor: branding.background_color || "#0e0e0e" }}
          >
            <span
              className="text-xs font-medium"
              style={{
                color: branding.text_color || "#ffffff",
                fontFamily: branding.body_font || "Inter",
              }}
            >
              &larr; Event Page
            </span>
            {branding.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logo_url}
                alt={branding.org_name || "Logo"}
                className="max-h-[32px] object-contain"
                style={{
                  width: branding.logo_width
                    ? `${branding.logo_width}px`
                    : "auto",
                }}
              />
            ) : (
              <span
                className="text-sm font-bold uppercase tracking-wider"
                style={{
                  color: branding.text_color || "#ffffff",
                  fontFamily: branding.heading_font || "Space Mono",
                }}
              >
                {branding.org_name || "YOUR BRAND"}
              </span>
            )}
            <span
              className="text-xs"
              style={{ color: branding.accent_color || "#ff0033" }}
            >
              Secure
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Event page preview */}
      <Card className="py-0 gap-0 overflow-hidden">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-sm">Event Page</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div
            className="px-6 py-6 space-y-4"
            style={{ backgroundColor: branding.background_color || "#0e0e0e" }}
          >
            {/* Announcement bar */}
            <div
              className="text-center text-xs py-2 rounded"
              style={{
                backgroundColor: `${branding.accent_color || "#ff0033"}15`,
                color: branding.accent_color || "#ff0033",
                fontFamily: branding.body_font || "Inter",
              }}
            >
              Official {branding.org_name || "YOUR BRAND"} ticket store
            </div>

            {/* Hero mockup */}
            <div
              className="rounded-lg p-6 border"
              style={{
                backgroundColor: branding.card_color || "#1a1a1a",
                borderColor: `${branding.card_color || "#1a1a1a"}80`,
              }}
            >
              <h3
                className="text-lg font-bold uppercase tracking-wider mb-2"
                style={{
                  color: branding.text_color || "#ffffff",
                  fontFamily: branding.heading_font || "Space Mono",
                }}
              >
                Sample Event Name
              </h3>
              <p
                className="text-xs mb-3"
                style={{
                  color: `${branding.text_color || "#ffffff"}88`,
                  fontFamily: branding.body_font || "Inter",
                }}
              >
                Saturday, 15 March 2026 &middot; 10:00 PM &middot; The Venue
              </p>
              <button
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: branding.accent_color || "#ff0033",
                  color: "#ffffff",
                  fontFamily: branding.heading_font || "Space Mono",
                }}
              >
                Buy Tickets
              </button>
            </div>

            {/* Ticket card mockup */}
            <div
              className="rounded-lg p-4 border"
              style={{
                backgroundColor: branding.card_color || "#1a1a1a",
                borderColor: `${branding.card_color || "#1a1a1a"}80`,
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className="text-sm font-bold uppercase tracking-wide"
                    style={{
                      color: branding.text_color || "#ffffff",
                      fontFamily: branding.heading_font || "Space Mono",
                    }}
                  >
                    Early Bird
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{
                      color: `${branding.text_color || "#ffffff"}66`,
                      fontFamily: branding.body_font || "Inter",
                    }}
                  >
                    Limited availability
                  </p>
                </div>
                <span
                  className="text-lg font-bold"
                  style={{
                    color: branding.accent_color || "#ff0033",
                    fontFamily: branding.heading_font || "Space Mono",
                  }}
                >
                  £15.00
                </span>
              </div>
            </div>

            {/* Footer */}
            <div
              className="text-center pt-4 border-t"
              style={{ borderColor: `${branding.text_color || "#ffffff"}15` }}
            >
              <p
                className="text-[10px] uppercase tracking-widest"
                style={{
                  color: `${branding.text_color || "#ffffff"}44`,
                  fontFamily: branding.heading_font || "Space Mono",
                }}
              >
                &copy; {new Date().getFullYear()}{" "}
                {branding.copyright_text ||
                  `${branding.org_name || "YOUR BRAND"}. ALL RIGHTS RESERVED.`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation mockup */}
      <Card className="py-0 gap-0 overflow-hidden">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-sm">Order Confirmation</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div
            className="px-6 py-6 text-center space-y-3"
            style={{ backgroundColor: branding.background_color || "#0e0e0e" }}
          >
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-full text-xl"
              style={{
                backgroundColor: `${branding.accent_color || "#ff0033"}20`,
                color: branding.accent_color || "#ff0033",
              }}
            >
              &#10003;
            </div>
            <h3
              className="text-base font-bold uppercase tracking-wider"
              style={{
                color: branding.text_color || "#ffffff",
                fontFamily: branding.heading_font || "Space Mono",
              }}
            >
              Order Confirmed
            </h3>
            <p
              className="text-xs"
              style={{
                color: `${branding.text_color || "#ffffff"}88`,
                fontFamily: branding.body_font || "Inter",
              }}
            >
              Your tickets for <strong>Sample Event</strong> are ready
            </p>
            <div
              className="inline-block rounded px-4 py-2 text-xs font-mono"
              style={{
                backgroundColor: branding.card_color || "#1a1a1a",
                color: branding.text_color || "#ffffff",
              }}
            >
              FERAL-00001 &middot; £30.00
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
