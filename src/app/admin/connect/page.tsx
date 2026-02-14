"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_PLATFORM_FEE_PERCENT, MIN_PLATFORM_FEE } from "@/lib/stripe/config";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

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

/**
 * Stripe Connect — Platform Admin Page
 *
 * This is the master admin tool for managing Stripe Connect:
 * - Platform fee configuration (defaults + per-event overrides)
 * - All connected accounts with status, onboarding, details
 * - Technical controls (create accounts, generate onboarding links, view requirements)
 * - Revenue split breakdown
 *
 * The promoter-facing equivalent is /admin/payments/ — clean and branded.
 */
export default function StripeConnectPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create account form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [country, setCountry] = useState("GB");
  const [accountType, setAccountType] = useState<"custom" | "express">("custom");

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
          account_type: accountType,
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
      setShowCreateForm(false);
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

  const activeAccounts = accounts.filter((a) => a.details_submitted);
  const pendingAccounts = accounts.filter((a) => !a.details_submitted);

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 className="admin-page-title">Stripe Connect</h1>
      <p className="admin-page-subtitle">
        Platform-level controls for Stripe Connect — fees, splits, and account management.
      </p>

      {error && (
        <div className="admin-alert admin-alert--error">{error}</div>
      )}
      {success && (
        <div className="admin-alert admin-alert--success">{success}</div>
      )}

      {/* ─── Platform Fee Configuration ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 32 }}>
        <div className="admin-card">
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#55557a", marginBottom: 8 }}>
            Default Platform Fee
          </div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, color: "#8B5CF6", marginBottom: 4 }}>
            {DEFAULT_PLATFORM_FEE_PERCENT}%
          </div>
          <div style={{ color: "#55557a", fontSize: 11 }}>
            Per transaction (configurable per event)
          </div>
        </div>

        <div className="admin-card">
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#55557a", marginBottom: 8 }}>
            Minimum Fee
          </div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, color: "#8B5CF6", marginBottom: 4 }}>
            £{(MIN_PLATFORM_FEE / 100).toFixed(2)}
          </div>
          <div style={{ color: "#55557a", fontSize: 11 }}>
            Floor per transaction
          </div>
        </div>

        <div className="admin-card">
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#55557a", marginBottom: 8 }}>
            Connected Accounts
          </div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, color: "#8B5CF6", marginBottom: 4 }}>
            {loading ? "—" : accounts.length}
          </div>
          <div style={{ color: "#55557a", fontSize: 11 }}>
            {activeAccounts.length} active, {pendingAccounts.length} pending
          </div>
        </div>
      </div>

      {/* ─── Revenue Split Breakdown ─── */}
      <div className="admin-card" style={{ marginBottom: 32 }}>
        <h2 className="admin-card__title">Revenue Split Example</h2>
        <p style={{ color: "#6666a0", fontSize: 12, marginBottom: 16 }}>
          How a £30 ticket sale is split with the default {DEFAULT_PLATFORM_FEE_PERCENT}% platform fee:
        </p>
        <div style={{ display: "flex", gap: 0, height: 40, borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
          <div style={{
            flex: 100 - DEFAULT_PLATFORM_FEE_PERCENT,
            background: "rgba(52, 211, 153, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "#34D399",
            borderRight: "2px solid #111117",
          }}>
            Promoter: £{(30 * (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100)).toFixed(2)}
          </div>
          <div style={{
            flex: DEFAULT_PLATFORM_FEE_PERCENT,
            background: "rgba(139, 92, 246, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "#8B5CF6",
          }}>
            Platform: £{(30 * DEFAULT_PLATFORM_FEE_PERCENT / 100).toFixed(2)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#55557a", marginBottom: 4 }}>Charge Model</div>
            <div style={{ color: "#ccc", fontSize: 12 }}>Direct Charges</div>
          </div>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#55557a", marginBottom: 4 }}>Merchant of Record</div>
            <div style={{ color: "#ccc", fontSize: 12 }}>Connected Account (Promoter)</div>
          </div>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#55557a", marginBottom: 4 }}>Stripe Fees Paid By</div>
            <div style={{ color: "#ccc", fontSize: 12 }}>Connected Account</div>
          </div>
        </div>
      </div>

      {/* ─── Onboarding Link Modal ─── */}
      {onboardingUrl && (
        <div className="admin-card" style={{ marginBottom: 32, borderColor: "rgba(246, 4, 52, 0.3)" }}>
          <h2 className="admin-card__title">Onboarding Link</h2>
          <p style={{ color: "#8888a0", fontSize: 13, marginBottom: 12 }}>
            Send this link to the promoter or open it yourself to complete KYC/onboarding:
          </p>
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "12px 16px",
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "#8B5CF6",
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

      {/* ─── Account Details Modal ─── */}
      {selectedAccount && (
        <div className="admin-card" style={{ marginBottom: 32, borderColor: "rgba(246, 4, 52, 0.3)" }}>
          <h2 className="admin-card__title">Account Details — {selectedAccount.account_id}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 24px", marginBottom: 16 }}>
            <div>
              <span className="admin-form__label">Account ID</span>
              <div style={{ color: "#8B5CF6", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                {selectedAccount.account_id}
              </div>
            </div>
            <div>
              <span className="admin-form__label">Charges</span>
              <div style={{ color: selectedAccount.charges_enabled ? "#34D399" : "#8B5CF6" }}>
                {selectedAccount.charges_enabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div>
              <span className="admin-form__label">Payouts</span>
              <div style={{ color: selectedAccount.payouts_enabled ? "#34D399" : "#8B5CF6" }}>
                {selectedAccount.payouts_enabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div>
              <span className="admin-form__label">KYC Status</span>
              <div style={{ color: selectedAccount.details_submitted ? "#34D399" : "#FBBF24" }}>
                {selectedAccount.details_submitted ? "Complete" : "Incomplete"}
              </div>
            </div>
            <div>
              <span className="admin-form__label">Card Payments</span>
              <div style={{ color: selectedAccount.capabilities.card_payments === "active" ? "#34D399" : "#888" }}>
                {selectedAccount.capabilities.card_payments}
              </div>
            </div>
            <div>
              <span className="admin-form__label">Transfers</span>
              <div style={{ color: selectedAccount.capabilities.transfers === "active" ? "#34D399" : "#888" }}>
                {selectedAccount.capabilities.transfers}
              </div>
            </div>
          </div>

          {selectedAccount.requirements.currently_due.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span className="admin-form__label" style={{ color: "#FBBF24" }}>Currently Due Requirements</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "4px 0" }}>
                {selectedAccount.requirements.currently_due.map((req) => (
                  <li key={req} style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#8888a0", padding: "2px 0" }}>
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedAccount.requirements.past_due.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span className="admin-form__label" style={{ color: "#8B5CF6" }}>Past Due (Urgent)</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "4px 0" }}>
                {selectedAccount.requirements.past_due.map((req) => (
                  <li key={req} style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#8B5CF6", padding: "2px 0" }}>
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedAccount.requirements.disabled_reason && (
            <div style={{ color: "#8B5CF6", fontFamily: "'Space Mono', monospace", fontSize: 11, marginBottom: 12, padding: "8px 12px", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
              Disabled Reason: {selectedAccount.requirements.disabled_reason}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {!selectedAccount.details_submitted && (
              <button
                className="admin-btn admin-btn--primary"
                onClick={() => handleOnboard(selectedAccount.account_id)}
              >
                Generate Onboarding Link
              </button>
            )}
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => setSelectedAccount(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ─── Connected Accounts Table ─── */}
      <div className="admin-card" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 className="admin-card__title" style={{ marginBottom: 0 }}>
            Connected Accounts {!loading && `(${accounts.length})`}
          </h2>
          <button
            className="admin-btn admin-btn--primary admin-btn--small"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? "Cancel" : "+ New Account"}
          </button>
        </div>

        {/* Inline Create Form */}
        {showCreateForm && (
          <form onSubmit={handleCreateAccount} style={{
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            marginBottom: 16,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <div>
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
              <div>
                <label className="admin-form__label">Business Name</label>
                <input
                  type="text"
                  className="admin-form__input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Acme Events Ltd"
                />
              </div>
              <div>
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
              <div>
                <label className="admin-form__label">Type</label>
                <Select value={accountType} onValueChange={(v) => setAccountType(v as "custom" | "express")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom (white-label)</SelectItem>
                    <SelectItem value="express">Express (Stripe-hosted)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={creating}
              style={{ marginTop: 12 }}
            >
              {creating ? "Creating..." : "Create Account"}
            </button>
          </form>
        )}

        {loading ? (
          <div style={{ color: "#55557a", padding: "24px 0", textAlign: "center" }}>
            Loading accounts...
          </div>
        ) : accounts.length === 0 ? (
          <div style={{ color: "#55557a", padding: "24px 0", textAlign: "center" }}>
            No connected accounts yet. Create one above or use{" "}
            <a href="/admin/payments/" style={{ color: "#8B5CF6" }}>
              Payment Settings
            </a>{" "}
            for the promoter-friendly setup.
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Email</th>
                  <th>Country</th>
                  <th>Charges</th>
                  <th>Payouts</th>
                  <th>KYC</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.account_id}>
                    <td>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#8B5CF6" }}>
                        {acc.account_id}
                      </div>
                      {acc.business_name && (
                        <div style={{ fontSize: 12, color: "#8888a0", marginTop: 2 }}>
                          {acc.business_name}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 9,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        background: acc.type === "custom" ? "rgba(139, 92, 246, 0.06)" : "rgba(52, 211, 153, 0.06)",
                        color: acc.type === "custom" ? "#8B5CF6" : "#34D399",
                        border: `1px solid ${acc.type === "custom" ? "rgba(139, 92, 246, 0.15)" : "rgba(52, 211, 153, 0.15)"}`,
                      }}>
                        {acc.type}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "#8888a0" }}>{acc.email || "—"}</td>
                    <td>{acc.country || "—"}</td>
                    <td>
                      <StatusDot enabled={acc.charges_enabled} />
                    </td>
                    <td>
                      <StatusDot enabled={acc.payouts_enabled} />
                    </td>
                    <td>
                      <span style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 9,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        padding: "3px 8px",
                        background: acc.details_submitted
                          ? "rgba(52, 211, 153, 0.1)"
                          : "rgba(255, 193, 7, 0.1)",
                        color: acc.details_submitted ? "#34D399" : "#FBBF24",
                        border: `1px solid ${acc.details_submitted ? "rgba(52, 211, 153, 0.2)" : "rgba(255, 193, 7, 0.2)"}`,
                      }}>
                        {acc.details_submitted ? "Complete" : "Pending"}
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

      {/* ─── Platform Architecture Reference ─── */}
      <div className="admin-card">
        <h2 className="admin-card__title">Architecture Reference</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px", color: "#8888a0", fontSize: 12, lineHeight: 1.8 }}>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#55557a", marginBottom: 4 }}>Connect Model</div>
            <div style={{ color: "#ccc" }}>Sellers collect payments directly (Direct Charges)</div>
            <div>Connected account is the merchant of record. Platform takes application_fee_amount.</div>
          </div>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#55557a", marginBottom: 4 }}>Account Types</div>
            <div style={{ color: "#ccc" }}>Custom (default) — fully white-labeled</div>
            <div>Express also supported for simpler onboarding. Standard accounts for future.</div>
          </div>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#55557a", marginBottom: 4 }}>Fee Collection</div>
            <div style={{ color: "#ccc" }}>Platform collects processing fees</div>
            <div>Stripe processing fees deducted from connected account. Platform fee via application_fee_amount.</div>
          </div>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#55557a", marginBottom: 4 }}>Onboarding</div>
            <div style={{ color: "#ccc" }}>Embedded components + hosted fallback</div>
            <div>Stripe handles KYC/liability. Account Links for hosted flow. Account Sessions for embedded.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Colored dot + Yes/No indicator */
function StatusDot({ enabled }: { enabled: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: enabled ? "#34D399" : "#8B5CF6",
      }} />
      {enabled ? "Yes" : "No"}
    </span>
  );
}
