"use client";

import { CheckCircle2, XCircle, AlertTriangle, Package, User, Clock, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScanStatus = "valid" | "already_used" | "merch_only" | "invalid" | "no_merch" | "merch_collected" | "merch_success" | "error";

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
}> = {
  valid: { icon: CheckCircle2, bg: "bg-success/10", border: "border-success/30", iconColor: "text-success", textColor: "text-success" },
  merch_success: { icon: CheckCircle2, bg: "bg-success/10", border: "border-success/30", iconColor: "text-success", textColor: "text-success" },
  already_used: { icon: XCircle, bg: "bg-destructive/10", border: "border-destructive/30", iconColor: "text-destructive", textColor: "text-destructive" },
  invalid: { icon: XCircle, bg: "bg-destructive/10", border: "border-destructive/30", iconColor: "text-destructive", textColor: "text-destructive" },
  error: { icon: XCircle, bg: "bg-destructive/10", border: "border-destructive/30", iconColor: "text-destructive", textColor: "text-destructive" },
  merch_only: { icon: AlertTriangle, bg: "bg-warning/10", border: "border-warning/30", iconColor: "text-warning", textColor: "text-warning" },
  no_merch: { icon: XCircle, bg: "bg-destructive/10", border: "border-destructive/30", iconColor: "text-destructive", textColor: "text-destructive" },
  merch_collected: { icon: AlertTriangle, bg: "bg-warning/10", border: "border-warning/30", iconColor: "text-warning", textColor: "text-warning" },
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
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[max(env(safe-area-inset-bottom),16px)] scanner-result-enter"
      onClick={onDismiss}
    >
      <div className={cn(
        "rounded-2xl border p-5 shadow-2xl shadow-black/30 backdrop-blur-xl",
        config.bg, config.border
      )}>
        {/* Status header */}
        <div className="flex items-center gap-3 mb-3">
          <Icon size={28} className={config.iconColor} />
          <div className="flex-1 min-w-0">
            <p className={cn("text-lg font-bold", config.textColor)}>{message}</p>
          </div>
        </div>

        {/* Ticket details */}
        {ticket && (
          <div className="space-y-2 mt-4">
            {holderName && (
              <div className="flex items-center gap-2 text-sm text-foreground/80">
                <User size={14} className="text-muted-foreground shrink-0" />
                <span className="font-medium">{holderName}</span>
              </div>
            )}
            {ticket.ticket_type?.name && (
              <div className="flex items-center gap-2 text-sm text-foreground/80">
                <Ticket size={14} className="text-muted-foreground shrink-0" />
                <span>{ticket.ticket_type.name}</span>
              </div>
            )}
            {ticket.merch_size && (
              <div className="flex items-center gap-2">
                <Package size={14} className="text-muted-foreground shrink-0" />
                <span className="inline-flex items-center rounded-md bg-primary/15 border border-primary/25 px-2.5 py-1 text-sm font-bold text-primary">
                  {ticket.merch_size}
                </span>
              </div>
            )}
            {ticket.ticket_code && (
              <p className="font-mono text-xs text-muted-foreground mt-1">
                {ticket.ticket_code}
              </p>
            )}
          </div>
        )}

        {/* Already scanned info */}
        {scanned_at && (
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <Clock size={12} />
            <span>Scanned {new Date(scanned_at).toLocaleTimeString()}{scanned_by ? ` by ${scanned_by}` : ""}</span>
          </div>
        )}

        {/* Already collected info */}
        {collected_at && (
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <Clock size={12} />
            <span>Collected {new Date(collected_at).toLocaleTimeString()}{collected_by ? ` by ${collected_by}` : ""}</span>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground/60 mt-4">
          Tap to dismiss
        </p>
      </div>
    </div>
  );
}
