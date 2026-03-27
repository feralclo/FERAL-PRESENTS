"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { QRScanner } from "@/components/scanner/QRScanner";
import { ScanResult, type ScanStatus } from "@/components/scanner/ScanResult";
import { ManualEntry } from "@/components/scanner/ManualEntry";
import { Loader2, Scan, WifiOff } from "lucide-react";

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
    order?: { order_number?: string };
  };
  scanned_at?: string;
  scanned_by?: string;
}

export default function LiveScannerPage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [result, setResult] = useState<ScanResultData | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Validate the token on mount
  useEffect(() => {
    async function validate() {
      try {
        // Quick validation: attempt a scan with a dummy code to verify token
        const res = await fetch("/api/scanner/live/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, ticket_code: "__validate__" }),
        });
        if (res.status === 403) {
          setError("Invalid scanner link. Please check the URL.");
          setLoading(false);
          return;
        }
        // 404 = token is valid, just no ticket found (expected)
        const json = await res.json();
        // Extract event name from any valid response or just proceed
        if (json.ticket?.event?.name) {
          setEventName(json.ticket.event.name);
        }
      } catch {
        setError("Unable to connect. Check your internet connection.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    validate();
  }, [token]);

  // Audio feedback
  const playFeedback = useCallback(
    (success: boolean) => {
      if (!soundEnabled) return;
      try {
        if (navigator.vibrate) {
          navigator.vibrate(success ? [100] : [100, 50, 100]);
        }
      } catch {
        // Vibration not supported
      }
    },
    [soundEnabled]
  );

  // Handle scan
  const handleScan = useCallback(
    async (code: string) => {
      if (scanning) return;
      setScanning(true);

      // Extract ticket code from URL-style QR codes
      let ticketCode = code;
      try {
        const url = new URL(code);
        const ticketParam = url.searchParams.get("ticket");
        if (ticketParam) ticketCode = ticketParam;
      } catch {
        // Not a URL — use raw code
      }

      try {
        const res = await fetch("/api/scanner/live/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, ticket_code: ticketCode }),
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
          if (!eventName && json.ticket?.event?.name) {
            setEventName(json.ticket.event.name);
          }
          setScanCount((c) => c + 1);
          playFeedback(true);
        } else if (res.status === 409) {
          setResult({
            status: "already_used",
            message: "Already Scanned",
            ticket: json.ticket,
            scanned_at: json.scanned_at,
            scanned_by: json.scanned_by,
          });
          playFeedback(false);
        } else if (json.status === "merch_only") {
          setResult({
            status: "merch_only",
            message: "Merch Pass Only — Not an entry ticket",
            ticket: json.ticket,
          });
          playFeedback(false);
        } else if (json.status === "wrong_event") {
          setResult({ status: "wrong_event", message: "Wrong Event" });
          playFeedback(false);
        } else {
          setResult({
            status: "invalid",
            message: json.error || "Invalid ticket",
          });
          playFeedback(false);
        }
      } catch {
        setResult({
          status: "error",
          message: "Network error — check connection",
        });
        playFeedback(false);
      }

      setScanning(false);
    },
    [scanning, token, eventName, soundEnabled, playFeedback]
  );

  const dismissResult = useCallback(() => {
    setResult(null);
    (window as { __scannerClearLast?: () => void }).__scannerClearLast?.();
  }, []);

  // Manual entry
  const handleManualEntry = useCallback(
    (code: string) => {
      handleScan(code);
    },
    [handleScan]
  );

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3" data-scanner>
        <Loader2 size={24} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Connecting scanner...</p>
      </div>
    );
  }

  // ── Error (invalid token) ──
  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6" data-scanner>
        <WifiOff size={48} className="text-muted-foreground/30" />
        <p className="text-center text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  // ── Scanner ──
  return (
    <div className="flex min-h-screen flex-col" data-scanner>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Scan size={16} className="text-primary" />
          <span className="text-sm font-semibold tracking-tight">
            {eventName || "Live Scanner"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {scanCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {scanCount} scanned
            </span>
          )}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {soundEnabled ? "Sound ON" : "Sound OFF"}
          </button>
        </div>
      </div>

      {/* Scanner viewfinder */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-4">
        <div className="w-full max-w-sm">
          <QRScanner onScan={handleScan} active={!result} />
        </div>

        <ManualEntry onSubmit={handleManualEntry} />
      </div>

      {/* Scan result overlay */}
      {result && (
        <ScanResult
          status={result.status}
          message={result.message}
          ticket={result.ticket}
          scanned_at={result.scanned_at}
          scanned_by={result.scanned_by}
          onDismiss={dismissResult}
        />
      )}
    </div>
  );
}
