"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";

interface PaymentStatus {
  connected: boolean;
  account_id: string | null;
  business_name: string | null;
  email: string | null;
  country: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_due: string[];
}

/**
 * Payment Settings — the promoter-facing page.
 *
 * This is what a promoter (or you as the first user) sees.
 * No mention of "Stripe Connect" — just "Set up payments" / "Payment settings".
 * Behind the scenes, it creates and manages a Stripe Custom connected account.
 */
export default function PaymentSettingsPage() {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setting_up, setSettingUp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);

  // Setup form
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("GB");

  // Check if we already have a connected account
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/connect");
      const json = await res.json();

      if (json.data && json.data.length > 0) {
        // Use the first account (for now, one account per platform)
        const acc = json.data[0];
        const detailRes = await fetch(`/api/stripe/connect/${acc.account_id}`);
        const detail = await detailRes.json();

        setStatus({
          connected: true,
          account_id: acc.account_id,
          business_name: acc.business_name,
          email: acc.email,
          country: acc.country,
          charges_enabled: acc.charges_enabled,
          payouts_enabled: acc.payouts_enabled,
          details_submitted: acc.details_submitted,
          requirements_due: detail.requirements?.currently_due || [],
        });
      } else {
        setStatus({
          connected: false,
          account_id: null,
          business_name: null,
          email: null,
          country: null,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          requirements_due: [],
        });
      }
    } catch {
      setError("Failed to check payment status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Create account and start onboarding
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setSettingUp(true);
    setError("");

    try {
      // Create the connected account
      const createRes = await fetch("/api/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          business_name: businessName.trim() || undefined,
          country,
          account_type: "custom",
        }),
      });

      const createJson = await createRes.json();

      if (!createRes.ok) {
        setError(createJson.error || "Failed to set up payments");
        setSettingUp(false);
        return;
      }

      // Save the connected account ID to site_settings so the payment-intent
      // route can auto-detect it — no manual linking needed
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.from(TABLES.SITE_SETTINGS).upsert(
          {
            key: "feral_stripe_account",
            data: { account_id: createJson.account_id },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      }

      // Get the onboarding link
      const onboardRes = await fetch(
        `/api/stripe/connect/${createJson.account_id}/onboarding`
      );
      const onboardJson = await onboardRes.json();

      if (onboardJson.url) {
        setOnboardingUrl(onboardJson.url);
        setSuccess("Account created. Complete the setup below.");
      }

      await checkStatus();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSettingUp(false);
    }
  };

  // Generate a new onboarding link for incomplete accounts
  const handleContinueSetup = async () => {
    if (!status?.account_id) return;
    setError("");

    try {
      const res = await fetch(
        `/api/stripe/connect/${status.account_id}/onboarding`
      );
      const json = await res.json();

      if (json.url) {
        setOnboardingUrl(json.url);
      } else {
        setError(json.error || "Failed to generate setup link");
      }
    } catch {
      setError("Failed to generate setup link");
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 700 }}>
        <h1 className="admin-page-title">Payment Settings</h1>
        <div style={{ color: "#555", padding: "48px 0", textAlign: "center" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 className="admin-page-title">Payment Settings</h1>
      <p className="admin-page-subtitle">
        Set up your business details to start accepting payments and receiving
        payouts.
      </p>

      {error && (
        <div className="admin-alert admin-alert--error">{error}</div>
      )}
      {success && (
        <div className="admin-alert admin-alert--success">{success}</div>
      )}

      {/* ─── Not Set Up Yet ─── */}
      {status && !status.connected && !onboardingUrl && (
        <div className="admin-card">
          <div style={{ textAlign: "center", padding: "16px 0 24px" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(255, 0, 51, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: 28,
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ff0033"
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
            <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
              Add your business details to start accepting card payments, Apple
              Pay, Google Pay, and more. You&apos;ll need your business info and
              bank account details.
            </p>
          </div>

          <form
            onSubmit={handleSetup}
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
                  placeholder="e.g. FERAL Events Ltd"
                />
              </div>

              <div className="admin-form__field" style={{ marginBottom: 24 }}>
                <label className="admin-form__label">Country</label>
                <select
                  className="admin-form__input"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="GB">United Kingdom</option>
                  <option value="IE">Ireland</option>
                  <option value="NL">Netherlands</option>
                  <option value="BE">Belgium</option>
                  <option value="DE">Germany</option>
                  <option value="FR">France</option>
                  <option value="ES">Spain</option>
                  <option value="US">United States</option>
                </select>
              </div>

              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                disabled={setting_up}
                style={{ width: "100%" }}
              >
                {setting_up ? "Setting up..." : "Continue Setup"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Onboarding Link ─── */}
      {onboardingUrl && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(246, 4, 52, 0.3)" }}
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
                color: "#888",
                fontSize: 13,
                lineHeight: 1.6,
                maxWidth: 400,
                margin: "0 auto 20px",
              }}
            >
              Click below to verify your identity and add your bank account
              details. This is a secure process — your information is encrypted
              and protected.
            </p>
            <a
              href={onboardingUrl}
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
                setOnboardingUrl(null);
                checkStatus();
              }}
            >
              I&apos;ve Completed Verification
            </button>
          </div>
        </div>
      )}

      {/* ─── Account Connected ─── */}
      {status && status.connected && !onboardingUrl && (
        <>
          {/* Status Banner */}
          <div
            className="admin-card"
            style={{
              borderColor: status.charges_enabled
                ? "rgba(78, 203, 113, 0.2)"
                : "rgba(255, 193, 7, 0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: status.details_submitted ? 0 : 16,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: status.charges_enabled
                    ? "rgba(78, 203, 113, 0.1)"
                    : "rgba(255, 193, 7, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  flexShrink: 0,
                }}
              >
                {status.charges_enabled ? (
                  <span style={{ color: "#4ecb71" }}>&#10003;</span>
                ) : (
                  <span style={{ color: "#ffc107" }}>!</span>
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
                <p style={{ color: "#888", fontSize: 13 }}>
                  {status.charges_enabled
                    ? "You can accept payments. Funds will be deposited to your bank account."
                    : "Complete the verification to start accepting payments."}
                </p>
              </div>
            </div>

            {!status.details_submitted && (
              <button
                className="admin-btn admin-btn--primary"
                style={{ width: "100%" }}
                onClick={handleContinueSetup}
              >
                Continue Setup
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
              <div>
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 9,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "#555",
                    marginBottom: 4,
                  }}
                >
                  Business Name
                </div>
                <div style={{ color: "#ccc", fontSize: 14 }}>
                  {status.business_name || "—"}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 9,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "#555",
                    marginBottom: 4,
                  }}
                >
                  Email
                </div>
                <div style={{ color: "#ccc", fontSize: 14 }}>
                  {status.email || "—"}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 9,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "#555",
                    marginBottom: 4,
                  }}
                >
                  Country
                </div>
                <div style={{ color: "#ccc", fontSize: 14 }}>
                  {status.country || "—"}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 9,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "#555",
                    marginBottom: 4,
                  }}
                >
                  Account ID
                </div>
                <div
                  style={{
                    color: "#ff0033",
                    fontSize: 11,
                    fontFamily: "'Space Mono', monospace",
                  }}
                >
                  {status.account_id}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Capabilities */}
          <div className="admin-card" style={{ marginTop: 24 }}>
            <h2 className="admin-card__title">Capabilities</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span style={{ color: "#ccc", fontSize: 13 }}>
                  Card Payments
                </span>
                <StatusBadge enabled={status.charges_enabled} />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span style={{ color: "#ccc", fontSize: 13 }}>Payouts</span>
                <StatusBadge enabled={status.payouts_enabled} />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                }}
              >
                <span style={{ color: "#ccc", fontSize: 13 }}>
                  Identity Verified
                </span>
                <StatusBadge enabled={status.details_submitted} />
              </div>
            </div>
          </div>

          {/* Pending Requirements */}
          {status.requirements_due.length > 0 && (
            <div className="admin-card" style={{ marginTop: 24 }}>
              <h2 className="admin-card__title">Action Required</h2>
              <p
                style={{
                  color: "#888",
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
                {status.requirements_due.map((req) => (
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
                    <span style={{ color: "#ffc107", fontSize: 14 }}>
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
                onClick={handleContinueSetup}
              >
                Complete Verification
              </button>
            </div>
          )}

          {/* Link to event setup */}
          <div className="admin-card" style={{ marginTop: 24 }}>
            <h2 className="admin-card__title">Next Steps</h2>
            <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6 }}>
              Your payment account is linked automatically. To start accepting
              payments for an event:
            </p>
            <ol
              style={{
                color: "#888",
                fontSize: 13,
                lineHeight: 2,
                paddingLeft: 20,
                marginTop: 8,
              }}
            >
              <li>
                Go to{" "}
                <Link href="/admin/events/" style={{ color: "#ff0033" }}>
                  Events
                </Link>
              </li>
              <li>Edit your event and set Payment Method to &quot;Stripe&quot;</li>
              <li>Save — that&apos;s it, you&apos;re live</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

/** Small green/red badge */
function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 9,
        letterSpacing: 1,
        textTransform: "uppercase",
        padding: "3px 10px",
        background: enabled
          ? "rgba(78, 203, 113, 0.1)"
          : "rgba(255, 0, 51, 0.08)",
        color: enabled ? "#4ecb71" : "#ff0033",
        border: `1px solid ${enabled ? "rgba(78, 203, 113, 0.2)" : "rgba(255, 0, 51, 0.15)"}`,
      }}
    >
      {enabled ? "Active" : "Inactive"}
    </span>
  );
}

/** Make Stripe requirement IDs human-readable */
function formatRequirement(req: string): string {
  const map: Record<string, string> = {
    "business_profile.url": "Business website URL",
    "business_profile.mcc": "Business category",
    "business_profile.product_description": "Description of your business",
    "external_account": "Bank account details",
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
    "individual.verification.document": "Identity document (passport/licence)",
    "individual.verification.additional_document": "Proof of address",
    "tos_acceptance.date": "Terms of service acceptance",
    "tos_acceptance.ip": "Terms of service acceptance",
    "company.name": "Company name",
    "company.tax_id": "Company tax ID / VAT number",
    "company.address.line1": "Company address",
    "company.address.city": "Company city",
    "company.address.postal_code": "Company postcode",
  };

  return map[req] || req.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
