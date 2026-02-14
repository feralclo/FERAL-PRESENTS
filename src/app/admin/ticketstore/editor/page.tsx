"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  ArrowLeft,
  Monitor,
  Tablet,
  Smartphone,
  Save,
  Loader2,
  Check,
  ChevronRight,
  Palette,
  Type,
  Image,
  Globe,
  User,
  Undo2,
} from "lucide-react";
import type { BrandingSettings, ThemeStore, StoreTheme } from "@/types/settings";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

/* ─── Constants ─── */

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
  social_links: { instagram: "", twitter: "", tiktok: "", website: "" },
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

type DeviceMode = "desktop" | "tablet" | "mobile";
const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

interface EventOption {
  slug: string;
  name: string;
}

/* ─── Editor section IDs ─── */
type SectionId = "colors" | "typography" | "logo" | "identity" | "social";

/* ═══════════════════════════════════════════════════════
   TICKET STORE EDITOR — Full-screen, Shopify-style
   Works with the multi-theme system. Reads ?theme=<id>
   from the URL to determine which theme to edit.
   ═══════════════════════════════════════════════════════ */

export default function TicketStoreEditorPageWrapper() {
  return (
    <Suspense
      fallback={
        <div
          data-admin
          className="flex h-screen items-center justify-center bg-background"
        >
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TicketStoreEditorPage />
    </Suspense>
  );
}

function TicketStoreEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const themeId = searchParams.get("theme");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  /* ── Theme + branding state ── */
  const [themeStore, setThemeStore] = useState<ThemeStore | null>(null);
  const [currentTheme, setCurrentTheme] = useState<StoreTheme | null>(null);
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [savedBranding, setSavedBranding] =
    useState<BrandingSettings>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* ── Events for preview selector ── */
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");

  /* ── UI state ── */
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [openSection, setOpenSection] = useState<SectionId>("colors");
  const [bridgeReady, setBridgeReady] = useState(false);

  const hasChanges = JSON.stringify(branding) !== JSON.stringify(savedBranding);

  /* ── Initial data fetch ── */
  useEffect(() => {
    Promise.all([
      fetch("/api/themes").then((r) => r.json()),
      fetch("/api/events").then((r) => r.json()),
    ])
      .then(([themesRes, eventsRes]) => {
        const store = themesRes.data as ThemeStore;
        setThemeStore(store);

        // Find the theme to edit
        const targetId = themeId || store.active_theme_id;
        const theme = store.themes.find((t) => t.id === targetId) || store.themes[0];

        if (theme) {
          setCurrentTheme(theme);
          const data = { ...DEFAULT_BRANDING, ...theme.branding };
          setBranding(data);
          setSavedBranding(data);
        }

        const list: EventOption[] = (eventsRes.data || [])
          .filter((e: { status: string }) => e.status !== "archived")
          .map((e: { slug: string; name: string }) => ({
            slug: e.slug,
            name: e.name,
          }));
        setEvents(list);
        if (list.length > 0) setSelectedSlug(list[0].slug);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [themeId]);

  /* ── Listen for bridge ready ── */
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === "editor-bridge-ready") {
        setBridgeReady(true);
        pushAllToIframe();
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding]);

  /* ── Push CSS variables to iframe ── */
  const pushToIframe = useCallback(
    (variables: Record<string, string>) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "theme-variables", variables },
        "*"
      );
    },
    []
  );

  const pushFontToIframe = useCallback(
    (variable: string, fontFamily: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "theme-font", variable, fontFamily },
        "*"
      );
    },
    []
  );

  const pushLogoToIframe = useCallback(
    (logoUrl: string, logoWidth?: number) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "theme-logo", logoUrl, logoWidth },
        "*"
      );
    },
    []
  );

  /* Push all branding to iframe at once */
  const pushAllToIframe = useCallback(() => {
    const vars: Record<string, string> = {};
    if (branding.accent_color) vars["--accent"] = branding.accent_color;
    if (branding.background_color) vars["--bg-dark"] = branding.background_color;
    if (branding.card_color) vars["--card-bg"] = branding.card_color;
    if (branding.text_color) vars["--text-primary"] = branding.text_color;
    pushToIframe(vars);
    if (branding.heading_font) pushFontToIframe("--font-mono", branding.heading_font);
    if (branding.body_font) pushFontToIframe("--font-sans", branding.body_font);
    if (branding.logo_url) pushLogoToIframe(branding.logo_url, branding.logo_width);
  }, [branding, pushToIframe, pushFontToIframe, pushLogoToIframe]);

  /* ── Update helpers ── */
  const updateColor = useCallback(
    (field: keyof BrandingSettings, cssVar: string, value: string) => {
      setBranding((prev) => ({ ...prev, [field]: value }));
      pushToIframe({ [cssVar]: value });
    },
    [pushToIframe]
  );

  const updateFont = useCallback(
    (field: keyof BrandingSettings, cssVar: string, value: string) => {
      setBranding((prev) => ({ ...prev, [field]: value }));
      pushFontToIframe(cssVar, value);
    },
    [pushFontToIframe]
  );

  const updateField = useCallback(
    (field: keyof BrandingSettings, value: unknown) => {
      setBranding((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const updateSocial = useCallback((key: string, value: string) => {
    setBranding((prev) => ({
      ...prev,
      social_links: { ...prev.social_links, [key]: value },
    }));
  }, []);

  /* ── Save / Discard ── */
  const handleSave = async () => {
    if (!currentTheme) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: currentTheme.id,
          branding,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setSavedBranding({ ...branding });
        if (json.store) setThemeStore(json.store);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // silent
    }
    setSaving(false);
  };

  const handleDiscard = () => {
    setBranding({ ...savedBranding });
    // Reset iframe to saved state
    setTimeout(() => {
      const vars: Record<string, string> = {};
      if (savedBranding.accent_color)
        vars["--accent"] = savedBranding.accent_color;
      if (savedBranding.background_color)
        vars["--bg-dark"] = savedBranding.background_color;
      if (savedBranding.card_color)
        vars["--card-bg"] = savedBranding.card_color;
      if (savedBranding.text_color)
        vars["--text-primary"] = savedBranding.text_color;
      pushToIframe(vars);
      if (savedBranding.heading_font)
        pushFontToIframe("--font-mono", savedBranding.heading_font);
      if (savedBranding.body_font)
        pushFontToIframe("--font-sans", savedBranding.body_font);
      if (savedBranding.logo_url)
        pushLogoToIframe(
          savedBranding.logo_url,
          savedBranding.logo_width
        );
    }, 0);
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div
        data-admin
        className="flex h-screen items-center justify-center bg-background"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isActive = themeStore?.active_theme_id === currentTheme?.id;
  const previewUrl = selectedSlug
    ? `/event/${selectedSlug}?editor=1&template=${currentTheme?.template || "midnight"}`
    : "";

  return (
    <div data-admin className="flex h-screen flex-col bg-background text-foreground">
      {/* ═══ Top bar ═══ */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 bg-background px-3">
        {/* Left: back + theme name */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push("/admin/ticketstore/")}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} />
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[1.5px] text-foreground/70">
            {currentTheme?.name || "Theme"}
          </span>
          {isActive && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              <Check size={8} />
              Live
            </span>
          )}
        </div>

        {/* Center: device preview */}
        <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border/40 bg-muted/20 p-0.5">
          {(
            [
              { mode: "desktop" as DeviceMode, icon: Monitor, label: "Desktop" },
              { mode: "tablet" as DeviceMode, icon: Tablet, label: "Tablet" },
              { mode: "mobile" as DeviceMode, icon: Smartphone, label: "Mobile" },
            ] as const
          ).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setDevice(mode)}
              title={label}
              className={`rounded-md p-1.5 transition-colors ${
                device === mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        {/* Right: save/discard */}
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscard}
              className="h-7 text-xs"
            >
              <Undo2 size={12} className="mr-1" />
              Discard
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="h-7 text-xs"
          >
            {saving ? (
              <Loader2 size={12} className="mr-1 animate-spin" />
            ) : saved ? (
              <Check size={12} className="mr-1" />
            ) : (
              <Save size={12} className="mr-1" />
            )}
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </Button>
        </div>
      </header>

      {/* ═══ Body: sidebar + preview ═══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Editor sidebar ── */}
        <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-border/50 bg-background">
          <div className="p-4 pb-8 space-y-1">
            <EditorSection
              id="colors"
              label="Colors"
              icon={<Palette size={14} />}
              open={openSection === "colors"}
              onToggle={() =>
                setOpenSection(openSection === "colors" ? null! : "colors")
              }
            >
              <div className="space-y-3">
                <ColorField
                  label="Accent"
                  value={branding.accent_color || "#ff0033"}
                  onChange={(v) => updateColor("accent_color", "--accent", v)}
                />
                <ColorField
                  label="Background"
                  value={branding.background_color || "#0e0e0e"}
                  onChange={(v) =>
                    updateColor("background_color", "--bg-dark", v)
                  }
                />
                <ColorField
                  label="Card"
                  value={branding.card_color || "#1a1a1a"}
                  onChange={(v) => updateColor("card_color", "--card-bg", v)}
                />
                <ColorField
                  label="Text"
                  value={branding.text_color || "#ffffff"}
                  onChange={(v) =>
                    updateColor("text_color", "--text-primary", v)
                  }
                />
              </div>
            </EditorSection>

            <EditorSection
              id="typography"
              label="Typography"
              icon={<Type size={14} />}
              open={openSection === "typography"}
              onToggle={() =>
                setOpenSection(
                  openSection === "typography" ? null! : "typography"
                )
              }
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    Heading Font
                  </Label>
                  <FontSelect
                    value={branding.heading_font || "Space Mono"}
                    onChange={(v) => updateFont("heading_font", "--font-mono", v)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    Body Font
                  </Label>
                  <FontSelect
                    value={branding.body_font || "Inter"}
                    onChange={(v) => updateFont("body_font", "--font-sans", v)}
                  />
                </div>
              </div>
            </EditorSection>

            <EditorSection
              id="logo"
              label="Logo"
              icon={<Image size={14} />}
              open={openSection === "logo"}
              onToggle={() =>
                setOpenSection(openSection === "logo" ? null! : "logo")
              }
            >
              <div className="space-y-3">
                <ImageUpload
                  label="Logo Image"
                  value={branding.logo_url || ""}
                  onChange={(v) => {
                    updateField("logo_url", v);
                    pushLogoToIframe(v, branding.logo_width);
                  }}
                  uploadKey="branding-logo"
                />
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    Logo Width (px)
                  </Label>
                  <Input
                    type="number"
                    value={branding.logo_width ?? ""}
                    onChange={(e) => {
                      const w = e.target.value ? Number(e.target.value) : undefined;
                      updateField("logo_width", w);
                      pushLogoToIframe(branding.logo_url || "", w);
                    }}
                    placeholder="Auto"
                    className="h-8 text-xs"
                    min={20}
                    max={400}
                  />
                </div>
              </div>
            </EditorSection>

            <EditorSection
              id="identity"
              label="Identity"
              icon={<User size={14} />}
              open={openSection === "identity"}
              onToggle={() =>
                setOpenSection(
                  openSection === "identity" ? null! : "identity"
                )
              }
            >
              <div className="space-y-3">
                <FieldRow label="Organisation Name">
                  <Input
                    value={branding.org_name || ""}
                    onChange={(e) => updateField("org_name", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="Your brand name"
                  />
                </FieldRow>
                <FieldRow label="Copyright Text">
                  <Input
                    value={branding.copyright_text || ""}
                    onChange={(e) =>
                      updateField("copyright_text", e.target.value)
                    }
                    className="h-8 text-xs"
                    placeholder="BRAND. ALL RIGHTS RESERVED."
                  />
                </FieldRow>
                <FieldRow label="Support Email">
                  <Input
                    type="email"
                    value={branding.support_email || ""}
                    onChange={(e) =>
                      updateField("support_email", e.target.value)
                    }
                    className="h-8 text-xs"
                    placeholder="support@yourbrand.com"
                  />
                </FieldRow>
              </div>
            </EditorSection>

            <EditorSection
              id="social"
              label="Social Links"
              icon={<Globe size={14} />}
              open={openSection === "social"}
              onToggle={() =>
                setOpenSection(openSection === "social" ? null! : "social")
              }
            >
              <div className="space-y-3">
                <FieldRow label="Instagram">
                  <Input
                    value={branding.social_links?.instagram || ""}
                    onChange={(e) => updateSocial("instagram", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="https://instagram.com/..."
                  />
                </FieldRow>
                <FieldRow label="Twitter / X">
                  <Input
                    value={branding.social_links?.twitter || ""}
                    onChange={(e) => updateSocial("twitter", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="https://x.com/..."
                  />
                </FieldRow>
                <FieldRow label="TikTok">
                  <Input
                    value={branding.social_links?.tiktok || ""}
                    onChange={(e) => updateSocial("tiktok", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="https://tiktok.com/@..."
                  />
                </FieldRow>
                <FieldRow label="Website">
                  <Input
                    value={branding.social_links?.website || ""}
                    onChange={(e) => updateSocial("website", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="https://yourbrand.com"
                  />
                </FieldRow>
              </div>
            </EditorSection>
          </div>
        </aside>

        {/* ── Live preview ── */}
        <div className="flex-1 bg-[#18181b] overflow-hidden flex items-start justify-center p-4">
          {previewUrl ? (
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{
                width: DEVICE_WIDTHS[device],
                maxWidth: "100%",
              }}
            >
              <div
                className={`relative h-full overflow-hidden ${
                  device === "mobile"
                    ? "rounded-[2rem] border-[3px] border-zinc-700/60 shadow-2xl shadow-black/50"
                    : device === "tablet"
                      ? "rounded-2xl border-2 border-border/30 shadow-2xl shadow-black/40"
                      : "rounded-lg"
                }`}
              >
                {/* Dynamic Island indicator for mobile preview */}
                {device === "mobile" && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                    <div className="w-[90px] h-[26px] bg-black rounded-full" />
                  </div>
                )}
                {/* Loading shimmer until bridge signals ready */}
                {!bridgeReady && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0e0e0e]">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2
                        size={20}
                        className="animate-spin text-muted-foreground"
                      />
                      <span className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                        Loading preview...
                      </span>
                    </div>
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  src={previewUrl}
                  className="h-full w-full border-0 bg-[#0e0e0e]"
                  title="Live preview"
                />
                {/* Home indicator bar for mobile preview */}
                {device === "mobile" && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                    <div className="w-[120px] h-[4px] bg-white/20 rounded-full" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center">
              <div className="max-w-xs space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/20">
                  <Monitor size={20} className="text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Create your first event to see the live preview.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/admin/events/")}
                  className="text-xs"
                >
                  Create Event
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════ */

function EditorSection({
  id,
  label,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/20"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-[12px] font-medium">{label}</span>
        <ChevronRight
          size={12}
          className={`text-muted-foreground/50 transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-border/30 px-3 py-3 bg-muted/[0.03]">
          {children}
        </div>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <ColorPicker value={value} onChange={onChange} className="h-7 px-2 text-[10px]" />
      <span className="flex-1 text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function FontSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FONT_OPTIONS.map((f) => (
          <SelectItem key={f} value={f}>
            {f}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
