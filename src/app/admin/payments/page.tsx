"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
} from "@stripe/react-connect-js";
import { loadConnectAndInitialize } from "@stripe/connect-js/pure";
import type { StripeConnectInstance } from "@stripe/connect-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { COUNTRIES, getDefaultCurrency, getCurrencySymbolFromMap } from "@/lib/country-currency-map";
import { generalKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  AlertTriangle,
  Smartphone,
  Banknote,
  Shield,
  Zap,
  Info,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Lock,
} from "lucide-react";

type AccountType = "standard" | "custom";

interface AccountStatus {
  connected: boolean;
  account_id: string | null;
  account_type: AccountType;
  email: string | null;
  business_name: string | null;
  country: string | null;
  default_currency: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  livemode: boolean;
  payout_schedule: {
    interval: string;
    delay_days: number | null;
    weekly_anchor: string | null;
    monthly_anchor: number | null;
  } | null;
  requirements_currently_due: string[];
  requirements_past_due: string[];
  disabled_reason: string | null;
  capabilities: {
    card_payments: string;
    transfers: string;
  } | null;
  stale_account?: boolean;
}

type PageView =
  | "loading"
  | "chooser"
  | "setup-form"
  | "onboarding"
  | "hosted-link"
  | "connected";

export default function PaymentSettingsPage() {
  const orgId = useOrgId();
  const [view, setView] = useState<PageView>("loading");
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [livemode, setLivemode] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [redirectingToOAuth, setRedirectingToOAuth] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [connectInstance, setConnectInstance] =
    useState<StripeConnectInstance | null>(null);
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [businessType, setBusinessType] = useState("individual");

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/settings?key=${generalKey(orgId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const savedCountry = json?.data?.country;
        if (savedCountry) setCountry((prev) => prev || savedCountry);
        else setCountry((prev) => prev || "GB");
      })
      .catch(() => setCountry((prev) => prev || "GB"));
  }, [orgId]);

  // Surface return-trip flags from hosted onboarding + OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("onboarding") === "complete") {
      setSuccess("Verification submitted. Checking your account status...");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("refresh") === "true") {
      setError("Your session expired. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("oauth") === "success") {
      setSuccess("Stripe account connected. You’re ready to sell.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("oauth") === "error") {
      const reason = params.get("reason") || "Stripe couldn't complete the connection.";
      setError(reason);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/connect/my-account");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to check payment status");
        setView("chooser");
        return;
      }

      const json = await res.json();
      setOauthAvailable(Boolean(json.oauth_available));

      if (!json.connected) {
        setStatus(null);
        setView("chooser");
        return;
      }

      const acct: AccountStatus = {
        connected: true,
        account_id: json.account_id,
        account_type: (json.account_type as AccountType) || "custom",
        email: json.email,
        business_name: json.business_name,
        country: json.country,
        default_currency: json.default_currency || null,
        charges_enabled: json.charges_enabled,
        payouts_enabled: json.payouts_enabled,
        details_submitted: json.details_submitted,
        livemode: json.livemode !== false,
        payout_schedule: json.payout_schedule || null,
        requirements_currently_due: json.requirements?.currently_due || [],
        requirements_past_due: json.requirements?.past_due || [],
        disabled_reason: json.requirements?.disabled_reason || null,
        capabilities: json.capabilities || null,
        stale_account: json.stale_account,
      };
      setStatus(acct);
      setLivemode(acct.livemode);

      // Always go to the connected/status view. If the Custom account hasn't
      // finished verification yet, the connected view shows a "Setup
      // Incomplete" banner with a "Continue Setup" button that redirects to
      // Stripe's hosted KYC page (more reliable than embedded ConnectJS,
      // which had load-failure issues that left users stuck).
      setView("connected");

      if (acct.charges_enabled) {
        fetch("/api/stripe/apple-pay-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: window.location.hostname }),
        }).catch(() => {});
      }
    } catch {
      setError("Failed to check payment status");
      setView("chooser");
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // ─── Connect existing Stripe (OAuth / Standard) ───

  const handleConnectExisting = async () => {
    setError("");
    setRedirectingToOAuth(true);
    try {
      const res = await fetch("/api/stripe/connect/oauth/start", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error || "Couldn't open Stripe. Please try again.");
        setRedirectingToOAuth(false);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("Network error. Please try again.");
      setRedirectingToOAuth(false);
    }
  };

  // ─── Set up new account (Custom) ───

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setSettingUp(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/stripe/connect/my-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          business_name: businessName.trim() || undefined,
          country,
          business_type: businessType,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to set up payments");
        setSettingUp(false);
        return;
      }

      fetch("/api/stripe/apple-pay-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: window.location.hostname }),
      }).catch(() => {});

      // Account exists in Stripe. Now generate a hosted onboarding link and
      // redirect the browser to it. Stripe handles KYC, then redirects back
      // to /admin/payments?onboarding=complete.
      setSuccess("Sending you to Stripe to verify your details...");
      const linkRes = await fetch("/api/stripe/connect/my-account/onboarding");
      const linkJson = await linkRes.json();
      if (!linkRes.ok || !linkJson.url) {
        setError(
          linkJson.error ||
            "Account created, but couldn't open verification. Please refresh and click Continue Setup.",
        );
        await checkStatus();
        setSettingUp(false);
        return;
      }
      window.location.href = linkJson.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSettingUp(false);
    }
  };

  // ─── Hosted onboarding redirect ───
  // Used when account exists but isn't fully verified — generates a fresh
  // account_link and full-redirects the browser to Stripe.

  const goToHostedOnboarding = async () => {
    setError("");
    try {
      const res = await fetch("/api/stripe/connect/my-account/onboarding");
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error || "Failed to open Stripe verification");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Network error. Please try again.");
    }
  };

  // ─── Embedded ConnectJS (Custom onboarding) ───

  const stripeConnectInstance = useMemo(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey || view !== "onboarding" || !status?.account_id) {
      return null;
    }
    if (status.account_type !== "custom") return null;

    try {
      return loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret: async () => {
          const res = await fetch("/api/stripe/connect/my-account/onboarding", {
            method: "POST",
          });
          const json = await res.json();
          if (!res.ok || !json.client_secret) {
            throw new Error(json.error || "Failed to create onboarding session");
          }
          return json.client_secret;
        },
        appearance: {
          overlays: "dialog",
          variables: {
            colorPrimary: "#8B5CF6",
            colorBackground: "#111117",
            colorText: "#f0f0f5",
            colorSecondaryText: "#8888a0",
            colorBorder: "#1e1e2a",
            colorDanger: "#F43F5E",
            borderRadius: "6px",
            fontFamily: "Inter, system-ui, -apple-system, sans-serif",
            fontSizeBase: "14px",
            spacingUnit: "12px",
          },
        },
      });
    } catch (err) {
      console.error("[PaymentSettings] ConnectJS init error:", err);
      return null;
    }
  }, [view, status?.account_id, status?.account_type]);

  useEffect(() => {
    if (stripeConnectInstance) {
      setConnectInstance(stripeConnectInstance);
    }
  }, [stripeConnectInstance]);

  // ─── Hosted onboarding fallback ───

  const handleHostedFallback = async () => {
    setError("");
    try {
      const res = await fetch("/api/stripe/connect/my-account/onboarding");
      const json = await res.json();
      if (json.url) {
        setHostedUrl(json.url);
        setView("hosted-link");
      } else {
        setError(json.error || "Failed to generate setup link");
      }
    } catch {
      setError("Failed to generate setup link");
    }
  };

  // ─── Disconnect ───

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/connect/my-account", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Failed to disconnect");
        setDisconnecting(false);
        return;
      }
      setStatus(null);
      setConfirmDisconnect(false);
      setSuccess("Account disconnected. You can connect a different account whenever you're ready.");
      setView("chooser");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  };

  // ─── Render ───

  if (view === "loading") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader livemode={livemode} subtitle="Loading your payment status..." />
        <div className="mt-8 flex justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        livemode={livemode}
        subtitle={
          view === "chooser"
            ? "Connect Stripe to start accepting payments."
            : view === "connected" && status?.charges_enabled
              ? "Your payments are live. You’re ready to sell."
              : view === "setup-form"
                ? "We’ll create your Stripe account inside Entry."
                : "Finish setting up to start accepting payments."
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {view === "chooser" && (
        <ChooserView
          oauthAvailable={oauthAvailable}
          redirectingToOAuth={redirectingToOAuth}
          onConnectExisting={handleConnectExisting}
          onSetUpNew={() => setView("setup-form")}
        />
      )}

      {view === "setup-form" && (
        <SetupForm
          email={email}
          setEmail={setEmail}
          businessName={businessName}
          setBusinessName={setBusinessName}
          country={country}
          setCountry={setCountry}
          businessType={businessType}
          setBusinessType={setBusinessType}
          settingUp={settingUp}
          oauthAvailable={oauthAvailable}
          onBack={() => setView("chooser")}
          onSubmit={handleSetup}
        />
      )}

      {view === "onboarding" && (
        <Card className="gap-0 py-0 overflow-hidden">
          <div className="px-6 py-5">
            <h2 className="font-mono text-sm font-bold uppercase tracking-[2px]">
              Complete Your Setup
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Verify your identity and add your bank account details below.
              Your information is encrypted and protected.
            </p>
          </div>

          {connectInstance ? (
            <div className="min-h-[400px] border-t border-border/40 px-6 pt-5 pb-6">
              <ConnectComponentsProvider connectInstance={connectInstance}>
                <ConnectAccountOnboarding
                  onExit={() => {
                    setSuccess("Verification submitted. Checking your account...");
                    checkStatus();
                  }}
                  onLoadError={() => {
                    handleHostedFallback();
                  }}
                />
              </ConnectComponentsProvider>
              <div className="mt-4 pt-4 border-t border-border/30 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={handleHostedFallback}
                >
                  Having trouble? Open verification in a new tab
                  <ExternalLink className="size-3 ml-1" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t border-border/40 px-6 py-6 text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                Loading the verification form...
              </p>
              <Button variant="secondary" size="sm" onClick={handleHostedFallback}>
                Open verification in a new tab instead
              </Button>
            </div>
          )}
        </Card>
      )}

      {view === "hosted-link" && hostedUrl && (
        <Card className="gap-0 border-primary/30 py-0">
          <div className="px-6 py-6 text-center">
            <h2 className="font-mono text-sm font-bold uppercase tracking-[2px]">
              Complete Your Setup
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Click below to verify your identity and add your bank account
              details. You&apos;ll be redirected back here when finished.
            </p>
            <Button className="mt-5" size="lg" asChild>
              <a href={hostedUrl} target="_blank" rel="noopener noreferrer">
                Complete Verification
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
          <Separator />
          <div className="px-6 py-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setHostedUrl(null);
                checkStatus();
              }}
            >
              I&apos;ve Completed Verification
            </Button>
          </div>
        </Card>
      )}

      {view === "connected" && status && (
        <ConnectedView
          status={status}
          confirmDisconnect={confirmDisconnect}
          disconnecting={disconnecting}
          onContinueOnboarding={goToHostedOnboarding}
          onAskDisconnect={() => setConfirmDisconnect(true)}
          onCancelDisconnect={() => setConfirmDisconnect(false)}
          onConfirmDisconnect={handleDisconnect}
        />
      )}
    </div>
  );
}

// ─── Header ───

function PageHeader({ livemode, subtitle }: { livemode: boolean; subtitle: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="font-mono text-sm font-bold uppercase tracking-[2px]">
          Payments
        </h1>
        {!livemode && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-warning ring-1 ring-warning/20">
            Test Mode
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// ─── Chooser ───

function ChooserView({
  oauthAvailable,
  redirectingToOAuth,
  onConnectExisting,
  onSetUpNew,
}: {
  oauthAvailable: boolean;
  redirectingToOAuth: boolean;
  onConnectExisting: () => void;
  onSetUpNew: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="gap-0 py-0 overflow-hidden">
        <div className="px-6 py-7 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
            <Banknote className="size-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Get paid for your tickets</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {oauthAvailable
              ? "Pick how you want to handle payments. Both options accept cards, Apple Pay, and Google Pay, and pay out directly to your bank."
              : "Accept cards, Apple Pay, and Google Pay, with funds paid out directly to your bank."}
          </p>
        </div>
      </Card>

      {/* Chooser */}
      <div className={cn("grid gap-4", oauthAvailable && "lg:grid-cols-2")}>
        {oauthAvailable && (
          <ChoiceCard
            recommended
            badge="30 seconds"
            icon={<StripeMark className="h-5 w-auto" />}
            title="Connect existing Stripe"
            body="Sign in to your Stripe account, approve the link, and you're done. Use the dashboard, bank account, and details you already have."
            features={[
              "Use your existing Stripe dashboard",
              "Refunds & disputes managed by you",
              "No new account to verify",
            ]}
            ctaLabel={redirectingToOAuth ? "Opening Stripe..." : "Connect with Stripe"}
            ctaIcon={redirectingToOAuth ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
            footer="We'll redirect you to Stripe's secure login."
            disabled={redirectingToOAuth}
            onClick={onConnectExisting}
          />
        )}

        <ChoiceCard
          badge="About 5 minutes"
          icon={<Zap className="size-5 text-primary" />}
          title={oauthAvailable ? "Set up new with Entry" : "Set up payments"}
          body={
            oauthAvailable
              ? "We'll guide you through creating a Stripe account inside Entry. You'll need your business details, an ID, and a bank account."
              : "We'll set you up to take payments inside Entry — no separate Stripe signup needed. You'll need your business details, an ID, and a bank account."
          }
          features={[
            "Stays inside Entry — no Stripe login needed",
            "Guided, step-by-step verification",
            "Powered by Stripe Connect",
          ]}
          ctaLabel={oauthAvailable ? "Set up with Entry" : "Get started"}
          ctaIcon={<ArrowRight className="size-4" />}
          footer="Powered by Stripe Connect."
          onClick={onSetUpNew}
        />
      </div>

      {/* Trust strip */}
      <Card className="gap-0 py-0">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-5 sm:grid-cols-4">
          {[
            { icon: CreditCard, label: "Cards" },
            { icon: Smartphone, label: "Apple & Google Pay" },
            { icon: Banknote, label: "Direct payouts" },
            { icon: Shield, label: "PCI-DSS secure" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className="size-3.5 shrink-0 text-primary" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Stripe credit + transparency */}
      <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <Lock className="size-3" />
        <span>Powered by</span>
        <StripeMark className="h-3.5 w-auto opacity-80" />
        <span>&middot; PCI-DSS Level 1 certified</span>
      </div>
    </div>
  );
}

function ChoiceCard({
  recommended,
  badge,
  icon,
  title,
  body,
  features,
  ctaLabel,
  ctaIcon,
  footer,
  disabled,
  onClick,
}: {
  recommended?: boolean;
  badge: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  features: string[];
  ctaLabel: string;
  ctaIcon: React.ReactNode;
  footer: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        "gap-0 py-0 overflow-hidden transition-shadow hover:shadow-lg",
        recommended ? "border-primary/30 ring-1 ring-primary/15" : ""
      )}
    >
      <div className="flex items-start justify-between px-6 pt-6">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/15">
          {icon}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {recommended && (
            <Badge variant="default" className="bg-primary/10 text-primary ring-1 ring-primary/20">
              Recommended
            </Badge>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">
            {badge}
          </span>
        </div>
      </div>

      <div className="px-6 pt-4">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>

      <ul className="mt-4 space-y-2 px-6">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-foreground/80">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 px-6">
        <Button className="w-full" size="lg" onClick={onClick} disabled={disabled}>
          {ctaIcon}
          {ctaLabel}
        </Button>
      </div>

      <p className="px-6 pb-5 pt-3 text-center text-[11px] text-muted-foreground/70">
        {footer}
      </p>
    </Card>
  );
}

// ─── Setup form (Custom path) ───

function SetupForm({
  email,
  setEmail,
  businessName,
  setBusinessName,
  country,
  setCountry,
  businessType,
  setBusinessType,
  settingUp,
  oauthAvailable,
  onBack,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  businessName: string;
  setBusinessName: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  businessType: string;
  setBusinessType: (v: string) => void;
  settingUp: boolean;
  oauthAvailable: boolean;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const isIndividual = businessType === "individual";

  return (
    <Card className="gap-0 py-0">
      <div className="px-6 py-7 text-center">
        {oauthAvailable && (
          <div className="mb-4 flex justify-center">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-xs text-muted-foreground">
              <ArrowLeft className="size-3" />
              Back to options
            </Button>
          </div>
        )}
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Zap className="size-6 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Set up payments with Entry</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          We&apos;ll create a Stripe account for you and walk you through verification.
        </p>
      </div>

      <Separator />

      <form onSubmit={onSubmit} className="space-y-4 px-6 py-6">
        <div className="space-y-2">
          <Label htmlFor="setup-email">Email *</Label>
          <Input
            id="setup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-name">
            {isIndividual ? "Your Name or Brand" : "Organisation Name"}
          </Label>
          <Input
            id="setup-name"
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder={isIndividual ? "e.g. DJ Flash" : "e.g. Acme Events Ltd"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>I am a...</Label>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="non_profit">Non-Profit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {country && (
          <div className="flex items-center gap-2 rounded-md bg-primary/[0.04] px-3 py-2.5 ring-1 ring-primary/10">
            <Info className="size-3.5 shrink-0 text-primary/70" />
            <p className="text-xs text-muted-foreground">
              Default currency:{" "}
              <span className="font-medium text-foreground">
                {getDefaultCurrency(country)} ({getCurrencySymbolFromMap(getDefaultCurrency(country))})
              </span>
            </p>
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={settingUp}>
          {settingUp ? "Creating your account..." : "Continue to Verification"}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground/60">
          Powered by Stripe Connect. PCI-DSS Level 1 certified.
        </p>
      </form>
    </Card>
  );
}

// ─── Connected state ───

function ConnectedView({
  status,
  confirmDisconnect,
  disconnecting,
  onContinueOnboarding,
  onAskDisconnect,
  onCancelDisconnect,
  onConfirmDisconnect,
}: {
  status: AccountStatus;
  confirmDisconnect: boolean;
  disconnecting: boolean;
  onContinueOnboarding: () => void;
  onAskDisconnect: () => void;
  onCancelDisconnect: () => void;
  onConfirmDisconnect: () => void;
}) {
  const isStandard = status.account_type === "standard";

  return (
    <>
      {/* Status banner */}
      <Card
        className={cn(
          "gap-0 py-0",
          status.charges_enabled ? "border-success/20" : "border-warning/20"
        )}
      >
        <CardContent className="flex items-center gap-4 px-6 py-5">
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-full",
              status.charges_enabled ? "bg-success/10" : "bg-warning/10"
            )}
          >
            {status.charges_enabled ? (
              <CheckCircle2 className="size-6 text-success" />
            ) : (
              <AlertTriangle className="size-6 text-warning" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="font-mono text-xs font-bold uppercase tracking-[2px]">
              {status.charges_enabled ? "Payments Active" : "Setup Incomplete"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {status.charges_enabled
                ? `${isStandard ? "Connected to your Stripe account" : "Funds will deposit to your bank account"}. ${describePayoutSchedule(status.payout_schedule)}`
                : isStandard
                  ? "Your Stripe account isn’t fully set up yet. Finish in your Stripe dashboard, then refresh."
                  : "Complete the verification to start accepting payments."}
            </p>
          </div>
        </CardContent>

        {!isStandard && (!status.charges_enabled || status.requirements_currently_due.length > 0) && (
          <div className="border-t border-border/40 px-6 py-4">
            <Button className="w-full" onClick={onContinueOnboarding}>
              {status.details_submitted ? "Update Verification" : "Continue Setup"}
            </Button>
          </div>
        )}

        {isStandard && (
          <div className="border-t border-border/40 px-6 py-4">
            <Button className="w-full" variant="secondary" asChild>
              <a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer">
                Open Stripe Dashboard
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        )}
      </Card>

      {/* Account header card */}
      <Card className="gap-0 py-0">
        <CardHeader className="px-6 py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-xs font-bold uppercase tracking-[2px]">
              Connected Account
            </CardTitle>
            <Badge variant={isStandard ? "default" : "secondary"} className={cn("text-[10px]", isStandard && "bg-primary/10 text-primary ring-1 ring-primary/20")}>
              {isStandard ? "Stripe (linked)" : "Entry-managed"}
            </Badge>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-5">
          <DetailField label="Business" value={status.business_name} />
          <DetailField label="Email" value={status.email} />
          <DetailField label="Country" value={status.country} />
          <DetailField
            label="Currency"
            value={status.default_currency ? status.default_currency.toUpperCase() : null}
          />
          <DetailField
            label="Account ID"
            value={status.account_id}
            mono
            accent
          />
          <DetailField
            label="Payout schedule"
            value={status.payout_schedule ? capitalize(status.payout_schedule.interval) : "—"}
          />
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card className="gap-0 py-0">
        <CardHeader className="px-6 py-4">
          <CardTitle className="font-mono text-xs font-bold uppercase tracking-[2px]">
            Capabilities
          </CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-0 px-6 py-2">
          <CapabilityRow
            label="Card Payments"
            status={status.charges_enabled ? "active" : "inactive"}
          />
          <CapabilityRow
            label="Payouts"
            status={
              status.payouts_enabled
                ? "active"
                : status.disabled_reason === "requirements.pending_verification"
                  ? "pending"
                  : "inactive"
            }
          />
          <CapabilityRow
            label="Identity Verified"
            status={status.details_submitted ? "active" : "inactive"}
            last
          />
        </CardContent>
      </Card>

      {/* Pending requirements (Custom only — Standard users see these in their own dashboard) */}
      {!isStandard && status.requirements_currently_due.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="px-6 py-4">
            <CardTitle className="font-mono text-xs font-bold uppercase tracking-[2px]">
              Action Required
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="space-y-2 px-6 py-5">
            <p className="text-sm text-muted-foreground">
              Complete these items to fully activate your account:
            </p>
            <ul className="space-y-1.5">
              {status.requirements_currently_due.map((req) => (
                <li
                  key={req}
                  className="flex items-center gap-2 rounded-md bg-warning/[0.04] px-3 py-2 ring-1 ring-warning/10"
                >
                  <span className="text-sm text-warning">&#9679;</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatRequirement(req)}
                  </span>
                </li>
              ))}
            </ul>
            <Button className="mt-3 w-full" onClick={onContinueOnboarding}>
              Complete Verification
            </Button>
          </CardContent>
        </Card>
      )}

      {!isStandard && status.requirements_past_due.length > 0 && (
        <Card className="gap-0 border-destructive/30 py-0">
          <CardHeader className="px-6 py-4">
            <CardTitle className="font-mono text-xs font-bold uppercase tracking-[2px] text-destructive">
              Overdue Requirements
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="space-y-2 px-6 py-5">
            <p className="text-sm text-muted-foreground">
              These items are overdue. Your account may be restricted until
              they are resolved:
            </p>
            <ul className="space-y-1.5">
              {status.requirements_past_due.map((req) => (
                <li
                  key={req}
                  className="flex items-center gap-2 rounded-md bg-destructive/[0.04] px-3 py-2 ring-1 ring-destructive/15"
                >
                  <span className="text-sm text-destructive">&#9679;</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatRequirement(req)}
                  </span>
                </li>
              ))}
            </ul>
            <Button className="mt-3 w-full" onClick={onContinueOnboarding}>
              Resolve Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Disabled reason context */}
      {status.disabled_reason &&
      status.disabled_reason === "requirements.pending_verification" &&
      status.charges_enabled ? (
        <Card className="gap-0 border-info/20 py-0">
          <CardContent className="flex items-center gap-3 px-6 py-5">
            <Shield className="size-5 shrink-0 text-info" />
            <div>
              <h2 className="font-mono text-xs font-bold uppercase tracking-[2px] text-info">
                Verification In Progress
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your account is under review. You can accept payments now —
                payouts will begin once verification is complete (usually 1-3
                business days).
              </p>
            </div>
          </CardContent>
        </Card>
      ) : status.disabled_reason ? (
        <Card className="gap-0 border-destructive/30 py-0">
          <CardContent className="flex items-center gap-3 px-6 py-5">
            <AlertTriangle className="size-5 shrink-0 text-destructive" />
            <div>
              <h2 className="font-mono text-xs font-bold uppercase tracking-[2px] text-destructive">
                Account Restricted
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDisabledReason(status.disabled_reason)}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Next steps */}
      {status.charges_enabled && (
        <Card className="gap-0 py-0">
          <CardHeader className="px-6 py-4">
            <CardTitle className="font-mono text-xs font-bold uppercase tracking-[2px]">
              Next Steps
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="px-6 py-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your payment account is linked automatically. To start accepting
              payments for an event:
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>
                Go to{" "}
                <Link href="/admin/events/" className="text-primary hover:underline">
                  Events
                </Link>
              </li>
              <li>
                Edit your event and set Payment Method to &quot;Stripe&quot;
              </li>
              <li>Save — that&apos;s it, you&apos;re live</li>
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Disconnect zone */}
      <Card className="gap-0 border-border/40 py-0">
        <CardContent className="space-y-3 px-6 py-5">
          <div>
            <h3 className="font-mono text-xs font-bold uppercase tracking-[2px] text-muted-foreground">
              Disconnect
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {isStandard
                ? "Revoke Entry's permission to charge on this Stripe account. Your Stripe account itself is not affected. New ticket sales won't be processed until you reconnect."
                : "Unlink this Entry-managed account from your org. The account stays in our Stripe directory; reconnect anytime. New ticket sales won't be processed until you set up payments again."}
            </p>
          </div>

          {!confirmDisconnect ? (
            <Button variant="outline" size="sm" onClick={onAskDisconnect}>
              Disconnect account
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/[0.04] p-3">
              <p className="text-xs text-foreground">
                Are you sure? You won&apos;t be able to take payments until you
                reconnect.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={disconnecting}
                  onClick={onConfirmDisconnect}
                >
                  {disconnecting ? "Disconnecting..." : "Yes, disconnect"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disconnecting}
                  onClick={onCancelDisconnect}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ─── Building blocks ───

function DetailField({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1",
          accent ? "text-primary" : "text-foreground/80",
          mono ? "font-mono text-[11px]" : "text-sm"
        )}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function CapabilityRow({
  label,
  status,
  last,
}: {
  label: string;
  status: "active" | "pending" | "inactive";
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-3",
        !last && "border-b border-border/40"
      )}
    >
      <span className="text-sm text-foreground/80">{label}</span>
      <Badge variant={status === "active" ? "success" : status === "pending" ? "warning" : "default"}>
        {status === "active" ? "Active" : status === "pending" ? "Pending Review" : "Inactive"}
      </Badge>
    </div>
  );
}

function StripeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 25" fill="currentColor" className={className} aria-label="Stripe">
      <path d="M59.5 14.7c0-4.1-2-7.4-5.8-7.4-3.8 0-6.1 3.3-6.1 7.4 0 4.8 2.7 7.3 6.6 7.3 1.9 0 3.4-.4 4.5-1V18c-1.1.5-2.3.9-3.9.9-1.5 0-2.9-.5-3.1-2.4h7.7c0-.2.1-.9.1-1.8zm-7.8-1.5c0-1.8 1.1-2.6 2.1-2.6.9 0 2 .8 2 2.6h-4.1zm-9.9-5.9c-1.5 0-2.5.7-3 1.2l-.2-1H35V25l4.1-.9v-4.3c.6.4 1.5 1.1 3 1.1 3 0 5.7-2.4 5.7-7.5 0-4.7-2.7-7.1-5.7-7.1zm-1 11c-1 0-1.6-.4-2-.8V11.6c.4-.5 1.1-.8 2-.8 1.5 0 2.6 1.7 2.6 3.7 0 2.1-1 3.8-2.6 3.8zm-9.5-12c0 1.2 1 2.2 2.2 2.2s2.2-1 2.2-2.2-1-2.2-2.2-2.2-2.2 1-2.2 2.2zM27.4 7.6h4.1v14.4h-4.1zm-4.5 1.2L23 7.6h-3.5V22h4.1V12.2c1-1.3 2.6-1 3.1-.9V7.6c-.5-.2-2.4-.5-3.8 1.2zM15.2 4l-4 1V19c0 2.6 1.9 4.5 4.5 4.5 1.4 0 2.5-.3 3-.6V19c-.6.2-3.5 1-3.5-1.6V11h3.5V7.6h-3.5V4zM4.1 11.6c0-.6.5-.9 1.4-.9 1.3 0 2.9.4 4.2 1.1V8c-1.4-.6-2.8-.8-4.2-.8C2 7.2 0 9 0 11.7c0 4.5 6.2 3.9 6.2 5.8 0 .8-.7 1-1.6 1-1.4 0-3.2-.6-4.7-1.4v3.9c1.6.7 3.3 1 4.7 1 3.7 0 5.7-1.7 5.7-4.5 0-4.9-6.2-4.2-6.2-5.9z"></path>
    </svg>
  );
}

// ─── Helpers ───

function describePayoutSchedule(
  schedule: AccountStatus["payout_schedule"]
): string {
  if (!schedule) return "Payouts run on a daily schedule by default.";
  const interval = schedule.interval;
  if (interval === "manual") return "Payouts are released manually.";
  if (interval === "daily") return "Payouts arrive daily after a short rolling delay.";
  if (interval === "weekly")
    return `Payouts arrive weekly${schedule.weekly_anchor ? ` on ${capitalize(schedule.weekly_anchor)}` : ""}.`;
  if (interval === "monthly")
    return `Payouts arrive monthly${schedule.monthly_anchor ? ` on day ${schedule.monthly_anchor}` : ""}.`;
  return `Payouts run on a ${interval} schedule.`;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function formatRequirement(req: string): string {
  const map: Record<string, string> = {
    "business_profile.url": "Business website URL",
    "business_profile.mcc": "Business category",
    "business_profile.product_description": "Description of your business",
    external_account: "Bank account details",
    "individual.first_name": "First name",
    "individual.last_name": "Last name",
    "individual.dob.day": "Date of birth",
    "individual.dob.month": "Date of birth",
    "individual.dob.year": "Date of birth",
    "individual.address.line1": "Address",
    "individual.address.city": "City",
    "individual.address.postal_code": "Postcode",
    "individual.email": "Email address",
    "individual.phone": "Phone number",
    "individual.id_number": "National ID number",
    "individual.verification.document":
      "Identity document (passport/licence)",
    "individual.verification.additional_document": "Proof of address",
    "tos_acceptance.date": "Terms of service acceptance",
    "tos_acceptance.ip": "Terms of service acceptance",
    "company.name": "Company name",
    "company.tax_id": "Company tax ID / VAT number",
    "company.address.line1": "Company address",
    "company.address.city": "Company city",
    "company.address.postal_code": "Company postcode",
    "representative.first_name": "Representative first name",
    "representative.last_name": "Representative last name",
    "representative.dob.day": "Representative date of birth",
    "representative.dob.month": "Representative date of birth",
    "representative.dob.year": "Representative date of birth",
    "representative.email": "Representative email",
    "representative.phone": "Representative phone",
    "representative.address.line1": "Representative address",
    "representative.relationship.title": "Representative job title",
    "representative.verification.document":
      "Representative identity document",
    owners_provided: "Business owners information",
    directors_provided: "Business directors information",
  };

  return (
    map[req] ||
    req.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatDisabledReason(reason: string): string {
  const map: Record<string, string> = {
    "requirements.past_due":
      "Required information is overdue. Complete the verification to restore your account.",
    "requirements.pending_verification":
      "Your information is being reviewed. This usually takes 1-2 business days.",
    listed: "Your account has been flagged for review. Please contact support.",
    platform_paused:
      "Your account has been paused by the platform. Please contact support.",
    rejected_fraud:
      "Your account was rejected due to suspected fraud. Please contact support.",
    rejected_listed: "Your account was rejected. Please contact support.",
    rejected_terms_of_service:
      "Your account was rejected for terms of service violation.",
    rejected_other: "Your account was rejected. Please contact support.",
    under_review: "Your account is under review. This may take a few days.",
  };

  return (
    map[reason] || `Account restricted: ${reason.replace(/[._]/g, " ")}`
  );
}
