"use client";

import { useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";

export default function AdminSettings() {
  const [confirmReset, setConfirmReset] = useState("");
  const [status, setStatus] = useState("");

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
      .neq("id", 0); // Delete all rows

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
              <td>WeeZTix (migrating to Stripe)</td>
            </tr>
            <tr>
              <td style={{ color: "#888" }}>Org ID</td>
              <td>feral</td>
            </tr>
          </tbody>
        </table>
      </div>

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
