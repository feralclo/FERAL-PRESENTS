"use client";

import { useState, useEffect, useCallback } from "react";
import { marketingKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import type { MarketingSettings } from "@/types/marketing";

type TestStatus = "idle" | "testing" | "success" | "error";

export default function IntegrationsPage() {
  const orgId = useOrgId();
  const [settings, setSettings] = useState<MarketingSettings>({
    meta_tracking_enabled: false,
    meta_pixel_id: "",
    meta_capi_token: "",
    meta_test_event_code: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");

  // Load existing settings
  useEffect(() => {
    fetch(`/api/settings?key=${marketingKey(orgId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.data) {
          setSettings((prev) => ({ ...prev, ...json.data }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  // Save settings
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: marketingKey(orgId), data: settings }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed: ${res.status}`);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  // Test Meta CAPI connection
  const handleTest = useCallback(async () => {
    if (!settings.meta_pixel_id || !settings.meta_capi_token) {
      setTestStatus("error");
      setTestMessage("Enter your Pixel ID and CAPI token first, then save.");
      return;
    }

    // Save first to ensure the API route can read the latest settings
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: marketingKey(orgId),
          data: { ...settings, meta_tracking_enabled: true },
        }),
      });
    } catch {
      // Continue anyway
    }
    setSaving(false);

    setTestStatus("testing");
    setTestMessage("Sending test event to Meta...");

    try {
      const res = await fetch("/api/meta/capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: "PageView",
          event_id: crypto.randomUUID(),
          event_source_url: window.location.href,
          user_data: {},
          custom_data: { test: true },
        }),
      });

      const json = await res.json();

      if (json.error) {
        setTestStatus("error");
        setTestMessage(json.error);
      } else if (json.events_received) {
        setTestStatus("success");
        setTestMessage(
          `Meta received ${json.events_received} event(s). ` +
            (settings.meta_test_event_code
              ? `Check Events Manager > Test Events for code "${settings.meta_test_event_code}".`
              : "Add a Test Event Code to see events in Meta's test tool.")
        );
      } else {
        setTestStatus("success");
        setTestMessage("Event sent successfully.");
      }
    } catch (e) {
      setTestStatus("error");
      setTestMessage((e as Error).message);
    }
  }, [settings]);

  const update = (field: keyof MarketingSettings, value: unknown) =>
    setSettings((prev) => ({ ...prev, [field]: value }));

  if (loading) {
    return (
      <div style={{ padding: 40, color: "#55557a", fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: 2 }}>
        LOADING...
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 24px", maxWidth: 720 }}>
      <h1
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: 3,
          color: "#fff",
          marginBottom: 8,
        }}
      >
        Integrations
      </h1>
      <p
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 11,
          color: "#55557a",
          letterSpacing: 1,
          marginBottom: 32,
        }}
      >
        Connect third-party services and tracking pixels.
      </p>

      {/* Meta Section */}
      <div
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {/* Meta logo */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "linear-gradient(135deg, #0081FB, #0064E0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.93 3.78-3.93 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                letterSpacing: 1,
              }}
            >
              META PIXEL + CONVERSIONS API
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                color: "#55557a",
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              Track the full funnel: PageView, ViewContent, AddToCart,
              InitiateCheckout, Purchase
            </div>
          </div>
        </div>

        {/* Enable toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 0",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            marginBottom: 16,
          }}
        >
          <label
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              color: "#ccc",
              letterSpacing: 1,
              cursor: "pointer",
            }}
          >
            Enable Meta Tracking
          </label>
          <button
            onClick={() =>
              update("meta_tracking_enabled", !settings.meta_tracking_enabled)
            }
            style={{
              width: 44,
              height: 24,
              borderRadius: 24,
              border: "none",
              background: settings.meta_tracking_enabled ? "#8B5CF6" : "#333",
              position: "relative",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                left: settings.meta_tracking_enabled ? 23 : 3,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: settings.meta_tracking_enabled ? "#fff" : "#888",
                transition: "left 0.2s, background 0.2s",
              }}
            />
          </button>
        </div>

        {/* Pixel ID */}
        <SettingsField
          label="PIXEL ID"
          help="Find this in Meta Events Manager → Data Sources → Your Pixel → Settings"
          value={settings.meta_pixel_id || ""}
          onChange={(v) => update("meta_pixel_id", v)}
          placeholder="e.g. 123456789012345"
        />

        {/* CAPI Access Token */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            CONVERSIONS API ACCESS TOKEN
          </label>
          <p style={helpStyle}>
            Generate in Events Manager → Settings → Conversions API →
            &quot;Generate access token&quot;
          </p>
          <div style={{ position: "relative" }}>
            <input
              type={tokenVisible ? "text" : "password"}
              value={settings.meta_capi_token || ""}
              onChange={(e) => update("meta_capi_token", e.target.value)}
              placeholder="Paste your access token here"
              style={{
                ...inputStyle,
                paddingRight: 80,
              }}
            />
            <button
              type="button"
              onClick={() => setTokenVisible(!tokenVisible)}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                fontFamily: "'Space Mono', monospace",
                fontSize: 9,
                letterSpacing: 1,
                color: "#55557a",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {tokenVisible ? "HIDE" : "SHOW"}
            </button>
          </div>
        </div>

        {/* Test Event Code */}
        <SettingsField
          label="TEST EVENT CODE (OPTIONAL)"
          help="Enter a test event code from Events Manager → Test Events to verify your setup"
          value={settings.meta_test_event_code || ""}
          onChange={(v) => update("meta_test_event_code", v)}
          placeholder="e.g. TEST12345"
        />

        {/* Test Connection */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <button
            onClick={handleTest}
            disabled={testStatus === "testing"}
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#8888a0",
              padding: "10px 20px",
              cursor: testStatus === "testing" ? "wait" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {testStatus === "testing" ? "TESTING..." : "TEST CONNECTION"}
          </button>

          {testStatus !== "idle" && testStatus !== "testing" && (
            <div
              style={{
                marginTop: 12,
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                letterSpacing: 0.5,
                padding: "10px 14px",
                background:
                  testStatus === "success"
                    ? "rgba(52, 211, 153, 0.08)"
                    : "rgba(139, 92, 246, 0.08)",
                border: `1px solid ${
                  testStatus === "success"
                    ? "rgba(52, 211, 153, 0.2)"
                    : "rgba(139, 92, 246, 0.2)"
                }`,
                color: testStatus === "success" ? "#34D399" : "#8B5CF6",
              }}
            >
              {testMessage}
            </div>
          )}
        </div>
      </div>

      {/* Future: Google / TikTok placeholders */}
      <div
        style={{
          background: "rgba(255,255,255,0.01)",
          border: "1px dashed rgba(255,255,255,0.06)",
          padding: "20px 24px",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "#1e1e2a",
            letterSpacing: 1,
          }}
        >
          GOOGLE ADS + TIKTOK EVENTS API — COMING SOON
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: "uppercase",
            background: "#8B5CF6",
            color: "#fff",
            border: "none",
            padding: "14px 32px",
            cursor: saving ? "wait" : "pointer",
            transition: "background 0.15s",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "SAVING..." : "SAVE"}
        </button>

        {saved && (
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              color: "#34D399",
              letterSpacing: 1,
            }}
          >
            Saved successfully
          </span>
        )}

        {error && (
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              color: "#8B5CF6",
              letterSpacing: 0.5,
            }}
          >
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Shared styles & sub-components ────────────────────────

const labelStyle: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#6666a0",
  display: "block",
  marginBottom: 4,
};

const helpStyle: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  color: "#444",
  letterSpacing: 0.3,
  marginBottom: 8,
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff",
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  padding: "11px 14px",
  outline: "none",
};

function SettingsField({
  label,
  help,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <p style={helpStyle}>{help}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}
