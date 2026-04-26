"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { SectionFooter, SectionField, SectionHeading, HintCard } from "../Shell";
import {
  COUNTRIES,
  detectCountryFromLocale,
  getCurrencySymbolFromMap,
  getDefaultCurrency,
} from "@/lib/country-currency-map";
import { getTaxLabel } from "@/lib/country-vat";
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
  const taxLabel = getTaxLabel(country);

  async function handleContinue() {
    setError(null);

    if (!api.hasOrg) {
      const identity = (api.getSection("identity")?.data ?? {}) as IdentityData;
      if (!identity.brand_name) {
        setError("Brand name missing — go back to step 1.");
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
        setError(err instanceof Error ? err.message : "Could not set up your account.");
        return;
      } finally {
        setProvisioning(false);
      }
    }

    await api.completeAndAdvance("country", { country });
  }

  return (
    <>
      <SectionHeading
        title="Where are you based?"
        subtitle="This sets your default currency and time zone. You can override either per event."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Country</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SectionField label="Country" htmlFor="onb-country">
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger id="onb-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SectionField>

          <div className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
            Default currency:{" "}
            <span className="font-medium text-foreground">
              {currency} ({symbol})
            </span>
          </div>
        </CardContent>
      </Card>

      <HintCard>
        We&apos;ll ask whether you&apos;re {taxLabel.toLowerCase()} registered on the next steps.
      </HintCard>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SectionFooter
        primaryLabel="Continue"
        primaryDisabled={provisioning}
        primaryLoading={provisioning || api.saving}
        onPrimary={handleContinue}
      />
    </>
  );
}
