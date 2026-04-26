"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { SectionFooter, SectionField, SectionHeading, HintCard } from "../Shell";
import {
  COUNTRIES,
  detectCountryFromLocale,
  getCurrencySymbolFromMap,
  getDefaultCurrency,
} from "@/lib/country-currency-map";
import { getCountryVatInfo, getTaxLabel } from "@/lib/country-vat";
import type { OnboardingApi } from "../../_state";

interface CountryData {
  country?: string;
}

interface IdentityData {
  brand_name?: string;
  first_name?: string;
  last_name?: string;
  slug?: string;
}

export function CountrySection({ api }: { api: OnboardingApi }) {
  const stored = (api.getSection("country")?.data ?? {}) as CountryData;
  const initial =
    stored.country ||
    (typeof navigator !== "undefined" ? detectCountryFromLocale(navigator.language) : "GB");

  const [country, setCountry] = useState(initial);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.updateSectionData("country", { country });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const currency = getDefaultCurrency(country);
  const symbol = getCurrencySymbolFromMap(currency);
  const vatInfo = getCountryVatInfo(country);
  const taxLabel = getTaxLabel(country);

  async function handleContinue() {
    setError(null);

    // After this section, we provision the org (if not already). Identity has
    // captured brand_name + first/last name; country gives us the rest.
    if (!api.hasOrg) {
      const identity = (api.getSection("identity")?.data ?? {}) as IdentityData;
      if (!identity.brand_name) {
        setError("Brand name missing — go back to step 1");
        return;
      }
      setProvisioning(true);
      try {
        const res = await fetch("/api/auth/provision-org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            org_name: identity.brand_name,
            country,
            event_types: ((api.state as { event_types?: string[] } | null)?.event_types ?? []),
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || `Provisioning failed (${res.status})`);
        }
        const newOrgId = json?.data?.org_id;
        if (newOrgId) api.setOrgId(newOrgId);
      } catch (err) {
        setProvisioning(false);
        setError(err instanceof Error ? err.message : "Could not provision your account");
        return;
      } finally {
        setProvisioning(false);
      }
    }

    await api.completeAndAdvance("country", { country });
  }

  return (
    <div>
      <SectionHeading
        eyebrow="Step 2 of 9"
        title="Where are you based?"
        subtitle="This sets your default currency, time zone, and tax handling."
      />

      <div className="space-y-5">
        <SectionField label="Country">
          <div className="relative">
            <Globe
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="h-11 w-full appearance-none rounded-xl border border-input bg-background/40 pl-11 pr-4 text-[14px] text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </SectionField>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Currency" value={`${currency} (${symbol})`} />
          <Stat
            label={taxLabel === "VAT" ? "Default VAT" : `Default ${taxLabel}`}
            value={vatInfo.default_rate > 0 ? `${vatInfo.default_rate}%` : "None"}
          />
          <Stat label="Pricing" value={vatInfo.prices_include_default ? "Inclusive" : "Excluded"} />
        </div>

        <HintCard>
          You can change any of this later — and individual events can have their own currency or {taxLabel.toLowerCase()} settings.
        </HintCard>

        {error && (
          <div className="rounded-xl border border-destructive/15 bg-destructive/8 px-4 py-2.5 text-[12px] text-destructive">
            {error}
          </div>
        )}
      </div>

      <SectionFooter
        primaryLabel="Continue"
        primaryDisabled={provisioning}
        primaryLoading={provisioning || api.saving}
        onPrimary={handleContinue}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-medium text-foreground">{value}</div>
    </div>
  );
}
