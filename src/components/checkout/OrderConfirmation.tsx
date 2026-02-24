"use client";

import { useState, useEffect, useRef } from "react";
import { useMetaTracking, storeMetaMatchData } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { useBranding } from "@/hooks/useBranding";
import { getCurrencySymbol } from "@/lib/stripe/config";
import type { Order } from "@/types/orders";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface OrderConfirmationProps {
  order: Order;
  slug: string;
  eventName: string;
  walletPassEnabled?: {
    apple?: boolean;
    google?: boolean;
  };
}

export function OrderConfirmation({
  order,
  slug,
  eventName,
  walletPassEnabled,
}: OrderConfirmationProps) {
  const { trackPurchase } = useMetaTracking();
  const { trackEngagement } = useTraffic();
  const branding = useBranding();
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);
  const [walletDownloading, setWalletDownloading] = useState<string | null>(null);
  const [googleWalletUrl, setGoogleWalletUrl] = useState<string | null>(null);
  const purchaseTracked = useRef(false);
  const symbol = getCurrencySymbol(order.currency || "GBP");
  const year = new Date().getFullYear();

  // Track Purchase event once when order confirmation mounts
  useEffect(() => {
    if (purchaseTracked.current) return;
    purchaseTracked.current = true;

    const ticketTypeIds = order.items?.map((i) => i.ticket_type_id) || [];
    const numItems = order.tickets?.length || order.items?.reduce((sum, i) => sum + i.qty, 0) || 0;
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
        content_ids: ticketTypeIds,
        content_type: "product",
        value: Number(order.total),
        currency: order.currency || "GBP",
        num_items: numItems,
        order_id: order.order_number,
      },
      // Send customer PII for CAPI advanced matching (hashed server-side)
      customer ? {
        em: customer.email || undefined,
        fn: customer.first_name || undefined,
        ln: customer.last_name || undefined,
        ph: customer.phone || undefined,
        external_id: order.customer_id || undefined,
      } : undefined
    );
  }, [order, trackPurchase]);

  // Generate QR codes client-side for instant display.
  // CRITICAL: Encodes the raw ticket code (e.g. "ACME-A3B4C5D6") — NOT a URL.
  // This must match the PDF and wallet pass QR codes exactly so that the same
  // scanner resolves the same data regardless of which QR the customer presents.
  useEffect(() => {
    async function loadQRCodes() {
      if (!order.tickets || order.tickets.length === 0) return;

      const QRCode = (await import("qrcode")).default;

      const codes: Record<string, string> = {};
      for (const ticket of order.tickets) {
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
  }, [order.tickets]);

  // Fetch Google Wallet URL if enabled
  useEffect(() => {
    if (!walletPassEnabled?.google || !order.id) return;
    fetch(`/api/orders/${order.id}/wallet/google`)
      .then((r) => r.json())
      .then((json) => {
        if (json.url) setGoogleWalletUrl(json.url);
      })
      .catch(() => {});
  }, [order.id, walletPassEnabled?.google]);

  // Extract VAT metadata from order (stored by createOrder)
  const meta = (order.metadata || {}) as Record<string, unknown>;
  const vatMeta = meta.vat_amount && Number(meta.vat_amount) > 0
    ? {
        amount: Number(meta.vat_amount),
        rate: Number(meta.vat_rate || 0),
        inclusive: meta.vat_inclusive === true,
      }
    : null;

  const handleAddToAppleWallet = async () => {
    setWalletDownloading("apple");
    trackEngagement("wallet_apple");
    try {
      const res = await fetch(`/api/orders/${order.id}/wallet/apple`);
      if (!res.ok) throw new Error("Failed to generate wallet pass");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Determine filename based on content type
      const contentType = res.headers.get("Content-Type") || "";
      const ext = contentType.includes("pkpasses") ? "pkpasses" : "pkpass";
      a.download = `${order.order_number}-tickets.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail — wallet pass is supplementary
    }
    setWalletDownloading(null);
  };

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
      a.download = `${order.order_number}-tickets.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download PDF. Please try again.");
    }
    setDownloading(false);
  };

  return (
    <div className="midnight-checkout min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="bg-[rgba(0,0,0,0.9)] backdrop-blur-[16px] border-b border-white/[0.04] px-6 max-sm:px-4 h-20 max-sm:h-[68px] flex items-center justify-center sticky top-0 z-[100]">
        <a
          href={`/event/${slug}/`}
          className="absolute left-6 max-sm:left-4 top-1/2 -translate-y-1/2 font-[family-name:var(--font-mono)] text-[10px] tracking-[1px] uppercase text-foreground/35 no-underline transition-colors duration-150 flex items-center gap-1.5 hover:text-foreground"
        >
          <span className="text-sm leading-none">&larr;</span>
          <span>Event Page</span>
        </a>
        <a href={`/event/${slug}/`}>
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
              Order Confirmed
            </h1>
            <p className="font-[family-name:var(--font-sans)] text-sm text-foreground/50 leading-relaxed m-0">
              Your tickets for <strong className="text-foreground/70">{eventName}</strong> are ready
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

          {/* Tickets */}
          {order.tickets && order.tickets.length > 0 && (
            <div className="mb-6">
              <h2 className="font-[family-name:var(--font-mono)] text-[11px] tracking-[3px] uppercase text-foreground mb-4 pb-3 border-b border-white/[0.06] m-0">
                Your Tickets
              </h2>
              {order.tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:text-center bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 mb-2"
                >
                  <div className="min-w-0">
                    <div className="font-[family-name:var(--font-mono)] text-xs font-bold tracking-[1px] uppercase text-foreground mb-1.5">
                      {ticket.ticket_type?.name || "Ticket"}
                    </div>
                    <div className="font-[family-name:var(--font-mono)] text-sm font-bold tracking-[2px] text-foreground mb-1">
                      {ticket.ticket_code}
                    </div>
                    {ticket.merch_size && (
                      <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[1px] text-foreground/50 mb-1">
                        Size: {ticket.merch_size}
                      </div>
                    )}
                    <div className="font-[family-name:var(--font-sans)] text-xs text-foreground/35">
                      {ticket.holder_first_name} {ticket.holder_last_name}
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

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="block w-full font-[family-name:var(--font-sans)] text-sm font-semibold tracking-[0.2px] text-center py-4 px-6 border-none cursor-pointer transition-all duration-150 bg-white text-[#0e0e0e] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:bg-[#f0f0f0] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)] active:bg-[#e5e5e5] active:translate-y-0 disabled:bg-white/[0.08] disabled:text-foreground/35 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              disabled={downloading}
            >
              {downloading ? "Generating PDF..." : "Download Tickets (PDF)"}
            </button>

            {/* Wallet Pass Buttons */}
            {(walletPassEnabled?.apple || walletPassEnabled?.google) && (
              <div className="flex gap-2 w-full">
                {walletPassEnabled.apple && (
                  <button
                    type="button"
                    onClick={handleAddToAppleWallet}
                    className="flex-1 block font-[-apple-system,'Helvetica_Neue',Arial,sans-serif] text-[13px] font-semibold tracking-[0.2px] text-center py-4 px-6 border border-white/[0.15] cursor-pointer transition-all duration-150 bg-white/[0.04] text-foreground rounded-lg no-underline hover:bg-white/[0.08] hover:border-white/[0.25] disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={walletDownloading === "apple"}
                  >
                    {walletDownloading === "apple" ? "Adding..." : "Add to Apple Wallet"}
                  </button>
                )}
                {walletPassEnabled.google && googleWalletUrl && (
                  <a
                    href={googleWalletUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 block font-[-apple-system,'Helvetica_Neue',Arial,sans-serif] text-[13px] font-semibold tracking-[0.2px] text-center py-4 px-6 border border-white/[0.15] cursor-pointer transition-all duration-150 bg-white/[0.04] text-foreground rounded-lg no-underline hover:bg-white/[0.08] hover:border-white/[0.25]"
                    onClick={() => trackEngagement("wallet_google")}
                  >
                    Save to Google Wallet
                  </a>
                )}
              </div>
            )}

            <a
              href={`/event/${slug}/`}
              className="block w-full font-[family-name:var(--font-sans)] text-sm font-semibold tracking-[0.2px] text-center py-4 px-6 transition-all duration-150 bg-transparent text-foreground/50 border border-white/[0.15] rounded-lg no-underline hover:text-foreground hover:border-white/[0.30]"
            >
              Back to Event
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
