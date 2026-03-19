"use client";

import { CheckCircle2, XCircle, AlertTriangle, Package, User, Clock, Ticket, X, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScanStatus = "valid" | "already_used" | "merch_only" | "invalid" | "wrong_event" | "no_merch" | "merch_collected" | "merch_success" | "error";

interface ScanResultProps {
  status: ScanStatus;
  message: string;
  ticket?: {
    ticket_code?: string;
    holder_first_name?: string;
    holder_last_name?: string;
    merch_size?: string;
    ticket_type?: { name?: string };
    event?: { name?: string };
    order?: { order_number?: string };
  };
  scanned_at?: string;
  scanned_by?: string;
  collected_at?: string;
  collected_by?: string;
  onDismiss: () => void;
}

const STATUS_CONFIG: Record<ScanStatus, {
  icon: typeof CheckCircle2;
  bg: string;
  border: string;
  iconColor: string;
  textColor: string;
  accentBg: string;
}> = {
  valid: { icon: CheckCircle2, bg: "bg-success/10", border: "border-success/30", iconColor: "text-success", textColor: "text-success", accentBg: "bg-success/20" },
  merch_success: { icon: CheckCircle2, bg: "bg-success/10", border: "border-success/30", iconColor: "text-success", textColor: "text-success", accentBg: "bg-success/20" },
  already_used: { icon: XCircle, bg: "bg-destructive/10", border: "border-destructive/30", iconColor: "text-destructive", textColor: "text-destructive", accentBg: "bg-destructive/20" },
  invalid: { icon: XCircle, bg: "bg-destructive/10", border: "border-destructive/30", iconColor: "text-destructive", textColor: "text-destructive", accentBg: "bg-destructive/20" },
  wrong_event: { icon: AlertTriangle, bg: "bg-warning/10", border: "border-warning/30", iconColor: "text-warning", textColor: "text-warning", accentBg: "bg-warning/20" },
  error: { icon: XCircle, bg: "bg-destructive/10", border: "border-destructive/30", iconColor: "text-destructive", textColor: "text-destructive", accentBg: "bg-destructive/20" },
  merch_only: { icon: AlertTriangle, bg: "bg-warning/10", border: "border-warning/30", iconColor: "text-warning", textColor: "text-warning", accentBg: "bg-warning/20" },
  no_merch: { icon: XCircle, bg: "bg-destructive/10", border: "border-destructive/30", iconColor: "text-destructive", textColor: "text-destructive", accentBg: "bg-destructive/20" },
  merch_collected: { icon: AlertTriangle, bg: "bg-warning/10", border: "border-warning/30", iconColor: "text-warning", textColor: "text-warning", accentBg: "bg-warning/20" },
};

export function ScanResult({
  status,
  message,
  ticket,
  scanned_at,
  scanned_by,
  collected_at,
  collected_by,
  onDismiss,
}: ScanResultProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const holderName = [ticket?.holder_first_name, ticket?.holder_last_name].filter(Boolean).join(" ");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm scanner-result-enter">
      <div
        className={cn(
          "w-full max-w-lg mx-4 mb-4 rounded-2xl border shadow-2xl shadow-black/40 pb-[max(env(safe-area-inset-bottom),16px)]",
          config.bg, config.border
        )}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-6 top-4 text-muted-foreground/60 hover:text-foreground p-1"
        >
          <X size={18} />
        </button>

        {/* Status icon + message — large and clear */}
        <div className="flex flex-col items-center pt-6 pb-4 px-6">
          <div className={cn("flex h-16 w-16 items-center justify-center rounded-full mb-4", config.accentBg)}>
            <Icon size={32} className={config.iconColor} />
          </div>
          <p className={cn("text-xl font-bold text-center", config.textColor)}>{message}</p>
        </div>

        {/* Ticket details — prominent and easy to read at a glance */}
        {ticket && (holderName || ticket.ticket_type?.name || ticket.merch_size) && (
          <div className="mx-6 mb-4 rounded-xl bg-background/40 border border-white/[0.06] p-4 space-y-3">
            {/* Holder name — large */}
            {holderName && (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                  {holderName[0]}
                </div>
                <span className="text-base font-semibold text-foreground">{holderName}</span>
              </div>
            )}

            {/* Ticket type — clearly labeled */}
            {ticket.ticket_type?.name && (
              <div className="flex items-center gap-2">
                <Ticket size={15} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground">{ticket.ticket_type.name}</span>
              </div>
            )}

            {/* Merch size — BIG and unmissable */}
            {ticket.merch_size && (
              <div className="flex items-center gap-2">
                <Package size={15} className="text-primary shrink-0" />
                <span className="inline-flex items-center rounded-lg bg-primary/15 border border-primary/25 px-4 py-1.5 text-base font-bold text-primary tracking-wide">
                  Size {ticket.merch_size}
                </span>
              </div>
            )}

            {/* Order number — important for merch desk to match physical items */}
            {ticket.order?.order_number && (
              <div className="flex items-center gap-2">
                <Hash size={15} className="text-muted-foreground shrink-0" />
                <span className="font-mono text-sm font-semibold text-foreground tracking-wide">
                  {ticket.order.order_number}
                </span>
              </div>
            )}

            {/* Ticket code — small, for reference */}
            {ticket.ticket_code && (
              <p className="font-mono text-[11px] text-muted-foreground/60 pt-1">
                {ticket.ticket_code}
              </p>
            )}
          </div>
        )}

        {/* Timestamp info */}
        {(scanned_at || collected_at) && (
          <div className="mx-6 mb-4 space-y-1">
            {scanned_at && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock size={11} />
                <span>Scanned {new Date(scanned_at).toLocaleTimeString()}{scanned_by ? ` by ${scanned_by}` : ""}</span>
              </div>
            )}
            {collected_at && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock size={11} />
                <span>Collected {new Date(collected_at).toLocaleTimeString()}{collected_by ? ` by ${collected_by}` : ""}</span>
              </div>
            )}
          </div>
        )}

        {/* Dismiss hint */}
        <button
          type="button"
          onClick={onDismiss}
          className="w-full py-3 text-center text-xs font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors border-t border-white/[0.04]"
        >
          Tap anywhere to scan next
        </button>
      </div>
    </div>
  );
}
