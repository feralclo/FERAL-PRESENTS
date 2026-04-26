"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
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
      setUploadError("Logo must be under 5MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setUploadError("Choose an image file (PNG, JPG, WebP)");
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
      setUploadError("Couldn't read that file");
    } finally {
      setUploading(false);
    }
  }

  async function handleContinue() {
    setSavingFinal(true);
    try {
      // Persist branding to the org's branding settings, plus optional wallet sync.
      // org_id should be present at this point (Country provisioned it).
      if (api.orgId) {
        const brandingPayload = {
          logo_url: logoDataUri || undefined,
          accent_color: accent,
          active_vibe: vibe,
          // Keep existing org_name (set during provision) — don't blank.
        };
        await fetch("/api/branding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(brandingPayload),
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
    <div>
      <SectionHeading
        eyebrow="Step 3 of 9"
        title="Make it look like you"
        subtitle="Upload a logo, pick a vibe. The preview on the right updates live."
      />

      <div className="space-y-5">
        <SectionField label="Logo" hint="PNG or SVG with a transparent background works best.">
          <div className="flex items-center gap-3">
            {logoDataUri ? (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                <img src={logoDataUri} alt="Logo" className="max-h-10 max-w-12 object-contain" />
              </div>
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] text-muted-foreground/50">
                <Upload size={16} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-white/[0.04] disabled:opacity-50"
              >
                {uploading ? "Reading…" : logoDataUri ? "Replace" : "Choose file"}
              </button>
              {logoDataUri && (
                <button
                  type="button"
                  onClick={() => setLogoDataUri("")}
                  className="text-left text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
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
          {uploadError && <p className="mt-1.5 text-[11px] text-destructive">{uploadError}</p>}
        </SectionField>

        <SectionField label="Accent colour">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value.toUpperCase())}
              className="h-10 w-10 cursor-pointer rounded-lg border border-white/[0.08] bg-transparent"
            />
            <input
              type="text"
              value={accent}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setAccent(v.toUpperCase());
              }}
              maxLength={7}
              className="h-10 w-32 rounded-lg border border-input bg-background/40 px-3 font-mono text-[12px] uppercase text-foreground outline-none focus:border-primary/50"
            />
            <p className="text-[11px] text-muted-foreground">Buttons, links, highlights.</p>
          </div>
        </SectionField>

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
                  className={`group flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all ${
                    isSelected
                      ? "border-primary/50 bg-primary/[0.06]"
                      : "border-white/[0.05] hover:border-white/[0.1]"
                  }`}
                  title={v.label}
                >
                  <span
                    className="h-7 w-7 rounded-full"
                    style={{ backgroundColor: v.accent }}
                  />
                  <span className="text-[10px] leading-tight text-muted-foreground/80">
                    {v.label.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </SectionField>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-4 py-3">
          <input
            type="checkbox"
            checked={syncWallet}
            onChange={(e) => setSyncWallet(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <div className="flex-1 text-[13px] text-foreground">
            <div className="font-medium">Use this brand on Apple/Google Wallet passes too</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              We'll mirror your logo, accent, and name onto wallet tickets so they feel like yours.
            </div>
          </div>
        </label>

        <HintCard>
          You can refine fonts, secondary colours and full theme effects later in Settings → Storefront.
        </HintCard>
      </div>

      <SectionFooter
        primaryLabel="Continue"
        primaryLoading={savingFinal || api.saving}
        onPrimary={handleContinue}
      />
    </div>
  );
}
