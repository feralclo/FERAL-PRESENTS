"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Scan,
  Plus,
  Copy,
  Trash2,
  Check,
  Loader2,
  Link2,
  QrCode,
  ChevronDown,
} from "lucide-react";

interface ScannerToken {
  token: string;
  event_id: string;
  event_name: string;
  label: string;
  created_at: string;
  created_by: string;
}

interface Event {
  id: string;
  name: string;
  date_start: string;
  status: string;
}

export default function ScannerAccessPage() {
  const [tokens, setTokens] = useState<ScannerToken[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [label, setLabel] = useState("");

  // Fetch tokens and events
  const fetchData = useCallback(async () => {
    try {
      const [tokensRes, eventsRes] = await Promise.all([
        fetch("/api/scanner/tokens"),
        fetch("/api/events?status=published,live&limit=50"),
      ]);

      if (tokensRes.ok) {
        const json = await tokensRes.json();
        setTokens(json.data || []);
      }
      if (eventsRes.ok) {
        const json = await eventsRes.json();
        setEvents(json.data || []);
      }
    } catch {
      // Silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate scanner link URL
  const getScannerUrl = (token: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/scanner/live/${token}`;
  };

  // Copy link to clipboard
  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(getScannerUrl(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback
    }
  };

  // Create new token
  const handleCreate = async () => {
    if (!selectedEventId) return;
    setCreating(true);

    try {
      const res = await fetch("/api/scanner/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEventId,
          label: label.trim() || undefined,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setTokens((prev) => [...prev, json.data]);
        setShowCreate(false);
        setSelectedEventId("");
        setLabel("");
      }
    } catch {
      // Silent
    }
    setCreating(false);
  };

  // Revoke token
  const handleRevoke = async (token: string) => {
    setRevoking(token);
    try {
      const res = await fetch("/api/scanner/tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        setTokens((prev) => prev.filter((t) => t.token !== token));
      }
    } catch {
      // Silent
    }
    setRevoking(null);
  };

  // Group tokens by event
  const tokensByEvent = tokens.reduce<Record<string, ScannerToken[]>>((acc, t) => {
    if (!acc[t.event_id]) acc[t.event_id] = [];
    acc[t.event_id].push(t);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Scanner Access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate shareable links for door staff to scan tickets. No login required —
          just share the link and they can start scanning on their phone.
        </p>
      </div>

      {/* Create new link */}
      {!showCreate ? (
        <Button
          onClick={() => setShowCreate(true)}
          className="gap-2"
          disabled={events.length === 0}
        >
          <Plus size={14} />
          Generate Scanner Link
        </Button>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-medium text-foreground">New Scanner Link</h3>

          {/* Event selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Event</label>
            <div className="relative">
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2.5 pr-8 text-sm text-foreground outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              >
                <option value="">Select an event...</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </div>

          {/* Optional label */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Label <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='e.g. "Main Door", "VIP Entrance"'
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={handleCreate} disabled={!selectedEventId || creating} className="gap-2">
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              Generate Link
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
                setSelectedEventId("");
                setLabel("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Active scanner links */}
      {tokens.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 py-12 text-center">
          <QrCode size={32} className="mx-auto text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">No scanner links yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Generate a link above to let door staff scan tickets without logging in
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <h2 className="text-sm font-medium text-muted-foreground">
            Active Links ({tokens.length})
          </h2>

          {Object.entries(tokensByEvent).map(([eventId, eventTokens]) => (
            <div key={eventId} className="space-y-2">
              {/* Event header */}
              <div className="flex items-center gap-2">
                <Scan size={13} className="text-primary/70" />
                <span className="text-sm font-medium text-foreground">
                  {eventTokens[0].event_name}
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {eventTokens.length} {eventTokens.length === 1 ? "link" : "links"}
                </span>
              </div>

              {/* Token cards */}
              <div className="space-y-2 pl-5">
                {eventTokens.map((t) => (
                  <div
                    key={t.token}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {t.label && (
                          <span className="text-sm font-medium text-foreground">
                            {t.label}
                          </span>
                        )}
                        <span className="truncate font-mono text-[11px] text-muted-foreground/60">
                          ...{t.token.slice(-8)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/50">
                        Created {new Date(t.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {t.created_by && ` by ${t.created_by}`}
                      </p>
                    </div>

                    {/* Copy link */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => copyLink(t.token)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      title="Copy scanner link"
                    >
                      {copied === t.token ? (
                        <Check size={14} className="text-success" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </Button>

                    {/* Revoke */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRevoke(t.token)}
                      disabled={revoking === t.token}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      title="Revoke scanner link"
                    >
                      {revoking === t.token ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-5">
        <h3 className="text-sm font-medium text-foreground">How it works</h3>
        <ol className="mt-3 space-y-2 text-[13px] text-muted-foreground">
          <li className="flex gap-2">
            <span className="shrink-0 text-primary/60">1.</span>
            Generate a scanner link for your event above
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-primary/60">2.</span>
            Share the link with your door staff via text or WhatsApp
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-primary/60">3.</span>
            They open the link on their phone — no login or app needed
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-primary/60">4.</span>
            Revoke access anytime by deleting the link here
          </li>
        </ol>
      </div>
    </div>
  );
}
