"use client";

import { useEffect, useState } from "react";
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

    // Persist to vatKey via /api/settings — happens post-provision
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
    <div>
      <SectionHeading
        eyebrow="Step 5 of 9"
        title={`Are you ${taxLabel} registered?`}
        subtitle={
          info.has_federal_tax
            ? `Most small or new promoters aren't yet — you'd typically be told by your tax authority once you cross the threshold.`
            : `${country} doesn't have a national ${taxLabel} regime — pick "Not registered" unless you handle state/provincial taxes separately.`
        }
      />

      <div className="space-y-3">
        <RadioCard
          active={!registered}
          title="Not registered"
          subtitle={`We won't add ${taxLabel} to your tickets.`}
          onClick={() => setRegistered(false)}
        />
        <RadioCard
          active={registered}
          title={`Yes, I'm ${taxLabel} registered`}
          subtitle={`Default rate ${info.default_rate}%, ${info.prices_include_default ? "inclusive" : "exclusive"} pricing.`}
          onClick={() => setRegistered(true)}
        />
      </div>

      {registered && (
        <div className="mt-5 space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.015] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SectionField label={`${taxLabel} rate (%)`}>
              <input
                type="number"
                value={rate}
                min={0}
                max={100}
                step={0.5}
                onChange={(e) => setRate(Number(e.target.value))}
                className={inputSm}
              />
            </SectionField>
            <SectionField label="Prices shown to customers">
              <select
                value={inclusive ? "inclusive" : "exclusive"}
                onChange={(e) => setInclusive(e.target.value === "inclusive")}
                className={inputSm}
              >
                <option value="inclusive">Include {taxLabel}</option>
                <option value="exclusive">Add {taxLabel} on top</option>
              </select>
            </SectionField>
          </div>
          <SectionField
            label={`${taxLabel} number (optional)`}
            error={vatNumberError ?? undefined}
            hint={taxLabel === "VAT" ? "e.g. GB123456789" : undefined}
          >
            <input
              type="text"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value.toUpperCase())}
              className={`${inputSm} font-mono`}
              placeholder={taxLabel === "VAT" ? "GB123456789" : "Your registration number"}
            />
          </SectionField>
        </div>
      )}

      <HintCard>
        You can override {taxLabel} per event later — useful if you sometimes run events
        in a country with different rules.
      </HintCard>

      <SectionFooter
        primaryLabel="Continue"
        primaryLoading={api.saving || persisting}
        onPrimary={handleContinue}
      />
    </div>
  );
}

function RadioCard({
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
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all ${
        active
          ? "border-primary/50 bg-primary/[0.06]"
          : "border-white/[0.05] hover:border-white/[0.1]"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          active ? "border-primary" : "border-white/[0.15]"
        }`}
      >
        {active && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <div>
        <div className="text-[14px] font-semibold text-foreground">{title}</div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}

const inputSm =
  "h-10 w-full rounded-lg border border-input bg-background/40 px-3 text-[13px] text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15";
