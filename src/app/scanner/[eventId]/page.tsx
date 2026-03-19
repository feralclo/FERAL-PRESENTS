"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Volume2, VolumeX, Settings, MapPin } from "lucide-react";
import { QRScanner } from "@/components/scanner/QRScanner";
import { ScanResult, type ScanStatus } from "@/components/scanner/ScanResult";
import { ManualEntry } from "@/components/scanner/ManualEntry";
import { ModeToggle, type ScanMode } from "@/components/scanner/ModeToggle";
import { ScanStats } from "@/components/scanner/ScanStats";
import { ScanHistory, type ScanHistoryEntry } from "@/components/scanner/ScanHistory";
import { GuestListSearch } from "@/components/scanner/GuestListSearch";

interface ScanResultData {
  status: ScanStatus;
  message: string;
  ticket?: {
    ticket_code?: string;
    holder_first_name?: string;
    holder_last_name?: string;
    merch_size?: string;
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

  const [mode, setMode] = useState<ScanMode>("entry");
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
    // Fetch event name from the events list
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
    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(success ? [200] : [100, 50, 100]);
    }

    // Audio feedback
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

  // Handle scan result
  const handleScan = useCallback(async (code: string) => {
    if (scanning) return;
    setScanning(true);

    // Extract ticket code from URL if a full URL was scanned
    let ticketCode = code;
    try {
      const url = new URL(code);
      // URL format: https://domain/event/slug?ticket=CODE or just the code in path
      const ticketParam = url.searchParams.get("ticket");
      if (ticketParam) ticketCode = ticketParam;
    } catch {
      // Not a URL — use raw code
    }

    try {
      if (mode === "entry") {
        const res = await fetch(`/api/tickets/${encodeURIComponent(ticketCode)}/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scanned_by: "scanner",
            scan_location: scanLocation || undefined,
          }),
        });

        const json = await res.json();

        if (res.ok && json.success) {
          const resultData: ScanResultData = {
            status: "valid",
            message: "Entry Approved",
            ticket: json.ticket,
          };
          setResult(resultData);
          playFeedback(true);
          addToHistory(ticketCode, "valid", "Entry Approved", json.ticket);
        } else if (res.status === 409) {
          const resultData: ScanResultData = {
            status: "already_used",
            message: "Already Scanned",
            ticket: json.ticket,
            scanned_at: json.scanned_at,
            scanned_by: json.scanned_by,
          };
          setResult(resultData);
          playFeedback(false);
          addToHistory(ticketCode, "already_used", "Already Scanned", json.ticket);
        } else if (json.status === "merch_only") {
          const resultData: ScanResultData = {
            status: "merch_only",
            message: "Merch Pass — Direct to Merch Stand",
            ticket: json.ticket,
          };
          setResult(resultData);
          playFeedback(false);
          addToHistory(ticketCode, "merch_only", "Merch Pass Only", json.ticket);
        } else {
          const resultData: ScanResultData = {
            status: "invalid",
            message: json.error || "Invalid ticket",
          };
          setResult(resultData);
          playFeedback(false);
          addToHistory(ticketCode, "invalid", json.error || "Invalid ticket");
        }
      } else if (mode === "merch") {
        const res = await fetch(`/api/tickets/${encodeURIComponent(ticketCode)}/merch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collected_by: "scanner" }),
        });

        const json = await res.json();

        if (res.ok && json.success) {
          const resultData: ScanResultData = {
            status: "merch_success",
            message: "Merch Collected!",
            ticket: { ...json.ticket, merch_size: json.merch_size },
          };
          setResult(resultData);
          playFeedback(true);
          addToHistory(ticketCode, "merch_success", `Merch: ${json.merch_size}`, json.ticket);
        } else if (res.status === 409) {
          const resultData: ScanResultData = {
            status: "merch_collected",
            message: "Already Collected",
            ticket: { merch_size: json.merch_size },
            collected_at: json.collected_at,
            collected_by: json.collected_by,
          };
          setResult(resultData);
          playFeedback(false);
          addToHistory(ticketCode, "merch_collected", "Already Collected");
        } else if (res.status === 400 && json.error?.includes("not include")) {
          const resultData: ScanResultData = {
            status: "no_merch",
            message: "No Merch on This Ticket",
          };
          setResult(resultData);
          playFeedback(false);
          addToHistory(ticketCode, "no_merch", "No Merch");
        } else {
          const resultData: ScanResultData = {
            status: "invalid",
            message: json.error || "Invalid ticket",
          };
          setResult(resultData);
          playFeedback(false);
          addToHistory(ticketCode, "invalid", json.error || "Invalid");
        }
      }

      // Refresh stats after scan
      fetchStats();
    } catch {
      setResult({ status: "error", message: "Network error — check connection" });
      playFeedback(false);
      addToHistory(ticketCode, "error", "Network error");
    }

    setScanning(false);

    // Auto-dismiss success results after 2s
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
  }, [mode, scanning, scanLocation, playFeedback, fetchStats]);

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
    // Allow scanning again
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
      {stats && <div className="mb-4"><ScanStats mode={mode} stats={stats} /></div>}

      {/* Mode toggle */}
      <div className="mb-4">
        <ModeToggle
          mode={mode}
          onChange={setMode}
          hasMerch={(stats?.merch_total ?? 0) > 0}
          hasGuestList={(stats?.guest_list_total ?? 0) > 0}
        />
      </div>

      {/* Main content */}
      {mode === "guest-list" ? (
        <GuestListSearch eventId={eventId} onCheckIn={fetchStats} />
      ) : (
        <div className="flex-1 flex flex-col gap-4">
          {/* Camera viewfinder */}
          <QRScanner onScan={handleScan} active={!result} />

          {/* Manual entry */}
          <ManualEntry onSubmit={handleScan} loading={scanning} />

          {/* Scan history */}
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
