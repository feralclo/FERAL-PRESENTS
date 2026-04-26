"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  COUNTRIES,
  getDefaultCurrency,
  getCurrencySymbolFromMap,
} from "@/lib/country-currency-map";
import { generalKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  Shield,
  Smartphone,
  Zap,
} from "lucide-react";

/**
 * /admin/payments — single-path Stripe Connect setup.
 *
 * Every tenant goes through the same flow regardless of whether they already
 * have a Stripe account: confirm 4 fields → create a Stripe Custom account →
 * redirect to Stripe's hosted KYC page → return → "You're set up". Stripe
 * handles ID/bank/identity on their branded page (with Entry's logo + colors
 * once configured in Stripe Dashboard → Connect → Branding).
 *
 * No OAuth path here. Standard accounts via OAuth are out of scope for v1 to
 * keep the UX one-button-simple. The OAuth routes remain in the codebase but
 * are not surfaced from this page.
 */

type AccountType = "standard" | "custom";

interface AccountStatus {
  account_id: string;
  account_type: AccountType;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  livemode: boolean;
}

type View = "loading" | "setup-form" | "waiting" | "connected";

export default function PaymentSettingsPage() {
  const orgId = useOrgId();
  const [view, setView] = useState<View>("loading");
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [livemode, setLivemode] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // URL of the in-flight Stripe hosted KYC tab — used so the user can
  // reopen Stripe if they accidentally closed the tab.
  const [stripeUrl, setStripeUrl] = useState<string | null>(null);

  // Setup form fields
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [country, setCountry] = useState("");
  const [businessType, setBusinessType] = useState("individual");

  // Pre-fill from auth + org settings so the form feels almost-already-done
  useEffect(() => {
    if (!orgId) return;

    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.auth
        .getUser()
        .then(({ data }) => {
          if (data.user?.email) setEmail((prev) => prev || data.user.email!);
        })
        .catch(() => {});
    }

    fetch(`/api/settings?key=${generalKey(orgId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data?.org_name) {
          setBusinessName((prev) => prev || json.data.org_name);
        }
        if (json?.data?.country) {
          setCountry((prev) => prev || json.data.country);
        } else {
          setCountry((prev) => prev || "GB");
        }
      })
      .catch(() => setCountry((prev) => prev || "GB"));
  }, [orgId]);

  // Surface return-trip flags from Stripe's hosted onboarding.
  // Auto-close the popup tab when it lands back here from Stripe — the
  // tenant's main Entry tab is already polling and will pick up the new
  // status. This makes the Stripe popup feel like a self-contained step.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPopupReturn =
      typeof window !== "undefined" && window.opener && !window.opener.closed;

    if (params.get("onboarding") === "complete") {
      if (isPopupReturn) {
        try {
          window.close();
          return;
        } catch {
          // Some browsers refuse to close — fall through and just show the page
        }
      }
      setSuccess("Verification submitted. Checking your account...");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("refresh") === "true") {
      if (isPopupReturn) {
        try {
          window.close();
          return;
        } catch {
          // Fall through
        }
      }
      setError("Your session expired. Please continue setup again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/connect/my-account");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Couldn't load payment status. Please refresh.");
        setView("setup-form");
        return;
      }

      const json = await res.json();
      if (json.livemode === false) setLivemode(false);

      if (!json.connected) {
        setStatus(null);
        setView("setup-form");
        return;
      }

      const acct: AccountStatus = {
        account_id: json.account_id,
        account_type: (json.account_type as AccountType) || "custom",
        charges_enabled: Boolean(json.charges_enabled),
        payouts_enabled: Boolean(json.payouts_enabled),
        details_submitted: Boolean(json.details_submitted),
        livemode: json.livemode !== false,
      };
      setStatus(acct);
      setLivemode(acct.livemode);
      setView("connected");

      if (acct.charges_enabled) {
        // Best-effort Apple Pay domain registration once charges are live.
        // Failure is non-blocking and not surfaced to the tenant.
        fetch("/api/stripe/apple-pay-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: window.location.hostname }),
        }).catch(() => {});
      }
    } catch {
      setError("Couldn't load payment status. Please refresh.");
      setView("setup-form");
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  /**
   * Form submit: create the Stripe Custom account, open Stripe's hosted KYC
   * in a new tab, and switch this tab to a waiting state that polls the
   * account status. When Stripe finishes, the polling picks it up and we
   * transition to the connected view automatically.
   *
   * The popup is opened synchronously inside the click handler (with
   * about:blank as a placeholder) so popup blockers don't fire — modern
   * browsers only allow window.open inside a user-gesture event.
   */
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    // Open popup IMMEDIATELY (synchronous, inside the user gesture) so the
    // browser doesn't block it. Update the URL after the async fetch.
    const popup = window.open("about:blank", "stripe-onboarding");
    if (!popup || popup.closed) {
      setError(
        "Looks like popups are blocked. Please allow popups for this site, then try again.",
      );
      return;
    }

    setSettingUp(true);
    setError("");
    setSuccess("");

    try {
      const createRes = await fetch("/api/stripe/connect/my-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          business_name: businessName.trim() || undefined,
          country,
          business_type: businessType,
        }),
      });

      const createJson = await createRes.json();
      if (!createRes.ok) {
        popup.close();
        setError(
          createJson.error ||
            "Couldn't set up your Stripe account. Please try again.",
        );
        setSettingUp(false);
        return;
      }

      const linkRes = await fetch("/api/stripe/connect/my-account/onboarding");
      const linkJson = await linkRes.json();
      if (!linkRes.ok || !linkJson.url) {
        popup.close();
        setError(
          linkJson.error ||
            "Account created, but couldn't open Stripe verification. Please refresh and try again.",
        );
        await checkStatus();
        setSettingUp(false);
        return;
      }

      // Hand the popup off to Stripe and switch this tab to waiting.
      popup.location.href = linkJson.url;
      setStripeUrl(linkJson.url);
      setView("waiting");
      setSettingUp(false);
    } catch {
      popup.close();
      setError("Network error. Please try again.");
      setSettingUp(false);
    }
  };

  /**
   * Continue an in-progress setup — same new-tab pattern as initial setup.
   * Used from the connected-but-incomplete view.
   */
  const goToHostedOnboarding = async () => {
    const popup = window.open("about:blank", "stripe-onboarding");
    if (!popup || popup.closed) {
      setError(
        "Looks like popups are blocked. Please allow popups for this site, then try again.",
      );
      return;
    }

    setError("");
    setContinuing(true);
    try {
      const res = await fetch("/api/stripe/connect/my-account/onboarding");
      const json = await res.json();
      if (!res.ok || !json.url) {
        popup.close();
        setError(
          json.error || "Couldn't open Stripe verification. Please try again.",
        );
        setContinuing(false);
        return;
      }
      popup.location.href = json.url;
      setStripeUrl(json.url);
      setView("waiting");
      setContinuing(false);
    } catch {
      popup.close();
      setError("Network error. Please try again.");
      setContinuing(false);
    }
  };

  /** Reopen Stripe in a new tab — for tenants who accidentally closed it. */
  const reopenStripe = () => {
    if (!stripeUrl) return;
    window.open(stripeUrl, "stripe-onboarding");
  };

  /** Cancel the waiting state and go back to the form. The Stripe account
   * stays in their org — they can resume from "One more step" later. */
  const cancelWaiting = () => {
    setStripeUrl(null);
    setError("");
    setSuccess("");
    checkStatus();
  };

  // Poll account status while in the waiting state. Refresh on tab focus too,
  // so when the tenant clicks back to this tab from the Stripe tab we pick up
  // their progress immediately.
  useEffect(() => {
    if (view !== "waiting") return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/stripe/connect/my-account");
        if (!res.ok) return;
        const json = await res.json();
        if (
          json.connected &&
          (json.charges_enabled || json.details_submitted)
        ) {
          await checkStatus();
        }
      } catch {
        // Silent — keep polling
      }
    };

    const interval = window.setInterval(tick, 4000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    // Immediate first check (no 4-second wait)
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [view, checkStatus]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/connect/my-account", {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Couldn't disconnect. Please try again.");
        setDisconnecting(false);
        return;
      }
      setStatus(null);
      setConfirmDisconnect(false);
      setSuccess(
        "Disconnected. You can set up payments again whenever you're ready.",
      );
      setView("setup-form");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  };

  if (view === "loading") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader livemode={livemode} subtitle="Loading payment status..." />
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
          view === "setup-form"
            ? "Set up payments to start selling tickets."
            : view === "waiting"
              ? "Stripe is verifying your details in a new tab."
              : status?.charges_enabled
                ? "Your payments are live. You're ready to sell."
                : "Almost there — finish verification to start selling."
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
          onSubmit={handleSetup}
        />
      )}

      {view === "waiting" && (
        <WaitingView onReopen={reopenStripe} onCancel={cancelWaiting} />
      )}

      {view === "connected" && status && (
        <ConnectedView
          status={status}
          continuing={continuing}
          confirmDisconnect={confirmDisconnect}
          disconnecting={disconnecting}
          onContinue={goToHostedOnboarding}
          onAskDisconnect={() => setConfirmDisconnect(true)}
          onCancelDisconnect={() => setConfirmDisconnect(false)}
          onConfirmDisconnect={handleDisconnect}
        />
      )}
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────

function PageHeader({
  livemode,
  subtitle,
}: {
  livemode: boolean;
  subtitle: string;
}) {
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

// ─── Setup form ─────────────────────────────────────────────────────────

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
  onSubmit: (e: React.FormEvent) => void;
}) {
  const isIndividual = businessType === "individual";

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {/* Hero */}
      <div className="px-6 py-7 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Banknote className="size-6 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground">
          Get paid for your tickets
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Confirm a few details, then we&apos;ll send you to Stripe to verify
          your identity and add your bank. Funds land in your bank
          automatically.
        </p>
      </div>

      <div className="border-t border-border/40">
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
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="setup-name">
              {isIndividual ? "Your name or stage name" : "Business name"}
            </Label>
            <Input
              id="setup-name"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder={isIndividual ? "e.g. DJ Flash" : "e.g. Acme Events Ltd"}
              autoComplete="organization"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                You&apos;ll be paid in{" "}
                <span className="font-medium text-foreground">
                  {getDefaultCurrency(country)} ({getCurrencySymbolFromMap(getDefaultCurrency(country))})
                </span>
              </p>
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={settingUp}>
            {settingUp ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Opening Stripe...
              </>
            ) : (
              <>
                Continue to verification
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>

          <p className="text-center text-[11px] text-muted-foreground/60">
            On the next step, Stripe will ask for your ID and bank account
            details. Have these handy — it takes about 2 minutes.
          </p>
        </form>
      </div>

      {/* Trust strip */}
      <div className="border-t border-border/40 bg-muted/20 px-6 py-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] text-muted-foreground sm:grid-cols-4">
          {[
            { icon: CreditCard, label: "Cards" },
            { icon: Smartphone, label: "Apple & Google Pay" },
            { icon: Banknote, label: "Direct to bank" },
            { icon: Shield, label: "PCI-DSS Level 1" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <Icon className="size-3 shrink-0 text-primary/70" />
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/70">
          <Lock className="size-2.5" />
          <span>
            Powered by Stripe — verification on Stripe&apos;s secure page
          </span>
        </div>
      </div>
    </Card>
  );
}

// ─── Waiting ────────────────────────────────────────────────────────────
// Cool animated holding pattern while Stripe KYC happens in another tab.
// Polling in the parent component picks up completion automatically.

function WaitingView({
  onReopen,
  onCancel,
}: {
  onReopen: () => void;
  onCancel: () => void;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="px-6 py-12 text-center">
        {/* Animated icon — concentric pulsing rings around a spinner */}
        <div className="relative mx-auto mb-6 flex size-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <span className="absolute inset-2 animate-pulse rounded-full bg-primary/30" />
          <span className="relative flex size-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
            <Loader2 className="size-6 animate-spin text-primary" />
          </span>
        </div>

        <h2 className="text-lg font-bold text-foreground">
          Verifying your details in Stripe
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          We&apos;ve opened Stripe in a new tab. Finish there — we&apos;ll
          detect when you&apos;re done and update this page automatically.
        </p>

        {/* "Listening" indicator — three staggered pulsing dots */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[1.5px] text-muted-foreground/60">
          <span className="flex gap-1">
            <span
              className="size-1.5 animate-pulse rounded-full bg-primary"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="size-1.5 animate-pulse rounded-full bg-primary"
              style={{ animationDelay: "200ms" }}
            />
            <span
              className="size-1.5 animate-pulse rounded-full bg-primary"
              style={{ animationDelay: "400ms" }}
            />
          </span>
          <span className="ml-1 font-mono">Listening</span>
        </div>
      </div>

      <div className="border-t border-border/40 px-6 py-4">
        <Button variant="secondary" className="w-full" onClick={onReopen}>
          <ExternalLink className="size-4" />
          Reopen Stripe tab
        </Button>
      </div>

      <div className="px-6 pb-5 text-center">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground/70 underline-offset-4 transition-colors hover:text-muted-foreground hover:underline"
        >
          Cancel and start over
        </button>
      </div>
    </Card>
  );
}

// ─── Connected ──────────────────────────────────────────────────────────

function ConnectedView({
  status,
  continuing,
  confirmDisconnect,
  disconnecting,
  onContinue,
  onAskDisconnect,
  onCancelDisconnect,
  onConfirmDisconnect,
}: {
  status: AccountStatus;
  continuing: boolean;
  confirmDisconnect: boolean;
  disconnecting: boolean;
  onContinue: () => void;
  onAskDisconnect: () => void;
  onCancelDisconnect: () => void;
  onConfirmDisconnect: () => void;
}) {
  const isStandard = status.account_type === "standard";
  const isLive = status.charges_enabled;

  return (
    <>
      <Card
        className={cn(
          "gap-0 overflow-hidden py-0",
          isLive ? "border-success/20" : "border-warning/20",
        )}
      >
        <div className="px-6 py-8 text-center">
          <div
            className={cn(
              "mx-auto mb-4 flex size-14 items-center justify-center rounded-full",
              isLive
                ? "bg-success/10 ring-1 ring-success/20"
                : "bg-warning/10 ring-1 ring-warning/20",
            )}
          >
            {isLive ? (
              <CheckCircle2 className="size-7 text-success" />
            ) : (
              <Zap className="size-6 text-warning" />
            )}
          </div>
          <h2 className="text-lg font-bold text-foreground">
            {isLive ? "You're set up to accept payments" : "One more step"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {isLive
              ? "Customers can buy tickets now. Funds land in your bank account automatically."
              : isStandard
                ? "Your Stripe account needs a few more details. Finish in your Stripe dashboard."
                : "Stripe needs to verify a few details before you can take payments. Takes about 2 minutes."}
          </p>
        </div>

        {!isLive && (
          <div className="border-t border-border/40 px-6 py-4">
            {isStandard ? (
              <Button className="w-full" variant="secondary" asChild>
                <a
                  href="https://dashboard.stripe.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Stripe Dashboard
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={onContinue}
                disabled={continuing}
              >
                {continuing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Opening Stripe...
                  </>
                ) : (
                  <>
                    Continue setup
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="pt-2 text-center">
        {!confirmDisconnect ? (
          <button
            type="button"
            onClick={onAskDisconnect}
            className="text-xs text-muted-foreground/70 underline-offset-4 transition-colors hover:text-muted-foreground hover:underline"
          >
            Disconnect Stripe account
          </button>
        ) : (
          <div className="mx-auto inline-flex flex-col items-center gap-2 rounded-md border border-destructive/30 bg-destructive/[0.04] px-4 py-3">
            <p className="text-xs text-foreground">
              You won&apos;t be able to take payments until you reconnect.
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
      </div>
    </>
  );
}
