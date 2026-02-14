"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";

export default function AdminSettings() {
  const [confirmReset, setConfirmReset] = useState("");
  const [status, setStatus] = useState("");

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

      {/* ── ORDER EMAILS (moved to Communications) ── */}
      <div className="admin-section">
        <h2 className="admin-section__title">ORDER EMAILS</h2>
        <p style={{ color: "#8888a0", fontSize: "0.85rem", marginBottom: "16px" }}>
          Email settings have moved to the Communications section.
        </p>
        <Link
          href="/admin/communications/transactional/order-confirmation/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: "'Space Mono', monospace",
            fontSize: "0.75rem",
            letterSpacing: "1px",
            color: "#8B5CF6",
            textDecoration: "none",
            padding: "10px 16px",
            border: "1px solid rgba(139,92,246,0.3)",
            background: "rgba(139,92,246,0.04)",
            transition: "background 0.15s, border-color 0.15s",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          Go to Communications &rarr;
        </Link>
      </div>

      {/* ── PLATFORM INFO ── */}
      <div className="admin-section">
        <h2 className="admin-section__title">PLATFORM INFO</h2>
        <table className="admin-table">
          <tbody>
            <tr>
              <td style={{ color: "#8888a0" }}>Platform</td>
              <td>Nocturn</td>
            </tr>
            <tr>
              <td style={{ color: "#8888a0" }}>Framework</td>
              <td>Next.js (App Router)</td>
            </tr>
            <tr>
              <td style={{ color: "#8888a0" }}>Database</td>
              <td>Supabase (PostgreSQL)</td>
            </tr>
            <tr>
              <td style={{ color: "#8888a0" }}>Hosting</td>
              <td>Vercel</td>
            </tr>
            <tr>
              <td style={{ color: "#8888a0" }}>Payments</td>
              <td>Stripe (Connect)</td>
            </tr>
            <tr>
              <td style={{ color: "#8888a0" }}>Email</td>
              <td>Resend</td>
            </tr>
            <tr>
              <td style={{ color: "#8888a0" }}>Org ID</td>
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
            color: "#8888a0",
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
              background: confirmReset === "RESET" ? "#8B5CF6" : "#333",
            }}
          >
            Reset Traffic Data
          </button>
          <button
            className="admin-form__save"
            onClick={handleResetPopups}
            style={{
              background: confirmReset === "RESET" ? "#8B5CF6" : "#333",
            }}
          >
            Reset Popup Data
          </button>
        </div>
        {status && (
          <p
            style={{
              color: status.includes("Error") ? "#8B5CF6" : "#34D399",
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
