"use client";

import { useState, useEffect, useRef } from "react";
import { AuroraCheckoutHeader } from "./AuroraCheckoutHeader";
import { AuroraFooter } from "./AuroraFooter";
import { AuroraCard } from "./ui/card";
import { AuroraButton } from "./ui/button";
import { AuroraBadge } from "./ui/badge";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { getCurrencySymbol } from "@/lib/stripe/config";
import type { Order } from "@/types/orders";
import "@/styles/aurora.css";
import "@/styles/aurora-effects.css";

interface AuroraOrderConfirmationProps {
  order: Order;
  slug: string;
  eventName: string;
  walletPassEnabled?: {
    apple?: boolean;
    google?: boolean;
  };
}

export function AuroraOrderConfirmation({
  order,
  slug,
  eventName,
  walletPassEnabled,
}: AuroraOrderConfirmationProps) {
  const { trackPurchase } = useMetaTracking();
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);
  const [walletDownloading, setWalletDownloading] = useState<string | null>(null);
  const [googleWalletUrl, setGoogleWalletUrl] = useState<string | null>(null);
  const purchaseTracked = useRef(false);
  const symbol = getCurrencySymbol(order.currency || "GBP");

  // Track Purchase
  useEffect(() => {
    if (purchaseTracked.current) return;
    purchaseTracked.current = true;
    const ticketTypeIds = order.items?.map((i) => i.ticket_type_id) || [];
    const numItems = order.tickets?.length || order.items?.reduce((sum, i) => sum + i.qty, 0) || 0;
    trackPurchase({
      content_ids: ticketTypeIds,
      content_type: "product",
      value: Number(order.total),
      currency: order.currency || "GBP",
      num_items: numItems,
      order_id: order.order_number,
    });
  }, [order, trackPurchase]);

  // Generate QR codes
  useEffect(() => {
    async function loadQRCodes() {
      if (!order.tickets || order.tickets.length === 0) return;
      const QRCode = (await import("qrcode")).default;
      const codes: Record<string, string> = {};
      for (const ticket of order.tickets) {
        try {
          codes[ticket.ticket_code] = await QRCode.toDataURL(ticket.ticket_code, {
            errorCorrectionLevel: "H",
            margin: 2,
            width: 300,
            color: { dark: "#000000", light: "#ffffff" },
          });
        } catch { /* skip */ }
      }
      setQrCodes(codes);
    }
    loadQRCodes();
  }, [order.tickets]);

  // Fetch Google Wallet URL
  useEffect(() => {
    if (!walletPassEnabled?.google || !order.id) return;
    fetch(`/api/orders/${order.id}/wallet/google`)
      .then((r) => r.json())
      .then((data) => { if (data.url) setGoogleWalletUrl(data.url); })
      .catch(() => {});
  }, [order.id, walletPassEnabled?.google]);

  const handleDownloadPdf = async () => {
    if (!order.id) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tickets-${order.order_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    setDownloading(false);
  };

  const handleAppleWallet = async () => {
    if (!order.id) return;
    setWalletDownloading("apple");
    try {
      const res = await fetch(`/api/orders/${order.id}/wallet/apple`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pass-${order.order_number}.pkpass`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    setWalletDownloading(null);
  };

  return (
    <div className="min-h-screen bg-aurora-bg">
      <AuroraCheckoutHeader slug={slug} />

      <div className="mx-auto max-w-2xl px-5 py-10 space-y-8">
        {/* Success Header */}
        <div className="text-center space-y-3 aurora-fade-in-up">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-aurora-success/15">
            <svg className="h-8 w-8 text-aurora-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-aurora-text">
            You&apos;re going to {eventName}!
          </h1>
          <p className="text-aurora-text-secondary">
            Order {order.order_number} confirmed. Check your email for details.
          </p>
        </div>

        {/* Order Summary */}
        <AuroraCard glass className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-aurora-text-secondary">Order Number</span>
            <span className="text-sm font-medium text-aurora-text">{order.order_number}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-aurora-text-secondary">Total</span>
            <span className="text-lg font-bold text-aurora-text">
              {symbol}{Number(order.total).toFixed(2)}
            </span>
          </div>
          {order.items && order.items.length > 0 && (
            <div className="border-t border-aurora-border/50 pt-3 space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-aurora-text-secondary">
                    {item.qty}&times; {item.ticket_type?.name || "Ticket"}
                    {item.merch_size && ` (${item.merch_size})`}
                  </span>
                  <span className="text-aurora-text tabular-nums">
                    {symbol}{(item.unit_price * item.qty).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </AuroraCard>

        {/* Tickets with QR Codes */}
        {order.tickets && order.tickets.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-aurora-text">
              Your Tickets
            </h2>
            {order.tickets.map((ticket) => (
              <AuroraCard key={ticket.id} glass gradientBorder className="p-5">
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  {/* QR Code */}
                  <div className="shrink-0">
                    {qrCodes[ticket.ticket_code] ? (
                      <img
                        src={qrCodes[ticket.ticket_code]}
                        alt={`QR code for ${ticket.ticket_code}`}
                        className="h-32 w-32 rounded-xl"
                      />
                    ) : (
                      <div className="h-32 w-32 rounded-xl aurora-shimmer" />
                    )}
                  </div>

                  {/* Ticket Info */}
                  <div className="flex-1 text-center sm:text-left space-y-1">
                    <p className="font-mono text-xs text-aurora-text-secondary tracking-wider">
                      {ticket.ticket_code}
                    </p>
                    <p className="text-base font-semibold text-aurora-text">
                      {ticket.ticket_type?.name || "Ticket"}
                    </p>
                    <p className="text-sm text-aurora-text-secondary">{eventName}</p>
                    {ticket.merch_size && (
                      <AuroraBadge variant="vip">
                        Merch: Size {ticket.merch_size}
                      </AuroraBadge>
                    )}
                  </div>
                </div>
              </AuroraCard>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {/* PDF Download */}
          {order.id && (
            <AuroraButton
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={handleDownloadPdf}
              disabled={downloading}
            >
              {downloading ? "Downloading..." : "Download PDF Tickets"}
            </AuroraButton>
          )}

          {/* Apple Wallet */}
          {walletPassEnabled?.apple && order.id && (
            <AuroraButton
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={handleAppleWallet}
              disabled={walletDownloading === "apple"}
            >
              {walletDownloading === "apple" ? "Downloading..." : "Add to Apple Wallet"}
            </AuroraButton>
          )}

          {/* Google Wallet */}
          {walletPassEnabled?.google && googleWalletUrl && (
            <a href={googleWalletUrl} target="_blank" rel="noopener noreferrer">
              <AuroraButton variant="secondary" size="lg" className="w-full">
                Add to Google Wallet
              </AuroraButton>
            </a>
          )}

          {/* Back to Event */}
          <a href={`/event/${slug}/`}>
            <AuroraButton variant="ghost" size="lg" className="w-full mt-2">
              Back to Event
            </AuroraButton>
          </a>
        </div>
      </div>

      <AuroraFooter />
    </div>
  );
}
