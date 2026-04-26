"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SectionFooter, SectionField, SectionHeading, HintCard } from "../Shell";
import type { OnboardingApi } from "../../_state";

interface BrandingData {
  logo_data_uri?: string;
  accent_hex?: string;
  vibe?: string;
  sync_to_wallet?: boolean;
}

const VIBES: Array<{ id: string; label: string; accent: string }> = [
  { id: "entry-dark", label: "Entry Dark", accent: "#8B5CF6" },
  { id: "rose-glow", label: "Rose Glow", accent: "#FF66B2" },
  { id: "neon-mint", label: "Neon Mint", accent: "#19D6A0" },
  { id: "electric-blue", label: "Electric Blue", accent: "#3B82F6" },
  { id: "sunset-gold", label: "Sunset Gold", accent: "#F5A524" },
  { id: "crimson-night", label: "Crimson Night", accent: "#DC2626" },
];

export function BrandingSection({ api }: { api: OnboardingApi }) {
  const data = (api.getSection("branding")?.data ?? {}) as BrandingData;
  const [logoDataUri, setLogoDataUri] = useState(data.logo_data_uri ?? "");
  const [accent, setAccent] = useState(data.accent_hex ?? "#8B5CF6");
  const [vibe, setVibe] = useState(data.vibe ?? "entry-dark");
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
        await fetch("/api/branding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
        title="Make it look like you"
        subtitle="Upload your logo and pick a colour. The preview on the right updates live."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            PNG or SVG with a transparent background works best.
          </p>
          <div className="flex items-center gap-3">
            {logoDataUri ? (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/40 p-2">
                <img src={logoDataUri} alt="Logo" className="max-h-10 max-w-12 object-contain" />
              </div>
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30 text-muted-foreground">
                <Upload size={16} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Reading…" : logoDataUri ? "Replace" : "Choose file"}
              </Button>
              {logoDataUri && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLogoDataUri("")}
                >
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Vibe & accent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SectionField label="Pick a vibe">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
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
                    className={`flex flex-col items-center gap-1.5 rounded-lg border bg-card p-2.5 transition-colors ${
                      isSelected
                        ? "border-primary/50 ring-1 ring-primary/15"
                        : "border-border/60 hover:border-primary/30"
                    }`}
                    title={v.label}
                  >
                    <span
                      className="h-7 w-7 rounded-full ring-1 ring-border/60"
                      style={{ backgroundColor: v.accent }}
                    />
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {v.label.split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </SectionField>

          <SectionField label="Accent colour" htmlFor="onb-accent">
            <div className="flex items-center gap-3">
              <input
                id="onb-accent"
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value.toUpperCase())}
                className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
              />
              <Input
                value={accent}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setAccent(v.toUpperCase());
                }}
                maxLength={7}
                className="w-32 font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">Buttons, links, highlights.</p>
            </div>
          </SectionField>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-secondary/40 px-4 py-3">
            <div className="flex-1">
              <Label htmlFor="onb-wallet-sync" className="text-sm font-medium text-foreground">
                Use this brand on Apple/Google Wallet passes
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                We&apos;ll mirror your logo, accent and name onto wallet tickets so they feel like
                yours.
              </p>
            </div>
            <Switch
              id="onb-wallet-sync"
              checked={syncWallet}
              onCheckedChange={setSyncWallet}
            />
          </div>
        </CardContent>
      </Card>

      <HintCard>
        Fonts and finer theme controls live in Settings → Storefront after onboarding.
      </HintCard>

      <SectionFooter
        primaryLabel="Continue"
        primaryLoading={savingFinal || api.saving}
        onPrimary={handleContinue}
      />
    </>
  );
}
