"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SectionFooter, SectionField, SectionHeading } from "../Shell";
import type { OnboardingApi } from "../../_state";

interface BrandingData {
  logo_data_uri?: string;
  accent_hex?: string;
  vibe?: string;
  sync_to_wallet?: boolean;
}

/**
 * Curated accent palettes. Each is a tested-readable colour that works on
 * the Midnight dark background without an extra contrast check. Picking a
 * vibe sets the accent; the user can still tweak the hex below.
 */
const VIBES: Array<{ id: string; label: string; accent: string }> = [
  { id: "entry-violet", label: "Violet", accent: "#8B5CF6" },
  { id: "rose-glow", label: "Rose", accent: "#FF66B2" },
  { id: "neon-mint", label: "Mint", accent: "#19D6A0" },
  { id: "electric-blue", label: "Blue", accent: "#3B82F6" },
  { id: "sunset-gold", label: "Gold", accent: "#F5A524" },
  { id: "crimson", label: "Crimson", accent: "#DC2626" },
];

/**
 * Step 2: Branding.
 *
 * Logo + accent. Both optional with sensible defaults — the user can publish
 * an event without uploading anything and it still looks polished. The live
 * preview on the right shows their real event page (mobile) reflecting any
 * changes instantly. No URL-paste import; competitors don't ship that
 * pattern at production scale and it consistently fails silently.
 */
export function BrandingSection({ api }: { api: OnboardingApi }) {
  const data = (api.getSection("branding")?.data ?? {}) as BrandingData;
  const [logoDataUri, setLogoDataUri] = useState(data.logo_data_uri ?? "");
  const [accent, setAccent] = useState(data.accent_hex ?? "#8B5CF6");
  const [vibe, setVibe] = useState(data.vibe ?? "entry-violet");
  const [syncWallet, setSyncWallet] = useState(data.sync_to_wallet ?? true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savingFinal, setSavingFinal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.updateSectionData("branding", {
      logo_data_uri: logoDataUri || undefined,
      accent_hex: accent,
      vibe,
      sync_to_wallet: syncWallet,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoDataUri, accent, vibe, syncWallet]);

  async function handleFile(file: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Logo must be under 5MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setUploadError("Choose an image file (PNG, JPG, WebP, SVG).");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      setLogoDataUri(dataUri);
    } catch {
      setUploadError("Couldn't read that file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleContinue() {
    setSavingFinal(true);
    try {
      if (api.orgId) {
        // Pull brand_name from the identity step so the saved branding row
        // carries the tenant's own name. Without this, /api/branding falls
        // back to the platform default ("Entry") on surfaces like the
        // VerifiedBanner.
        const identity = (api.getSection("identity")?.data ?? {}) as {
          brand_name?: string;
        };
        const orgName = identity.brand_name?.trim();

        // Persist branding to the real settings store so /admin/settings/branding/
        // and the public event page reflect the choices immediately.
        await fetch("/api/branding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(orgName ? { org_name: orgName } : {}),
            logo_url: logoDataUri || undefined,
            accent_color: accent,
            active_vibe: vibe,
          }),
        }).catch(() => {});

        if (syncWallet) {
          await fetch("/api/branding/sync-wallet", { method: "POST" }).catch(() => {});
        }
      }
      await api.completeAndAdvance("branding", {
        logo_data_uri: logoDataUri || undefined,
        accent_hex: accent,
        vibe,
        sync_to_wallet: syncWallet,
      });
    } finally {
      setSavingFinal(false);
    }
  }

  return (
    <>
      <SectionHeading
        title="Make it yours"
        subtitle="Add a logo and pick an accent. The phone preview updates as you go."
      />

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-foreground">Logo</Label>
            <span className="text-[11px] text-muted-foreground">PNG or SVG · transparent bg</span>
          </div>

          <div className="flex items-center gap-4">
            <LogoSlot logo={logoDataUri} onClick={() => fileInputRef.current?.click()} />

            <div className="flex flex-1 flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={13} />
                {uploading ? "Reading…" : logoDataUri ? "Replace logo" : "Upload logo"}
              </Button>
              {logoDataUri && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-muted-foreground"
                  onClick={() => setLogoDataUri("")}
                >
                  <Trash2 size={12} />
                  Remove
                </Button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </div>

          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          {!logoDataUri && !uploadError && (
            <p className="text-[11px] text-muted-foreground">
              No logo? Your brand name will appear in its place — looks great too.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-5">
          <SectionField label="Accent">
            <div className="grid grid-cols-6 gap-2">
              {VIBES.map((v) => {
                const isSelected = vibe === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setVibe(v.id);
                      setAccent(v.accent.toUpperCase());
                    }}
                    className={`group flex flex-col items-center gap-1.5 rounded-lg border bg-card py-2.5 transition-all ${
                      isSelected
                        ? "border-primary/60 bg-primary/[0.04] ring-1 ring-primary/20"
                        : "border-border/50 hover:border-primary/30"
                    }`}
                    title={v.label}
                    aria-pressed={isSelected}
                  >
                    <span
                      className="h-6 w-6 rounded-full transition-transform group-hover:scale-110"
                      style={{
                        backgroundColor: v.accent,
                        boxShadow: isSelected
                          ? `0 0 12px ${v.accent}66`
                          : "none",
                      }}
                    />
                    <span
                      className={`text-[10px] leading-none ${
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {v.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </SectionField>

          <SectionField label="Custom hex" htmlFor="onb-accent">
            <div className="flex items-center gap-2.5">
              <label
                htmlFor="onb-accent"
                className="relative h-9 w-12 cursor-pointer overflow-hidden rounded-md border border-border"
                style={{ backgroundColor: accent }}
              >
                <input
                  id="onb-accent"
                  type="color"
                  value={accent}
                  onChange={(e) => {
                    setAccent(e.target.value.toUpperCase());
                    setVibe("custom");
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <Input
                value={accent}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                    setAccent(v.toUpperCase());
                    setVibe("custom");
                  }
                }}
                maxLength={7}
                className="w-32 font-mono uppercase"
                placeholder="#8B5CF6"
              />
              <p className="text-[11px] text-muted-foreground">
                Used on buttons, links, highlights.
              </p>
            </div>
          </SectionField>
        </CardContent>
      </Card>

      <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-secondary/40 px-4 py-3.5">
        <div className="flex-1">
          <Label htmlFor="onb-wallet-sync" className="text-sm font-medium text-foreground">
            Mirror to Apple &amp; Google Wallet
          </Label>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Buyers add tickets to their phone wallet — those passes will use this logo and accent.
          </p>
        </div>
        <Switch id="onb-wallet-sync" checked={syncWallet} onCheckedChange={setSyncWallet} />
      </div>

      <p className="text-center text-[11px] text-muted-foreground/70">
        Don&apos;t worry, you can change all of this any time in Settings &rarr; Branding.
      </p>

      <SectionFooter
        primaryLabel="Next"
        primaryLoading={savingFinal || api.saving}
        onPrimary={handleContinue}
      />
    </>
  );
}

function LogoSlot({ logo, onClick }: { logo: string; onClick: () => void }) {
  if (logo) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/60 p-2.5 transition-colors hover:border-primary/40"
        aria-label="Change logo"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="Logo" className="max-h-12 max-w-14 object-contain" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30 text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground"
      aria-label="Upload logo"
    >
      <ImageIcon size={18} />
    </button>
  );
}
