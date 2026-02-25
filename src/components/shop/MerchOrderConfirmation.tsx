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
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <span className="text-3xl">&#10003;</span>
        </div>
        <h1 className="font-[var(--font-mono,'Space_Mono',monospace)] text-2xl font-bold text-[var(--text-primary,#fff)]">
          Pre-order Confirmed!
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary,#888)]">
          Order {order.order_number}
        </p>
        <p className="mt-1 text-xs text-[var(--text-secondary,#888)]">
          A confirmation email has been sent to your inbox.
        </p>
      </div>

      {/* Order details */}
      <div className="mb-6 rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)] mb-3">
          Order Details
        </p>
        {merchItems.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between py-1.5 text-sm">
            <div className="text-[var(--text-primary,#fff)]">
              <span>{item.product_name || "Merch Item"}</span>
              {item.merch_size && (
                <span className="ml-1.5 text-[var(--text-secondary,#888)]">({item.merch_size})</span>
              )}
              {item.qty > 1 && (
                <span className="ml-1.5 text-[var(--text-secondary,#888)]">&times;{item.qty}</span>
              )}
            </div>
            <span className="font-[var(--font-mono,'Space_Mono',monospace)] text-[var(--text-primary,#fff)]">
              {symbol}{(Number(item.unit_price) * item.qty).toFixed(2)}
            </span>
          </div>
        ))}
        <div className="mt-3 border-t border-[var(--card-border,#2a2a2a)] pt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text-primary,#fff)]">Total</span>
          <span className="font-[var(--font-mono,'Space_Mono',monospace)] text-lg font-bold text-[var(--text-primary,#fff)]">
            {symbol}{Number(order.total).toFixed(2)}
          </span>
        </div>
      </div>

      {/* QR codes for collection */}
      {tickets.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)] mb-3">
            Your Collection QR {tickets.length === 1 ? "Code" : "Codes"}
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
                      alt={`QR code for ${ticket.ticket_code}`}
                      className="h-20 w-20 rounded-lg"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-[var(--bg-dark,#0e0e0e)]">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--text-secondary,#888)] border-t-transparent" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-[var(--font-mono,'Space_Mono',monospace)] text-sm font-bold text-[var(--text-primary,#fff)]">
                    {ticket.ticket_code}
                  </p>
                  {ticket.merch_size && (
                    <p className="mt-0.5 text-xs text-[var(--text-secondary,#888)]">
                      Size: {ticket.merch_size}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-[var(--text-secondary,#888)]/60">
                    Show this at the merch stand
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collection instructions */}
      <div className="mb-6 rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-base">&#128230;</span>
          <div>
            <p className="text-[12px] font-semibold text-[var(--text-primary,#fff)]">
              Collect at {event.name}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary,#888)]">
              {collection.pickup_instructions ||
                "Present your QR code at the merch stand to collect your order."}
            </p>
            {event.venue_name && (
              <p className="mt-1 text-[11px] text-[var(--text-secondary,#888)]">
                &#128205; {event.venue_name}
              </p>
            )}
            {event.date_start && (
              <p className="text-[11px] text-[var(--text-secondary,#888)]">
                &#128197; {new Date(event.date_start).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Need a ticket? */}
      {event.slug && (
        <div className="mb-6 rounded-xl border border-[var(--accent,#ff0033)]/15 bg-[var(--accent,#ff0033)]/5 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-base">&#127915;</span>
            <div>
              <p className="text-[12px] font-semibold text-[var(--text-primary,#fff)]">
                Don&apos;t forget your ticket!
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary,#888)]">
                You&apos;ll need a ticket to {event.name} to collect your merch.
              </p>
              <Link
                href={`/event/${event.slug}/`}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent,#ff0033)] hover:underline"
              >
                Get your ticket &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Continue shopping */}
      <div className="text-center">
        <Link
          href="/shop/"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary,#888)] transition-colors hover:text-[var(--text-primary,#fff)]"
        >
          &larr; Continue shopping
        </Link>
      </div>
    </div>
  );
}
