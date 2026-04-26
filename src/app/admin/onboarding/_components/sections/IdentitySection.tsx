"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Check, Lock, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionFooter, SectionField, SectionHeading } from "../Shell";
import { COUNTRIES, detectCountryFromLocale } from "@/lib/country-currency-map";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { OnboardingApi } from "../../_state";

interface IdentityData {
  first_name?: string;
  last_name?: string;
  brand_name?: string;
  slug?: string;
  country?: string;
}

/**
 * Best-effort split of a single full-name string into first/last.
 * Handles "Alex Morgan", "Alex de Lacy", "Alex" → ["Alex", ""], etc.
 */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * Step 1: Identity.
 *
 * One screen — name, brand, country. Country drives currency, timezone, and
 * VAT defaults silently (provision-org applies them) so the user never sees
 * a binary "Are you VAT registered?" question. Slug is derived from brand
 * name with live availability check.
 *
 * On Continue (first time), provisions the org via /api/auth/provision-org
 * with the chosen country, then advances to Branding. On Continue (resume,
 * post-provision), the slug is locked and we just advance.
 */
export function IdentitySection({ api }: { api: OnboardingApi }) {
  const stored = (api.getSection("identity")?.data ?? {}) as IdentityData;

  const initialCountry = useMemo(
    () =>
      stored.country ||
      (typeof navigator !== "undefined"
        ? detectCountryFromLocale(navigator.language)
        : "GB"),
    [stored.country]
  );

  const [firstName, setFirstName] = useState(stored.first_name ?? "");
  const [lastName, setLastName] = useState(stored.last_name ?? "");
  const [brandName, setBrandName] = useState(stored.brand_name ?? "");
  const [country, setCountry] = useState(initialCountry);
  const [slug, setSlug] = useState(stored.slug ?? "");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionMessage, setProvisionMessage] = useState("Reserving your address…");
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefilledRef = useRef(false);
  const isLocked = api.hasOrg;

  // Phased loading messages during provisioning. The actual call usually
  // resolves in 600–1500ms; the messages cycle through warm copy so the
  // user never stares at a generic "Working…" spinner at the moment of
  // creating their org.
  useEffect(() => {
    if (!provisioning) {
      setProvisionMessage("Reserving your address…");
      return;
    }
    const t1 = setTimeout(() => setProvisionMessage("Setting up your storefront…"), 1300);
    const t2 = setTimeout(() => setProvisionMessage("Almost there…"), 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [provisioning]);

  // Pre-fill name from auth metadata (Google OAuth populates full_name /
  // given_name). Stripe Connect Express's redesign credits a 17% conversion
  // uplift to aggressive pre-fill: don't ask for what we already know.
  useEffect(() => {
    if (prefilledRef.current) return;
    if (stored.first_name || stored.last_name) {
      prefilledRef.current = true;
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const meta = data.user.user_metadata as
        | { full_name?: string; name?: string; given_name?: string; family_name?: string }
        | undefined;
      if (!meta) return;
      const given = meta.given_name?.trim();
      const family = meta.family_name?.trim();
      if (given || family) {
        if (given && !firstName) setFirstName(given);
        if (family && !lastName) setLastName(family);
        prefilledRef.current = true;
        return;
      }
      const fallback = (meta.full_name || meta.name || "").trim();
      if (fallback) {
        const { first, last } = splitName(fallback);
        if (first && !firstName) setFirstName(first);
        if (last && !lastName) setLastName(last);
        prefilledRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slug live-derived from brand name + availability check.
  useEffect(() => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    const next = brandName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    setSlug(next);

    if (isLocked || next.length < 3) {
      setSlugAvailable(null);
      setSlugChecking(false);
      return;
    }
    setSlugChecking(true);
    slugTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-slug?slug=${encodeURIComponent(next)}`);
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
  }, [brandName, isLocked]);

  // Mirror form state into the wizard so Branding's preview can use brand_name + accent.
  useEffect(() => {
    api.updateSectionData("identity", {
      first_name: firstName,
      last_name: lastName,
      brand_name: brandName,
      slug,
      country,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, brandName, slug, country]);

  const canContinue = isLocked
    ? !!firstName.trim() && !!brandName.trim()
    : !!firstName.trim() &&
      !!brandName.trim() &&
      slug.length >= 3 &&
      slugAvailable === true &&
      !!country;

  async function handleContinue() {
    setProvisionError(null);

    // Resume case — already provisioned, just advance.
    if (isLocked) {
      await api.completeAndAdvance("identity", {
        first_name: firstName,
        last_name: lastName,
        brand_name: brandName,
        slug,
        country,
      });
      return;
    }

    // First-time case — provision the org now.
    setProvisioning(true);
    try {
      const res = await fetch("/api/auth/provision-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: brandName.trim(),
          country,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `Could not create your account (${res.status})`);
      }
      const finalSlug = json?.data?.org_id ?? slug;
      api.setOrgId(finalSlug);
      await api.completeAndAdvance("identity", {
        first_name: firstName,
        last_name: lastName,
        brand_name: brandName,
        slug: finalSlug,
        country,
      });
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : "Could not create your account.");
    } finally {
      setProvisioning(false);
    }
  }

  // Auto-clear provision errors when the user edits anything — they're acting,
  // we don't need to keep a stale red alert hanging around.
  useEffect(() => {
    if (provisionError) setProvisionError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, brandName, country]);

  return (
    <>
      <SectionHeading
        title="Welcome to Entry"
        subtitle="A few quick details and we'll set up your storefront."
      />

      {isLocked && (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>
            <span className="font-medium text-foreground">Your account is set up.</span>{" "}
            Your address is{" "}
            <span className="font-mono text-foreground">{slug}.entry.events</span>. You can
            edit names and country in Settings later.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <SectionField label="First name" htmlFor="onb-first-name">
              <Input
                id="onb-first-name"
                autoFocus={!isLocked}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={40}
                readOnly={isLocked}
                placeholder="Alex"
              />
            </SectionField>
            <SectionField
              label={
                <>
                  Last name{" "}
                  <span className="ml-1 text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground/60">
                    optional
                  </span>
                </>
              }
              htmlFor="onb-last-name"
            >
              <Input
                id="onb-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={40}
                readOnly={isLocked}
                placeholder="Morgan"
              />
            </SectionField>
          </div>

          <SectionField
            label="Country"
            htmlFor="onb-country"
            hint={
              isLocked
                ? undefined
                : "Sets your default currency and timezone. You can override per event later."
            }
          >
            <Select
              value={country}
              onValueChange={setCountry}
              disabled={isLocked || provisioning}
            >
              <SelectTrigger id="onb-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                      {c.currency}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SectionField>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <SectionField
            label="Brand name"
            htmlFor="onb-brand-name"
            hint={
              isLocked
                ? undefined
                : "What buyers see at checkout, in your emails, and on your event pages."
            }
          >
            <Input
              id="onb-brand-name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              maxLength={50}
              readOnly={isLocked}
              placeholder="Night Shift Events"
            />
          </SectionField>

          {!isLocked && brandName.trim().length > 0 && slug.length >= 3 && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-xs">
              {slugChecking ? (
                <>
                  <Loader2 size={12} className="animate-spin text-muted-foreground" />
                  <span className="font-mono text-muted-foreground">{slug}.entry.events</span>
                </>
              ) : slugAvailable ? (
                <>
                  <Check size={12} className="text-success" strokeWidth={2.5} />
                  <span className="font-mono text-foreground">{slug}.entry.events</span>
                  <span className="ml-auto text-success/80">available</span>
                </>
              ) : slugAvailable === false ? (
                <span className="text-destructive">
                  {slug}.entry.events is taken — try a slightly different name.
                </span>
              ) : null}
            </div>
          )}

          {isLocked && slug && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-xs">
              <Lock size={12} className="text-muted-foreground" />
              <span className="font-mono text-foreground">{slug}.entry.events</span>
            </div>
          )}
        </CardContent>
      </Card>

      {provisionError && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            <div className="font-medium text-destructive-foreground">
              {prettifyProvisionError(provisionError)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setProvisionError(null);
                  void handleContinue();
                }}
                disabled={provisioning || !canContinue}
              >
                <RefreshCw size={11} />
                Try again
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Or pick a slightly different brand name above.
              </span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <SectionFooter
        primaryLabel={isLocked ? "Continue" : "Create my space"}
        primaryLoadingLabel={isLocked ? "Saving…" : provisionMessage}
        primaryDisabled={!canContinue || provisioning}
        primaryLoading={provisioning || api.saving}
        onPrimary={handleContinue}
      />
    </>
  );
}

/**
 * Server errors come through verbose ("Could not find an available slug.
 * Please try a different name."). Soften the most common ones for the
 * panicked-merchant moment without losing specificity.
 */
function prettifyProvisionError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("available slug") || lower.includes("already")) {
    return "That brand name was just taken. Tweak it slightly and we'll grab it for you.";
  }
  if (lower.includes("authenticated") || lower.includes("session")) {
    return "Your session timed out. Refresh the page and we'll pick up where you left off.";
  }
  if (lower.includes("rate") || lower.includes("limit")) {
    return "We're being asked too many times — wait a few seconds and try again.";
  }
  return raw;
}
