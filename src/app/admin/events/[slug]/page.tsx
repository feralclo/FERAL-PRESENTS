"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, SETTINGS_KEYS } from "@/lib/constants";
import type { EventSettings } from "@/types/settings";

const SLUG_TO_KEY: Record<string, string> = {
  "liverpool-27-march": SETTINGS_KEYS.LIVERPOOL,
  "kompass-klub-7-march": SETTINGS_KEYS.KOMPASS,
};

/* ── Image compression (matches original admin/index.html:2274-2315) ── */
function compressImage(
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
          resolve(canvas.toDataURL("image/jpeg", quality));
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

async function processImageFile(file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) {
    alert("Image too large. Maximum is 5MB.");
    return null;
  }
  let result = await compressImage(file, 1600, 0.75);
  if (result && result.length > 500 * 1024) {
    result = await compressImage(file, 1600, 0.6);
  }
  if (result && result.length > 500 * 1024) {
    result = await compressImage(file, 1200, 0.5);
  }
  return result;
}

/* ── ImageField component ── */
const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#888",
  marginBottom: 6,
  fontFamily: "'Space Mono', monospace",
};

const DROP_ZONE_BASE: React.CSSProperties = {
  border: "2px dashed #333",
  padding: 20,
  textAlign: "center",
  cursor: "pointer",
  transition: "border-color 0.15s",
  marginBottom: 8,
};

function ImageField({
  label,
  value,
  onChange,
  blurPx,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  blurPx?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setProcessing(true);
      const result = await processImageFile(file);
      if (result) onChange(result);
      setProcessing(false);
    },
    [onChange]
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={LABEL_STYLE}>{label}</label>

      {/* Preview */}
      {value && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              style={{
                maxWidth: "100%",
                maxHeight: 150,
                border: "1px solid #333",
                background: "#111",
                display: "block",
                filter: blurPx != null ? `blur(${blurPx}px)` : undefined,
              }}
            />
            {blurPx != null && (
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  background: "rgba(0,0,0,0.7)",
                  padding: "2px 6px",
                  fontSize: 9,
                  color: "#888",
                }}
              >
                Preview with blur
              </span>
            )}
          </div>
          <button
            onClick={() => onChange("")}
            style={{
              display: "block",
              marginTop: 8,
              background: "transparent",
              border: "1px solid #ff0033",
              color: "#ff0033",
              fontSize: 10,
              padding: "6px 12px",
              cursor: "pointer",
              fontFamily: "'Space Mono', monospace",
              letterSpacing: 1,
            }}
          >
            Remove Image
          </button>
        </div>
      )}

      {/* Drop zone */}
      <div
        style={{
          ...DROP_ZONE_BASE,
          borderColor: dragging ? "#ff0033" : "#333",
        }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <span style={{ fontSize: 12, color: "#888" }}>
          {processing
            ? "Processing image..."
            : "Drag & drop image here, or click to select"}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* URL input */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or enter image URL"
        style={{
          width: "100%",
          background: "#0e0e0e",
          border: "1px solid #333",
          color: "#ccc",
          fontFamily: "'Space Mono', monospace",
          fontSize: 11,
          padding: 8,
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

/* ── Main Event Editor ── */
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

    const supabase = getSupabaseClient();
    if (!supabase) {
      setSaveStatus("Error: Database not connected");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from(TABLES.SITE_SETTINGS).upsert(
      {
        key: settingsKey,
        data: settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      setSaveStatus(`Error: ${error.message}`);
    } else {
      setSaveStatus("Settings saved successfully");
      try {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
      } catch {
        // localStorage may be unavailable
      }
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

      {/* Banner Image */}
      {isLiverpool && (
        <div className="admin-section">
          <h2 className="admin-section__title">BANNER IMAGE</h2>
          <ImageField
            label="Hero / Banner Image"
            value={settings.heroImage || ""}
            onChange={(v) => updateField("heroImage", v)}
          />
        </div>
      )}

      {/* Tee Images */}
      {isLiverpool && (
        <div className="admin-section">
          <h2 className="admin-section__title">EXCLUSIVE TEE IMAGES</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <ImageField
              label="Front Image"
              value={settings.teeFront || ""}
              onChange={(v) => updateField("teeFront", v)}
            />
            <ImageField
              label="Back Image"
              value={settings.teeBack || ""}
              onChange={(v) => updateField("teeBack", v)}
            />
          </div>
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
                <ImageField
                  label="Background Image"
                  value={settings.minimalBgImage || ""}
                  onChange={(v) => updateField("minimalBgImage", v)}
                  blurPx={settings.minimalBlurStrength || 0}
                />
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
