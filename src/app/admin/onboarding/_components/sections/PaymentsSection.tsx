"use client";

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { SectionFooter, SectionField, SectionHeading, HintCard } from "../Shell";
import { previewTakeHome } from "@/lib/fee-preview";
import { getDefaultCurrency } from "@/lib/country-currency-map";
import type { OnboardingApi } from "../../_state";

interface PaymentsData {
  method?: "stripe" | "external";
  business_type?: "individual" | "company" | "non_profit";
  account_id?: string;
  charges_enabled?: boolean;
  details_submitted?: boolean;
  deferred?: boolean;
}
interface IdentityData {
  brand_name?: string;
  first_name?: string;
  last_name?: string;
}
interface CountryData {
  country?: string;
}

export function PaymentsSection({ api }: { api: OnboardingApi }) {
  const stored = (api.getSection("payments")?.data ?? {}) as PaymentsData;
  const identity = (api.getSection("identity")?.data ?? {}) as IdentityData;
  const country = ((api.getSection("country")?.data ?? {}) as CountryData).country ?? "GB";
  const currency = getDefaultCurrency(country);

  const [method, setMethod] = useState<"stripe" | "external">(stored.method ?? "stripe");
  const [businessType, setBusinessType] =
    useState<"individual" | "company" | "non_profit">(stored.business_type ?? "individual");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(stored.account_id);
  const [chargesEnabled, setChargesEnabled] = useState(stored.charges_enabled);

  useEffect(() => {
    api.updateSectionData("payments", { method, business_type: businessType });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, businessType]);

  // Compute fee preview — uses Starter plan since that's the default for new orgs
  const sample = previewTakeHome({ ticket_price: 20, currency, plan_id: "starter" });

  async function handleStripeSetup() {
    setCreating(true);
    setError(null);
    try {
      // Pop a window first (to avoid popup blockers when we get the link async).
      const popup = typeof window !== "undefined" ? window.open("", "_blank") : null;

      const createRes = await fetch("/api/stripe/connect/my-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: undefined, // Server reads from auth user / org admin
          business_name: identity.brand_name,
          country,
          business_type: businessType,
          first_name: identity.first_name,
          last_name: identity.last_name,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) {
        if (popup) popup.close();
        throw new Error(createJson?.error || "Could not create Stripe account");
      }
      setAccountId(createJson.account_id);
      setChargesEnabled(createJson.charges_enabled);

      const linkRes = await fetch("/api/stripe/connect/my-account/onboarding");
      const linkJson = await linkRes.json();
      if (!linkRes.ok || !linkJson.url) {
        if (popup) popup.close();
        throw new Error(linkJson?.error || "Could not open Stripe onboarding");
      }

      if (popup) popup.location.href = linkJson.url;
      else if (typeof window !== "undefined") window.open(linkJson.url, "_blank");

      api.updateSectionData("payments", {
        account_id: createJson.account_id,
        charges_enabled: createJson.charges_enabled,
        details_submitted: createJson.details_submitted,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stripe setup failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <SectionHeading
        eyebrow="Step 6 of 9"
        title="Take payments"
        subtitle="Connect Stripe to accept card payments through Entry — or link an external ticketing provider."
      />

      <div className="space-y-3">
        <ChoiceCard
          active={method === "stripe"}
          title="Take payments through Entry"
          subtitle={`Buyers check out on your event page — funds settle to your Stripe account.`}
          tag="Recommended"
          onClick={() => setMethod("stripe")}
        />
        <ChoiceCard
          active={method === "external"}
          title="I use Skiddle / Eventbrite / another ticketing provider"
          subtitle="Use Entry just for listings. We won't ask for payment details."
          onClick={() => setMethod("external")}
        />
      </div>

      {method === "stripe" && (
        <div className="mt-5 space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.015] p-4">
          <SectionField label="Business type">
            <select
              value={businessType}
              onChange={(e) =>
                setBusinessType(e.target.value as "individual" | "company" | "non_profit")
              }
              className="h-10 w-full rounded-lg border border-input bg-background/40 px-3 text-[13px] text-foreground outline-none focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15"
            >
              <option value="individual">Individual / sole trader</option>
              <option value="company">Company</option>
              <option value="non_profit">Non-profit</option>
            </select>
            {businessType === "company" && (
              <p className="mt-2 text-[11px] text-warning">
                Stripe will ask for your company registration number. If you trade alone without
                one, pick "Individual / sole trader" instead.
              </p>
            )}
          </SectionField>

          {/* Fee transparency */}
          <div className="rounded-xl border border-white/[0.05] bg-black/[0.2] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              On a {currency} 20 ticket sold today
            </div>
            <div className="mt-2 space-y-1 text-[12px]">
              <FeeRow label="Customer pays" value={sample.customer_pays} currency={currency} />
              <FeeRow label="Entry fee" value={sample.entry_fee} negative currency={currency} />
              <FeeRow
                label="Stripe processing (est.)"
                value={sample.stripe_fee_estimate}
                negative
                currency={currency}
              />
              <div className="my-1 h-px bg-white/[0.05]" />
              <FeeRow label="You keep" value={sample.take_home} bold currency={currency} />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground/60">
              Stripe processing varies by card type — this is a rough UK domestic estimate.
              Pro plan reduces Entry's cut to 2% + 10p.
            </p>
          </div>

          {chargesEnabled ? (
            <div className="rounded-xl border border-success/20 bg-success/[0.06] px-4 py-3 text-[13px] text-foreground">
              ✅ You can accept payments now. Bank details for payouts can be added anytime.
            </div>
          ) : accountId ? (
            <div className="rounded-xl border border-warning/20 bg-warning/[0.06] px-4 py-3 text-[13px] text-foreground">
              Stripe verification is in progress. We'll keep going — you can finish at any time
              from <span className="font-mono text-[12px] text-muted-foreground">/admin/payments</span>.
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStripeSetup}
              disabled={creating}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-[13px] font-semibold text-primary transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {creating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Opening Stripe…
                </>
              ) : (
                <>
                  <CreditCard size={14} />
                  Set up Stripe (~2 min)
                  <ExternalLink size={12} />
                </>
              )}
            </button>
          )}
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      )}

      {method === "external" && (
        <HintCard>
          Your events will publish with a "Get tickets" link to wherever you sell. You can flip
          back to Stripe-hosted checkout per event later.
        </HintCard>
      )}

      <SectionFooter
        primaryLabel={method === "stripe" && !chargesEnabled ? "Continue, finish Stripe later" : "Continue"}
        primaryLoading={api.saving}
        onPrimary={async () => {
          await api.completeAndAdvance("payments", {
            method,
            business_type: businessType,
            account_id: accountId,
            charges_enabled: chargesEnabled,
            deferred: method === "stripe" && !chargesEnabled,
          });
        }}
      />
    </div>
  );
}

function ChoiceCard({
  active,
  title,
  subtitle,
  tag,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  tag?: string;
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
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-foreground">{title}</span>
          {tag && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
              {tag}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}

function FeeRow({
  label,
  value,
  negative,
  bold,
  currency,
}: {
  label: string;
  value: number;
  negative?: boolean;
  bold?: boolean;
  currency: string;
}) {
  const symbol =
    currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "JPY" ? "¥" : "£";
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={`font-mono ${bold ? "font-semibold text-foreground" : "text-foreground/80"}`}>
        {negative ? "−" : ""}
        {symbol}
        {value.toFixed(2)}
      </span>
    </div>
  );
}
