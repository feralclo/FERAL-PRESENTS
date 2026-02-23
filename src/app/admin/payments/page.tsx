"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
} from "@stripe/react-connect-js";
import { loadConnectAndInitialize } from "@stripe/connect-js/pure";
import type { StripeConnectInstance } from "@stripe/connect-js";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

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
  | "setup"          // No account — show the creation form
  | "onboarding"     // Account created, embedded onboarding in progress
  | "hosted-link"    // Fallback: hosted onboarding link
  | "connected";     // Account fully set up

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
      <div style={{ maxWidth: 700 }}>
        <h1 className="admin-page-title">Payment Settings</h1>
        <div
          style={{
            color: "#55557a",
            padding: "48px 0",
            textAlign: "center",
          }}
        >
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 className="admin-page-title">Payment Settings</h1>
      <p className="admin-page-subtitle">
        Set up your business details to start accepting payments and
        receiving payouts.
      </p>

      {error && (
        <div className="admin-alert admin-alert--error">{error}</div>
      )}
      {success && (
        <div className="admin-alert admin-alert--success">{success}</div>
      )}

      {/* ─── Setup Form (no account yet) ─── */}
      {view === "setup" && <SetupForm
        email={email}
        setEmail={setEmail}
        businessName={businessName}
        setBusinessName={setBusinessName}
        country={country}
        setCountry={setCountry}
        settingUp={settingUp}
        onSubmit={handleSetup}
      />}

      {/* ─── Embedded Onboarding ─── */}
      {view === "onboarding" && (
        <div className="admin-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "8px 0 20px" }}>
            <h2
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#fff",
                marginBottom: 8,
              }}
            >
              Complete Your Setup
            </h2>
            <p
              style={{
                color: "#8888a0",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              Verify your identity and add your bank account details below.
              Your information is encrypted and protected.
            </p>
          </div>

          {connectInstance ? (
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.06)",
                paddingTop: 20,
                minHeight: 400,
              }}
            >
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
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.06)",
                paddingTop: 20,
                textAlign: "center",
              }}
            >
              <p
                style={{
                  color: "#8888a0",
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                Loading the verification form...
              </p>
              <button
                className="admin-btn admin-btn--secondary"
                onClick={handleHostedFallback}
                style={{ fontSize: 12 }}
              >
                Open verification in a new tab instead
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Hosted Onboarding Link (fallback) ─── */}
      {view === "hosted-link" && hostedUrl && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(139, 92, 246, 0.3)" }}
        >
          <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
            <h2
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#fff",
                marginBottom: 8,
              }}
            >
              Complete Your Setup
            </h2>
            <p
              style={{
                color: "#8888a0",
                fontSize: 13,
                lineHeight: 1.6,
                maxWidth: 400,
                margin: "0 auto 20px",
              }}
            >
              Click below to verify your identity and add your bank account
              details. You&apos;ll be redirected back here when finished.
            </p>
            <a
              href={hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-btn admin-btn--primary"
              style={{
                display: "inline-block",
                padding: "16px 40px",
                fontSize: 12,
              }}
            >
              Complete Verification
            </a>
          </div>
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: 16,
              marginTop: 16,
              textAlign: "center",
            }}
          >
            <button
              className="admin-btn admin-btn--secondary"
              style={{ fontSize: 10 }}
              onClick={() => {
                setHostedUrl(null);
                checkStatus();
              }}
            >
              I&apos;ve Completed Verification
            </button>
          </div>
        </div>
      )}

      {/* ─── Account Connected ─── */}
      {view === "connected" && status && (
        <>
          {/* Status Banner */}
          <div
            className="admin-card"
            style={{
              borderColor: status.charges_enabled
                ? "rgba(52, 211, 153, 0.2)"
                : "rgba(255, 193, 7, 0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: status.charges_enabled
                    ? "rgba(52, 211, 153, 0.1)"
                    : "rgba(255, 193, 7, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  flexShrink: 0,
                }}
              >
                {status.charges_enabled ? (
                  <span style={{ color: "#34D399" }}>&#10003;</span>
                ) : (
                  <span style={{ color: "#FBBF24" }}>!</span>
                )}
              </div>
              <div>
                <h2
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 13,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "#fff",
                    marginBottom: 4,
                  }}
                >
                  {status.charges_enabled
                    ? "Payments Active"
                    : "Setup Incomplete"}
                </h2>
                <p style={{ color: "#8888a0", fontSize: 13 }}>
                  {status.charges_enabled
                    ? "You can accept payments. Funds will be deposited to your bank account."
                    : "Complete the verification to start accepting payments."}
                </p>
              </div>
            </div>

            {/* Show "Continue Setup" if details submitted but charges not yet enabled
                (Stripe is still reviewing) — or if details not submitted */}
            {(!status.charges_enabled || status.requirements_currently_due.length > 0) && (
              <button
                className="admin-btn admin-btn--primary"
                style={{ width: "100%", marginTop: 16 }}
                onClick={() => setView("onboarding")}
              >
                {status.details_submitted
                  ? "Update Verification"
                  : "Continue Setup"}
              </button>
            )}
          </div>

          {/* Business Details */}
          <div className="admin-card" style={{ marginTop: 24 }}>
            <h2 className="admin-card__title">Business Details</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px 24px",
              }}
            >
              <DetailField label="Business Name" value={status.business_name} />
              <DetailField label="Email" value={status.email} />
              <DetailField label="Country" value={status.country} />
              <DetailField
                label="Account ID"
                value={status.account_id}
                mono
                accent
              />
            </div>
          </div>

          {/* Capabilities */}
          <div className="admin-card" style={{ marginTop: 24 }}>
            <h2 className="admin-card__title">Capabilities</h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
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
              />
            </div>
          </div>

          {/* Pending Requirements */}
          {status.requirements_currently_due.length > 0 && (
            <div className="admin-card" style={{ marginTop: 24 }}>
              <h2 className="admin-card__title">Action Required</h2>
              <p
                style={{
                  color: "#8888a0",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                Complete these items to fully activate your account:
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {status.requirements_currently_due.map((req) => (
                  <li
                    key={req}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      background: "rgba(255, 193, 7, 0.04)",
                      border: "1px solid rgba(255, 193, 7, 0.1)",
                    }}
                  >
                    <span style={{ color: "#FBBF24", fontSize: 14 }}>
                      &#9679;
                    </span>
                    <span
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 11,
                        color: "#aaa",
                      }}
                    >
                      {formatRequirement(req)}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                className="admin-btn admin-btn--primary"
                style={{ width: "100%", marginTop: 16 }}
                onClick={() => setView("onboarding")}
              >
                Complete Verification
              </button>
            </div>
          )}

          {/* Past-due requirements (urgent) */}
          {status.requirements_past_due.length > 0 && (
            <div
              className="admin-card"
              style={{
                marginTop: 24,
                borderColor: "rgba(244, 63, 94, 0.3)",
              }}
            >
              <h2
                className="admin-card__title"
                style={{ color: "#F43F5E" }}
              >
                Overdue Requirements
              </h2>
              <p
                style={{
                  color: "#8888a0",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                These items are overdue. Your account may be restricted
                until they are resolved:
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {status.requirements_past_due.map((req) => (
                  <li
                    key={req}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      background: "rgba(244, 63, 94, 0.04)",
                      border: "1px solid rgba(244, 63, 94, 0.15)",
                    }}
                  >
                    <span style={{ color: "#F43F5E", fontSize: 14 }}>
                      &#9679;
                    </span>
                    <span
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 11,
                        color: "#aaa",
                      }}
                    >
                      {formatRequirement(req)}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                className="admin-btn admin-btn--primary"
                style={{ width: "100%", marginTop: 16 }}
                onClick={() => setView("onboarding")}
              >
                Resolve Now
              </button>
            </div>
          )}

          {/* Disabled reason */}
          {status.disabled_reason && (
            <div
              className="admin-card"
              style={{
                marginTop: 24,
                borderColor: "rgba(244, 63, 94, 0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ color: "#F43F5E", fontSize: 20 }}>
                  &#9888;
                </span>
                <div>
                  <h2
                    className="admin-card__title"
                    style={{ color: "#F43F5E", marginBottom: 4 }}
                  >
                    Account Restricted
                  </h2>
                  <p style={{ color: "#8888a0", fontSize: 13 }}>
                    {formatDisabledReason(status.disabled_reason)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Next Steps */}
          {status.charges_enabled && (
            <div className="admin-card" style={{ marginTop: 24 }}>
              <h2 className="admin-card__title">Next Steps</h2>
              <p
                style={{
                  color: "#8888a0",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Your payment account is linked automatically. To start
                accepting payments for an event:
              </p>
              <ol
                style={{
                  color: "#8888a0",
                  fontSize: 13,
                  lineHeight: 2,
                  paddingLeft: 20,
                  marginTop: 8,
                }}
              >
                <li>
                  Go to{" "}
                  <Link
                    href="/admin/events/"
                    style={{ color: "#8B5CF6" }}
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
            </div>
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
  settingUp,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  businessName: string;
  setBusinessName: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  settingUp: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="admin-card">
      <div style={{ textAlign: "center", padding: "16px 0 24px" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(139, 92, 246, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8B5CF6"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 10h20" />
            <path d="M2 14h20" />
            <rect x="2" y="5" width="20" height="14" rx="2" />
          </svg>
        </div>
        <h2
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 16,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#fff",
            marginBottom: 8,
          }}
        >
          Set Up Payments
        </h2>
        <p
          style={{
            color: "#8888a0",
            fontSize: 13,
            lineHeight: 1.6,
            maxWidth: 400,
            margin: "0 auto",
          }}
        >
          Add your business details to start accepting card payments, Apple
          Pay, Google Pay, and more. You&apos;ll need your business info and
          bank account details.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: 24,
        }}
      >
        <div className="admin-form">
          <div className="admin-form__field" style={{ marginBottom: 16 }}>
            <label className="admin-form__label">Business Email *</label>
            <input
              type="email"
              className="admin-form__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourbusiness.com"
              required
            />
          </div>

          <div className="admin-form__field" style={{ marginBottom: 16 }}>
            <label className="admin-form__label">
              Business / Organisation Name
            </label>
            <input
              type="text"
              className="admin-form__input"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Acme Events Ltd"
            />
          </div>

          <div className="admin-form__field" style={{ marginBottom: 24 }}>
            <label className="admin-form__label">Country</label>
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

          <button
            type="submit"
            className="admin-btn admin-btn--primary"
            disabled={settingUp}
            style={{ width: "100%" }}
          >
            {settingUp ? "Setting up..." : "Continue Setup"}
          </button>
        </div>
      </form>
    </div>
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
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#55557a",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: accent ? "#8B5CF6" : "#ccc",
          fontSize: mono ? 11 : 14,
          fontFamily: mono
            ? "'Space Mono', monospace"
            : undefined,
        }}
      >
        {value || "\u2014"}
      </div>
    </div>
  );
}

function CapabilityRow({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span style={{ color: "#ccc", fontSize: 13 }}>{label}</span>
      <span
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          letterSpacing: 1,
          textTransform: "uppercase",
          padding: "3px 10px",
          background: enabled
            ? "rgba(52, 211, 153, 0.1)"
            : "rgba(139, 92, 246, 0.08)",
          color: enabled ? "#34D399" : "#8B5CF6",
          border: `1px solid ${
            enabled
              ? "rgba(52, 211, 153, 0.2)"
              : "rgba(139, 92, 246, 0.15)"
          }`,
        }}
      >
        {enabled ? "Active" : "Inactive"}
      </span>
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
