"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Volume2, VolumeX, Settings, MapPin, Scan, Package, ClipboardList } from "lucide-react";
import { QRScanner } from "@/components/scanner/QRScanner";
import { ScanResult, type ScanStatus } from "@/components/scanner/ScanResult";
import { ManualEntry } from "@/components/scanner/ManualEntry";
import { ScanStats } from "@/components/scanner/ScanStats";
import { ScanHistory, type ScanHistoryEntry } from "@/components/scanner/ScanHistory";
import { GuestListSearch } from "@/components/scanner/GuestListSearch";
import { cn } from "@/lib/utils";

type ScanMode = "entry" | "merch" | "guest-list";

interface ScanResultData {
  status: ScanStatus;
  message: string;
  ticket?: {
    ticket_code?: string;
    holder_first_name?: string;
    holder_last_name?: string;
    merch_size?: string;
    merch_collected?: boolean;
    ticket_type?: { name?: string };
    event?: { name?: string };
  };
  scanned_at?: string;
  scanned_by?: string;
  collected_at?: string;
  collected_by?: string;
}

interface Stats {
  total_tickets: number;
  scanned: number;
  merch_total: number;
  merch_collected: number;
  guest_list_total: number;
  guest_list_checked_in: number;
}

export default function ScannerEventPage() {
  const { eventId } = useParams<{ eventId: string }>();

  const [mode, setMode] = useState<ScanMode>("entry");
  const [result, setResult] = useState<ScanResultData | null>(null);
  const [scanning, setScanning] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [eventName, setEventName] = useState("");
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scanLocation, setScanLocation] = useState("");
  const [showLocationInput, setShowLocationInput] = useState(false);
  // No auto-dismiss — results stay on screen until staff taps to dismiss

  useEffect(() => {
    try {
      const loc = localStorage.getItem("scanner_location");
      if (loc) setScanLocation(loc);
      const sound = localStorage.getItem("scanner_sound");
      if (sound === "false") setSoundEnabled(false);
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/scanner/events/${eventId}/stats`);
      if (res.ok) {
        const json = await res.json();
        setStats(json.stats);
      }
    } catch {}
  }, [eventId]);

  useEffect(() => {
    // Fetch stats and event name in parallel
    fetchStats();
    // Try to get event name from stats endpoint first (fast, single event)
    // Falls back to localStorage cache from event picker
    try {
      const cached = sessionStorage.getItem(`scanner_event_${eventId}`);
      if (cached) setEventName(cached);
    } catch {}
    (async () => {
      try {
        const res = await fetch(`/api/scanner/events/${eventId}/stats`);
        if (res.ok) {
          const json = await res.json();
          if (json.event_name) {
            setEventName(json.event_name);
            try { sessionStorage.setItem(`scanner_event_${eventId}`, json.event_name); } catch {}
          }
        }
      } catch {}
    })();
  }, [eventId, fetchStats]);

  // Poll stats — only when page is visible (saves battery on mobile)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const playFeedback = useCallback((success: boolean) => {
    if (navigator.vibrate) {
      navigator.vibrate(success ? [200] : [100, 50, 100]);
    }
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      if (success) {
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
      } else {
        oscillator.frequency.setValueAtTime(330, ctx.currentTime);
        oscillator.frequency.setValueAtTime(220, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
      }
    } catch {}
  }, [soundEnabled]);

  /**
   * Mode-aware scan handler. Each mode has ONE job:
   *
   * ENTRY MODE (Door):
   *   - Scan → approve entry. Shows merch size as info, never collects.
   *   - Already scanned → "Already Scanned" (never auto-collects merch)
   *   - Merch-only ticket → "Merch Pass Only — not an entry ticket"
   *
   * MERCH MODE (Merch Desk):
   *   - Scan → collect merch. Doesn't care about entry status.
   *   - No merch → "No merch on this ticket"
   *   - Already collected → "Already Collected"
   *
   * Same QR code can be scanned once in each mode.
   */
  const handleScan = useCallback(async (code: string) => {
    if (scanning) return;
    setScanning(true);

    let ticketCode = code;
    try {
      const url = new URL(code);
      const ticketParam = url.searchParams.get("ticket");
      if (ticketParam) ticketCode = ticketParam;
    } catch {}

    try {
      if (mode === "entry") {
        // ── ENTRY MODE: scan for door entry only ──
        const res = await fetch(`/api/tickets/${encodeURIComponent(ticketCode)}/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scanned_by: "scanner",
            scan_location: scanLocation || undefined,
            event_id: eventId,
          }),
        });
        const json = await res.json();

        if (res.ok && json.success) {
          const hasMerch = !!json.ticket?.merch_size;
          setResult({
            status: "valid",
            message: hasMerch
              ? `Entry Approved — Merch: ${json.ticket.merch_size}`
              : "Entry Approved",
            ticket: json.ticket,
          });
          playFeedback(true);
          addToHistory(ticketCode, "valid",
            hasMerch ? `Entry — Merch: ${json.ticket.merch_size}` : "Entry Approved",
            json.ticket);
        } else if (res.status === 409) {
          setResult({
            status: "already_used",
            message: "Already Scanned",
            ticket: json.ticket,
            scanned_at: json.scanned_at,
            scanned_by: json.scanned_by,
          });
          playFeedback(false);
          addToHistory(ticketCode, "already_used", "Already Scanned", json.ticket);
        } else if (json.status === "merch_only") {
          setResult({
            status: "merch_only",
            message: "Merch Pass Only — Not an entry ticket",
            ticket: json.ticket,
          });
          playFeedback(false);
          addToHistory(ticketCode, "merch_only", "Merch Pass Only", json.ticket);
        } else if (json.status === "wrong_event") {
          setResult({ status: "wrong_event", message: "Wrong Event" });
          playFeedback(false);
          addToHistory(ticketCode, "wrong_event", "Wrong Event");
        } else {
          setResult({ status: "invalid", message: json.error || "Invalid ticket" });
          playFeedback(false);
          addToHistory(ticketCode, "invalid", json.error || "Invalid ticket");
        }

      } else if (mode === "merch") {
        // ── MERCH MODE: collect merch only ──
        const res = await fetch(`/api/tickets/${encodeURIComponent(ticketCode)}/merch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collected_by: "scanner", event_id: eventId }),
        });
        const json = await res.json();

        if (res.ok && json.success) {
          setResult({
            status: "merch_success",
            message: `Merch Collected — ${json.merch_size}`,
            ticket: { ...json.ticket, merch_size: json.merch_size },
          });
          playFeedback(true);
          addToHistory(ticketCode, "merch_success", `Merch: ${json.merch_size}`, json.ticket);
        } else if (res.status === 409) {
          setResult({
            status: "merch_collected",
            message: "Already Collected",
            ticket: { merch_size: json.merch_size },
            collected_at: json.collected_at,
            collected_by: json.collected_by,
          });
          playFeedback(false);
          addToHistory(ticketCode, "merch_collected", "Already Collected");
        } else if (json.error?.includes("not include")) {
          setResult({ status: "no_merch", message: "No Merch on This Ticket" });
          playFeedback(false);
          addToHistory(ticketCode, "no_merch", "No Merch");
        } else if (json.error?.includes("different event")) {
          setResult({ status: "wrong_event", message: "Wrong Event" });
          playFeedback(false);
          addToHistory(ticketCode, "wrong_event", "Wrong Event");
        } else {
          setResult({ status: "invalid", message: json.error || "Invalid ticket" });
          playFeedback(false);
          addToHistory(ticketCode, "invalid", json.error || "Invalid ticket");
        }
      }

      fetchStats();
    } catch {
      setResult({ status: "error", message: "Network error — check connection" });
      playFeedback(false);
      addToHistory(ticketCode, "error", "Network error");
    }

    setScanning(false);
  }, [mode, scanning, scanLocation, eventId, playFeedback, fetchStats]);

  const addToHistory = (code: string, status: ScanStatus, message: string, ticket?: ScanResultData["ticket"]) => {
    setHistory((prev) => [{
      id: `${Date.now()}-${Math.random()}`,
      code,
      status,
      holderName: [ticket?.holder_first_name, ticket?.holder_last_name].filter(Boolean).join(" ") || undefined,
      message,
      timestamp: new Date(),
    }, ...prev].slice(0, 20));
  };

  const dismissResult = useCallback(() => {
    setResult(null);
    (window as { __scannerClearLast?: () => void }).__scannerClearLast?.();
  }, []);

  const saveScanLocation = (loc: string) => {
    setScanLocation(loc);
    try { localStorage.setItem("scanner_location", loc); } catch {}
    setShowLocationInput(false);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try { localStorage.setItem("scanner_sound", String(next)); } catch {}
  };

  const hasMerch = (stats?.merch_total ?? 0) > 0;
  const hasGuestList = (stats?.guest_list_total ?? 0) > 0;

  // Build available modes
  const modes: { key: ScanMode; label: string; icon: typeof Scan }[] = [
    { key: "entry", label: "Entry", icon: Scan },
  ];
  if (hasMerch) modes.push({ key: "merch", label: "Merch", icon: Package });
  if (hasGuestList) modes.push({ key: "guest-list", label: "Guests", icon: ClipboardList });

  return (
    <div className="px-4 py-4 max-w-lg mx-auto min-h-[100dvh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/scanner"
            prefetch={true}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">{eventName || "Event"}</h1>
            {scanLocation && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <MapPin size={8} /> {scanLocation}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleSound}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground transition-colors"
            title={soundEnabled ? "Mute" : "Unmute"}
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
          <button
            type="button"
            onClick={() => setShowLocationInput(!showLocationInput)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground transition-colors"
            title="Scan location"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* Location input */}
      {showLocationInput && (
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={scanLocation}
            onChange={(e) => setScanLocation(e.target.value)}
            placeholder="e.g. Door A, VIP Gate"
            className="flex-1 rounded-lg border border-input bg-background/50 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-primary/50"
            onKeyDown={(e) => { if (e.key === "Enter") saveScanLocation(scanLocation); }}
          />
          <button
            type="button"
            onClick={() => saveScanLocation(scanLocation)}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white"
          >
            Save
          </button>
        </div>
      )}

      {/* Stats bar — contextual to mode */}
      {stats && (
        <div className="mb-4">
          <ScanStats mode={mode === "guest-list" ? "guest-list" : mode} stats={stats} />
        </div>
      )}

      {/* Mode toggle */}
      {modes.length > 1 && (
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/80 backdrop-blur p-1 mb-4">
          {modes.map((m) => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setMode(m.key);
                  setResult(null);
                  // Clear QR debounce so the same code can be scanned in the new mode
                  (window as { __scannerClearLast?: () => void }).__scannerClearLast?.();
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all flex-1 justify-center",
                  active
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon size={14} />
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Main content */}
      {mode === "guest-list" ? (
        <GuestListSearch eventId={eventId} onCheckIn={fetchStats} />
      ) : (
        <div className="flex-1 flex flex-col gap-4">
          <QRScanner onScan={handleScan} active={!result} />
          <ManualEntry onSubmit={handleScan} loading={scanning} />
          {history.length > 0 && (
            <div className="mt-2">
              <ScanHistory entries={history} />
            </div>
          )}
        </div>
      )}

      {/* Result overlay */}
      {result && (
        <ScanResult
          status={result.status}
          message={result.message}
          ticket={result.ticket}
          scanned_at={result.scanned_at}
          scanned_by={result.scanned_by}
          collected_at={result.collected_at}
          collected_by={result.collected_by}
          onDismiss={dismissResult}
        />
      )}
    </div>
  );
}
