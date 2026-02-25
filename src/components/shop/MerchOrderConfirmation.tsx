"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getCurrencySymbol } from "@/lib/stripe/config";
import type { MerchCollection } from "@/types/merch-store";
import type { Event } from "@/types/events";

interface MerchOrderConfirmationProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
  collection: MerchCollection;
  event: Event;
  currency: string;
}

export function MerchOrderConfirmation({
  order,
  collection,
  event,
  currency,
}: MerchOrderConfirmationProps) {
  const symbol = getCurrencySymbol(currency);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const tickets = order.tickets || [];
  const merchItems = ((order.metadata as Record<string, unknown>)?.merch_items || []) as {
    product_name: string;
    qty: number;
    unit_price: number;
    merch_size?: string;
  }[];

  // Generate QR codes for each ticket
  useEffect(() => {
    if (tickets.length === 0) return;

    import("qrcode").then((QRCode) => {
      const generate = async () => {
        const codes: Record<string, string> = {};
        for (const ticket of tickets) {
          try {
            codes[ticket.ticket_code] = await QRCode.toDataURL(
              ticket.ticket_code,
              {
                width: 200,
                margin: 2,
                color: { dark: "#000000", light: "#ffffff" },
              }
            );
          } catch {
            // QR generation failed for this ticket
          }
        }
        setQrCodes(codes);
      };
      generate();
    });
  }, [tickets]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      {/* Success header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="font-[var(--font-mono,'Space_Mono',monospace)] text-xl font-bold text-[var(--text-primary,#fff)]">
          Pre-order Confirmed
        </h1>
        <p className="mt-2 text-[13px] text-[var(--text-secondary,#888)]/60">
          Order {order.order_number}
        </p>
        <p className="mt-1 text-[11px] text-[var(--text-secondary,#888)]/40">
          Confirmation sent to your email
        </p>
      </div>

      {/* Order details */}
      <div className="mb-5 rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)]/50 mb-3">
          Order Details
        </p>
        {merchItems.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between py-1.5 text-[13px]">
            <div className="text-[var(--text-primary,#fff)]/80">
              <span>{item.product_name || "Item"}</span>
              {item.merch_size && (
                <span className="ml-1.5 text-[var(--text-secondary,#888)]/50">({item.merch_size})</span>
              )}
              {item.qty > 1 && (
                <span className="ml-1.5 text-[var(--text-secondary,#888)]/50">&times;{item.qty}</span>
              )}
            </div>
            <span className="font-[var(--font-mono,'Space_Mono',monospace)] text-[13px] text-[var(--text-primary,#fff)]/80">
              {symbol}{(Number(item.unit_price) * item.qty).toFixed(2)}
            </span>
          </div>
        ))}
        <div className="mt-3 border-t border-[var(--card-border,#2a2a2a)] pt-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[var(--text-primary,#fff)]">Total</span>
          <span className="font-[var(--font-mono,'Space_Mono',monospace)] text-base font-bold text-[var(--text-primary,#fff)]">
            {symbol}{Number(order.total).toFixed(2)}
          </span>
        </div>
      </div>

      {/* QR codes for collection */}
      {tickets.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)]/50 mb-3">
            Collection QR {tickets.length === 1 ? "Code" : "Codes"}
          </p>
          <div className="grid gap-3">
            {tickets.map((ticket: { ticket_code: string; merch_size?: string }) => (
              <div
                key={ticket.ticket_code}
                className="flex items-center gap-4 rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] p-4"
              >
                <div className="flex-shrink-0">
                  {qrCodes[ticket.ticket_code] ? (
                    <img
                      src={qrCodes[ticket.ticket_code]}
                      alt={`QR code ${ticket.ticket_code}`}
                      className="h-20 w-20 rounded-lg"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-[var(--bg-dark,#0e0e0e)]">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--text-secondary,#888)]/30 border-t-[var(--text-secondary,#888)]" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-[var(--font-mono,'Space_Mono',monospace)] text-[13px] font-bold text-[var(--text-primary,#fff)]">
                    {ticket.ticket_code}
                  </p>
                  {ticket.merch_size && (
                    <p className="mt-0.5 text-[11px] text-[var(--text-secondary,#888)]/60">
                      Size: {ticket.merch_size}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-[var(--text-secondary,#888)]/40">
                    Show at the merch stand
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collection info — compact, no emojis */}
      <div className="mb-5 rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)]/60">
        <div className="px-4 py-3">
          <p className="text-[12px] font-medium text-[var(--text-primary,#fff)]/80">
            Collect at {event.name}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary,#888)]/50">
            {collection.pickup_instructions ||
              "Present your QR code at the merch stand to collect your order."}
          </p>
        </div>
        <div className="mx-4 h-px bg-[var(--card-border,#2a2a2a)]" />
        <div className="flex items-center gap-3 px-4 py-3 text-[11px] text-[var(--text-secondary,#888)]/50">
          {event.venue_name && <span>{event.venue_name}</span>}
          {event.venue_name && event.date_start && (
            <span className="text-[var(--card-border,#2a2a2a)]">&middot;</span>
          )}
          {event.date_start && (
            <span>
              {new Date(event.date_start).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Ticket CTA */}
      {event.slug && (
        <div className="mb-6">
          <Link
            href={`/event/${event.slug}/`}
            className="flex items-center justify-between rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)]/60 px-4 py-3.5 transition-all hover:border-[var(--text-secondary,#888)]/20"
          >
            <div>
              <p className="text-[12px] font-medium text-[var(--text-primary,#fff)]/80">
                Need a ticket?
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary,#888)]/50">
                You&apos;ll need one to collect your merch
              </p>
            </div>
            <span className="text-[12px] font-medium text-[var(--text-secondary,#888)]/50">
              &rarr;
            </span>
          </Link>
        </div>
      )}

      {/* Continue shopping */}
      <div className="text-center">
        <Link
          href="/shop/"
          className="text-[12px] text-[var(--text-secondary,#888)]/50 transition-colors hover:text-[var(--text-primary,#fff)]"
        >
          &larr; Continue shopping
        </Link>
      </div>
    </div>
  );
}
