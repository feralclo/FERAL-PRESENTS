"use client";

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, Loader2, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

  const sample = previewTakeHome({ ticket_price: 20, currency, plan_id: "starter" });

  async function handleStripeSetup() {
    setCreating(true);
    setError(null);
    try {
      const popup = typeof window !== "undefined" ? window.open("", "_blank") : null;

      const createRes = await fetch("/api/stripe/connect/my-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: undefined,
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
    <>
      <SectionHeading
        title="Get paid for your tickets"
        subtitle="Sell directly through your event page, or list events on Entry and send buyers to your existing ticket site."
      />

      <div className="space-y-3">
        <ChoiceCard
          active={method === "stripe"}
          title="Sell tickets through Entry"
          subtitle="Buyers check out on your event page. Funds settle to your Stripe account, with Apple/Google Pay built in."
          tag="Recommended"
          onClick={() => setMethod("stripe")}
        />
        <ChoiceCard
          active={method === "external"}
          title="I sell tickets somewhere else"
          subtitle="Skiddle, Eventbrite, your own site — Entry shows the listing and a “Get tickets” button that points to your URL."
          onClick={() => setMethod("external")}
        />
      </div>

      {method === "stripe" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Stripe details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <SectionField
              label="Business type"
              hint={
                businessType === "company"
                  ? "Stripe will ask for your company registration number. If you trade alone without one, pick “Individual / sole trader” instead."
                  : undefined
              }
            >
              <Select
                value={businessType}
                onValueChange={(v) =>
                  setBusinessType(v as "individual" | "company" | "non_profit")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual / sole trader</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="non_profit">Non-profit</SelectItem>
                </SelectContent>
              </Select>
            </SectionField>

            <FeeBreakdown sample={sample} currency={currency} />

            {chargesEnabled ? (
              <Alert variant="success">
                <Check className="size-4" />
                <AlertDescription>
                  You can take payments now. Add a bank account anytime to receive payouts.
                </AlertDescription>
              </Alert>
            ) : accountId ? (
              <Alert variant="warning">
                <AlertDescription>
                  Stripe verification is in progress. You can keep going — finish anytime from
                  Settings → Payments.
                </AlertDescription>
              </Alert>
            ) : (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleStripeSetup}
                disabled={creating}
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
              </Button>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {method === "external" && (
        <HintCard>
          Each event you create will have a “Get tickets” link to wherever you sell — you&apos;ll
          paste that URL when you set up the event. Entry handles the listing, your existing
          provider handles the checkout. You can switch any single event to Stripe-hosted
          checkout later.
        </HintCard>
      )}

      <SectionFooter
        primaryLabel={
          method === "stripe" && !chargesEnabled ? "Continue, finish Stripe later" : "Continue"
        }
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
    </>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {tag && (
            <span className="rounded-full bg-primary/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1.5px] text-primary ring-1 ring-primary/15">
              {tag}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}

function FeeBreakdown({
  sample,
  currency,
}: {
  sample: ReturnType<typeof previewTakeHome>;
  currency: string;
}) {
  const symbol =
    currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "JPY" ? "¥" : "£";
  const fmt = (n: number) => `${symbol}${n.toFixed(2)}`;
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/40 p-3">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
        On a {symbol}20 ticket sold today
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        <Row label="Customer pays" value={fmt(sample.customer_pays)} />
        <Row label="Entry fee" value={`−${fmt(sample.entry_fee)}`} />
        <Row label="Stripe processing (est.)" value={`−${fmt(sample.stripe_fee_estimate)}`} />
        <div className="my-1 h-px bg-border/60" />
        <Row label="You keep" value={fmt(sample.take_home)} bold />
      </dl>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Stripe processing varies by card type — this is a UK domestic estimate. Pro plan reduces
        Entry&apos;s cut to 2% + 10p.
      </p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={bold ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd
        className={`font-mono ${
          bold ? "font-semibold text-foreground" : "text-foreground/85"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
