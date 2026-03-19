"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Volume2, VolumeX, Settings, MapPin, Scan, ClipboardList } from "lucide-react";
import { QRScanner } from "@/components/scanner/QRScanner";
import { ScanResult, type ScanStatus } from "@/components/scanner/ScanResult";
import { ManualEntry } from "@/components/scanner/ManualEntry";
import { ScanStats } from "@/components/scanner/ScanStats";
import { ScanHistory, type ScanHistoryEntry } from "@/components/scanner/ScanHistory";
import { GuestListSearch } from "@/components/scanner/GuestListSearch";
import { cn } from "@/lib/utils";

type ViewMode = "scan" | "guest-list";

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
  const router = useRouter();

  const [viewMode, setViewMode] = useState<ViewMode>("scan");
  const [result, setResult] = useState<ScanResultData | null>(null);
  const [scanning, setScanning] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [eventName, setEventName] = useState("");
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scanLocation, setScanLocation] = useState("");
  const [showLocationInput, setShowLocationInput] = useState(false);
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Load preferences from localStorage
  useEffect(() => {
    try {
      const loc = localStorage.getItem("scanner_location");
      if (loc) setScanLocation(loc);
      const sound = localStorage.getItem("scanner_sound");
      if (sound === "false") setSoundEnabled(false);
    } catch {}
  }, []);

  // Fetch event info + stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/scanner/events/${eventId}/stats`);
      if (res.ok) {
        const json = await res.json();
        setStats(json.stats);
      }
    } catch { /* silent */ }
  }, [eventId]);

  useEffect(() => {
    fetchStats();
    (async () => {
      try {
        const res = await fetch("/api/scanner/events");
        if (res.ok) {
          const json = await res.json();
          const event = json.events?.find((e: { id: string }) => e.id === eventId);
          if (event) setEventName(event.name);
        }
      } catch {}
    })();
  }, [eventId, fetchStats]);

  // Poll stats every 30s
  useEffect(() => {
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Play sound effect
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
    } catch { /* audio not available */ }
  }, [soundEnabled]);

  /**
   * Unified scan handler — no mode switching needed:
   *
   * 1. Try entry scan → if valid, approve (show merch size as info, don't collect)
   * 2. If already entered + has uncollected merch → auto-collect merch
   * 3. If merch-only ticket → auto-collect merch
   * 4. If fully done (entered + merch collected) → show "already scanned"
   *
   * Door flow: scan → "Entry Approved — Merch: L" (merch NOT collected yet)
   * Merch desk flow: scan → "Merch Collected — Size L" (auto-collected)
   * Friend's unscanned ticket at merch desk: scan → entry approved, scan again → merch collected
   */
  const handleScan = useCallback(async (code: string) => {
    if (scanning) return;
    setScanning(true);

    // Extract ticket code from URL if a full URL was scanned
    let ticketCode = code;
    try {
      const url = new URL(code);
      const ticketParam = url.searchParams.get("ticket");
      if (ticketParam) ticketCode = ticketParam;
    } catch {
      // Not a URL — use raw code
    }

    try {
      // Step 1: Try entry scan (event_id prevents cross-event scanning)
      const scanRes = await fetch(`/api/tickets/${encodeURIComponent(ticketCode)}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanned_by: "scanner",
          scan_location: scanLocation || undefined,
          event_id: eventId,
        }),
      });
      const scanJson = await scanRes.json();

      if (scanRes.ok && scanJson.success) {
        // Entry approved — show merch size as info but do NOT mark collected.
        // Merch collection happens separately at the merch desk (second scan).
        // This ensures the merch desk can distinguish "not yet handed over"
        // from "already physically collected".
        const hasMerch = !!scanJson.ticket?.merch_size;
        setResult({
          status: "valid",
          message: hasMerch
            ? `Entry Approved — Merch: ${scanJson.ticket.merch_size}`
            : "Entry Approved",
          ticket: scanJson.ticket,
        });
        playFeedback(true);
        addToHistory(ticketCode, "valid",
          hasMerch ? `Entry — Merch: ${scanJson.ticket.merch_size}` : "Entry Approved",
          scanJson.ticket);

      } else if (scanRes.status === 409) {
        // Already scanned for entry — check if they have uncollected merch
        const ticket = scanJson.ticket;
        const hasMerch = !!ticket?.merch_size;

        if (hasMerch) {
          // Try to collect merch automatically
          const merchRes = await fetch(`/api/tickets/${encodeURIComponent(ticketCode)}/merch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collected_by: "scanner", event_id: eventId }),
          });
          const merchJson = await merchRes.json();

          if (merchRes.ok && merchJson.success) {
            // Merch collected successfully
            setResult({
              status: "merch_success",
              message: "Merch Collected!",
              ticket: { ...ticket, merch_size: merchJson.merch_size },
            });
            playFeedback(true);
            addToHistory(ticketCode, "merch_success", `Merch: ${merchJson.merch_size}`, ticket);
          } else if (merchRes.status === 409) {
            // Entry done, merch already collected — fully processed
            setResult({
              status: "already_used",
              message: "Already Scanned & Merch Collected",
              ticket,
              scanned_at: scanJson.scanned_at,
              scanned_by: scanJson.scanned_by,
            });
            playFeedback(false);
            addToHistory(ticketCode, "already_used", "Already Scanned & Merch Collected", ticket);
          } else {
            // Merch collection failed for some reason — show entry-already-scanned
            setResult({
              status: "already_used",
              message: "Already Scanned",
              ticket,
              scanned_at: scanJson.scanned_at,
              scanned_by: scanJson.scanned_by,
            });
            playFeedback(false);
            addToHistory(ticketCode, "already_used", "Already Scanned", ticket);
          }
        } else {
          // No merch — just already scanned
          setResult({
            status: "already_used",
            message: "Already Scanned",
            ticket,
            scanned_at: scanJson.scanned_at,
            scanned_by: scanJson.scanned_by,
          });
          playFeedback(false);
          addToHistory(ticketCode, "already_used", "Already Scanned", ticket);
        }

      } else if (scanJson.status === "merch_only") {
        // Merch-only ticket — auto-collect merch
        const merchRes = await fetch(`/api/tickets/${encodeURIComponent(ticketCode)}/merch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collected_by: "scanner", event_id: eventId }),
        });
        const merchJson = await merchRes.json();

        if (merchRes.ok && merchJson.success) {
          setResult({
            status: "merch_success",
            message: "Merch Collected!",
            ticket: { ...scanJson.ticket, merch_size: merchJson.merch_size },
          });
          playFeedback(true);
          addToHistory(ticketCode, "merch_success", `Merch Only: ${merchJson.merch_size}`, scanJson.ticket);
        } else if (merchRes.status === 409) {
          setResult({
            status: "merch_collected",
            message: "Merch Already Collected",
            ticket: scanJson.ticket,
            collected_at: merchJson.collected_at,
            collected_by: merchJson.collected_by,
          });
          playFeedback(false);
          addToHistory(ticketCode, "merch_collected", "Merch Already Collected", scanJson.ticket);
        } else {
          setResult({
            status: "merch_only",
            message: "Merch Pass — Collection Failed",
            ticket: scanJson.ticket,
          });
          playFeedback(false);
          addToHistory(ticketCode, "merch_only", "Merch Pass — Error", scanJson.ticket);
        }

      } else if (scanJson.status === "wrong_event") {
        // Ticket belongs to a different event
        setResult({
          status: "wrong_event",
          message: "Wrong Event — This ticket is for a different event",
        });
        playFeedback(false);
        addToHistory(ticketCode, "wrong_event", "Wrong Event");
      } else {
        // Invalid ticket
        setResult({
          status: "invalid",
          message: scanJson.error || "Invalid ticket",
        });
        playFeedback(false);
        addToHistory(ticketCode, "invalid", scanJson.error || "Invalid ticket");
      }

      fetchStats();
    } catch {
      setResult({ status: "error", message: "Network error — check connection" });
      playFeedback(false);
      addToHistory(ticketCode, "error", "Network error");
    }

    setScanning(false);
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
  }, [scanning, scanLocation, playFeedback, fetchStats]);

  const addToHistory = (code: string, status: ScanStatus, message: string, ticket?: ScanResultData["ticket"]) => {
    const entry: ScanHistoryEntry = {
      id: `${Date.now()}-${Math.random()}`,
      code,
      status,
      holderName: [ticket?.holder_first_name, ticket?.holder_last_name].filter(Boolean).join(" ") || undefined,
      message,
      timestamp: new Date(),
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  };

  const dismissResult = useCallback(() => {
    setResult(null);
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    (window as { __scannerClearLast?: () => void }).__scannerClearLast?.();
  }, []);

  // Auto-dismiss success after 2s
  useEffect(() => {
    if (!result) return;
    if (result.status === "valid" || result.status === "merch_success") {
      resultTimeoutRef.current = setTimeout(dismissResult, 2000);
      return () => {
        if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      };
    }
  }, [result, dismissResult]);

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

  const hasGuestList = (stats?.guest_list_total ?? 0) > 0;

  return (
    <div className="px-4 py-4 max-w-lg mx-auto min-h-[100dvh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/scanner")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
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

      {/* Stats bar */}
      {stats && <div className="mb-4"><ScanStats mode="entry" stats={stats} /></div>}

      {/* View toggle — only show if event has a guest list */}
      {hasGuestList && (
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/80 backdrop-blur p-1 mb-4">
          <button
            type="button"
            onClick={() => setViewMode("scan")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all flex-1 justify-center",
              viewMode === "scan"
                ? "bg-primary/15 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Scan size={14} />
            Scan
          </button>
          <button
            type="button"
            onClick={() => setViewMode("guest-list")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all flex-1 justify-center",
              viewMode === "guest-list"
                ? "bg-primary/15 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ClipboardList size={14} />
            Guest List
          </button>
        </div>
      )}

      {/* Main content */}
      {viewMode === "guest-list" ? (
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
