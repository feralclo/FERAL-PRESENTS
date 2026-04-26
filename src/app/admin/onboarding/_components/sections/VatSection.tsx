"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionFooter, SectionField, SectionHeading, HintCard } from "../Shell";
import { getCountryVatInfo, getDefaultVatSettings, getTaxLabel } from "@/lib/country-vat";
import { validateVatNumber } from "@/lib/vat";
import type { OnboardingApi } from "../../_state";

interface CountryData {
  country?: string;
}
interface VatData {
  registered?: boolean;
  vat_number?: string;
  vat_rate?: number;
  prices_include_vat?: boolean;
}

export function VatSection({ api }: { api: OnboardingApi }) {
  const country = ((api.getSection("country")?.data ?? {}) as CountryData).country ?? "GB";
  const taxLabel = getTaxLabel(country);
  const info = getCountryVatInfo(country);
  const defaults = getDefaultVatSettings(country);

  const stored = (api.getSection("vat")?.data ?? {}) as VatData;
  const [registered, setRegistered] = useState<boolean>(stored.registered ?? false);
  const [vatNumber, setVatNumber] = useState(stored.vat_number ?? "");
  const [rate, setRate] = useState<number>(stored.vat_rate ?? defaults.vat_rate);
  const [inclusive, setInclusive] = useState<boolean>(
    stored.prices_include_vat ?? defaults.prices_include_vat
  );
  const [vatNumberError, setVatNumberError] = useState<string | null>(null);
  const [persisting, setPersisting] = useState(false);

  useEffect(() => {
    api.updateSectionData("vat", {
      registered,
      vat_number: vatNumber,
      vat_rate: rate,
      prices_include_vat: inclusive,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registered, vatNumber, rate, inclusive]);

  async function handleContinue() {
    setVatNumberError(null);

    if (registered && vatNumber.trim()) {
      const cleaned = validateVatNumber(vatNumber);
      if (!cleaned) {
        setVatNumberError(`That doesn't look like a valid ${taxLabel} number.`);
        return;
      }
    }

    if (api.orgId) {
      setPersisting(true);
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: `${api.orgId}_vat`,
            data: {
              vat_registered: registered,
              vat_number: registered ? vatNumber.trim() : "",
              vat_rate: registered ? rate : defaults.vat_rate,
              prices_include_vat: registered ? inclusive : defaults.prices_include_vat,
            },
          }),
        }).catch(() => {});
      } finally {
        setPersisting(false);
      }
    }

    await api.completeAndAdvance("vat", {
      registered,
      vat_number: vatNumber.trim() || undefined,
      vat_rate: rate,
      prices_include_vat: inclusive,
    });
  }

  return (
    <>
      <SectionHeading
        title={`Are you ${taxLabel} registered?`}
        subtitle={
          info.has_federal_tax
            ? `Most small or new promoters aren't yet — your tax authority lets you know once you cross the threshold.`
            : `${country} doesn't have a national ${taxLabel} regime — pick "Not registered" unless you handle state or provincial tax separately.`
        }
      />

      <div className="space-y-3">
        <ChoiceRow
          active={!registered}
          title="Not registered"
          subtitle={`We won't add ${taxLabel} to your tickets.`}
          onClick={() => setRegistered(false)}
        />
        <ChoiceRow
          active={registered}
          title={`Yes, I'm ${taxLabel} registered`}
          subtitle={`Default rate ${info.default_rate}%, ${
            info.prices_include_default ? "inclusive" : "exclusive"
          } pricing.`}
          onClick={() => setRegistered(true)}
        />
      </div>

      {registered && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{taxLabel} details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SectionField label={`${taxLabel} rate (%)`} htmlFor="onb-vat-rate">
                <Input
                  id="onb-vat-rate"
                  type="number"
                  value={rate}
                  min={0}
                  max={100}
                  step={0.5}
                  onChange={(e) => setRate(Number(e.target.value))}
                />
              </SectionField>
              <SectionField label="Pricing" htmlFor="onb-vat-pricing">
                <Select
                  value={inclusive ? "inclusive" : "exclusive"}
                  onValueChange={(v) => setInclusive(v === "inclusive")}
                >
                  <SelectTrigger id="onb-vat-pricing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inclusive">Include {taxLabel} in price</SelectItem>
                    <SelectItem value="exclusive">Add {taxLabel} on top</SelectItem>
                  </SelectContent>
                </Select>
              </SectionField>
            </div>
            <SectionField
              label={`${taxLabel} number (optional)`}
              htmlFor="onb-vat-number"
              hint={taxLabel === "VAT" ? "e.g. GB123456789" : undefined}
              error={vatNumberError ?? undefined}
            >
              <Input
                id="onb-vat-number"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value.toUpperCase())}
                className="font-mono"
                placeholder={taxLabel === "VAT" ? "GB123456789" : "Your registration number"}
              />
            </SectionField>
          </CardContent>
        </Card>
      )}

      <HintCard>
        You can override {taxLabel.toLowerCase()} per event later — useful when an event runs in a
        country with different rules.
      </HintCard>

      <SectionFooter
        primaryLabel="Continue"
        primaryLoading={api.saving || persisting}
        onPrimary={handleContinue}
      />
    </>
  );
}

function ChoiceRow({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border bg-card px-4 py-3.5 text-left shadow-sm shadow-black/20 transition-all ${
        active
          ? "border-primary/50 bg-primary/[0.04]"
          : "border-border/60 hover:border-primary/30"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          active ? "border-primary" : "border-input"
        }`}
      >
        {active && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <div className="flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}
