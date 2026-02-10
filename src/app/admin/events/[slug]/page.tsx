"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, SETTINGS_KEYS } from "@/lib/constants";
import { saveSettings } from "@/lib/settings";
import type { EventSettings } from "@/types/settings";

const SLUG_TO_KEY: Record<string, string> = {
  "liverpool-27-march": SETTINGS_KEYS.LIVERPOOL,
  "kompass-klub-7-march": SETTINGS_KEYS.KOMPASS,
};

export default function EventEditor() {
  const params = useParams();
  const slug = params.slug as string;
  const settingsKey = SLUG_TO_KEY[slug] || `feral_event_${slug}`;

  const [settings, setSettings] = useState<EventSettings>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [loadStatus, setLoadStatus] = useState("Loading settings\u2026");

  // Load current settings
  useEffect(() => {
    async function load() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setLoadStatus("Database not configured — using defaults");
        return;
      }

      const { data, error } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", settingsKey)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows found — first time, will create on save
          setLoadStatus("No saved settings yet — using defaults");
        } else {
          setLoadStatus(`Load error: ${error.message}`);
        }
        return;
      }

      if (data?.data) {
        setSettings(data.data as EventSettings);
        setLoadStatus("Settings loaded from database");
      } else {
        setLoadStatus("No saved settings yet — using defaults");
      }
    }
    load();
  }, [settingsKey]);

  const updateField = useCallback(
    (field: string, value: string | number | boolean) => {
      setSettings((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus("");

    const result = await saveSettings(settingsKey, settings);

    if (result.error) {
      setSaveStatus(`Error: ${result.error.message}`);
    } else {
      setSaveStatus("Settings saved successfully");
    }

    setSaving(false);
    setTimeout(() => setSaveStatus(""), 3000);
  }, [settingsKey, settings]);

  const isLiverpool = slug === "liverpool-27-march";

  return (
    <div>
      <h1 className="admin-section__title" style={{ marginBottom: "8px" }}>
        EVENT EDITOR: {slug.toUpperCase().replace(/-/g, " ")}
      </h1>
      <div style={{ marginBottom: "24px", fontSize: "0.8rem", color: "#888", letterSpacing: "1px" }}>
        {loadStatus}
      </div>

      {/* Ticket IDs */}
      {isLiverpool && (
        <div className="admin-section">
          <h2 className="admin-section__title">TICKET IDS (WEEZTIX)</h2>
          <div className="admin-form__group">
            <label className="admin-form__label">General Release ID</label>
            <input
              className="admin-form__input"
              value={settings.ticketId1 || ""}
              onChange={(e) => updateField("ticketId1", e.target.value)}
              placeholder="6b45169f-cf51-4600-8682-d6f79dcb59ae"
            />
          </div>
          <div className="admin-form__group">
            <label className="admin-form__label">VIP Ticket ID</label>
            <input
              className="admin-form__input"
              value={settings.ticketId2 || ""}
              onChange={(e) => updateField("ticketId2", e.target.value)}
              placeholder="bb73bb64-ba1a-4a23-9a05-f2b57bca51cf"
            />
          </div>
          <div className="admin-form__group">
            <label className="admin-form__label">VIP Black + Tee ID</label>
            <input
              className="admin-form__input"
              value={settings.ticketId3 || ""}
              onChange={(e) => updateField("ticketId3", e.target.value)}
              placeholder="53c5262b-93ba-412e-bb5c-84ebc445a734"
            />
          </div>
        </div>
      )}

      {/* Ticket Names */}
      {isLiverpool && (
        <div className="admin-section">
          <h2 className="admin-section__title">TICKET NAMES</h2>
          <div className="admin-form__group">
            <label className="admin-form__label">Ticket 1 Name</label>
            <input
              className="admin-form__input"
              value={settings.ticketName1 || ""}
              onChange={(e) => updateField("ticketName1", e.target.value)}
              placeholder="General Release"
            />
          </div>
          <div className="admin-form__group">
            <label className="admin-form__label">Ticket 1 Subtitle</label>
            <input
              className="admin-form__input"
              value={settings.ticketSubtitle1 || ""}
              onChange={(e) => updateField("ticketSubtitle1", e.target.value)}
              placeholder="Standard entry"
            />
          </div>
          <div className="admin-form__group">
            <label className="admin-form__label">Ticket 2 Name</label>
            <input
              className="admin-form__input"
              value={settings.ticketName2 || ""}
              onChange={(e) => updateField("ticketName2", e.target.value)}
              placeholder="VIP Ticket"
            />
          </div>
          <div className="admin-form__group">
            <label className="admin-form__label">Ticket 3 Name</label>
            <input
              className="admin-form__input"
              value={settings.ticketName3 || ""}
              onChange={(e) => updateField("ticketName3", e.target.value)}
              placeholder="VIP Black + Tee"
            />
          </div>
        </div>
      )}

      {/* Size-Specific IDs */}
      {isLiverpool && (
        <div className="admin-section">
          <h2 className="admin-section__title">SIZE-SPECIFIC TEE IDS</h2>
          {(["XS", "S", "M", "L", "XL", "XXL"] as const).map((size) => (
            <div className="admin-form__group" key={size}>
              <label className="admin-form__label">Size {size} ID</label>
              <input
                className="admin-form__input"
                value={(settings as Record<string, string>)[`sizeId${size}`] || ""}
                onChange={(e) => updateField(`sizeId${size}`, e.target.value)}
                placeholder={`WeeZTix ticket ID for size ${size}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Theme Settings */}
      <div className="admin-section">
        <h2 className="admin-section__title">THEME</h2>
        <div className="admin-form__group">
          <label className="admin-form__label">Theme</label>
          <select
            className="admin-form__input"
            value={settings.theme || "default"}
            onChange={(e) => updateField("theme", e.target.value)}
          >
            <option value="default">Default</option>
            <option value="minimal">Minimal</option>
          </select>
        </div>
        {settings.theme === "minimal" && (
          <>
            <div className="admin-form__group">
              <label className="admin-form__label">
                <input
                  type="checkbox"
                  checked={settings.minimalBgEnabled || false}
                  onChange={(e) =>
                    updateField("minimalBgEnabled", e.target.checked)
                  }
                  style={{ marginRight: "8px" }}
                />
                Enable Background Image
              </label>
            </div>
            {settings.minimalBgEnabled && (
              <>
                <div className="admin-form__group">
                  <label className="admin-form__label">
                    Background Image URL
                  </label>
                  <input
                    className="admin-form__input"
                    value={settings.minimalBgImage || ""}
                    onChange={(e) =>
                      updateField("minimalBgImage", e.target.value)
                    }
                    placeholder="https://..."
                  />
                </div>
                <div className="admin-form__group">
                  <label className="admin-form__label">
                    Blur Strength ({settings.minimalBlurStrength || 0}px)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={settings.minimalBlurStrength || 0}
                    onChange={(e) =>
                      updateField(
                        "minimalBlurStrength",
                        parseInt(e.target.value)
                      )
                    }
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="admin-form__group">
                  <label className="admin-form__label">
                    Static Strength (
                    {settings.minimalStaticStrength || 50}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.minimalStaticStrength || 50}
                    onChange={(e) =>
                      updateField(
                        "minimalStaticStrength",
                        parseInt(e.target.value)
                      )
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Save Button */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <button
          className="admin-form__save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "SAVING..." : "SAVE SETTINGS"}
        </button>
        {saveStatus && (
          <span
            style={{
              color: saveStatus.includes("Error") ? "#ff0033" : "#4ecb71",
              fontSize: "0.85rem",
            }}
          >
            {saveStatus}
          </span>
        )}
      </div>
    </div>
  );
}
