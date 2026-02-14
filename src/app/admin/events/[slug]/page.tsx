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
  draft: "#FBBF24",
  live: "#34D399",
  past: "#888",
  cancelled: "#8B5CF6",
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
                border: "1px solid #1e1e2a",
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
                  color: "#8888a0",
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
        <div style={{ color: "#8B5CF6", fontSize: "0.7rem", marginBottom: 8 }}>
          {uploadError}
        </div>
      )}

      <div
        style={{
          border: `2px dashed ${dragging ? "#8B5CF6" : "#333"}`,
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
        <span style={{ fontSize: 12, color: "#8888a0" }}>
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
          border: "1px solid #1e1e2a",
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
              background: "#111117",
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
                color: "#8B5CF6",
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
      <span style={{ fontSize: "0.7rem", color: "#55557a", marginTop: 4, display: "block" }}>
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
  const [expandedTickets, setExpandedTickets] = useState<Set<string>>(new Set());
  const [dragItem, setDragItem] = useState<{ type: "group" | "ticket"; id: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

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
      return prev.filter((_, i) => i !== index).map((tt2, i2) => ({ ...tt2, sort_order: i2 }));
    });
  }, []);

  const moveTicketType = useCallback((index: number, direction: "up" | "down") => {
    setTicketTypes((prev) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((tt, i) => ({ ...tt, sort_order: i }));
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedTickets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const moveGroup = useCallback((groupName: string, direction: "up" | "down") => {
    const groups = [...((settings.ticket_groups as string[]) || [])];
    const idx = groups.indexOf(groupName);
    if (idx === -1) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= groups.length) return;
    [groups[idx], groups[target]] = [groups[target], groups[idx]];
    updateSetting("ticket_groups", groups);
  }, [settings, updateSetting]);

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

          // Always include ticket group config in settings
          const groupData = {
            ticket_groups: settings.ticket_groups || [],
            ticket_group_map: settings.ticket_group_map || {},
          };

          const dataToSave = event.payment_method === "weeztix"
            ? { ...settings, ...groupData }
            : {
                theme: event.theme || "default",
                minimalBlurStrength: settings.minimalBlurStrength ?? 4,
                minimalStaticStrength: settings.minimalStaticStrength ?? 5,
                minimalBgEnabled: !!(event.hero_image || event.cover_image),
                ...groupData,
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
          ticket_types: ticketTypes.map((tt) => ({
            ...(tt.id ? { id: tt.id } : {}),
            name: tt.name,
            description: tt.description || null,
            price: Number(tt.price),
            capacity: tt.capacity ? Number(tt.capacity) : null,
            status: tt.status,
            sort_order: tt.sort_order,
            includes_merch: tt.includes_merch,
            merch_name: tt.merch_name || null,
            merch_type: tt.merch_type || null,
            merch_sizes: tt.merch_sizes || null,
            merch_description: tt.merch_description || null,
            merch_images: tt.merch_images || null,
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
            color: "#8B5CF6",
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
            <span style={{ color: "#6666a0", fontSize: "0.75rem" }}>
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
            border: "1px solid #8B5CF644",
            padding: "16px 20px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <span style={{ color: "#8B5CF6", fontSize: "0.8rem" }}>
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
                style={{ fontSize: "0.7rem", color: "#55557a", marginTop: 2 }}
              >
                nocturne.events/event/{event.slug}/
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

      {/* ─── Section: Page Content ─── */}
      <div className="admin-section">
        <h2 className="admin-section__title">Page Content</h2>
        <p style={{ color: "#8888a0", fontSize: "0.8rem", marginBottom: 16 }}>
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
                <span style={{ fontSize: "0.7rem", color: "#55557a", marginTop: 2 }}>
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
                <span style={{ fontSize: "0.7rem", color: "#55557a", marginTop: 2 }}>
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
            <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(52, 211, 153, 0.04)", border: "1px solid rgba(52, 211, 153, 0.1)" }}>
              <span style={{ fontSize: 12, color: "#8888a0" }}>
                Payments are handled automatically via your{" "}
                <Link href="/admin/payments/" style={{ color: "#8B5CF6" }}>
                  Payment Settings
                </Link>
                . Make sure your payment setup is complete before going live.
              </span>
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
            <span style={{ fontSize: "0.65rem", color: "#55557a", display: "block", marginTop: -8 }}>
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
            <span style={{ fontSize: "0.65rem", color: "#55557a", display: "block", marginTop: -8 }}>
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


      {/* ─── Section: Ticket Layout ─── */}
      <div className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section__title" style={{ marginBottom: 0 }}>
            Ticket Layout
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            {isNativeCheckout && (
              <button
                className="admin-btn admin-btn--primary"
                onClick={addTicketType}
                style={{ fontSize: "0.7rem", padding: "8px 16px" }}
              >
                + Add Ticket
              </button>
            )}
            {!isNativeCheckout && (
              <span style={{ color: "#55557a", fontSize: "0.6rem", fontFamily: "'Space Mono', monospace", alignSelf: "center" }}>
                WeeZTix: 4 fixed slots
              </span>
            )}
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => {
                const name = prompt("Enter group name:");
                if (!name?.trim()) return;
                const trimmed = name.trim();
                const existing = (settings.ticket_groups as string[]) || [];
                if (!existing.includes(trimmed)) {
                  updateSetting("ticket_groups", [...existing, trimmed]);
                }
              }}
              style={{ fontSize: "0.7rem", padding: "8px 16px" }}
            >
              + Create Group
            </button>
          </div>
        </div>
        <p style={{ color: "#6666a0", fontSize: "0.7rem", marginTop: 8, marginBottom: 20 }}>
          This mirrors your event page. Ungrouped tickets appear first, then each group in order.
          Click a ticket to expand and edit its settings.
        </p>

        {(() => {
          const allGroups = (settings.ticket_groups as string[]) || [];
          const groupMap = (settings.ticket_group_map as Record<string, string | null>) || {};

          const arrowBtn = (enabled: boolean): React.CSSProperties => ({
            width: 22, height: 14, padding: 0, border: "1px solid #1e1e2a",
            background: enabled ? "#111117" : "#0a0a0a",
            color: enabled ? "#aaa" : "#333",
            cursor: enabled ? "pointer" : "default",
            fontSize: "0.55rem",
            display: "flex", alignItems: "center", justifyContent: "center",
          });

          const handleEditGroup = (gName: string) => {
            const action = prompt(`Group: "${gName}"\nType a new name to rename, or type DELETE to remove:`);
            if (!action) return;
            const gList = (settings.ticket_groups as string[]) || [];
            const gm = { ...groupMap };
            if (action === "DELETE") {
              updateSetting("ticket_groups", gList.filter((x) => x !== gName));
              for (const k of Object.keys(gm)) { if (gm[k] === gName) gm[k] = null; }
              updateSetting("ticket_group_map", gm);
            } else {
              const t = action.trim();
              if (!t) return;
              updateSetting("ticket_groups", gList.map((x) => x === gName ? t : x));
              for (const k of Object.keys(gm)) { if (gm[k] === gName) gm[k] = t; }
              updateSetting("ticket_group_map", gm);
            }
          };

          const assignToGroup = (ticketId: string, val: string) => {
            if (val === "__new__") {
              const name = prompt("Enter new group name:");
              if (!name?.trim()) return;
              const trimmed = name.trim();
              const existing = (settings.ticket_groups as string[]) || [];
              if (!existing.includes(trimmed)) updateSetting("ticket_groups", [...existing, trimmed]);
              updateSetting("ticket_group_map", { ...groupMap, [ticketId]: trimmed });
            } else {
              updateSetting("ticket_group_map", { ...groupMap, [ticketId]: val || null });
            }
          };

          /* ── Group container ── */
          const renderGroup = (
            gName: string | null, gIdx: number, total: number,
            children: React.ReactNode, count: number,
          ) => (
            <div
              key={gName || "__ungrouped"}
              style={{
                marginBottom: 16,
                border: gName ? `1px solid ${dragOver === `group:${gName}` ? "#8B5CF6" : "#1e1e2a"}` : "none",
                background: gName ? "#08080c" : "transparent",
                transition: "border-color 0.15s",
              }}
              onDragOver={gName ? (e) => {
                e.preventDefault();
                if (dragItem?.type === "group" && dragItem.id !== gName) {
                  setDragOver(`group:${gName}`);
                }
              } : undefined}
              onDragLeave={gName ? () => setDragOver(null) : undefined}
              onDrop={gName ? (e) => {
                e.preventDefault();
                setDragOver(null);
                if (dragItem?.type === "group" && dragItem.id !== gName) {
                  // Reorder: move dragged group to this group's position
                  const groups = [...allGroups];
                  const fromIdx = groups.indexOf(dragItem.id);
                  const toIdx = groups.indexOf(gName);
                  if (fromIdx !== -1 && toIdx !== -1) {
                    groups.splice(fromIdx, 1);
                    groups.splice(toIdx, 0, dragItem.id);
                    updateSetting("ticket_groups", groups);
                  }
                }
                setDragItem(null);
              } : undefined}
            >
              {gName ? (
                <div
                  draggable
                  onDragStart={(e) => {
                    setDragItem({ type: "group", id: gName });
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", gName);
                  }}
                  onDragEnd={() => { setDragItem(null); setDragOver(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", background: "#141414", borderBottom: "1px solid #1e1e2a",
                    cursor: "grab",
                  }}>
                  <span style={{ color: "#444", fontSize: "1rem", cursor: "grab", userSelect: "none" }} title="Drag to reorder">&#x2807;</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button type="button" onClick={() => moveGroup(gName, "up")} disabled={gIdx === 0} style={arrowBtn(gIdx > 0)}>&#9650;</button>
                    <button type="button" onClick={() => moveGroup(gName, "down")} disabled={gIdx === total - 1} style={arrowBtn(gIdx < total - 1)}>&#9660;</button>
                  </div>
                  <span style={{
                    flex: 1, fontFamily: "'Space Mono', monospace", fontSize: "0.8rem",
                    color: "#fff", textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>{gName}</span>
                  <span style={{ color: "#55557a", fontSize: "0.6rem", fontFamily: "'Space Mono', monospace" }}>
                    {count} ticket{count !== 1 ? "s" : ""}
                  </span>
                  <button type="button" onClick={() => handleEditGroup(gName)} style={{
                    background: "none", border: "1px solid #1e1e2a", color: "#8888a0",
                    fontSize: "0.6rem", padding: "4px 10px", cursor: "pointer",
                    fontFamily: "'Space Mono', monospace",
                  }}>&#9998; Edit</button>
                </div>
              ) : (
                <div style={{ padding: "0 0 6px", marginBottom: 4 }}>
                  <span style={{
                    fontFamily: "'Space Mono', monospace", fontSize: "0.65rem",
                    color: "#55557a", textTransform: "uppercase", letterSpacing: "0.1em",
                  }}>UNGROUPED</span>
                </div>
              )}
              <div style={{ padding: gName ? "8px" : "0", display: "flex", flexDirection: "column", gap: 4 }}>
                {children}
              </div>
            </div>
          );

          /* ──────── STRIPE / TEST EVENTS ──────── */
          if (isNativeCheckout) {
            const ungrouped = ticketTypes.filter((tt) => !groupMap[tt.id]);
            const sections: React.ReactNode[] = [];

            const renderStripeCard = (tt: TicketTypeRow, i: number, canUp: boolean, canDown: boolean) => {
              const isExp = expandedTickets.has(tt.id || `new-${i}`);
              const tierLabel = tt.tier || "standard";
              const cardId = tt.id || `new-${i}`;
              return (
                <div
                  key={cardId}
                  draggable
                  onDragStart={(e) => {
                    setDragItem({ type: "ticket", id: cardId });
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", cardId);
                  }}
                  onDragEnd={() => { setDragItem(null); setDragOver(null); }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragItem?.type === "ticket" && dragItem.id !== cardId) {
                      setDragOver(`ticket:${cardId}`);
                    }
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOver(null);
                    if (dragItem?.type === "ticket" && dragItem.id !== cardId) {
                      const fromIdx = ticketTypes.findIndex((t) => (t.id || `new-${ticketTypes.indexOf(t)}`) === dragItem.id);
                      const toIdx = i;
                      if (fromIdx !== -1 && fromIdx !== toIdx) {
                        setTicketTypes((prev) => {
                          const next = [...prev];
                          const [moved] = next.splice(fromIdx, 1);
                          next.splice(toIdx, 0, moved);
                          return next.map((t, idx) => ({ ...t, sort_order: idx }));
                        });
                      }
                    }
                    setDragItem(null);
                  }}
                  style={{
                    border: `1px solid ${dragOver === `ticket:${cardId}` ? "#8B5CF6" : "#222"}`,
                    background: "#111",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", userSelect: "none" }}
                    onClick={() => toggleExpanded(cardId)}
                  >
                    <span style={{ color: "#444", fontSize: "0.9rem", cursor: "grab", userSelect: "none" }} onClick={(e) => e.stopPropagation()} title="Drag to reorder">&#x2807;</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => moveTicketType(i, "up")} disabled={!canUp} style={arrowBtn(canUp)}>&#9650;</button>
                      <button type="button" onClick={() => moveTicketType(i, "down")} disabled={!canDown} style={arrowBtn(canDown)}>&#9660;</button>
                    </div>
                    <span style={{ flex: 1, fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", color: "#fff" }}>
                      {tt.name || "Untitled"}
                    </span>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#8888a0" }}>
                      {currSym}{Number(tt.price).toFixed(2)}
                    </span>
                    <span style={{
                      fontSize: "0.55rem", fontFamily: "'Space Mono', monospace", textTransform: "uppercase",
                      padding: "2px 8px", border: "1px solid #1e1e2a", color: "#6666a0",
                    }}>{tierLabel}</span>
                    {tt.sold > 0 && (
                      <span style={{ color: "#34D399", fontSize: "0.65rem", fontFamily: "'Space Mono', monospace" }}>{tt.sold} sold</span>
                    )}
                    <span style={{ color: "#55557a", fontSize: "0.7rem" }}>{isExp ? "\u25BE" : "\u25B8"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "12px 14px", borderTop: "1px solid #111117" }}>
                      <div className="admin-form">
                        <div className="admin-form__row">
                          <div className="admin-form__field">
                            <label className="admin-form__label">Name *</label>
                            <input type="text" className="admin-form__input" value={tt.name} onChange={(e) => updateTicketType(i, "name", e.target.value)} placeholder="e.g. General Admission" />
                          </div>
                          <div className="admin-form__field">
                            <label className="admin-form__label">Status</label>
                            <select className="admin-form__input" value={tt.status} onChange={(e) => updateTicketType(i, "status", e.target.value)}>
                              <option value="active">Active</option>
                              <option value="hidden">Hidden</option>
                              <option value="sold_out">Sold Out</option>
                              <option value="archived">Archived</option>
                            </select>
                          </div>
                        </div>
                        <div className="admin-form__field">
                          <label className="admin-form__label">Description</label>
                          <input type="text" className="admin-form__input" value={tt.description || ""} onChange={(e) => updateTicketType(i, "description", e.target.value)} placeholder="Brief description of this ticket tier" />
                        </div>
                        <div className="admin-form__field">
                          <label className="admin-form__label">Ticket Design Tier</label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                            {([
                              { id: "standard", label: "Standard", desc: "Default clean style", bg: "#111", border: "#8B5CF6", color: "#fff" },
                              { id: "platinum", label: "Platinum", desc: "Silver/VIP shimmer", bg: "linear-gradient(135deg, #1e1e2a 0%, #111117 100%)", border: "#e5e4e2", color: "#e5e4e2" },
                              { id: "black", label: "Black", desc: "Dark obsidian premium", bg: "linear-gradient(135deg, #0a0a0a 0%, #111117 100%)", border: "rgba(255,255,255,0.5)", color: "#fff" },
                              { id: "valentine", label: "Valentine", desc: "Pink-red with hearts", bg: "linear-gradient(135deg, #2a0a14 0%, #1f0810 100%)", border: "#e8365d", color: "#ff7eb3" },
                            ] as const).map((tier) => (
                              <button key={tier.id} type="button" onClick={() => updateTicketType(i, "tier", tier.id)} style={{
                                padding: "10px 8px", border: (tt.tier || "standard") === tier.id ? `2px solid ${tier.border}` : "1px solid #333",
                                background: tier.bg, color: tier.color, fontSize: "0.7rem", fontFamily: "'Space Mono', monospace",
                                textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", textAlign: "center",
                              }}>
                                {tier.id === "valentine" ? `\u2665 ${tier.label}` : tier.label}
                                <span style={{ display: "block", fontSize: "0.55rem", color: tier.color, opacity: 0.6, marginTop: 2 }}>{tier.desc}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="admin-form__field">
                          <label className="admin-form__label">Group</label>
                          <select className="admin-form__input" value={groupMap[tt.id] || ""} onChange={(e) => assignToGroup(tt.id, e.target.value)}>
                            <option value="">(No group)</option>
                            {allGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                            <option value="__new__">+ Create new group...</option>
                          </select>
                        </div>
                        <div className="admin-form__row">
                          <div className="admin-form__field">
                            <label className="admin-form__label">Price ({currSym})</label>
                            <input type="number" className="admin-form__input" value={tt.price} onChange={(e) => updateTicketType(i, "price", Number(e.target.value))} min="0" step="0.01" />
                          </div>
                          <div className="admin-form__field">
                            <label className="admin-form__label">Capacity</label>
                            <input type="number" className="admin-form__input" value={tt.capacity ?? ""} onChange={(e) => updateTicketType(i, "capacity", e.target.value ? Number(e.target.value) : null)} placeholder="Unlimited" min="0" />
                          </div>
                        </div>
                        <div className="admin-form__row">
                          <div className="admin-form__field">
                            <label className="admin-form__label">Min per Order</label>
                            <input type="number" className="admin-form__input" value={tt.min_per_order} onChange={(e) => updateTicketType(i, "min_per_order", Number(e.target.value))} min="1" />
                          </div>
                          <div className="admin-form__field">
                            <label className="admin-form__label">Max per Order</label>
                            <input type="number" className="admin-form__input" value={tt.max_per_order} onChange={(e) => updateTicketType(i, "max_per_order", Number(e.target.value))} min="1" />
                          </div>
                        </div>
                        <div className="admin-form__row">
                          <div className="admin-form__field">
                            <label className="admin-form__label">Sale Start</label>
                            <input type="datetime-local" className="admin-form__input" value={toDatetimeLocal(tt.sale_start)} onChange={(e) => updateTicketType(i, "sale_start", fromDatetimeLocal(e.target.value))} />
                          </div>
                          <div className="admin-form__field">
                            <label className="admin-form__label">Sale End</label>
                            <input type="datetime-local" className="admin-form__input" value={toDatetimeLocal(tt.sale_end)} onChange={(e) => updateTicketType(i, "sale_end", fromDatetimeLocal(e.target.value))} />
                          </div>
                        </div>
                        <div className="admin-form__field">
                          <label className="admin-form__label" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                            <input type="checkbox" checked={tt.includes_merch} onChange={(e) => updateTicketType(i, "includes_merch", e.target.checked)} />
                            Includes Merchandise
                          </label>
                        </div>
                        {tt.includes_merch && (
                          <>
                            <div className="admin-form__field">
                              <label className="admin-form__label">Merch Name</label>
                              <input type="text" className="admin-form__input" value={tt.merch_name || ""} onChange={(e) => updateTicketType(i, "merch_name", e.target.value)} placeholder="e.g. FERAL x Liverpool Drop Tee" />
                            </div>
                            <div className="admin-form__row">
                              <div className="admin-form__field">
                                <label className="admin-form__label">Merch Type</label>
                                <input type="text" className="admin-form__input" value={tt.merch_type || ""} onChange={(e) => updateTicketType(i, "merch_type", e.target.value)} placeholder="e.g. T-Shirt" />
                              </div>
                              <div className="admin-form__field">
                                <label className="admin-form__label">Available Sizes</label>
                                <input type="text" className="admin-form__input" value={(tt.merch_sizes || []).join(", ")} onChange={(e) => updateTicketType(i, "merch_sizes", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="XS, S, M, L, XL, XXL" />
                              </div>
                            </div>
                            <div className="admin-form__field">
                              <label className="admin-form__label">Merch Description</label>
                              <textarea className="admin-form__input" rows={3} value={tt.merch_description || ""} onChange={(e) => updateTicketType(i, "merch_description", e.target.value)} placeholder="One-time drop. Never again..." />
                            </div>
                            <div className="admin-form__row">
                              <div className="admin-form__field">
                                <ImageField label="Merch Image — Front" value={(tt.merch_images as { front?: string; back?: string } | undefined)?.front || ""} onChange={(v) => updateTicketType(i, "merch_images", { ...((tt.merch_images as Record<string, string>) || {}), front: v })} uploadKey={`merch_${tt.id || `new-${i}`}_front`} />
                              </div>
                              <div className="admin-form__field">
                                <ImageField label="Merch Image — Back" value={(tt.merch_images as { front?: string; back?: string } | undefined)?.back || ""} onChange={(v) => updateTicketType(i, "merch_images", { ...((tt.merch_images as Record<string, string>) || {}), back: v })} uploadKey={`merch_${tt.id || `new-${i}`}_back`} />
                              </div>
                            </div>
                          </>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                          <button
                            className="admin-btn admin-btn--danger"
                            style={{ fontSize: "0.65rem", padding: "6px 14px" }}
                            onClick={() => {
                              if (tt.sold > 0) {
                                if (!confirm(`This ticket type has ${tt.sold} sales. Are you sure?`)) return;
                              }
                              removeTicketType(i);
                            }}
                          >Delete Ticket</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            };

            if (ungrouped.length > 0) {
              sections.push(renderGroup(null, -1, 0,
                ungrouped.map((tt) => {
                  const i = ticketTypes.indexOf(tt);
                  return renderStripeCard(tt, i, i > 0, i < ticketTypes.length - 1);
                }), ungrouped.length));
            }

            allGroups.forEach((gName, gi) => {
              const gTickets = ticketTypes.filter((tt) => groupMap[tt.id] === gName);
              sections.push(renderGroup(gName, gi, allGroups.length,
                gTickets.length > 0
                  ? gTickets.map((tt) => {
                      const i = ticketTypes.indexOf(tt);
                      return renderStripeCard(tt, i, i > 0, i < ticketTypes.length - 1);
                    })
                  : <p style={{ color: "#55557a", fontSize: "0.7rem", padding: "8px 0", textAlign: "center" }}>
                      No tickets in this group yet. Assign tickets from their expanded settings.
                    </p>,
                gTickets.length));
            });

            if (sections.length === 0 && ticketTypes.length === 0) {
              sections.push(
                <p key="empty" style={{ color: "#8888a0", fontSize: "0.85rem" }}>
                  No ticket types yet. Add your first ticket type to start selling.
                </p>
              );
            }

            return sections;
          }

          /* ──────── WEEZTIX EVENTS ──────── */
          const SLOTS = [
            { key: "general", num: 1, defaultName: "General Release", defaultSubtitle: "Standard entry", defaultPrice: 26.46, tier: "standard" as const },
            { key: "vip", num: 2, defaultName: "VIP Ticket", defaultSubtitle: "VIP entry", defaultPrice: 35.00, tier: "platinum" as const },
            { key: "vip-tee", num: 3, defaultName: "VIP Black + Tee", defaultSubtitle: "VIP + exclusive tee", defaultPrice: 65.00, tier: "black" as const },
            { key: "valentine", num: 4, defaultName: "Valentine\u2019s Special", defaultSubtitle: "Valentine\u2019s entry + perks", defaultPrice: 35.00, tier: "valentine" as const },
          ];

          const wOrder = (settings.weeztixTicketOrder as string[]) || SLOTS.map((s) => s.key);
          const sortedSlots = [...SLOTS].sort((a, b) => {
            const ai = wOrder.indexOf(a.key);
            const bi = wOrder.indexOf(b.key);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          });

          const getSlotGroup = (key: string): string | null => {
            if (groupMap[key] !== undefined) return groupMap[key];
            if (key === "vip" || key === "vip-tee") return "VIP Experiences";
            return null;
          };

          const moveSlot = (slotKey: string, dir: "up" | "down") => {
            const cur = sortedSlots.map((s) => s.key);
            const idx = cur.indexOf(slotKey);
            if (idx === -1) return;
            const target = dir === "up" ? idx - 1 : idx + 1;
            if (target < 0 || target >= cur.length) return;
            [cur[idx], cur[target]] = [cur[target], cur[idx]];
            updateSetting("weeztixTicketOrder", cur);
          };

          const TIER_STYLE: Record<string, { border: string; color: string }> = {
            standard: { border: "#333", color: "#6666a0" },
            platinum: { border: "#e5e4e2", color: "#e5e4e2" },
            black: { border: "rgba(255,255,255,0.3)", color: "#aaa" },
            valentine: { border: "#e8365d", color: "#ff7eb3" },
          };

          const TIER_OPTIONS = [
            { id: "standard", label: "Standard", desc: "Default clean style", bg: "#111", border: "#8B5CF6", color: "#fff" },
            { id: "platinum", label: "Platinum", desc: "Silver/VIP shimmer", bg: "linear-gradient(135deg, #1e1e2a 0%, #111117 100%)", border: "#e5e4e2", color: "#e5e4e2" },
            { id: "black", label: "Black", desc: "Dark obsidian premium", bg: "linear-gradient(135deg, #0a0a0a 0%, #111117 100%)", border: "rgba(255,255,255,0.5)", color: "#fff" },
            { id: "valentine", label: "Valentine", desc: "Pink-red with hearts", bg: "linear-gradient(135deg, #2a0a14 0%, #1f0810 100%)", border: "#e8365d", color: "#ff7eb3" },
          ] as const;

          const renderWeeztixCard = (slot: typeof SLOTS[0], canUp: boolean, canDown: boolean) => {
            const isExp = expandedTickets.has(slot.key);
            const name = (settings[`ticketName${slot.num}` as keyof typeof settings] as string) || slot.defaultName;
            const subtitle = (settings[`ticketSubtitle${slot.num}` as keyof typeof settings] as string) || slot.defaultSubtitle;
            const price = (settings[`ticketPrice${slot.num}` as keyof typeof settings] as number) ?? slot.defaultPrice;
            const ticketId = (settings[`ticketId${slot.num}` as keyof typeof settings] as string) || "";
            const currentTier = (settings[`ticketTier${slot.num}` as keyof typeof settings] as string) || slot.tier;
            const ts = TIER_STYLE[currentTier] || TIER_STYLE.standard;

            return (
              <div
                key={slot.key}
                draggable
                onDragStart={(e) => {
                  setDragItem({ type: "ticket", id: slot.key });
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", slot.key);
                }}
                onDragEnd={() => { setDragItem(null); setDragOver(null); }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragItem?.type === "ticket" && dragItem.id !== slot.key) {
                    setDragOver(`ticket:${slot.key}`);
                  }
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(null);
                  if (dragItem?.type === "ticket" && dragItem.id !== slot.key) {
                    // Reorder weeztix slots via drag
                    const cur = sortedSlots.map((s) => s.key);
                    const fromIdx = cur.indexOf(dragItem.id);
                    const toIdx = cur.indexOf(slot.key);
                    if (fromIdx !== -1 && toIdx !== -1) {
                      cur.splice(fromIdx, 1);
                      cur.splice(toIdx, 0, dragItem.id);
                      updateSetting("weeztixTicketOrder", cur);
                    }
                  }
                  setDragItem(null);
                }}
                style={{
                  border: `1px solid ${dragOver === `ticket:${slot.key}` ? "#8B5CF6" : "#222"}`,
                  background: "#111",
                  transition: "border-color 0.15s",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", userSelect: "none" }}
                  onClick={() => toggleExpanded(slot.key)}
                >
                  <span style={{ color: "#444", fontSize: "0.9rem", cursor: "grab", userSelect: "none" }} onClick={(e) => e.stopPropagation()} title="Drag to reorder">&#x2807;</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => moveSlot(slot.key, "up")} disabled={!canUp} style={arrowBtn(canUp)}>&#9650;</button>
                    <button type="button" onClick={() => moveSlot(slot.key, "down")} disabled={!canDown} style={arrowBtn(canDown)}>&#9660;</button>
                  </div>
                  <span style={{ flex: 1, fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", color: "#fff" }}>{name}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#8888a0" }}>{currSym}{Number(price).toFixed(2)}</span>
                  <span style={{
                    fontSize: "0.55rem", fontFamily: "'Space Mono', monospace", textTransform: "uppercase",
                    padding: "2px 8px", border: `1px solid ${ts.border}`, color: ts.color,
                  }}>{currentTier === "valentine" ? "\u2665 " : ""}{currentTier}</span>
                  <span style={{ color: "#55557a", fontSize: "0.7rem" }}>{isExp ? "\u25BE" : "\u25B8"}</span>
                </div>
                {isExp && (
                  <div style={{ padding: "12px 14px", borderTop: "1px solid #111117" }}>
                    <div className="admin-form">
                      <div className="admin-form__row">
                        <div className="admin-form__field">
                          <label className="admin-form__label">Name</label>
                          <input className="admin-form__input" value={name} onChange={(e) => updateSetting(`ticketName${slot.num}`, e.target.value)} placeholder={slot.defaultName} />
                        </div>
                        <div className="admin-form__field">
                          <label className="admin-form__label">Subtitle</label>
                          <input className="admin-form__input" value={subtitle} onChange={(e) => updateSetting(`ticketSubtitle${slot.num}`, e.target.value)} placeholder={slot.defaultSubtitle} />
                        </div>
                      </div>
                      <div className="admin-form__row">
                        <div className="admin-form__field">
                          <label className="admin-form__label">Display Price ({currSym})</label>
                          <input type="number" className="admin-form__input" value={price} onChange={(e) => updateSetting(`ticketPrice${slot.num}`, Number(e.target.value))} min="0" step="0.01" />
                        </div>
                        <div className="admin-form__field">
                          <label className="admin-form__label">WeeZTix ID</label>
                          <input className="admin-form__input" value={ticketId} onChange={(e) => updateSetting(`ticketId${slot.num}`, e.target.value)} placeholder="WeeZTix ticket UUID" style={{ fontSize: "0.7rem" }} />
                        </div>
                      </div>
                      <div className="admin-form__field">
                        <label className="admin-form__label">Ticket Design Tier</label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                          {TIER_OPTIONS.map((tier) => (
                            <button key={tier.id} type="button" onClick={() => updateSetting(`ticketTier${slot.num}`, tier.id)} style={{
                              padding: "10px 8px", border: currentTier === tier.id ? `2px solid ${tier.border}` : "1px solid #333",
                              background: tier.bg, color: tier.color, fontSize: "0.7rem", fontFamily: "'Space Mono', monospace",
                              textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", textAlign: "center",
                            }}>
                              {tier.id === "valentine" ? `\u2665 ${tier.label}` : tier.label}
                              <span style={{ display: "block", fontSize: "0.55rem", color: tier.color, opacity: 0.6, marginTop: 2 }}>{tier.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="admin-form__field">
                        <label className="admin-form__label">Group</label>
                        <select className="admin-form__input" value={getSlotGroup(slot.key) || ""} onChange={(e) => assignToGroup(slot.key, e.target.value)}>
                          <option value="">(No group)</option>
                          {allGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                          <option value="__new__">+ Create new group...</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          };

          const visibleSlots = sortedSlots;
          const wUngrouped = visibleSlots.filter((s) => !getSlotGroup(s.key));
          const wSections: React.ReactNode[] = [];

          if (wUngrouped.length > 0) {
            wSections.push(renderGroup(null, -1, 0,
              wUngrouped.map((s, idx) => renderWeeztixCard(s, idx > 0, idx < wUngrouped.length - 1)),
              wUngrouped.length));
          }

          allGroups.forEach((gName, gi) => {
            const gSlots = visibleSlots.filter((s) => getSlotGroup(s.key) === gName);
            wSections.push(renderGroup(gName, gi, allGroups.length,
              gSlots.length > 0
                ? gSlots.map((s, idx) => renderWeeztixCard(s, idx > 0, idx < gSlots.length - 1))
                : <p style={{ color: "#55557a", fontSize: "0.7rem", padding: "8px 0", textAlign: "center" }}>No tickets in this group yet.</p>,
              gSlots.length));
          });

          if (wSections.length === 0) {
            wSections.push(
              <p key="empty" style={{ color: "#8888a0", fontSize: "0.85rem" }}>
                Configure ticket IDs to see tickets here.
              </p>
            );
          }

          return wSections;
        })()}
      </div>

      {event.payment_method === "weeztix" && (
        <>
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
                  ? "#8B5CF6"
                  : "#34D399",
            }}
          >
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
