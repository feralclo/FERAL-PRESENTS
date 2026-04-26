"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Check, Sparkles, Globe } from "lucide-react";
import { SectionFooter, SectionField, SectionHeading, HintCard } from "../Shell";
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
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced slug check — mirrors the existing wizard's logic.
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

  // Persist field changes (debounced via state hook)
  useEffect(() => {
    api.updateSectionData("identity", {
      first_name: firstName,
      last_name: lastName,
      brand_name: brandName,
      slug,
    });
    // Intentionally exclude `api` from deps — it's stable enough and including
    // it causes infinite-loop with the autosave debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, brandName, slug]);

  async function handleImport() {
    if (!websiteUrl.trim() || importing) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const res = await fetch("/api/onboarding/import-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl.trim() }),
      });
      const json = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) {
        setImportMessage(
          "Couldn't auto-load — that's fine, fill anything in below or upload a logo on the next step."
        );
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
      setImportMessage(
        filled.length
          ? `Loaded ${filled.join(", ")}.`
          : "Site loaded but no logo/colour found — upload your own on the branding step."
      );
    } catch {
      setImportMessage(
        "Couldn't auto-load — that's fine, fill anything in below or upload a logo on the next step."
      );
    } finally {
      setImporting(false);
    }
  }

  // Once provisioning has run (i.e. the user advanced to Country and back),
  // their account is locked. Slug is the URL identifier — can't be changed
  // post-provision because everything (org_users.org_id, settings keys, domain
  // hostname) keys off it. They can edit display name & branding from Settings.
  const isLocked = api.hasOrg;

  const canContinue = isLocked
    ? !!brandName.trim() && !!firstName.trim()
    : !!brandName.trim() &&
      slug.length >= 3 &&
      slugAvailable === true &&
      !!firstName.trim();

  return (
    <div>
      <SectionHeading
        eyebrow="Step 1 of 9"
        title="Tell us who you are"
        subtitle="Just the basics — we use this to set up your account and pre-fill what we can later."
      />

      {isLocked && (
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-success/20 bg-success/[0.05] px-4 py-3 text-[12px]">
          <Check size={14} className="mt-0.5 shrink-0 text-success" strokeWidth={2.5} />
          <div className="text-foreground/85">
            <div className="font-medium text-foreground">Account already created.</div>
            <div className="mt-0.5 text-muted-foreground">
              Your address is{" "}
              <span className="font-mono text-foreground">{slug}.entry.events</span>. Display name
              and branding can be updated later in Settings → Branding.
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <SectionField label="First name">
            <input
              autoFocus={!isLocked}
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={40}
              readOnly={isLocked}
              className={`${inputClass} ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
              placeholder="First name"
            />
          </SectionField>
          <SectionField label="Last name">
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={40}
              readOnly={isLocked}
              className={`${inputClass} ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
              placeholder="Last name"
            />
          </SectionField>
        </div>

        <SectionField
          label="Brand name"
          hint={isLocked ? undefined : "What customers will see on your event pages."}
        >
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            maxLength={50}
            readOnly={isLocked}
            className={`${inputClass} ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
            placeholder="e.g. Night Shift Events"
          />
          {!isLocked && slug.length >= 3 && (
            <div className="mt-2.5 flex items-center gap-1.5 text-[12px]">
              {slugChecking ? (
                <>
                  <Loader2 size={12} className="animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">{slug}.entry.events</span>
                </>
              ) : slugAvailable ? (
                <>
                  <Check size={12} className="text-success" strokeWidth={2.5} />
                  <span className="text-success">{slug}.entry.events</span>
                  <span className="text-success/60">— available</span>
                </>
              ) : slugAvailable === false ? (
                <span className="text-destructive">{slug}.entry.events is taken — try a tweak.</span>
              ) : null}
            </div>
          )}
        </SectionField>

        {!isLocked && (
        <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            <Sparkles size={12} />
            Optional shortcut
          </div>
          <div className="text-[13px] font-medium text-foreground">Got a website?</div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            Paste it and we'll grab your logo and colours automatically.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Globe size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="yourbrand.com"
                className={`${inputClass} pl-9`}
                disabled={importing}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleImport();
                  }
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={!websiteUrl.trim() || importing}
              className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-[12px] font-semibold text-primary transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {importing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  Loading…
                </span>
              ) : (
                "Load"
              )}
            </button>
          </div>
          {importMessage && (
            <p className="mt-2 text-[11px] text-muted-foreground">{importMessage}</p>
          )}
        </div>
        )}

        {!isLocked && (
          <HintCard>
            We&apos;ll never share your name publicly without you wanting us to.
          </HintCard>
        )}
      </div>

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
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-input bg-background/40 px-4 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15";
