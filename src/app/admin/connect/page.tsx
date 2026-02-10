"use client";

import { useState, useEffect, useCallback } from "react";

interface ConnectedAccount {
  account_id: string;
  email: string | null;
  business_name: string | null;
  country: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  type: string;
  created: number;
}

interface AccountDetails {
  account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
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

export default function ConnectPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create account form
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [country, setCountry] = useState("GB");

  // Onboarding
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountDetails | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/connect");
      const json = await res.json();
      if (json.data) {
        setAccounts(json.data);
      } else if (json.error) {
        setError(json.error);
      }
    } catch {
      setError("Failed to fetch connected accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          business_name: businessName.trim() || undefined,
          country,
          account_type: "custom",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to create account");
        setCreating(false);
        return;
      }

      setSuccess(`Account created: ${json.account_id}`);
      setEmail("");
      setBusinessName("");
      await fetchAccounts();
    } catch {
      setError("Network error creating account");
    } finally {
      setCreating(false);
    }
  };

  const handleOnboard = async (accountId: string) => {
    setError("");
    try {
      const res = await fetch(
        `/api/stripe/connect/${accountId}/onboarding`
      );
      const json = await res.json();

      if (json.url) {
        setOnboardingUrl(json.url);
      } else {
        setError(json.error || "Failed to create onboarding link");
      }
    } catch {
      setError("Failed to generate onboarding link");
    }
  };

  const handleViewDetails = async (accountId: string) => {
    setError("");
    try {
      const res = await fetch(`/api/stripe/connect/${accountId}`);
      const json = await res.json();

      if (json.account_id) {
        setSelectedAccount(json);
      } else {
        setError(json.error || "Failed to fetch account details");
      }
    } catch {
      setError("Failed to fetch account details");
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 className="admin-page-title">Stripe Connect</h1>
      <p className="admin-page-subtitle">
        Manage connected accounts for promoters and event organizers.
      </p>

      {error && (
        <div className="admin-alert admin-alert--error">{error}</div>
      )}
      {success && (
        <div className="admin-alert admin-alert--success">{success}</div>
      )}

      {/* Create Account Form */}
      <div className="admin-card" style={{ marginBottom: 32 }}>
        <h2 className="admin-card__title">Create Connected Account</h2>
        <form onSubmit={handleCreateAccount} className="admin-form">
          <div className="admin-form__row">
            <div className="admin-form__field">
              <label className="admin-form__label">Email *</label>
              <input
                type="email"
                className="admin-form__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="promoter@example.com"
                required
              />
            </div>
            <div className="admin-form__field">
              <label className="admin-form__label">Business Name</label>
              <input
                type="text"
                className="admin-form__input"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. FERAL Events Ltd"
              />
            </div>
            <div className="admin-form__field">
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
          </div>
          <button
            type="submit"
            className="admin-btn admin-btn--primary"
            disabled={creating}
            style={{ marginTop: 16 }}
          >
            {creating ? "Creating..." : "Create Account"}
          </button>
        </form>
      </div>

      {/* Onboarding Link Modal */}
      {onboardingUrl && (
        <div className="admin-card" style={{ marginBottom: 32, borderColor: "rgba(246, 4, 52, 0.3)" }}>
          <h2 className="admin-card__title">Onboarding Link</h2>
          <p style={{ color: "#888", fontSize: 13, marginBottom: 12 }}>
            Send this link to the promoter or open it yourself to complete onboarding:
          </p>
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "12px 16px",
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "#ff0033",
            wordBreak: "break-all",
            marginBottom: 12,
          }}>
            {onboardingUrl}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={onboardingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-btn admin-btn--primary"
            >
              Open Onboarding
            </a>
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => {
                navigator.clipboard.writeText(onboardingUrl);
                setSuccess("Link copied to clipboard");
              }}
            >
              Copy Link
            </button>
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => setOnboardingUrl(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Account Details Modal */}
      {selectedAccount && (
        <div className="admin-card" style={{ marginBottom: 32, borderColor: "rgba(246, 4, 52, 0.3)" }}>
          <h2 className="admin-card__title">Account Details</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginBottom: 16 }}>
            <div>
              <span className="admin-form__label">Account ID</span>
              <div style={{ color: "#ff0033", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
                {selectedAccount.account_id}
              </div>
            </div>
            <div>
              <span className="admin-form__label">Charges</span>
              <div style={{ color: selectedAccount.charges_enabled ? "#4ecb71" : "#ff0033" }}>
                {selectedAccount.charges_enabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div>
              <span className="admin-form__label">Payouts</span>
              <div style={{ color: selectedAccount.payouts_enabled ? "#4ecb71" : "#ff0033" }}>
                {selectedAccount.payouts_enabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div>
              <span className="admin-form__label">Onboarding</span>
              <div style={{ color: selectedAccount.details_submitted ? "#4ecb71" : "#ffc107" }}>
                {selectedAccount.details_submitted ? "Complete" : "Incomplete"}
              </div>
            </div>
            <div>
              <span className="admin-form__label">Card Payments</span>
              <div style={{ color: selectedAccount.capabilities.card_payments === "active" ? "#4ecb71" : "#888" }}>
                {selectedAccount.capabilities.card_payments}
              </div>
            </div>
            <div>
              <span className="admin-form__label">Transfers</span>
              <div style={{ color: selectedAccount.capabilities.transfers === "active" ? "#4ecb71" : "#888" }}>
                {selectedAccount.capabilities.transfers}
              </div>
            </div>
          </div>

          {selectedAccount.requirements.currently_due.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span className="admin-form__label" style={{ color: "#ffc107" }}>Currently Due</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "4px 0" }}>
                {selectedAccount.requirements.currently_due.map((req) => (
                  <li key={req} style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#888", padding: "2px 0" }}>
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedAccount.requirements.disabled_reason && (
            <div style={{ color: "#ff0033", fontFamily: "'Space Mono', monospace", fontSize: 11, marginBottom: 12 }}>
              Disabled: {selectedAccount.requirements.disabled_reason}
            </div>
          )}

          <button
            className="admin-btn admin-btn--secondary"
            onClick={() => setSelectedAccount(null)}
          >
            Close
          </button>
        </div>
      )}

      {/* Connected Accounts List */}
      <div className="admin-card">
        <h2 className="admin-card__title">
          Connected Accounts {!loading && `(${accounts.length})`}
        </h2>

        {loading ? (
          <div style={{ color: "#555", padding: "24px 0", textAlign: "center" }}>
            Loading accounts...
          </div>
        ) : accounts.length === 0 ? (
          <div style={{ color: "#555", padding: "24px 0", textAlign: "center" }}>
            No connected accounts yet. Create one above to get started.
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Email</th>
                  <th>Country</th>
                  <th>Charges</th>
                  <th>Payouts</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.account_id}>
                    <td>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#ff0033" }}>
                        {acc.account_id.slice(0, 20)}...
                      </div>
                      {acc.business_name && (
                        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                          {acc.business_name}
                        </div>
                      )}
                    </td>
                    <td>{acc.email || "—"}</td>
                    <td>{acc.country || "—"}</td>
                    <td>
                      <span style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: acc.charges_enabled ? "#4ecb71" : "#ff0033",
                        marginRight: 6,
                      }} />
                      {acc.charges_enabled ? "Yes" : "No"}
                    </td>
                    <td>
                      <span style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: acc.payouts_enabled ? "#4ecb71" : "#ff0033",
                        marginRight: 6,
                      }} />
                      {acc.payouts_enabled ? "Yes" : "No"}
                    </td>
                    <td>
                      <span style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 9,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        padding: "3px 8px",
                        background: acc.details_submitted
                          ? "rgba(78, 203, 113, 0.1)"
                          : "rgba(255, 193, 7, 0.1)",
                        color: acc.details_submitted ? "#4ecb71" : "#ffc107",
                        border: `1px solid ${acc.details_submitted ? "rgba(78, 203, 113, 0.2)" : "rgba(255, 193, 7, 0.2)"}`,
                      }}>
                        {acc.details_submitted ? "Active" : "Pending"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="admin-btn admin-btn--small"
                          onClick={() => handleViewDetails(acc.account_id)}
                        >
                          Details
                        </button>
                        {!acc.details_submitted && (
                          <button
                            className="admin-btn admin-btn--small admin-btn--primary"
                            onClick={() => handleOnboard(acc.account_id)}
                          >
                            Onboard
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="admin-card" style={{ marginTop: 32 }}>
        <h2 className="admin-card__title">How It Works</h2>
        <div style={{ color: "#888", fontSize: 13, lineHeight: 1.8 }}>
          <p><strong style={{ color: "#ccc" }}>1. Create Account</strong> — Create a connected account for a promoter using their email.</p>
          <p><strong style={{ color: "#ccc" }}>2. Onboard</strong> — Send them the onboarding link or complete it yourself. They&apos;ll provide ID, bank details, and business info.</p>
          <p><strong style={{ color: "#ccc" }}>3. Link to Event</strong> — In the event editor, set the payment method to &quot;Stripe&quot; and select the connected account.</p>
          <p><strong style={{ color: "#ccc" }}>4. Accept Payments</strong> — Buyers pay via Card, Apple Pay, Google Pay, or Klarna. Funds go to the promoter minus your platform fee.</p>
        </div>
      </div>
    </div>
  );
}
