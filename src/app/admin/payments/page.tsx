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
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

// ─── Types ───

interface AccountStatus {
  connected: boolean;
  account_id: string | null;
  email: string | null;
  business_name: string | null;
  country: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
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
  | "setup" // No account — show the creation form
  | "onboarding" // Account created, embedded onboarding in progress
  | "hosted-link" // Fallback: hosted onboarding link
  | "connected"; // Account fully set up

// ─── Page ───

/**
 * Payment Settings — the tenant-facing page.
 *
 * Tenants see this to set up and manage their Stripe Connect account.
 * Uses tenant-scoped /api/stripe/connect/my-account routes (requireAuth).
 * Embedded ConnectJS onboarding for branded, in-page experience.
 */
export default function PaymentSettingsPage() {
  const [view, setView] = useState<PageView>("loading");
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [connectInstance, setConnectInstance] =
    useState<StripeConnectInstance | null>(null);
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);

  // Setup form
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("GB");
  const [businessType, setBusinessType] = useState("individual");

  // Check URL params on mount (return from hosted onboarding)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("onboarding") === "complete") {
      setSuccess("Verification submitted. Checking your account status...");
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("refresh") === "true") {
      setError("Your session expired. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // ─── Fetch account status ───

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/connect/my-account");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to check payment status");
        setView("setup");
        return;
      }

      const json = await res.json();

      if (!json.connected) {
        setStatus(null);
        setView("setup");
        return;
      }

      const acct: AccountStatus = {
        connected: true,
        account_id: json.account_id,
        email: json.email,
        business_name: json.business_name,
        country: json.country,
        charges_enabled: json.charges_enabled,
        payouts_enabled: json.payouts_enabled,
        details_submitted: json.details_submitted,
        requirements_currently_due:
          json.requirements?.currently_due || [],
        requirements_past_due: json.requirements?.past_due || [],
        disabled_reason: json.requirements?.disabled_reason || null,
        capabilities: json.capabilities || null,
        stale_account: json.stale_account,
      };
      setStatus(acct);

      // If account exists but onboarding incomplete, show embedded onboarding
      if (!acct.details_submitted) {
        setView("onboarding");
      } else {
        setView("connected");
      }

      // Auto-register Apple Pay domain
      if (acct.charges_enabled) {
        fetch("/api/stripe/apple-pay-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: window.location.hostname }),
        }).catch(() => {});
      }
    } catch {
      setError("Failed to check payment status");
      setView("setup");
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // ─── Create account ───

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

      // Register Apple Pay domain
      fetch("/api/stripe/apple-pay-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: window.location.hostname }),
      }).catch(() => {});

      setSuccess("Account created. Complete the verification below.");

      // Refresh status then show embedded onboarding
      await checkStatus();
      setView("onboarding");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSettingUp(false);
    }
  };

  // ─── Initialize embedded ConnectJS ───

  const stripeConnectInstance = useMemo(() => {
    const publishableKey =
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey || view !== "onboarding" || !status?.account_id) {
      return null;
    }

    try {
      return loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret: async () => {
          const res = await fetch(
            "/api/stripe/connect/my-account/onboarding",
            { method: "POST" }
          );
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
  }, [view, status?.account_id]);

  // Update instance state when the memoized value changes
  useEffect(() => {
    if (stripeConnectInstance) {
      setConnectInstance(stripeConnectInstance);
    }
  }, [stripeConnectInstance]);

  // ─── Hosted onboarding fallback ───

  const handleHostedFallback = async () => {
    setError("");
    try {
      const res = await fetch(
        "/api/stripe/connect/my-account/onboarding"
      );
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

  // ─── Render ───

  if (view === "loading") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-mono text-sm font-bold uppercase tracking-[2px]">
          Payment Settings
        </h1>
        <p className="mt-12 text-center text-sm text-muted-foreground">
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-mono text-sm font-bold uppercase tracking-[2px]">
          Payment Settings
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Set up your business details to start accepting payments and
          receiving payouts.
        </p>
      </div>

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

      {/* ─── Setup Form (no account yet) ─── */}
      {view === "setup" && (
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

      {/* ─── Embedded Onboarding ─── */}
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
              <ConnectComponentsProvider
                connectInstance={connectInstance}
              >
                <ConnectAccountOnboarding
                  onExit={() => {
                    setSuccess(
                      "Verification submitted. Checking your account..."
                    );
                    checkStatus();
                  }}
                />
              </ConnectComponentsProvider>
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

      {/* ─── Hosted Onboarding Link (fallback) ─── */}
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
              <a
                href={hostedUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
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

      {/* ─── Account Connected ─── */}
      {view === "connected" && status && (
        <>
          {/* Status Banner */}
          <Card
            className={cn(
              "gap-0 py-0",
              status.charges_enabled
                ? "border-success/20"
                : "border-warning/20"
            )}
          >
            <CardContent className="flex items-center gap-4 px-6 py-5">
              <div
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-full",
                  status.charges_enabled
                    ? "bg-success/10"
                    : "bg-warning/10"
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
                  {status.charges_enabled
                    ? "Payments Active"
                    : "Setup Incomplete"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {status.charges_enabled
                    ? "You can accept payments. Funds will be deposited to your bank account."
                    : "Complete the verification to start accepting payments."}
                </p>
              </div>
            </CardContent>

            {(!status.charges_enabled || status.requirements_currently_due.length > 0) && (
              <div className="border-t border-border/40 px-6 py-4">
                <Button className="w-full" onClick={() => setView("onboarding")}>
                  {status.details_submitted
                    ? "Update Verification"
                    : "Continue Setup"}
                </Button>
              </div>
            )}
          </Card>

          {/* Business Details */}
          <Card className="gap-0 py-0">
            <CardHeader className="px-6 py-4">
              <CardTitle className="font-mono text-xs font-bold uppercase tracking-[2px]">
                Business Details
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-5">
              <DetailField label="Business Name" value={status.business_name} />
              <DetailField label="Email" value={status.email} />
              <DetailField label="Country" value={status.country} />
              <DetailField
                label="Account ID"
                value={status.account_id}
                mono
                accent
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
                enabled={status.charges_enabled}
              />
              <CapabilityRow
                label="Payouts"
                enabled={status.payouts_enabled}
              />
              <CapabilityRow
                label="Identity Verified"
                enabled={status.details_submitted}
                last
              />
            </CardContent>
          </Card>

          {/* Pending Requirements */}
          {status.requirements_currently_due.length > 0 && (
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
                <Button className="mt-3 w-full" onClick={() => setView("onboarding")}>
                  Complete Verification
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Past-due requirements (urgent) */}
          {status.requirements_past_due.length > 0 && (
            <Card className="gap-0 border-destructive/30 py-0">
              <CardHeader className="px-6 py-4">
                <CardTitle className="font-mono text-xs font-bold uppercase tracking-[2px] text-destructive">
                  Overdue Requirements
                </CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="space-y-2 px-6 py-5">
                <p className="text-sm text-muted-foreground">
                  These items are overdue. Your account may be restricted
                  until they are resolved:
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
                <Button className="mt-3 w-full" onClick={() => setView("onboarding")}>
                  Resolve Now
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Disabled reason */}
          {status.disabled_reason && (
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
          )}

          {/* Next Steps */}
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
                  Your payment account is linked automatically. To start
                  accepting payments for an event:
                </p>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                  <li>
                    Go to{" "}
                    <Link
                      href="/admin/events/"
                      className="text-primary hover:underline"
                    >
                      Events
                    </Link>
                  </li>
                  <li>
                    Edit your event and set Payment Method to
                    &quot;Stripe&quot;
                  </li>
                  <li>Save — that&apos;s it, you&apos;re live</li>
                </ol>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───

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
  return (
    <Card className="gap-0 py-0">
      <div className="px-6 py-6 text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-primary/8">
          <CreditCard className="size-7 text-primary" />
        </div>
        <h2 className="font-mono text-base font-bold uppercase tracking-[2px]">
          Set Up Payments
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Add your business details to start accepting card payments, Apple
          Pay, Google Pay, and more. You&apos;ll need your business info and
          bank account details.
        </p>
      </div>

      <Separator />

      <form onSubmit={onSubmit} className="space-y-4 px-6 py-6">
        <div className="space-y-2">
          <Label htmlFor="setup-email">Business Email *</Label>
          <Input
            id="setup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourbusiness.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-name">Business / Organisation Name</Label>
          <Input
            id="setup-name"
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Acme Events Ltd"
          />
        </div>

        <div className="space-y-2">
          <Label>Account Type</Label>
          <Select value={businessType} onValueChange={setBusinessType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Individual / Sole Trader</SelectItem>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="non_profit">Non-Profit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Country</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GB">United Kingdom</SelectItem>
              <SelectItem value="IE">Ireland</SelectItem>
              <SelectItem value="NL">Netherlands</SelectItem>
              <SelectItem value="BE">Belgium</SelectItem>
              <SelectItem value="DE">Germany</SelectItem>
              <SelectItem value="FR">France</SelectItem>
              <SelectItem value="ES">Spain</SelectItem>
              <SelectItem value="US">United States</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" className="w-full" disabled={settingUp}>
          {settingUp ? "Setting up..." : "Continue Setup"}
        </Button>
      </form>
    </Card>
  );
}

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
        {value || "\u2014"}
      </div>
    </div>
  );
}

function CapabilityRow({
  label,
  enabled,
  last,
}: {
  label: string;
  enabled: boolean;
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
      <Badge variant={enabled ? "success" : "default"}>
        {enabled ? "Active" : "Inactive"}
      </Badge>
    </div>
  );
}

// ─── Helpers ───

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
    req
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
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
    rejected_listed:
      "Your account was rejected. Please contact support.",
    rejected_terms_of_service:
      "Your account was rejected for terms of service violation.",
    rejected_other: "Your account was rejected. Please contact support.",
    under_review: "Your account is under review. This may take a few days.",
  };

  return (
    map[reason] || `Account restricted: ${reason.replace(/[._]/g, " ")}`
  );
}
