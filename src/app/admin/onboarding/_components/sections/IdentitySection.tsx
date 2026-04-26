"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Check, Sparkles, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionFooter, SectionField, SectionHeading } from "../Shell";
import type { OnboardingApi } from "../../_state";

interface IdentityData {
  first_name?: string;
  last_name?: string;
  brand_name?: string;
  slug?: string;
  source_url?: string;
}

interface ImportResult {
  source_url?: string;
  name?: string;
  logo_url?: string;
  accent_hex?: string;
  og_image_url?: string;
  partial?: boolean;
}

export function IdentitySection({ api }: { api: OnboardingApi }) {
  const data = (api.getSection("identity")?.data ?? {}) as IdentityData;
  const [firstName, setFirstName] = useState(data.first_name ?? "");
  const [lastName, setLastName] = useState(data.last_name ?? "");
  const [brandName, setBrandName] = useState(data.brand_name ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(data.source_url ?? "");
  const [slug, setSlug] = useState(data.slug ?? "");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    const s = brandName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    setSlug(s);

    if (s.length < 3) {
      setSlugAvailable(null);
      setSlugChecking(false);
      return;
    }
    setSlugChecking(true);
    slugTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-slug?slug=${encodeURIComponent(s)}`);
        const json = await res.json();
        setSlugAvailable(json.available === true);
        if (json.slug) setSlug(json.slug);
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, 300);
    return () => {
      if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    };
  }, [brandName]);

  useEffect(() => {
    api.updateSectionData("identity", {
      first_name: firstName,
      last_name: lastName,
      brand_name: brandName,
      slug,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, brandName, slug]);

  async function handleImport() {
    if (!websiteUrl.trim() || importing) return;
    setImporting(true);
    setImportNote(null);
    try {
      const res = await fetch("/api/onboarding/import-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl.trim() }),
      });
      const json = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) {
        setImportNote(null);
        return;
      }
      if (!brandName && json.name) setBrandName(json.name);

      const brandingPatch: Record<string, unknown> = {};
      if (json.logo_url) brandingPatch.logo_data_uri = json.logo_url;
      if (json.accent_hex) brandingPatch.accent_hex = json.accent_hex;
      if (Object.keys(brandingPatch).length > 0) {
        api.updateSectionData("branding", brandingPatch);
      }

      api.updateSectionData("identity", { source_url: json.source_url ?? websiteUrl.trim() });
      const filled: string[] = [];
      if (json.name) filled.push("name");
      if (json.logo_url) filled.push("logo");
      if (json.accent_hex) filled.push("colour");
      if (filled.length > 0) {
        setImportNote(`Loaded ${filled.join(", ")}.`);
      } else {
        setImportNote(null);
      }
    } catch {
      setImportNote(null);
    } finally {
      setImporting(false);
    }
  }

  const isLocked = api.hasOrg;

  const canContinue = isLocked
    ? !!brandName.trim() && !!firstName.trim()
    : !!brandName.trim() &&
      slug.length >= 3 &&
      slugAvailable === true &&
      !!firstName.trim();

  return (
    <>
      <SectionHeading
        title="Tell us who you are"
        subtitle="Just the basics. We use your brand name to set up your address on the platform."
      />

      {isLocked && (
        <Alert variant="success">
          <Check className="size-4" />
          <AlertDescription>
            <span className="font-medium text-foreground">Account already created.</span>{" "}
            Your address is{" "}
            <span className="font-mono text-foreground">{slug}.entry.events</span>. You can edit
            your display name in Settings → Branding later.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <SectionField label="First name" htmlFor="onb-first-name">
              <Input
                id="onb-first-name"
                autoFocus={!isLocked}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={40}
                readOnly={isLocked}
                placeholder="First name"
              />
            </SectionField>
            <SectionField label="Last name" htmlFor="onb-last-name">
              <Input
                id="onb-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={40}
                readOnly={isLocked}
                placeholder="Last name"
              />
            </SectionField>
          </div>

          <SectionField
            label="Brand name"
            htmlFor="onb-brand-name"
            hint={isLocked ? undefined : "What customers will see on your event pages."}
          >
            <Input
              id="onb-brand-name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              maxLength={50}
              readOnly={isLocked}
              placeholder="e.g. Night Shift Events"
            />
            {!isLocked && slug.length >= 3 && (
              <div className="flex items-center gap-1.5 text-xs">
                {slugChecking ? (
                  <>
                    <Loader2 size={12} className="animate-spin text-muted-foreground" />
                    <span className="font-mono text-muted-foreground">{slug}.entry.events</span>
                  </>
                ) : slugAvailable ? (
                  <>
                    <Check size={12} className="text-success" strokeWidth={2.5} />
                    <span className="font-mono text-success">{slug}.entry.events</span>
                    <span className="text-success/70">— available</span>
                  </>
                ) : slugAvailable === false ? (
                  <span className="text-destructive">
                    {slug}.entry.events is taken — try a different name.
                  </span>
                ) : null}
              </div>
            )}
          </SectionField>
        </CardContent>
      </Card>

      {!isLocked && (
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles size={14} className="text-primary" />
              Got a website?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Paste your URL and we&apos;ll grab your logo and colours automatically.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="pl-9"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="yourbrand.com"
                  disabled={importing}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleImport();
                    }
                  }}
                />
              </div>
              <Button
                variant="outline"
                size="default"
                onClick={handleImport}
                disabled={!websiteUrl.trim() || importing}
              >
                {importing ? <Loader2 size={12} className="animate-spin" /> : "Load"}
              </Button>
            </div>
            {importNote && <p className="text-xs text-muted-foreground">{importNote}</p>}
          </CardContent>
        </Card>
      )}

      <SectionFooter
        primaryLabel="Continue"
        primaryDisabled={!canContinue}
        primaryLoading={api.saving}
        onPrimary={async () => {
          await api.completeAndAdvance("identity", {
            first_name: firstName,
            last_name: lastName,
            brand_name: brandName,
            slug,
            source_url: websiteUrl.trim() || undefined,
          });
        }}
      />
    </>
  );
}
