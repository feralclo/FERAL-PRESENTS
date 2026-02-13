"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";
import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";

/* ── Logo image compression ── */

function compressLogoImage(
  file: File,
  maxWidth: number,
  quality: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;
          let w = img.width;
          let h = img.height;
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/png", quality));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function processLogoFile(file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) {
    alert("Image too large. Maximum is 5MB.");
    return null;
  }
  // Logos should be crisp — use PNG, cap at 400px wide
  const result = await compressLogoImage(file, 400, 0.9);
  if (!result) {
    alert("Failed to process image. Try a smaller file.");
  }
  return result;
}

/* ================================================================
   TEMPLATE VARIABLES REFERENCE
   Shown to the user so they know what placeholders are available.
   ================================================================ */

const TEMPLATE_VARS = [
  { var: "{{customer_name}}", desc: "Customer's first name" },
  { var: "{{event_name}}", desc: "Event name" },
  { var: "{{venue_name}}", desc: "Venue name" },
  { var: "{{event_date}}", desc: "Event date" },
  { var: "{{order_number}}", desc: "Order number" },
  { var: "{{ticket_count}}", desc: "Number of tickets" },
];

export default function AdminSettings() {
  const [confirmReset, setConfirmReset] = useState("");
  const [status, setStatus] = useState("");

  // ── Email settings state ──
  const [emailSettings, setEmailSettings] = useState<EmailSettings>(DEFAULT_EMAIL_SETTINGS);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");

  // ── Logo upload state ──
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoDragging, setLogoDragging] = useState(false);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");

  // Load email settings on mount
  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setEmailLoading(false);
          return;
        }
        const { data } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", "feral_email")
          .single();

        if (data?.data && typeof data.data === "object") {
          setEmailSettings({
            ...DEFAULT_EMAIL_SETTINGS,
            ...(data.data as Partial<EmailSettings>),
          });
        }
      } catch {
        // No settings saved yet — defaults are fine
      }
      setEmailLoading(false);
    })();
  }, []);

  // Save email settings
  const handleSaveEmail = useCallback(async () => {
    setEmailSaving(true);
    setEmailStatus("");

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setEmailStatus("Error: Supabase not configured");
        setEmailSaving(false);
        return;
      }

      const { error } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .upsert(
          {
            key: "feral_email",
            data: emailSettings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) {
        setEmailStatus(`Error: ${error.message}`);
      } else {
        setEmailStatus("Email settings saved");
      }
    } catch {
      setEmailStatus("Error: Failed to save");
    }

    setEmailSaving(false);
  }, [emailSettings]);

  // Helper to update a single email settings field
  const updateEmail = <K extends keyof EmailSettings>(
    key: K,
    value: EmailSettings[K]
  ) => {
    setEmailSettings((prev) => ({ ...prev, [key]: value }));
    setEmailStatus(""); // Clear status on change
  };

  // Handle logo file upload
  const handleLogoFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setLogoProcessing(true);
      setLogoUploadError("");

      const compressed = await processLogoFile(file);
      if (!compressed) {
        setLogoProcessing(false);
        return;
      }

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageData: compressed, key: "email-logo" }),
        });
        const json = await res.json();
        if (res.ok && json.url) {
          updateEmail("logo_url", json.url);
        } else {
          setLogoUploadError(json.error || "Upload failed");
        }
      } catch {
        setLogoUploadError("Network error during upload");
      }
      setLogoProcessing(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Danger zone handlers ──
  const handleResetTraffic = useCallback(async () => {
    if (confirmReset !== "RESET") {
      setStatus('Type "RESET" to confirm');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus("Error: Supabase not configured");
      return;
    }
    const { error } = await supabase
      .from(TABLES.TRAFFIC_EVENTS)
      .delete()
      .neq("id", 0);

    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      setStatus("Traffic data reset successfully");
      setConfirmReset("");
    }
  }, [confirmReset]);

  const handleResetPopups = useCallback(async () => {
    if (confirmReset !== "RESET") {
      setStatus('Type "RESET" to confirm');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus("Error: Supabase not configured");
      return;
    }
    const { error } = await supabase
      .from(TABLES.POPUP_EVENTS)
      .delete()
      .neq("id", 0);

    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      setStatus("Popup data reset successfully");
      setConfirmReset("");
    }
  }, [confirmReset]);

  return (
    <div>
      <h1 className="admin-section__title" style={{ marginBottom: "24px" }}>
        SETTINGS
      </h1>

      {/* ── ORDER EMAILS ── */}
      <div className="admin-section">
        <h2 className="admin-section__title">ORDER EMAILS</h2>
        <p style={{ color: "#888", fontSize: "0.85rem", marginBottom: "20px" }}>
          Configure order confirmation emails sent to customers after purchase.
          Customers receive their tickets as a PDF attachment with QR codes.
        </p>

        {emailLoading ? (
          <p style={{ color: "#555", fontSize: "0.85rem" }}>Loading...</p>
        ) : (
          <>
            {/* Enable/disable toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <label style={{
                position: "relative",
                display: "inline-block",
                width: "44px",
                height: "24px",
                flexShrink: 0,
              }}>
                <input
                  type="checkbox"
                  checked={emailSettings.order_confirmation_enabled}
                  onChange={(e) => updateEmail("order_confirmation_enabled", e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
                />
                <span style={{
                  position: "absolute",
                  inset: 0,
                  background: emailSettings.order_confirmation_enabled ? "#ff0033" : "#333",
                  borderRadius: "24px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }} />
                <span style={{
                  position: "absolute",
                  height: "18px",
                  width: "18px",
                  left: emailSettings.order_confirmation_enabled ? "23px" : "3px",
                  bottom: "3px",
                  background: emailSettings.order_confirmation_enabled ? "#fff" : "#888",
                  borderRadius: "50%",
                  transition: "left 0.2s, background 0.2s",
                }} />
              </label>
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.8rem",
                letterSpacing: "1px",
                color: emailSettings.order_confirmation_enabled ? "#fff" : "#666",
              }}>
                {emailSettings.order_confirmation_enabled ? "ENABLED" : "DISABLED"}
              </span>
            </div>

            {/* Sender Identity */}
            <div style={{ marginBottom: "24px" }}>
              <h3 style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.7rem",
                letterSpacing: "2px",
                color: "#666",
                textTransform: "uppercase",
                marginBottom: "12px",
              }}>Sender Identity</h3>
              <div className="admin-form__group" style={{ marginBottom: "8px" }}>
                <label style={{ color: "#888", fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>
                  From Name
                </label>
                <input
                  className="admin-form__input"
                  value={emailSettings.from_name}
                  onChange={(e) => updateEmail("from_name", e.target.value)}
                  placeholder="FERAL PRESENTS"
                  style={{ maxWidth: "400px" }}
                />
              </div>
              <div className="admin-form__group" style={{ marginBottom: "8px" }}>
                <label style={{ color: "#888", fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>
                  From Email
                </label>
                <input
                  className="admin-form__input"
                  type="email"
                  value={emailSettings.from_email}
                  onChange={(e) => updateEmail("from_email", e.target.value)}
                  placeholder="tickets@feralpresents.com"
                  style={{ maxWidth: "400px" }}
                />
              </div>
              <div className="admin-form__group">
                <label style={{ color: "#888", fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>
                  Reply-To Email (optional)
                </label>
                <input
                  className="admin-form__input"
                  type="email"
                  value={emailSettings.reply_to || ""}
                  onChange={(e) => updateEmail("reply_to", e.target.value || undefined)}
                  placeholder="support@feralpresents.com"
                  style={{ maxWidth: "400px" }}
                />
              </div>
            </div>

            {/* Branding */}
            <div style={{ marginBottom: "24px" }}>
              <h3 style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.7rem",
                letterSpacing: "2px",
                color: "#666",
                textTransform: "uppercase",
                marginBottom: "12px",
              }}>Branding</h3>
              <div className="admin-form__group" style={{ marginBottom: "8px" }}>
                <label style={{ color: "#888", fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>
                  Accent Color
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="color"
                    value={emailSettings.accent_color}
                    onChange={(e) => updateEmail("accent_color", e.target.value)}
                    style={{
                      width: "40px",
                      height: "36px",
                      border: "1px solid #333",
                      background: "transparent",
                      cursor: "pointer",
                      padding: "2px",
                    }}
                  />
                  <input
                    className="admin-form__input"
                    value={emailSettings.accent_color}
                    onChange={(e) => updateEmail("accent_color", e.target.value)}
                    placeholder="#ff0033"
                    style={{ maxWidth: "120px" }}
                  />
                </div>
              </div>
              <div className="admin-form__group" style={{ marginBottom: "8px" }}>
                <label style={{ color: "#888", fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>
                  Email Logo
                </label>
                <p style={{ color: "#555", fontSize: "0.75rem", margin: "0 0 10px 0" }}>
                  Upload a logo for the email header. PNG recommended for best compatibility.
                  {!emailSettings.logo_url && " If no logo is set, your org name will be shown as text."}
                </p>

                {/* Logo preview */}
                {emailSettings.logo_url && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{
                      display: "inline-block",
                      background: "#111",
                      border: "1px solid #333",
                      padding: "16px 24px",
                      borderRadius: "4px",
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={emailSettings.logo_url}
                        alt="Email logo preview"
                        style={{
                          maxWidth: 200,
                          maxHeight: 60,
                          display: "block",
                        }}
                      />
                    </div>
                    <button
                      onClick={() => updateEmail("logo_url", undefined)}
                      style={{
                        display: "block",
                        marginTop: 8,
                        fontSize: "0.65rem",
                        padding: "6px 12px",
                        background: "transparent",
                        border: "1px solid #ff0033",
                        color: "#ff0033",
                        cursor: "pointer",
                        fontFamily: "'Space Mono', monospace",
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                      }}
                    >
                      Remove Logo
                    </button>
                  </div>
                )}

                {logoUploadError && (
                  <div style={{ color: "#ff0033", fontSize: "0.7rem", marginBottom: 8 }}>
                    {logoUploadError}
                  </div>
                )}

                {/* Drop zone */}
                <div
                  style={{
                    border: `2px dashed ${logoDragging ? "#ff0033" : "#333"}`,
                    padding: 20,
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                    maxWidth: "400px",
                  }}
                  onClick={() => logoFileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setLogoDragging(true);
                  }}
                  onDragLeave={() => setLogoDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setLogoDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleLogoFile(file);
                  }}
                >
                  <span style={{ fontSize: 12, color: "#888" }}>
                    {logoProcessing
                      ? "Uploading..."
                      : emailSettings.logo_url
                        ? "Drag & drop to replace, or click to select"
                        : "Drag & drop your logo here, or click to select"}
                  </span>
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoFile(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
              <div className="admin-form__group">
                <label style={{ color: "#888", fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>
                  Footer Text
                </label>
                <input
                  className="admin-form__input"
                  value={emailSettings.footer_text}
                  onChange={(e) => updateEmail("footer_text", e.target.value)}
                  placeholder="FERAL PRESENTS"
                  style={{ maxWidth: "400px" }}
                />
              </div>
            </div>

            {/* Template */}
            <div style={{ marginBottom: "24px" }}>
              <h3 style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.7rem",
                letterSpacing: "2px",
                color: "#666",
                textTransform: "uppercase",
                marginBottom: "12px",
              }}>Order Confirmation Template</h3>

              {/* Template variables reference */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                padding: "12px 16px",
                marginBottom: "16px",
              }}>
                <div style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "0.65rem",
                  letterSpacing: "1.5px",
                  color: "#555",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}>
                  Available Variables
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {TEMPLATE_VARS.map((v) => (
                    <span
                      key={v.var}
                      title={v.desc}
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: "0.75rem",
                        color: "#ff0033",
                        background: "rgba(255,0,51,0.06)",
                        border: "1px solid rgba(255,0,51,0.15)",
                        padding: "3px 8px",
                        cursor: "help",
                      }}
                    >
                      {v.var}
                    </span>
                  ))}
                </div>
              </div>

              <div className="admin-form__group" style={{ marginBottom: "8px" }}>
                <label style={{ color: "#888", fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>
                  Subject Line
                </label>
                <input
                  className="admin-form__input"
                  value={emailSettings.order_confirmation_subject}
                  onChange={(e) => updateEmail("order_confirmation_subject", e.target.value)}
                  placeholder="Your tickets for {{event_name}}"
                  style={{ maxWidth: "500px" }}
                />
              </div>
              <div className="admin-form__group" style={{ marginBottom: "8px" }}>
                <label style={{ color: "#888", fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>
                  Heading
                </label>
                <input
                  className="admin-form__input"
                  value={emailSettings.order_confirmation_heading}
                  onChange={(e) => updateEmail("order_confirmation_heading", e.target.value)}
                  placeholder="You're in."
                  style={{ maxWidth: "400px" }}
                />
              </div>
              <div className="admin-form__group">
                <label style={{ color: "#888", fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>
                  Message
                </label>
                <textarea
                  className="admin-form__input"
                  value={emailSettings.order_confirmation_message}
                  onChange={(e) => updateEmail("order_confirmation_message", e.target.value)}
                  placeholder="Your order is confirmed and your tickets are attached..."
                  rows={3}
                  style={{ maxWidth: "500px", resize: "vertical", minHeight: "80px" }}
                />
              </div>
            </div>

            {/* Save button */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                className="admin-form__save"
                onClick={handleSaveEmail}
                disabled={emailSaving}
                style={{ background: "#ff0033" }}
              >
                {emailSaving ? "Saving..." : "Save Email Settings"}
              </button>
              {emailStatus && (
                <span style={{
                  fontSize: "0.8rem",
                  color: emailStatus.includes("Error") ? "#ff0033" : "#4ecb71",
                }}>
                  {emailStatus}
                </span>
              )}
            </div>

            {/* ENV reminder */}
            <div style={{
              marginTop: "20px",
              padding: "12px 16px",
              background: "rgba(255,193,7,0.04)",
              border: "1px dashed rgba(255,193,7,0.2)",
            }}>
              <p style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.7rem",
                letterSpacing: "1px",
                color: "#ffc107",
                margin: 0,
              }}>
                Requires <code style={{ color: "#fff" }}>RESEND_API_KEY</code> environment variable.
                Emails will be silently skipped if not configured.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── PLATFORM INFO ── */}
      <div className="admin-section">
        <h2 className="admin-section__title">PLATFORM INFO</h2>
        <table className="admin-table">
          <tbody>
            <tr>
              <td style={{ color: "#888" }}>Platform</td>
              <td>FERAL PRESENTS</td>
            </tr>
            <tr>
              <td style={{ color: "#888" }}>Framework</td>
              <td>Next.js (App Router)</td>
            </tr>
            <tr>
              <td style={{ color: "#888" }}>Database</td>
              <td>Supabase (PostgreSQL)</td>
            </tr>
            <tr>
              <td style={{ color: "#888" }}>Hosting</td>
              <td>Vercel</td>
            </tr>
            <tr>
              <td style={{ color: "#888" }}>Payments</td>
              <td>Stripe (Connect)</td>
            </tr>
            <tr>
              <td style={{ color: "#888" }}>Email</td>
              <td>Resend</td>
            </tr>
            <tr>
              <td style={{ color: "#888" }}>Org ID</td>
              <td>feral</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── DANGER ZONE ── */}
      <div className="admin-section">
        <h2 className="admin-section__title">DANGER ZONE</h2>
        <p
          style={{
            color: "#888",
            fontSize: "0.85rem",
            marginBottom: "16px",
          }}
        >
          These actions cannot be undone. Type &quot;RESET&quot; to confirm.
        </p>
        <div className="admin-form__group">
          <input
            className="admin-form__input"
            value={confirmReset}
            onChange={(e) => setConfirmReset(e.target.value)}
            placeholder='Type "RESET" to confirm'
            style={{ maxWidth: "300px" }}
          />
        </div>
        <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
          <button
            className="admin-form__save"
            onClick={handleResetTraffic}
            style={{
              background: confirmReset === "RESET" ? "#ff0033" : "#333",
            }}
          >
            Reset Traffic Data
          </button>
          <button
            className="admin-form__save"
            onClick={handleResetPopups}
            style={{
              background: confirmReset === "RESET" ? "#ff0033" : "#333",
            }}
          >
            Reset Popup Data
          </button>
        </div>
        {status && (
          <p
            style={{
              color: status.includes("Error") ? "#ff0033" : "#4ecb71",
              fontSize: "0.85rem",
              marginTop: "12px",
            }}
          >
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
