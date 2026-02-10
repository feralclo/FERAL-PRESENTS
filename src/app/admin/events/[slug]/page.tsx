"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID, SETTINGS_KEYS } from "@/lib/constants";
import type { Event, TicketTypeRow } from "@/types/events";
import type { EventSettings } from "@/types/settings";

/* ── Helpers ── */

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocal(val: string): string | null {
  if (!val) return null;
  return new Date(val).toISOString();
}

const SLUG_TO_KEY: Record<string, string> = {
  "liverpool-27-march": SETTINGS_KEYS.LIVERPOOL,
  "kompass-klub-7-march": SETTINGS_KEYS.KOMPASS,
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#ffc107",
  live: "#4ecb71",
  past: "#888",
  cancelled: "#ff0033",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "\u00a3",
  EUR: "\u20ac",
  USD: "$",
};

/* ── Image compression (reused from original admin) ── */

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
  if (file.size > 10 * 1024 * 1024) {
    alert("Image too large. Maximum is 10MB.");
    return null;
  }
  // Progressive compression — resize and compress to JPEG
  // Site_settings JSONB handles large values fine (proven by Liverpool images)
  const MAX_LEN = 800 * 1024; // ~600KB binary as base64
  let result = await compressImage(file, 1600, 0.8);
  if (result && result.length > MAX_LEN) {
    result = await compressImage(file, 1200, 0.65);
  }
  if (result && result.length > MAX_LEN) {
    result = await compressImage(file, 900, 0.5);
  }
  if (!result) {
    alert("Failed to process image. Try a smaller file.");
  }
  return result;
}

/* ── ImageField component ── */

function ImageField({
  label,
  value,
  onChange,
  blurPx,
  uploadKey,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  blurPx?: number;
  uploadKey?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setProcessing(true);
      setUploadError("");

      const compressed = await processImageFile(file);
      if (!compressed) {
        setProcessing(false);
        return;
      }

      // If we have an upload key, store via the upload API and get a URL back
      if (uploadKey) {
        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageData: compressed, key: uploadKey }),
          });
          const json = await res.json();
          if (res.ok && json.url) {
            onChange(json.url);
          } else {
            setUploadError(json.error || "Upload failed");
            // Fallback: store base64 directly
            onChange(compressed);
          }
        } catch {
          setUploadError("Network error during upload");
          // Fallback: store base64 directly
          onChange(compressed);
        }
      } else {
        // No upload key — store base64 directly (for settings images)
        onChange(compressed);
      }
      setProcessing(false);
    },
    [onChange, uploadKey]
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <label className="admin-form__label">{label}</label>

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
            className="admin-btn admin-btn--danger"
            style={{
              display: "block",
              marginTop: 8,
              fontSize: "0.65rem",
              padding: "6px 12px",
            }}
          >
            Remove Image
          </button>
        </div>
      )}

      {uploadError && (
        <div style={{ color: "#ff0033", fontSize: "0.7rem", marginBottom: 8 }}>
          {uploadError}
        </div>
      )}

      <div
        style={{
          border: `2px dashed ${dragging ? "#ff0033" : "#333"}`,
          padding: 20,
          textAlign: "center",
          cursor: "pointer",
          transition: "border-color 0.15s",
          marginBottom: 8,
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
            ? "Uploading image..."
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

      <input
        type="text"
        className="admin-form__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or enter image URL"
        style={{ fontSize: "0.75rem" }}
      />
    </div>
  );
}

/* ── Lineup Tag Input ── */

function LineupInput({
  lineup,
  onChange,
}: {
  lineup: string[];
  onChange: (lineup: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addArtist = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (lineup.includes(trimmed)) return;
      onChange([...lineup, trimmed]);
    },
    [lineup, onChange]
  );

  const removeArtist = useCallback(
    (index: number) => {
      onChange(lineup.filter((_, i) => i !== index));
    },
    [lineup, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addArtist(inputValue);
        setInputValue("");
      } else if (
        e.key === "Backspace" &&
        inputValue === "" &&
        lineup.length > 0
      ) {
        removeArtist(lineup.length - 1);
      }
    },
    [inputValue, lineup, addArtist, removeArtist]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text");
      if (pasted.includes(",")) {
        e.preventDefault();
        const names = pasted
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const unique = names.filter((n) => !lineup.includes(n));
        if (unique.length > 0) {
          onChange([...lineup, ...unique]);
        }
        setInputValue("");
      }
    },
    [lineup, onChange]
  );

  return (
    <div className="admin-form__field">
      <label className="admin-form__label">Lineup</label>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          padding: "8px 10px",
          background: "#111",
          border: "1px solid #333",
          borderRadius: 2,
          cursor: "text",
          minHeight: 42,
          alignItems: "center",
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {lineup.map((artist, i) => (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#1a1a1a",
              border: "1px solid #444",
              padding: "4px 8px",
              fontSize: "0.75rem",
              fontFamily: "'Space Mono', monospace",
              color: "#fff",
            }}
          >
            {artist}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeArtist(i);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#ff0033",
                cursor: "pointer",
                padding: 0,
                fontSize: "0.85rem",
                lineHeight: 1,
                fontWeight: "bold",
              }}
              aria-label={`Remove ${artist}`}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            if (inputValue.trim()) {
              addArtist(inputValue);
              setInputValue("");
            }
          }}
          placeholder={
            lineup.length === 0 ? "Type artist name, press Enter to add" : ""
          }
          style={{
            background: "none",
            border: "none",
            outline: "none",
            color: "#fff",
            fontSize: "0.8rem",
            fontFamily: "'Space Mono', monospace",
            flex: 1,
            minWidth: 160,
            padding: "2px 0",
          }}
        />
      </div>
      <span style={{ fontSize: "0.7rem", color: "#555", marginTop: 4, display: "block" }}>
        Press Enter or comma to add. Backspace to remove last. Paste comma-separated lists.
      </span>
    </div>
  );
}

/* ── Main Event Editor ── */

export default function EventEditorPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeRow[]>([]);
  const [deletedTypeIds, setDeletedTypeIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<EventSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load event by slug
  useEffect(() => {
    async function load() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data } = await supabase
        .from(TABLES.EVENTS)
        .select("*, ticket_types(*)")
        .eq("org_id", ORG_ID)
        .eq("slug", slug)
        .single();

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setEvent(data as Event);
      const types = (data.ticket_types || []) as TicketTypeRow[];
      setTicketTypes(types.sort((a, b) => a.sort_order - b.sort_order));

      // Load site_settings (WeeZTix gets all settings, native events get theme effects)
      const key =
        SLUG_TO_KEY[slug] || data.settings_key || `feral_event_${slug}`;
      const { data: sd } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", key)
        .single();
      if (sd?.data) {
        const s = sd.data as EventSettings;
        setSettings(s);
        // For WeeZTix: sync theme from site_settings into event state
        if (data.payment_method === "weeztix" && s.theme) {
          setEvent((prev) => prev ? { ...prev, theme: s.theme as string } : prev);
        }
      }

      setLoading(false);
    }
    load();
  }, [slug]);

  const updateEvent = useCallback((field: string, value: unknown) => {
    setEvent((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const updateSetting = useCallback((field: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateTicketType = useCallback(
    (index: number, field: string, value: unknown) => {
      setTicketTypes((prev) =>
        prev.map((tt, i) => (i === index ? { ...tt, [field]: value } : tt))
      );
    },
    []
  );

  const addTicketType = useCallback(() => {
    setTicketTypes((prev) => [
      ...prev,
      {
        id: "",
        org_id: ORG_ID,
        event_id: event?.id || "",
        name: "",
        description: "",
        price: 0,
        capacity: undefined,
        sold: 0,
        sort_order: prev.length,
        includes_merch: false,
        status: "active" as const,
        min_per_order: 1,
        max_per_order: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as TicketTypeRow,
    ]);
  }, [event?.id]);

  const removeTicketType = useCallback((index: number) => {
    setTicketTypes((prev) => {
      const tt = prev[index];
      if (tt.id) setDeletedTypeIds((d) => [...d, tt.id]);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!event) return;
    setSaving(true);
    setSaveMsg("");

    try {
      // STEP 1: Save site_settings FIRST — so when revalidatePath fires
      // in step 2, the public page regenerates with up-to-date settings.
      {
        const supabase = getSupabaseClient();
        if (supabase) {
          const key =
            SLUG_TO_KEY[slug] ||
            event.settings_key ||
            `feral_event_${event.slug}`;

          const dataToSave = event.payment_method === "weeztix"
            ? settings
            : {
                theme: event.theme || "default",
                minimalBlurStrength: settings.minimalBlurStrength ?? 4,
                minimalStaticStrength: settings.minimalStaticStrength ?? 5,
                minimalBgEnabled: !!(event.hero_image || event.cover_image),
              };

          await supabase.from(TABLES.SITE_SETTINGS).upsert(
            {
              key,
              data: dataToSave,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" }
          );
        }
      }

      // STEP 2: Save event + ticket types via API (calls revalidatePath on server)
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: event.name,
          slug: event.slug,
          description: event.description || null,
          venue_name: event.venue_name || null,
          venue_address: event.venue_address || null,
          city: event.city || null,
          country: event.country || null,
          date_start: event.date_start,
          date_end: event.date_end || null,
          doors_open: event.doors_open || null,
          age_restriction: event.age_restriction || null,
          status: event.status,
          visibility: event.visibility,
          payment_method: event.payment_method,
          capacity: event.capacity || null,
          cover_image: event.cover_image || null,
          hero_image: event.hero_image || null,
          theme: event.theme || "default",
          currency: event.currency,
          about_text: event.about_text || null,
          lineup: event.lineup && event.lineup.length > 0 ? event.lineup : null,
          details_text: event.details_text || null,
          tag_line: event.tag_line || null,
          doors_time: event.doors_time || null,
          stripe_account_id: event.stripe_account_id || null,
          platform_fee_percent: event.platform_fee_percent ?? null,
          ticket_types: ticketTypes.map((tt) => ({
            ...(tt.id ? { id: tt.id } : {}),
            name: tt.name,
            description: tt.description || null,
            price: Number(tt.price),
            capacity: tt.capacity ? Number(tt.capacity) : null,
            status: tt.status,
            sort_order: tt.sort_order,
            includes_merch: tt.includes_merch,
            merch_type: tt.merch_type || null,
            merch_sizes: tt.merch_sizes || null,
            min_per_order: tt.min_per_order,
            max_per_order: tt.max_per_order,
            sale_start: tt.sale_start || null,
            sale_end: tt.sale_end || null,
            tier: tt.tier || "standard",
          })),
          deleted_ticket_type_ids: deletedTypeIds,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setEvent(json.data);
        const types = (json.data.ticket_types || []) as TicketTypeRow[];
        setTicketTypes(types.sort((a, b) => a.sort_order - b.sort_order));
        setDeletedTypeIds([]);

        // Warn if image didn't persist
        if (event.cover_image && !json.data.cover_image) {
          setSaveMsg(
            "Saved, but image may not have persisted. Try re-uploading a smaller image."
          );
        } else {
          setSaveMsg("Saved successfully");
        }
      } else {
        setSaveMsg(`Error: ${json.error}`);
      }
    } catch {
      setSaveMsg("Network error");
    }

    setSaving(false);
    setTimeout(() => setSaveMsg(""), 4000);
  }, [event, ticketTypes, deletedTypeIds, settings, slug]);

  const handleDelete = useCallback(async () => {
    if (!event) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/events/");
      } else {
        const json = await res.json();
        setSaveMsg(`Delete failed: ${json.error}`);
        setShowDeleteConfirm(false);
      }
    } catch {
      setSaveMsg("Network error during delete");
      setShowDeleteConfirm(false);
    }
    setDeleting(false);
  }, [event, router]);

  /* ── Render ── */

  if (loading) return <div className="admin-loading">Loading event...</div>;

  if (notFound || !event) {
    return (
      <div className="admin-empty">
        <p>Event not found for slug: {slug}</p>
        <Link
          href="/admin/events/"
          className="admin-link"
          style={{
            color: "#ff0033",
            marginTop: 12,
            display: "inline-block",
          }}
        >
          Back to Events
        </Link>
      </div>
    );
  }

  const isNativeCheckout = event.payment_method !== "weeztix";
  const currSym = CURRENCY_SYMBOLS[event.currency] || event.currency;

  return (
    <div>
      {/* Back Link */}
      <Link href="/admin/events/" className="admin-back-link">
        &larr; Back to Events
      </Link>

      {/* Header */}
      <div className="admin-editor-header">
        <div className="admin-editor-header__left">
          <h1 className="admin-title" style={{ marginBottom: 0 }}>
            {event.name || "Untitled Event"}
          </h1>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <span
              className="admin-badge"
              style={{
                background: `${STATUS_COLORS[event.status] || "#888"}22`,
                color: STATUS_COLORS[event.status] || "#888",
              }}
            >
              {event.status}
            </span>
            <span style={{ color: "#666", fontSize: "0.75rem" }}>
              /event/{event.slug}/
            </span>
          </div>
        </div>
        <div className="admin-editor-header__actions">
          <button
            className="admin-btn admin-btn--danger"
            onClick={() => setShowDeleteConfirm(true)}
            style={{ fontSize: "0.68rem", padding: "8px 12px" }}
          >
            Delete
          </button>
          <a
            href={`/event/${event.slug}/?preview=${Date.now()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-btn admin-btn--secondary"
            onClick={(e) => {
              e.preventDefault();
              window.open(`/event/${event.slug}/?t=${Date.now()}`, "_blank");
            }}
          >
            Preview
          </a>
          <button
            className="admin-btn admin-btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div
          style={{
            background: "#1a0000",
            border: "1px solid #ff003344",
            padding: "16px 20px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <span style={{ color: "#ff0033", fontSize: "0.8rem" }}>
            Permanently delete &ldquo;{event.name}&rdquo;? This cannot be undone.
          </span>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              className="admin-btn admin-btn--danger"
              onClick={handleDelete}
              disabled={deleting}
              style={{ fontSize: "0.7rem", padding: "6px 16px" }}
            >
              {deleting ? "Deleting..." : "Yes, Delete"}
            </button>
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => setShowDeleteConfirm(false)}
              style={{ fontSize: "0.7rem", padding: "6px 16px" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Save Message */}
      {saveMsg && (
        <div
          className={`admin-save-toast ${
            saveMsg.includes("Error") || saveMsg.includes("error")
              ? "admin-save-toast--error"
              : "admin-save-toast--success"
          }`}
        >
          {saveMsg}
        </div>
      )}

      {/* ─── Section: Event Details ─── */}
      <div className="admin-section">
        <h2 className="admin-section__title">Event Details</h2>
        <div className="admin-form">
          <div className="admin-form__row">
            <div className="admin-form__field">
              <label className="admin-form__label">Event Name *</label>
              <input
                type="text"
                className="admin-form__input"
                value={event.name}
                onChange={(e) => updateEvent("name", e.target.value)}
                placeholder="e.g. FERAL Liverpool June"
              />
            </div>
            <div className="admin-form__field">
              <label className="admin-form__label">URL Slug</label>
              <input
                type="text"
                className="admin-form__input"
                value={event.slug}
                onChange={(e) => updateEvent("slug", e.target.value)}
                placeholder="liverpool-june-2026"
              />
              <span
                style={{ fontSize: "0.7rem", color: "#555", marginTop: 2 }}
              >
                feralpresents.com/event/{event.slug}/
              </span>
            </div>
          </div>
          <div className="admin-form__field">
            <label className="admin-form__label">Description</label>
            <textarea
              className="admin-form__input admin-form__textarea"
              value={event.description || ""}
              onChange={(e) => updateEvent("description", e.target.value)}
              placeholder="Event description..."
              rows={4}
            />
          </div>
        </div>
      </div>

      {/* ─── Section: Page Content (native checkout only) ─── */}
      {isNativeCheckout && (
        <div className="admin-section">
          <h2 className="admin-section__title">Page Content</h2>
          <p style={{ color: "#888", fontSize: "0.8rem", marginBottom: 16 }}>
            This content appears on the public event page.
          </p>
          <div className="admin-form">
            <div className="admin-form__row">
              <div className="admin-form__field">
                <label className="admin-form__label">Tag Line</label>
                <input
                  type="text"
                  className="admin-form__input"
                  value={event.tag_line || ""}
                  onChange={(e) => updateEvent("tag_line", e.target.value)}
                  placeholder="e.g. SECOND RELEASE NOW ACTIVE"
                />
                <span style={{ fontSize: "0.7rem", color: "#555", marginTop: 2 }}>
                  Shown on the hero banner
                </span>
              </div>
              <div className="admin-form__field">
                <label className="admin-form__label">Doors Time</label>
                <input
                  type="text"
                  className="admin-form__input"
                  value={event.doors_time || ""}
                  onChange={(e) => updateEvent("doors_time", e.target.value)}
                  placeholder="e.g. 9:30PM — 4:00AM"
                />
                <span style={{ fontSize: "0.7rem", color: "#555", marginTop: 2 }}>
                  Display format for event page hero
                </span>
              </div>
            </div>

            <div className="admin-form__field">
              <label className="admin-form__label">About</label>
              <textarea
                className="admin-form__input admin-form__textarea"
                value={event.about_text || ""}
                onChange={(e) => updateEvent("about_text", e.target.value)}
                placeholder="Describe the event..."
                rows={4}
              />
            </div>

            <LineupInput
              lineup={event.lineup || []}
              onChange={(lineup) => updateEvent("lineup", lineup)}
            />

            <div className="admin-form__field">
              <label className="admin-form__label">Details</label>
              <textarea
                className="admin-form__input admin-form__textarea"
                value={event.details_text || ""}
                onChange={(e) => updateEvent("details_text", e.target.value)}
                placeholder="Entry requirements, age policy, venue info..."
                rows={3}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Section: Status & Settings ─── */}
      <div className="admin-section">
        <h2 className="admin-section__title">Status & Settings</h2>
        <div className="admin-form">
          <div className="admin-form__row">
            <div className="admin-form__field">
              <label className="admin-form__label">Status</label>
              <select
                className="admin-form__input"
                value={event.status}
                onChange={(e) => updateEvent("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="live">Live</option>
                <option value="past">Past</option>
                <option value="cancelled">Cancelled</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="admin-form__field">
              <label className="admin-form__label">Visibility</label>
              <select
                className="admin-form__input"
                value={event.visibility}
                onChange={(e) => updateEvent("visibility", e.target.value)}
              >
                <option value="public">Public</option>
                <option value="private">Private (Secret Link)</option>
                <option value="unlisted">Unlisted</option>
              </select>
            </div>
          </div>
          <div className="admin-form__row">
            <div className="admin-form__field">
              <label className="admin-form__label">Payment Method</label>
              <select
                className="admin-form__input"
                value={event.payment_method}
                onChange={(e) => updateEvent("payment_method", e.target.value)}
              >
                <option value="test">Test (Simulated)</option>
                <option value="stripe">Stripe</option>
                <option value="weeztix">WeeZTix (External)</option>
              </select>
            </div>
            <div className="admin-form__field">
              <label className="admin-form__label">Currency</label>
              <select
                className="admin-form__input"
                value={event.currency}
                onChange={(e) => updateEvent("currency", e.target.value)}
              >
                <option value="GBP">GBP ({"\u00a3"})</option>
                <option value="EUR">EUR ({"\u20ac"})</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>
          {event.payment_method === "stripe" && (
            <div className="admin-form__row" style={{ marginTop: 12 }}>
              <div className="admin-form__field">
                <label className="admin-form__label">
                  Stripe Connected Account ID
                </label>
                <input
                  type="text"
                  className="admin-form__input"
                  value={event.stripe_account_id || ""}
                  onChange={(e) =>
                    updateEvent("stripe_account_id", e.target.value || undefined)
                  }
                  placeholder="acct_... (from Stripe Connect page)"
                />
                <span style={{ fontSize: 10, color: "#555", marginTop: 4, display: "block" }}>
                  Leave blank to charge the platform account directly.{" "}
                  <Link href="/admin/connect/" style={{ color: "#ff0033" }}>
                    Manage accounts &rarr;
                  </Link>
                </span>
              </div>
              <div className="admin-form__field">
                <label className="admin-form__label">
                  Platform Fee %
                </label>
                <input
                  type="number"
                  className="admin-form__input"
                  value={event.platform_fee_percent ?? 5}
                  onChange={(e) =>
                    updateEvent(
                      "platform_fee_percent",
                      parseFloat(e.target.value) || 5
                    )
                  }
                  min={0}
                  max={50}
                  step={0.5}
                  placeholder="5"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Section: Date & Time ─── */}
      <div className="admin-section">
        <h2 className="admin-section__title">Date & Time</h2>
        <div className="admin-form">
          <div className="admin-form__row">
            <div className="admin-form__field">
              <label className="admin-form__label">Event Start *</label>
              <input
                type="datetime-local"
                className="admin-form__input"
                value={toDatetimeLocal(event.date_start)}
                onChange={(e) =>
                  updateEvent(
                    "date_start",
                    fromDatetimeLocal(e.target.value) || event.date_start
                  )
                }
              />
            </div>
            <div className="admin-form__field">
              <label className="admin-form__label">Event End</label>
              <input
                type="datetime-local"
                className="admin-form__input"
                value={toDatetimeLocal(event.date_end)}
                onChange={(e) =>
                  updateEvent("date_end", fromDatetimeLocal(e.target.value))
                }
              />
            </div>
          </div>
          <div className="admin-form__row">
            <div className="admin-form__field">
              <label className="admin-form__label">Doors Open</label>
              <input
                type="datetime-local"
                className="admin-form__input"
                value={toDatetimeLocal(event.doors_open)}
                onChange={(e) =>
                  updateEvent("doors_open", fromDatetimeLocal(e.target.value))
                }
              />
            </div>
            <div className="admin-form__field" />
          </div>
        </div>
      </div>

      {/* ─── Section: Venue ─── */}
      <div className="admin-section">
        <h2 className="admin-section__title">Venue</h2>
        <div className="admin-form">
          <div className="admin-form__row">
            <div className="admin-form__field">
              <label className="admin-form__label">Venue Name</label>
              <input
                type="text"
                className="admin-form__input"
                value={event.venue_name || ""}
                onChange={(e) => updateEvent("venue_name", e.target.value)}
                placeholder="e.g. Invisible Wind Factory"
              />
            </div>
            <div className="admin-form__field">
              <label className="admin-form__label">Venue Address</label>
              <input
                type="text"
                className="admin-form__input"
                value={event.venue_address || ""}
                onChange={(e) => updateEvent("venue_address", e.target.value)}
                placeholder="e.g. 3 Regent Rd, Liverpool"
              />
            </div>
          </div>
          <div className="admin-form__row">
            <div className="admin-form__field">
              <label className="admin-form__label">City</label>
              <input
                type="text"
                className="admin-form__input"
                value={event.city || ""}
                onChange={(e) => updateEvent("city", e.target.value)}
                placeholder="e.g. Liverpool"
              />
            </div>
            <div className="admin-form__field">
              <label className="admin-form__label">Country</label>
              <input
                type="text"
                className="admin-form__input"
                value={event.country || ""}
                onChange={(e) => updateEvent("country", e.target.value)}
                placeholder="e.g. UK"
              />
            </div>
          </div>
          <div className="admin-form__row">
            <div className="admin-form__field">
              <label className="admin-form__label">Capacity</label>
              <input
                type="number"
                className="admin-form__input"
                value={event.capacity ?? ""}
                onChange={(e) =>
                  updateEvent(
                    "capacity",
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                placeholder="e.g. 500"
              />
            </div>
            <div className="admin-form__field">
              <label className="admin-form__label">Age Restriction</label>
              <input
                type="text"
                className="admin-form__input"
                value={event.age_restriction || ""}
                onChange={(e) =>
                  updateEvent("age_restriction", e.target.value)
                }
                placeholder="e.g. 18+"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Section: Design ─── */}
      <div className="admin-section">
        <h2 className="admin-section__title">Design</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
          }}
        >
          <div>
            <ImageField
              label="Event Tile"
              value={event.cover_image || ""}
              onChange={(v) => updateEvent("cover_image", v)}
              uploadKey={event.id ? `event_${event.id}_cover` : undefined}
            />
            <span style={{ fontSize: "0.65rem", color: "#555", display: "block", marginTop: -8 }}>
              Tile image for event listings / homepage.
            </span>
          </div>
          <div>
            <ImageField
              label="Event Banner"
              value={event.hero_image || ""}
              onChange={(v) => updateEvent("hero_image", v)}
              uploadKey={event.id ? `event_${event.id}_banner` : undefined}
            />
            <span style={{ fontSize: "0.65rem", color: "#555", display: "block", marginTop: -8 }}>
              Hero background on the event page. Any aspect ratio — auto-centered.
            </span>
          </div>
        </div>
        <div className="admin-form" style={{ marginTop: 16 }}>
          <div className="admin-form__field">
            <label className="admin-form__label">Theme</label>
            <select
              className="admin-form__input"
              value={
                event.payment_method === "weeztix"
                  ? (settings.theme as string) || "default"
                  : event.theme || "default"
              }
              onChange={(e) => {
                if (event.payment_method === "weeztix") {
                  updateSetting("theme", e.target.value);
                }
                updateEvent("theme", e.target.value);
              }}
            >
              <option value="default">Default</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>

          {/* Minimal theme effects — show when minimal is selected */}
          {((event.payment_method !== "weeztix" && event.theme === "minimal") ||
            (event.payment_method === "weeztix" && (settings.theme as string) === "minimal")) && (
            <>
              <div className="admin-form__field" style={{ marginTop: 16 }}>
                <label className="admin-form__label">
                  Blur ({settings.minimalBlurStrength ?? 4}px)
                </label>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={settings.minimalBlurStrength ?? 4}
                  onChange={(e) =>
                    updateSetting("minimalBlurStrength", parseInt(e.target.value))
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <div className="admin-form__field">
                <label className="admin-form__label">
                  Static / Noise ({settings.minimalStaticStrength ?? 5}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.minimalStaticStrength ?? 5}
                  onChange={(e) =>
                    updateSetting("minimalStaticStrength", parseInt(e.target.value))
                  }
                  style={{ width: "100%" }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Section: Ticket Types (native checkout only) ─── */}
      {isNativeCheckout && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h2 className="admin-section__title" style={{ marginBottom: 0 }}>
              Ticket Types
            </h2>
            <button
              className="admin-btn admin-btn--primary"
              onClick={addTicketType}
              style={{ fontSize: "0.7rem", padding: "8px 16px" }}
            >
              + Add Ticket Type
            </button>
          </div>

          {ticketTypes.length === 0 ? (
            <p
              style={{
                color: "#888",
                fontSize: "0.85rem",
                marginTop: 16,
              }}
            >
              No ticket types yet. Add your first ticket type to start selling.
            </p>
          ) : (
            <div className="admin-ticket-types">
              {ticketTypes.map((tt, i) => (
                <div key={tt.id || `new-${i}`} className="admin-ticket-card">
                  <div className="admin-ticket-card__header">
                    <span className="admin-ticket-card__number">
                      Tier #{i + 1}
                    </span>
                    {tt.sold > 0 && (
                      <span
                        style={{
                          color: "#4ecb71",
                          fontSize: "0.7rem",
                          fontFamily: "'Space Mono', monospace",
                        }}
                      >
                        {tt.sold} sold
                      </span>
                    )}
                    <button
                      className="admin-btn-icon admin-btn-icon--danger"
                      onClick={() => {
                        if (tt.sold > 0) {
                          if (
                            !confirm(
                              `This ticket type has ${tt.sold} sales. Are you sure you want to delete it?`
                            )
                          )
                            return;
                        }
                        removeTicketType(i);
                      }}
                      title="Delete ticket type"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="admin-form">
                    <div className="admin-form__row">
                      <div className="admin-form__field">
                        <label className="admin-form__label">Name *</label>
                        <input
                          type="text"
                          className="admin-form__input"
                          value={tt.name}
                          onChange={(e) =>
                            updateTicketType(i, "name", e.target.value)
                          }
                          placeholder="e.g. General Admission"
                        />
                      </div>
                      <div className="admin-form__field">
                        <label className="admin-form__label">Status</label>
                        <select
                          className="admin-form__input"
                          value={tt.status}
                          onChange={(e) =>
                            updateTicketType(i, "status", e.target.value)
                          }
                        >
                          <option value="active">Active</option>
                          <option value="hidden">Hidden</option>
                          <option value="sold_out">Sold Out</option>
                          <option value="archived">Archived</option>
                        </select>
                      </div>
                    </div>

                    <div className="admin-form__field">
                      <label className="admin-form__label">Description</label>
                      <input
                        type="text"
                        className="admin-form__input"
                        value={tt.description || ""}
                        onChange={(e) =>
                          updateTicketType(i, "description", e.target.value)
                        }
                        placeholder="Brief description of this ticket tier"
                      />
                    </div>

                    <div className="admin-form__field">
                      <label className="admin-form__label">Ticket Design Tier</label>
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        {(["standard", "platinum", "black"] as const).map((tier) => (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => updateTicketType(i, "tier", tier)}
                            style={{
                              flex: 1,
                              padding: "10px 8px",
                              border: (tt.tier || "standard") === tier
                                ? tier === "black"
                                  ? "2px solid rgba(255,255,255,0.5)"
                                  : tier === "platinum"
                                    ? "2px solid #e5e4e2"
                                    : "2px solid #ff0033"
                                : "1px solid #333",
                              background: tier === "black"
                                ? "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)"
                                : tier === "platinum"
                                  ? "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)"
                                  : "#111",
                              color: tier === "platinum" ? "#e5e4e2" : "#fff",
                              fontSize: "0.7rem",
                              fontFamily: "'Space Mono', monospace",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              cursor: "pointer",
                              textAlign: "center",
                            }}
                          >
                            {tier}
                            {tier === "platinum" && (
                              <span style={{ display: "block", fontSize: "0.55rem", color: "#c0c0c0", marginTop: 2 }}>
                                Silver/VIP style
                              </span>
                            )}
                            {tier === "black" && (
                              <span style={{ display: "block", fontSize: "0.55rem", color: "#666", marginTop: 2 }}>
                                Dark/Gold VIP style
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="admin-form__row">
                      <div className="admin-form__field">
                        <label className="admin-form__label">
                          Price ({currSym})
                        </label>
                        <input
                          type="number"
                          className="admin-form__input"
                          value={tt.price}
                          onChange={(e) =>
                            updateTicketType(
                              i,
                              "price",
                              Number(e.target.value)
                            )
                          }
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="admin-form__field">
                        <label className="admin-form__label">Capacity</label>
                        <input
                          type="number"
                          className="admin-form__input"
                          value={tt.capacity ?? ""}
                          onChange={(e) =>
                            updateTicketType(
                              i,
                              "capacity",
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          placeholder="Unlimited"
                          min="0"
                        />
                      </div>
                    </div>

                    <div className="admin-form__row">
                      <div className="admin-form__field">
                        <label className="admin-form__label">
                          Min per Order
                        </label>
                        <input
                          type="number"
                          className="admin-form__input"
                          value={tt.min_per_order}
                          onChange={(e) =>
                            updateTicketType(
                              i,
                              "min_per_order",
                              Number(e.target.value)
                            )
                          }
                          min="1"
                        />
                      </div>
                      <div className="admin-form__field">
                        <label className="admin-form__label">
                          Max per Order
                        </label>
                        <input
                          type="number"
                          className="admin-form__input"
                          value={tt.max_per_order}
                          onChange={(e) =>
                            updateTicketType(
                              i,
                              "max_per_order",
                              Number(e.target.value)
                            )
                          }
                          min="1"
                        />
                      </div>
                    </div>

                    <div className="admin-form__row">
                      <div className="admin-form__field">
                        <label className="admin-form__label">Sale Start</label>
                        <input
                          type="datetime-local"
                          className="admin-form__input"
                          value={toDatetimeLocal(tt.sale_start)}
                          onChange={(e) =>
                            updateTicketType(
                              i,
                              "sale_start",
                              fromDatetimeLocal(e.target.value)
                            )
                          }
                        />
                      </div>
                      <div className="admin-form__field">
                        <label className="admin-form__label">Sale End</label>
                        <input
                          type="datetime-local"
                          className="admin-form__input"
                          value={toDatetimeLocal(tt.sale_end)}
                          onChange={(e) =>
                            updateTicketType(
                              i,
                              "sale_end",
                              fromDatetimeLocal(e.target.value)
                            )
                          }
                        />
                      </div>
                    </div>

                    {/* Merch options */}
                    <div className="admin-form__field">
                      <label
                        className="admin-form__label"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={tt.includes_merch}
                          onChange={(e) =>
                            updateTicketType(
                              i,
                              "includes_merch",
                              e.target.checked
                            )
                          }
                        />
                        Includes Merchandise
                      </label>
                    </div>
                    {tt.includes_merch && (
                      <div className="admin-form__row">
                        <div className="admin-form__field">
                          <label className="admin-form__label">
                            Merch Type
                          </label>
                          <input
                            type="text"
                            className="admin-form__input"
                            value={tt.merch_type || ""}
                            onChange={(e) =>
                              updateTicketType(
                                i,
                                "merch_type",
                                e.target.value
                              )
                            }
                            placeholder="e.g. T-Shirt"
                          />
                        </div>
                        <div className="admin-form__field">
                          <label className="admin-form__label">
                            Available Sizes
                          </label>
                          <input
                            type="text"
                            className="admin-form__input"
                            value={(tt.merch_sizes || []).join(", ")}
                            onChange={(e) =>
                              updateTicketType(
                                i,
                                "merch_sizes",
                                e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                              )
                            }
                            placeholder="XS, S, M, L, XL, XXL"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Section: WeeZTix Configuration (legacy) ─── */}
      {event.payment_method === "weeztix" && (
        <>
          <div className="admin-section">
            <h2 className="admin-section__title">WeeZTix Configuration</h2>
            <p
              style={{
                color: "#888",
                fontSize: "0.8rem",
                marginBottom: 16,
              }}
            >
              This event uses WeeZTix for checkout. Configure the external
              ticket IDs below.
            </p>
            <div className="admin-form">
              <div className="admin-form__field">
                <label className="admin-form__label">
                  General Release ID
                </label>
                <input
                  className="admin-form__input"
                  value={settings.ticketId1 || ""}
                  onChange={(e) => updateSetting("ticketId1", e.target.value)}
                  placeholder="WeeZTix ticket UUID"
                />
              </div>
              <div className="admin-form__field">
                <label className="admin-form__label">VIP Ticket ID</label>
                <input
                  className="admin-form__input"
                  value={settings.ticketId2 || ""}
                  onChange={(e) => updateSetting("ticketId2", e.target.value)}
                  placeholder="WeeZTix ticket UUID"
                />
              </div>
              <div className="admin-form__field">
                <label className="admin-form__label">
                  VIP Black + Tee ID
                </label>
                <input
                  className="admin-form__input"
                  value={settings.ticketId3 || ""}
                  onChange={(e) => updateSetting("ticketId3", e.target.value)}
                  placeholder="WeeZTix ticket UUID"
                />
              </div>
            </div>
          </div>

          <div className="admin-section">
            <h2 className="admin-section__title">WeeZTix Ticket Names</h2>
            <div className="admin-form">
              <div className="admin-form__row">
                <div className="admin-form__field">
                  <label className="admin-form__label">Ticket 1 Name</label>
                  <input
                    className="admin-form__input"
                    value={settings.ticketName1 || ""}
                    onChange={(e) =>
                      updateSetting("ticketName1", e.target.value)
                    }
                    placeholder="General Release"
                  />
                </div>
                <div className="admin-form__field">
                  <label className="admin-form__label">
                    Ticket 1 Subtitle
                  </label>
                  <input
                    className="admin-form__input"
                    value={settings.ticketSubtitle1 || ""}
                    onChange={(e) =>
                      updateSetting("ticketSubtitle1", e.target.value)
                    }
                    placeholder="Standard entry"
                  />
                </div>
              </div>
              <div className="admin-form__row">
                <div className="admin-form__field">
                  <label className="admin-form__label">Ticket 2 Name</label>
                  <input
                    className="admin-form__input"
                    value={settings.ticketName2 || ""}
                    onChange={(e) =>
                      updateSetting("ticketName2", e.target.value)
                    }
                    placeholder="VIP Ticket"
                  />
                </div>
                <div className="admin-form__field">
                  <label className="admin-form__label">Ticket 3 Name</label>
                  <input
                    className="admin-form__input"
                    value={settings.ticketName3 || ""}
                    onChange={(e) =>
                      updateSetting("ticketName3", e.target.value)
                    }
                    placeholder="VIP Black + Tee"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="admin-section">
            <h2 className="admin-section__title">Size-Specific Tee IDs</h2>
            <div className="admin-form">
              {["XS", "S", "M", "L", "XL", "XXL"].map((size) => (
                <div className="admin-form__field" key={size}>
                  <label className="admin-form__label">Size {size} ID</label>
                  <input
                    className="admin-form__input"
                    value={
                      (settings as Record<string, string>)[
                        `sizeId${size}`
                      ] || ""
                    }
                    onChange={(e) =>
                      updateSetting(`sizeId${size}`, e.target.value)
                    }
                    placeholder={`WeeZTix ticket ID for size ${size}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="admin-section">
            <h2 className="admin-section__title">Exclusive Tee Images</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 24,
              }}
            >
              <ImageField
                label="Front Image"
                value={settings.teeFront || ""}
                onChange={(v) => updateSetting("teeFront", v)}
              />
              <ImageField
                label="Back Image"
                value={settings.teeBack || ""}
                onChange={(v) => updateSetting("teeBack", v)}
              />
            </div>
          </div>

          {event.theme === "minimal" && (
            <div className="admin-section">
              <h2 className="admin-section__title">
                Minimal Theme Settings
              </h2>
              <div className="admin-form">
                <div className="admin-form__field">
                  <label
                    className="admin-form__label"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={settings.minimalBgEnabled || false}
                      onChange={(e) =>
                        updateSetting("minimalBgEnabled", e.target.checked)
                      }
                    />
                    Enable Background Image
                  </label>
                </div>
                {settings.minimalBgEnabled && (
                  <>
                    <ImageField
                      label="Background Image"
                      value={settings.minimalBgImage || ""}
                      onChange={(v) => updateSetting("minimalBgImage", v)}
                      blurPx={settings.minimalBlurStrength || 0}
                    />
                    <div className="admin-form__field">
                      <label className="admin-form__label">
                        Blur ({settings.minimalBlurStrength || 0}px)
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={settings.minimalBlurStrength || 0}
                        onChange={(e) =>
                          updateSetting(
                            "minimalBlurStrength",
                            parseInt(e.target.value)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div className="admin-form__field">
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
                          updateSetting(
                            "minimalStaticStrength",
                            parseInt(e.target.value)
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="admin-section">
            <h2 className="admin-section__title">Banner Image</h2>
            <ImageField
              label="Hero / Banner Image (Site Settings)"
              value={settings.heroImage || ""}
              onChange={(v) => updateSetting("heroImage", v)}
            />
          </div>
        </>
      )}

      {/* ─── Bottom Save ─── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginTop: 8,
          marginBottom: 40,
        }}
      >
        <button
          className="admin-btn admin-btn--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <a
          href={`/event/${event.slug}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="admin-btn admin-btn--secondary"
        >
          Preview Event
        </a>
        {saveMsg && (
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "0.8rem",
              color:
                saveMsg.includes("Error") || saveMsg.includes("error")
                  ? "#ff0033"
                  : "#4ecb71",
            }}
          >
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
