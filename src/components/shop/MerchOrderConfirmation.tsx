"use client";

import { useState, useEffect, useRef } from "react";
import { useMetaTracking, storeMetaMatchData } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { useBranding } from "@/hooks/useBranding";
import { getCurrencySymbol } from "@/lib/stripe/config";
import type { MerchCollection } from "@/types/merch-store";
import type { Event } from "@/types/events";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

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
  const { trackPurchase } = useMetaTracking();
  const { trackEngagement } = useTraffic();
  const branding = useBranding();
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);
  const purchaseTracked = useRef(false);
  const symbol = getCurrencySymbol(currency);
  const year = new Date().getFullYear();

  const tickets = order.tickets || [];
  const merchItems = ((order.metadata as Record<string, unknown>)?.merch_items || []) as {
    product_name: string;
    qty: number;
    unit_price: number;
    merch_size?: string;
  }[];

  // Extract VAT metadata from order (stored by createOrder)
  const meta = (order.metadata || {}) as Record<string, unknown>;
  const vatMeta = meta.vat_amount && Number(meta.vat_amount) > 0
    ? {
        amount: Number(meta.vat_amount),
        rate: Number(meta.vat_rate || 0),
        inclusive: meta.vat_inclusive === true,
      }
    : null;

  // Track Purchase event once when confirmation mounts
  useEffect(() => {
    if (purchaseTracked.current) return;
    purchaseTracked.current = true;

    const numItems = merchItems.reduce((sum, i) => sum + i.qty, 0) || 0;
    const customer = order.customer;

    // Store full customer PII for Meta Advanced Matching on future visits
    if (customer) {
      storeMetaMatchData({
        em: customer.email || undefined,
        fn: customer.first_name || undefined,
        ln: customer.last_name || undefined,
        ph: customer.phone || undefined,
        external_id: order.customer_id || undefined,
      });
    }

    trackPurchase(
      {
        content_ids: merchItems.map((_: unknown, i: number) => `merch-${i}`),
        content_type: "product",
        value: Number(order.total),
        currency: currency || "GBP",
        num_items: numItems,
        order_id: order.order_number,
      },
      customer ? {
        em: customer.email || undefined,
        fn: customer.first_name || undefined,
        ln: customer.last_name || undefined,
        ph: customer.phone || undefined,
        external_id: order.customer_id || undefined,
      } : undefined
    );

    trackEngagement("purchase");
  }, [order, trackPurchase, trackEngagement, merchItems, currency]);

  // Generate QR codes client-side for instant display.
  // Encodes the raw ticket code — must match PDF QR codes exactly.
  useEffect(() => {
    if (tickets.length === 0) return;

    async function loadQRCodes() {
      const QRCode = (await import("qrcode")).default;
      const codes: Record<string, string> = {};
      for (const ticket of tickets) {
        try {
          codes[ticket.ticket_code] = await QRCode.toDataURL(
            ticket.ticket_code,
            {
              errorCorrectionLevel: "H",
              margin: 2,
              width: 300,
              color: { dark: "#000000", light: "#ffffff" },
            }
          );
        } catch {
          // QR generation failed for this ticket
        }
      }
      setQrCodes(codes);
    }
    loadQRCodes();
  }, [tickets]);

  const handleDownloadPDF = async () => {
    setDownloading(true);
    trackEngagement("pdf_download");
    try {
      const res = await fetch(`/api/orders/${order.id}/pdf`);
      if (!res.ok) throw new Error("Failed to generate PDF");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${order.order_number}-merch.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download PDF. Please try again.");
    }
    setDownloading(false);
  };

  const shopUrl = collection.slug ? `/shop/${collection.slug}/` : "/shop/";

  return (
    <div className="midnight-checkout min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="bg-[rgba(0,0,0,0.9)] backdrop-blur-[16px] border-b border-white/[0.04] px-6 max-sm:px-4 h-20 max-sm:h-[68px] flex items-center justify-center sticky top-0 z-[100]">
        <a
          href={shopUrl}
          className="absolute left-6 max-sm:left-4 top-1/2 -translate-y-1/2 font-[family-name:var(--font-mono)] text-[10px] tracking-[1px] uppercase text-foreground/35 no-underline transition-colors duration-150 flex items-center gap-1.5 hover:text-foreground"
        >
          <span className="text-sm leading-none">&larr;</span>
          <span>Shop</span>
        </a>
        <a href={shopUrl}>
          {branding.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={branding.logo_url}
              alt={branding.org_name || "Entry"}
              className="w-auto block"
              style={{ height: Math.min(branding.logo_height || 40, 48), maxWidth: 200, objectFit: "contain" }}
            />
          ) : (
            <span className="font-[family-name:var(--font-mono)] text-lg tracking-wide text-white uppercase">
              {branding.org_name || "Entry"}
            </span>
          )}
        </a>
        <div className="absolute right-6 max-sm:right-4 top-1/2 -translate-y-1/2 flex items-center">
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[1.5px] uppercase text-[#4ecb71] font-bold">
            Confirmed
          </span>
        </div>
      </div>

      {/* Confirmation Content */}
      <div className="flex-1">
        <div className="max-w-[560px] mx-auto px-6 max-sm:px-4 pt-8 pb-12">
          {/* Success Header */}
          <div className="text-center pt-8 pb-6">
            <div className="w-16 h-16 rounded-full bg-[rgba(78,203,113,0.12)] text-[#4ecb71] text-[32px] flex items-center justify-center mx-auto mb-5">
              &#10003;
            </div>
            <h1 className="font-[family-name:var(--font-mono)] text-xl font-bold tracking-[2px] uppercase text-foreground mb-2 m-0">
              Pre-order Confirmed
            </h1>
            <p className="font-[family-name:var(--font-sans)] text-sm text-foreground/50 leading-relaxed m-0">
              Your merch for <strong className="text-foreground/70">{event.name}</strong> is ready to collect
            </p>
          </div>

          {/* Order Info */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5 mb-6">
            <div className="flex items-center justify-between py-2">
              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-foreground/35">
                Order Number
              </span>
              <span className="font-[family-name:var(--font-mono)] text-xs tracking-[1px] text-foreground">
                {order.order_number}
              </span>
            </div>

            {/* Line items */}
            {merchItems.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-t border-white/[0.04]">
                <div className="min-w-0">
                  <span className="font-[family-name:var(--font-sans)] text-xs text-foreground/70">
                    {item.product_name || "Item"}
                  </span>
                  {item.merch_size && (
                    <span className="font-[family-name:var(--font-mono)] text-[10px] text-foreground/35 ml-2">
                      {item.merch_size}
                    </span>
                  )}
                  {item.qty > 1 && (
                    <span className="font-[family-name:var(--font-mono)] text-[10px] text-foreground/35 ml-2">
                      x{item.qty}
                    </span>
                  )}
                </div>
                <span className="font-[family-name:var(--font-mono)] text-xs tracking-[1px] text-foreground/70">
                  {symbol}{(Number(item.unit_price) * item.qty).toFixed(2)}
                </span>
              </div>
            ))}

            {/* Separator before totals */}
            <div className="flex items-center justify-between py-2 border-t border-white/[0.04]">
              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-foreground/35">
                Total
              </span>
              <span className="font-[family-name:var(--font-mono)] text-base tracking-[1px] text-foreground font-bold">
                {symbol}{Number(order.total).toFixed(2)}
              </span>
            </div>

            {vatMeta && (
              <div className="flex items-center justify-between py-2 border-t border-white/[0.04]">
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-foreground/35">
                  {vatMeta.inclusive ? `Includes VAT (${vatMeta.rate}%)` : `VAT (${vatMeta.rate}%)`}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-xs tracking-[1px] text-foreground">
                  {symbol}{vatMeta.amount.toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between py-2 border-t border-white/[0.04]">
              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-foreground/35">
                Payment Reference
              </span>
              <span className="font-[family-name:var(--font-mono)] text-xs tracking-[1px] text-foreground">
                {order.payment_ref}
              </span>
            </div>
          </div>

          {/* Collection QR Codes */}
          {tickets.length > 0 && (
            <div className="mb-6">
              <h2 className="font-[family-name:var(--font-mono)] text-[11px] tracking-[3px] uppercase text-foreground mb-4 pb-3 border-b border-white/[0.06] m-0">
                {tickets.length === 1 ? "Collection QR Code" : "Collection QR Codes"}
              </h2>
              {tickets.map((ticket: { id?: string; ticket_code: string; merch_size?: string; holder_first_name?: string; holder_last_name?: string }) => (
                <div
                  key={ticket.ticket_code}
                  className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:text-center bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 mb-2"
                >
                  <div className="min-w-0">
                    <div className="font-[family-name:var(--font-mono)] text-sm font-bold tracking-[2px] text-foreground mb-1">
                      {ticket.ticket_code}
                    </div>
                    {ticket.merch_size && (
                      <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[1px] text-foreground/50 mb-1">
                        Size: {ticket.merch_size}
                      </div>
                    )}
                    {(ticket.holder_first_name || ticket.holder_last_name) && (
                      <div className="font-[family-name:var(--font-sans)] text-xs text-foreground/35 mb-1.5">
                        {ticket.holder_first_name} {ticket.holder_last_name}
                      </div>
                    )}
                    <div className="font-[family-name:var(--font-mono)] text-[9px] tracking-[1px] uppercase text-foreground/25">
                      Present at merch stand
                    </div>
                  </div>
                  <div className="shrink-0">
                    {qrCodes[ticket.ticket_code] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrCodes[ticket.ticket_code]}
                        alt={`QR Code: ${ticket.ticket_code}`}
                        width={140}
                        height={140}
                        className="block rounded max-sm:mx-auto"
                      />
                    ) : (
                      <div className="w-[140px] h-[140px] flex items-center justify-center bg-white/[0.04] rounded font-[family-name:var(--font-mono)] text-[9px] tracking-[1px] text-foreground/25">
                        Loading QR...
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Collection Info */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5 mb-6">
            <h2 className="font-[family-name:var(--font-mono)] text-[11px] tracking-[3px] uppercase text-foreground mb-3 m-0">
              Collection Details
            </h2>
            <div className="flex items-center justify-between py-2">
              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-foreground/35">
                Event
              </span>
              <span className="font-[family-name:var(--font-sans)] text-xs text-foreground/70">
                {event.name}
              </span>
            </div>
            {event.venue_name && (
              <div className="flex items-center justify-between py-2 border-t border-white/[0.04]">
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-foreground/35">
                  Venue
                </span>
                <span className="font-[family-name:var(--font-sans)] text-xs text-foreground/70">
                  {event.venue_name}
                </span>
              </div>
            )}
            {event.date_start && (
              <div className="flex items-center justify-between py-2 border-t border-white/[0.04]">
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-foreground/35">
                  Date
                </span>
                <span className="font-[family-name:var(--font-sans)] text-xs text-foreground/70">
                  {new Date(event.date_start).toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}
            {collection.pickup_instructions && (
              <div className="pt-3 mt-2 border-t border-white/[0.04]">
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-foreground/35 block mb-1.5">
                  Pickup Instructions
                </span>
                <p className="font-[family-name:var(--font-sans)] text-xs text-foreground/50 leading-relaxed m-0">
                  {collection.pickup_instructions}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="block w-full font-[family-name:var(--font-sans)] text-sm font-semibold tracking-[0.2px] text-center py-4 px-6 border-none cursor-pointer transition-all duration-150 bg-white text-[#0e0e0e] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:bg-[#f0f0f0] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)] active:bg-[#e5e5e5] active:translate-y-0 disabled:bg-white/[0.08] disabled:text-foreground/35 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              disabled={downloading}
            >
              {downloading ? "Generating PDF..." : "Download Order (PDF)"}
            </button>

            {/* Ticket CTA */}
            {event.slug && (
              <a
                href={`/event/${event.slug}/`}
                className="block w-full font-[family-name:var(--font-sans)] text-sm font-semibold tracking-[0.2px] text-center py-4 px-6 transition-all duration-150 bg-transparent text-foreground/50 border border-white/[0.15] rounded-lg no-underline hover:text-foreground hover:border-white/[0.30]"
              >
                Need a ticket? View Event
              </a>
            )}

            <a
              href={shopUrl}
              className="block w-full font-[family-name:var(--font-sans)] text-sm font-semibold tracking-[0.2px] text-center py-4 px-6 transition-all duration-150 bg-transparent text-foreground/35 border-none rounded-lg no-underline hover:text-foreground/60"
            >
              Back to Shop
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-6">
        <div className="max-w-[1200px] mx-auto text-center">
          <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-foreground/20">
            &copy; {year} {branding.copyright_text || `${branding.org_name || "Entry"}. ALL RIGHTS RESERVED.`}
          </span>
        </div>
      </footer>
    </div>
  );
}
