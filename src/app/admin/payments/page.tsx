"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  business_type: string | null;
  default_currency: string | null;
  requirements: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
    disabled_reason: string | null;
  };
  capabilities: {
    card_payments: string;
    transfers: string;
  };
}

interface BalanceEntry {
  amount: number;
  currency: string;
}

/**
 * Five-state machine that drives ConnectedView. Computed from the raw
 * Stripe account state; covers every combination the tenant can land in:
 *
 *  - "incomplete"     KYC barely started — they need to fill the form
 *  - "action-needed"  KYC submitted but Stripe is asking for one more thing
 *  - "under-review"   Submitted, no outstanding asks, waiting on Stripe
 *  - "needs-bank"     Charges live but bank account missing → money piles up
 *                     in their Stripe balance until they add it (Phase 2)
 *  - "live"           Fully operational — charges + payouts both enabled
 */
type OnboardingState =
  | "incomplete"
  | "action-needed"
  | "under-review"
  | "needs-bank"
  | "live";

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
  const [checkingNow, setCheckingNow] = useState(false);
  // URL of the in-flight Stripe hosted KYC tab — used so the user can
  // reopen Stripe if they accidentally closed the tab.
  const [stripeUrl, setStripeUrl] = useState<string | null>(null);
  // Reference to the popup window so the parent can detect close events
  // and post-message replies — focus events alone aren't reliable when the
  // parent tab never lost focus (e.g. user kept watching it on a wide screen).
  const popupRef = useRef<Window | null>(null);

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
  //
  // When this URL is loaded inside the popup tab, postMessage to the parent so
  // it transitions out of the waiting state instantly — relying on the parent's
  // focus event isn't reliable (the parent may never have lost focus), and the
  // 4-second polling tick can leave the user staring at a stale spinner.
  // Then close the popup. The parent picks up the message in handleParentMessage.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPopupReturn =
      typeof window !== "undefined" && window.opener && !window.opener.closed;

    if (params.get("onboarding") === "complete") {
      if (isPopupReturn) {
        try {
          window.opener.postMessage(
            { type: "stripe-onboarding-complete" },
            window.location.origin,
          );
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
          window.opener.postMessage(
            { type: "stripe-onboarding-refresh" },
            window.location.origin,
          );
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
        business_type: json.business_type || null,
        default_currency: json.default_currency || null,
        requirements: {
          currently_due: Array.isArray(json.requirements?.currently_due)
            ? json.requirements.currently_due
            : [],
          eventually_due: Array.isArray(json.requirements?.eventually_due)
            ? json.requirements.eventually_due
            : [],
          past_due: Array.isArray(json.requirements?.past_due)
            ? json.requirements.past_due
            : [],
          disabled_reason: json.requirements?.disabled_reason || null,
        },
        capabilities: {
          card_payments: json.capabilities?.card_payments || "inactive",
          transfers: json.capabilities?.transfers || "inactive",
        },
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

  // Listen for the popup's postMessage so the waiting view can exit instantly
  // when Stripe redirects back, regardless of focus state.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string } | null;
      if (data?.type === "stripe-onboarding-complete") {
        void checkStatus();
      } else if (data?.type === "stripe-onboarding-refresh") {
        setError("Your session expired. Please continue setup again.");
        setView("setup-form");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
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
    popupRef.current = popup;

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
    popupRef.current = popup;

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

  // Detect completion via four converging triggers so the user is never stuck:
  //   1. postMessage from the popup (instant — see other useEffect above)
  //   2. popup.closed flips to true (popup self-closed, user manually closed,
  //      or browser killed it). Polled at 800ms while we're waiting.
  //   3. Periodic 4s poll (fallback if the above somehow miss)
  //   4. Manual "Check now" button in WaitingView (final escape hatch)
  //
  // Any successful poll showing connected: true exits the waiting view —
  // even if details_submitted is false, ConnectedView has a clear "Continue
  // setup" path so the user is never trapped.
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

    // Watch popupRef so a popup close (any cause) forces a status recheck.
    // Once detected, ConnectedView handles whatever state Stripe is in.
    const popupWatch = window.setInterval(() => {
      const popup = popupRef.current;
      if (popup && popup.closed) {
        popupRef.current = null;
        window.clearInterval(popupWatch);
        void checkStatus();
      }
    }, 800);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearInterval(popupWatch);
      window.removeEventListener("focus", onFocus);
    };
  }, [view, checkStatus]);

  /** Manual escape hatch from the waiting view. */
  const handleCheckNow = async () => {
    setCheckingNow(true);
    setError("");
    try {
      await checkStatus();
    } finally {
      setCheckingNow(false);
    }
  };

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
        <WaitingView
          onReopen={reopenStripe}
          onCheckNow={handleCheckNow}
          checkingNow={checkingNow}
          onCancel={cancelWaiting}
        />
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
  onCheckNow,
  checkingNow,
  onCancel,
}: {
  onReopen: () => void;
  onCheckNow: () => void;
  checkingNow: boolean;
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

      <div className="space-y-2 border-t border-border/40 px-6 py-4">
        <Button
          className="w-full"
          size="lg"
          onClick={onCheckNow}
          disabled={checkingNow}
        >
          {checkingNow ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              I&apos;ve finished — check now
            </>
          )}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onReopen}>
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

/**
 * Group raw Stripe requirement field paths into plain-English categories.
 * Each group has a `blocksSelling` flag:
 *   true  → must be filled before charges_enabled can flip true
 *   false → only blocks payouts (i.e. external_account / bank)
 *
 * Field paths come from Stripe's account.requirements.currently_due array.
 * Patterns are prefix-based, so the same logic handles `individual.*`,
 * `company.*`, and `representative.*` variants automatically.
 */
const REQUIREMENT_GROUPS: ReadonlyArray<{
  label: string;
  test: (field: string) => boolean;
  blocksSelling: boolean;
}> = [
  // Bank account — payout-only, doesn't block charges
  {
    label: "Bank account for payouts",
    test: (f) => f === "external_account" || f.startsWith("external_account."),
    blocksSelling: false,
  },
  // Individual identity
  {
    label: "Your full name",
    test: (f) => f === "individual.first_name" || f === "individual.last_name",
    blocksSelling: true,
  },
  {
    label: "Date of birth",
    test: (f) => f.startsWith("individual.dob"),
    blocksSelling: true,
  },
  {
    label: "Home address",
    test: (f) => f.startsWith("individual.address"),
    blocksSelling: true,
  },
  {
    label: "Phone number",
    test: (f) => f === "individual.phone",
    blocksSelling: true,
  },
  {
    label: "Email address",
    test: (f) => f === "individual.email",
    blocksSelling: true,
  },
  {
    label: "ID verification",
    test: (f) =>
      f === "individual.id_number" ||
      f.startsWith("individual.verification") ||
      f.startsWith("individual.political_exposure"),
    blocksSelling: true,
  },
  // Company identity
  {
    label: "Business name",
    test: (f) => f === "company.name" || f === "company.name_kana" || f === "company.name_kanji",
    blocksSelling: true,
  },
  {
    label: "Business address",
    test: (f) => f.startsWith("company.address"),
    blocksSelling: true,
  },
  {
    label: "Business registration",
    test: (f) =>
      f === "company.tax_id" ||
      f === "company.registration_number" ||
      f === "company.vat_id",
    blocksSelling: true,
  },
  {
    label: "Business phone",
    test: (f) => f === "company.phone",
    blocksSelling: true,
  },
  {
    label: "Confirm directors and owners",
    test: (f) =>
      f === "company.directors_provided" ||
      f === "company.owners_provided" ||
      f === "company.executives_provided" ||
      f === "company.ownership_declaration",
    blocksSelling: true,
  },
  {
    label: "Business verification documents",
    test: (f) => f.startsWith("company.verification"),
    blocksSelling: true,
  },
  // Representative (one director's personal details — companies/non-profits)
  {
    label: "Director's full name",
    test: (f) => f === "representative.first_name" || f === "representative.last_name",
    blocksSelling: true,
  },
  {
    label: "Director's date of birth",
    test: (f) => f.startsWith("representative.dob"),
    blocksSelling: true,
  },
  {
    label: "Director's home address",
    test: (f) => f.startsWith("representative.address"),
    blocksSelling: true,
  },
  {
    label: "Director's phone & email",
    test: (f) => f === "representative.phone" || f === "representative.email",
    blocksSelling: true,
  },
  {
    label: "Director ID verification",
    test: (f) =>
      f === "representative.id_number" ||
      f.startsWith("representative.verification") ||
      f.startsWith("representative.relationship"),
    blocksSelling: true,
  },
  // Business profile
  {
    label: "About your business",
    test: (f) => f.startsWith("business_profile."),
    blocksSelling: true,
  },
  // Universal
  {
    label: "Accept Stripe's terms",
    test: (f) => f.startsWith("tos_acceptance."),
    blocksSelling: true,
  },
  {
    label: "Settings",
    test: (f) => f.startsWith("settings."),
    blocksSelling: true,
  },
];

interface RequirementGroup {
  label: string;
  blocksSelling: boolean;
}

/**
 * Collapse an array of Stripe field paths into deduplicated plain-English
 * groups, preserving the declaration order in REQUIREMENT_GROUPS.
 */
function groupRequirements(fields: string[]): RequirementGroup[] {
  const out: RequirementGroup[] = [];
  const seen = new Set<string>();
  for (const group of REQUIREMENT_GROUPS) {
    if (fields.some((f) => group.test(f))) {
      if (!seen.has(group.label)) {
        out.push({ label: group.label, blocksSelling: group.blocksSelling });
        seen.add(group.label);
      }
    }
  }
  // Catch unrecognised field paths (rare — Stripe occasionally adds new ones)
  // so we never silently drop something that's blocking the tenant.
  const recognised = new Set(
    fields.filter((f) => REQUIREMENT_GROUPS.some((g) => g.test(f))),
  );
  const unknown = fields.filter((f) => !recognised.has(f));
  if (unknown.length > 0) {
    out.push({
      label: `Other: ${unknown.join(", ")}`,
      blocksSelling: true,
    });
  }
  return out;
}

function getOnboardingState(status: AccountStatus): OnboardingState {
  if (status.charges_enabled && status.payouts_enabled) return "live";
  if (status.charges_enabled && !status.payouts_enabled) return "needs-bank";

  const blocking = groupRequirements(status.requirements.currently_due).filter(
    (g) => g.blocksSelling,
  );

  if (status.details_submitted && blocking.length === 0) return "under-review";
  if (status.details_submitted && blocking.length > 0) return "action-needed";
  return "incomplete";
}

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
  const onboardingState = getOnboardingState(status);
  const allGroups = groupRequirements(status.requirements.currently_due);
  const sellingBlockers = allGroups.filter((g) => g.blocksSelling);
  const payoutBlockers = allGroups.filter((g) => !g.blocksSelling);

  return (
    <>
      {onboardingState === "live" && <LiveCard status={status} />}

      {onboardingState === "needs-bank" && (
        <NeedsBankCard
          status={status}
          continuing={continuing}
          onContinue={onContinue}
          payoutBlockers={payoutBlockers}
        />
      )}

      {onboardingState === "under-review" && <UnderReviewCard />}

      {(onboardingState === "incomplete" ||
        onboardingState === "action-needed") && (
        <IncompleteCard
          status={status}
          continuing={continuing}
          isStandard={isStandard}
          onContinue={onContinue}
          sellingBlockers={sellingBlockers}
          payoutBlockers={payoutBlockers}
          actionNeeded={onboardingState === "action-needed"}
        />
      )}

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

// ─── Connected sub-views ────────────────────────────────────────────────

function LiveCard({ status }: { status: AccountStatus }) {
  const schedule = (status as { payout_schedule?: { interval?: string } }).payout_schedule;
  return (
    <Card className="gap-0 overflow-hidden border-success/20 py-0">
      <div className="px-6 py-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success/10 ring-1 ring-success/20">
          <CheckCircle2 className="size-7 text-success" />
        </div>
        <h2 className="text-lg font-bold text-foreground">
          You&apos;re set up to accept payments
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Customers can buy tickets now. Funds land in your bank account
          {schedule?.interval ? ` ${humaniseSchedule(schedule.interval)}` : " automatically"}.
        </p>
      </div>
    </Card>
  );
}

function humaniseSchedule(interval: string): string {
  switch (interval) {
    case "daily":
      return "every day";
    case "weekly":
      return "every week";
    case "monthly":
      return "every month";
    case "manual":
      return "when you trigger payouts";
    default:
      return "automatically";
  }
}

/**
 * Charges live, but no bank account yet → money is held in their Stripe
 * balance until they add one. Show the held amount so they can see exactly
 * what's waiting for them, with a clear CTA to add the bank.
 */
function NeedsBankCard({
  status,
  continuing,
  onContinue,
  payoutBlockers,
}: {
  status: AccountStatus;
  continuing: boolean;
  onContinue: () => void;
  payoutBlockers: RequirementGroup[];
}) {
  const [balance, setBalance] = useState<{
    available: BalanceEntry[];
    pending: BalanceEntry[];
  } | null>(null);
  const [balanceError, setBalanceError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stripe/connect/my-account/balance")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setBalance({
          available: json.available || [],
          pending: json.pending || [],
        });
      })
      .catch(() => {
        if (!cancelled) setBalanceError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = totalisePerCurrency(balance);
  const fallbackCurrency = status.default_currency || "gbp";
  const showZeroState = balance !== null && totals.length === 0;

  return (
    <Card className="gap-0 overflow-hidden border-success/20 py-0">
      <div className="px-6 py-7 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success/10 ring-1 ring-success/20">
          <CheckCircle2 className="size-7 text-success" />
        </div>
        <h2 className="text-lg font-bold text-foreground">
          You can sell tickets now
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Add a bank account to receive your earnings. Until then, money sits
          safely in your Stripe balance — nothing is lost.
        </p>
      </div>

      <div className="border-t border-border/40 bg-muted/10 px-6 py-5">
        <div className="text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
            Held in Stripe
          </p>
          <div className="mt-2 space-y-1">
            {balance === null && !balanceError && (
              <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
            )}
            {balanceError && (
              <p className="text-xs text-muted-foreground">
                Couldn&apos;t load balance. Refresh to retry.
              </p>
            )}
            {showZeroState && (
              <p className="text-2xl font-bold text-foreground">
                {formatMoney(0, fallbackCurrency)}
              </p>
            )}
            {totals.map((t) => (
              <div key={t.currency}>
                <p className="text-2xl font-bold text-foreground">
                  {formatMoney(t.total, t.currency)}
                </p>
                {t.pending > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {formatMoney(t.available, t.currency)} ready ·{" "}
                    {formatMoney(t.pending, t.currency)} settling
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {payoutBlockers.length > 0 && (
        <div className="border-t border-border/40 px-6 py-4">
          <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
            To get paid, Stripe needs
          </p>
          <ul className="space-y-1.5">
            {payoutBlockers.map((g) => (
              <li
                key={g.label}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-warning" />
                {g.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-border/40 px-6 py-4">
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
              Add bank account
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

function UnderReviewCard() {
  return (
    <Card className="gap-0 overflow-hidden border-info/20 py-0">
      <div className="px-6 py-9 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-info/10 ring-1 ring-info/20">
          <Loader2 className="size-6 animate-spin text-info" />
        </div>
        <h2 className="text-lg font-bold text-foreground">
          Stripe is reviewing your account
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          You&apos;ve submitted everything Stripe needs. Reviews usually take
          1–2 business days. We&apos;ll email you the moment payments go live —
          you don&apos;t need to do anything else.
        </p>
      </div>
    </Card>
  );
}

/**
 * Either KYC was barely started (no submit yet) or Stripe has come back
 * asking for one more thing. Show the missing fields in plain English with
 * the bank-account requirement (if any) called out separately so it's clear
 * the rest is what's blocking sales.
 */
function IncompleteCard({
  status,
  continuing,
  isStandard,
  onContinue,
  sellingBlockers,
  payoutBlockers,
  actionNeeded,
}: {
  status: AccountStatus;
  continuing: boolean;
  isStandard: boolean;
  onContinue: () => void;
  sellingBlockers: RequirementGroup[];
  payoutBlockers: RequirementGroup[];
  actionNeeded: boolean;
}) {
  const stripeReason = status.requirements.disabled_reason;
  // Disabled reasons that aren't just "fill in the form" — surface these
  // to the tenant directly because they often need human action.
  const opaqueReason =
    stripeReason &&
    !stripeReason.startsWith("requirements.") &&
    stripeReason !== "rejected.requirements"
      ? stripeReason
      : null;

  return (
    <Card className="gap-0 overflow-hidden border-warning/20 py-0">
      <div className="px-6 py-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-warning/10 ring-1 ring-warning/20">
          <Zap className="size-6 text-warning" />
        </div>
        <h2 className="text-lg font-bold text-foreground">
          {actionNeeded
            ? "Stripe needs a bit more from you"
            : sellingBlockers.length === 0
              ? "Almost there"
              : "Verify your identity to start selling"}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {isStandard
            ? "Your Stripe account needs a few more details. Finish in your Stripe dashboard."
            : actionNeeded
              ? "You're nearly through — Stripe just needs one more detail before payments can go live."
              : "Stripe verifies every business that takes payments. Takes about 5 minutes — you can come back any time if you need to step away."}
        </p>
      </div>

      {opaqueReason && (
        <div className="border-t border-destructive/20 bg-destructive/[0.04] px-6 py-3">
          <p className="text-xs text-foreground">
            <span className="font-mono font-bold uppercase tracking-[1px] text-destructive">
              Stripe says:
            </span>{" "}
            {humaniseDisabledReason(opaqueReason)}
          </p>
        </div>
      )}

      {sellingBlockers.length > 0 && (
        <div className="border-t border-border/40 px-6 py-4">
          <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
            Required to sell tickets
          </p>
          <ul className="space-y-1.5">
            {sellingBlockers.map((g) => (
              <li
                key={g.label}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-warning" />
                {g.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {payoutBlockers.length > 0 && (
        <div className="border-t border-border/40 px-6 py-4">
          <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
            Required to get paid
          </p>
          <ul className="space-y-1.5">
            {payoutBlockers.map((g) => (
              <li
                key={g.label}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                {g.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">
            You can fill this in now or later — selling works as soon as the
            top section is done.
          </p>
        </div>
      )}

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
                {status.details_submitted ? "Resume verification" : "Continue to Stripe"}
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ─── Money + reason helpers ─────────────────────────────────────────────

interface CurrencyTotal {
  currency: string;
  available: number;
  pending: number;
  total: number;
}

function totalisePerCurrency(
  balance: { available: BalanceEntry[]; pending: BalanceEntry[] } | null,
): CurrencyTotal[] {
  if (!balance) return [];
  const map = new Map<string, CurrencyTotal>();
  const ensure = (cur: string) => {
    if (!map.has(cur)) {
      map.set(cur, { currency: cur, available: 0, pending: 0, total: 0 });
    }
    return map.get(cur)!;
  };
  for (const entry of balance.available) {
    const row = ensure(entry.currency);
    row.available += entry.amount;
    row.total += entry.amount;
  }
  for (const entry of balance.pending) {
    const row = ensure(entry.currency);
    row.pending += entry.amount;
    row.total += entry.amount;
  }
  return Array.from(map.values()).filter((r) => r.total !== 0);
}

/** Format Stripe minor units into a localised currency string. */
function formatMoney(amountMinor: number, currency: string): string {
  const cur = currency.toUpperCase();
  const value = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: cur,
    }).format(value);
  } catch {
    return `${cur} ${value.toFixed(2)}`;
  }
}

/**
 * Stripe's disabled_reason values are designed for developers, not tenants.
 * Translate the common ones into plain language. Falls back to the raw value
 * for unknown reasons so we never silently swallow a Stripe-side block.
 */
function humaniseDisabledReason(reason: string): string {
  const map: Record<string, string> = {
    rejected: "Your account was rejected. Contact Stripe support to appeal.",
    "rejected.fraud":
      "Stripe rejected the account for suspected fraud. Contact Stripe support to appeal.",
    "rejected.terms_of_service":
      "Stripe rejected the account for violating their terms. Contact Stripe support.",
    "rejected.listed":
      "Your account was flagged as listed (sanctions / watchlist). Contact Stripe support.",
    "rejected.other":
      "Your account was rejected. Contact Stripe support to appeal.",
    listed: "Your account is on a verification watchlist. Stripe is reviewing.",
    under_review: "Stripe is doing extra verification — usually takes 1-2 days.",
    other: "Stripe needs more information. Continue to Stripe to find out what.",
  };
  return map[reason] || `Stripe blocked the account: ${reason}.`;
}
