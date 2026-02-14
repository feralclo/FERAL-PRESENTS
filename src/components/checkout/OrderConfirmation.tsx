"use client";

import { useState, useEffect, useRef } from "react";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useBranding } from "@/hooks/useBranding";
import { getCurrencySymbol } from "@/lib/stripe/config";
import type { Order } from "@/types/orders";
import "@/styles/checkout-page.css";

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

    trackPurchase({
      content_ids: ticketTypeIds,
      content_type: "product",
      value: Number(order.total),
      currency: order.currency || "GBP",
      num_items: numItems,
      order_id: order.order_number,
    });
  }, [order, trackPurchase]);

  // Generate QR codes client-side for instant display.
  // CRITICAL: Encodes the raw ticket code (e.g. "FERAL-A3B4C5D6") — NOT a URL.
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
    <>
      {/* Header */}
      <div className="checkout-header">
        <a href={`/event/${slug}/`} className="checkout-header__back">
          <span className="checkout-header__back-arrow">&larr;</span>
          <span>Event Page</span>
        </a>
        <a href={`/event/${slug}/`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logo_url || "/images/FERAL%20LOGO.svg"}
            alt={branding.org_name || "FERAL PRESENTS"}
            className="checkout-header__logo"
          />
        </a>
        <div className="checkout-header__secure">
          <span style={{ color: "#4ecb71", fontWeight: 700 }}>CONFIRMED</span>
        </div>
      </div>

      {/* Confirmation Content */}
      <div className="order-confirmation">
        <div className="order-confirmation__inner">
          {/* Success Header */}
          <div className="order-confirmation__success">
            <div className="order-confirmation__check">&#10003;</div>
            <h1 className="order-confirmation__title">Order Confirmed</h1>
            <p className="order-confirmation__subtitle">
              Your tickets for <strong>{eventName}</strong> are ready
            </p>
          </div>

          {/* Order Info */}
          <div className="order-confirmation__info">
            <div className="order-confirmation__info-row">
              <span className="order-confirmation__info-label">
                Order Number
              </span>
              <span className="order-confirmation__info-value">
                {order.order_number}
              </span>
            </div>
            <div className="order-confirmation__info-row">
              <span className="order-confirmation__info-label">Total</span>
              <span className="order-confirmation__info-value order-confirmation__info-value--price">
                {symbol}{Number(order.total).toFixed(2)}
              </span>
            </div>
            {vatMeta && (
              <div className="order-confirmation__info-row">
                <span className="order-confirmation__info-label">
                  {vatMeta.inclusive ? `Includes VAT (${vatMeta.rate}%)` : `VAT (${vatMeta.rate}%)`}
                </span>
                <span className="order-confirmation__info-value">
                  {symbol}{vatMeta.amount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="order-confirmation__info-row">
              <span className="order-confirmation__info-label">
                Payment Reference
              </span>
              <span className="order-confirmation__info-value">
                {order.payment_ref}
              </span>
            </div>
          </div>

          {/* Tickets */}
          {order.tickets && order.tickets.length > 0 && (
            <div className="order-confirmation__tickets">
              <h2 className="order-confirmation__section-title">
                Your Tickets
              </h2>
              {order.tickets.map((ticket) => (
                <div key={ticket.id} className="order-confirmation__ticket">
                  <div className="order-confirmation__ticket-info">
                    <div className="order-confirmation__ticket-type">
                      {ticket.ticket_type?.name || "Ticket"}
                    </div>
                    <div className="order-confirmation__ticket-code">
                      {ticket.ticket_code}
                    </div>
                    {ticket.merch_size && (
                      <div className="order-confirmation__ticket-size">
                        Size: {ticket.merch_size}
                      </div>
                    )}
                    <div className="order-confirmation__ticket-holder">
                      {ticket.holder_first_name} {ticket.holder_last_name}
                    </div>
                  </div>
                  <div className="order-confirmation__ticket-qr">
                    {qrCodes[ticket.ticket_code] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrCodes[ticket.ticket_code]}
                        alt={`QR Code: ${ticket.ticket_code}`}
                        width={140}
                        height={140}
                      />
                    ) : (
                      <div className="order-confirmation__qr-loading">
                        Loading QR...
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="order-confirmation__actions">
            <button
              onClick={handleDownloadPDF}
              className="order-confirmation__btn order-confirmation__btn--primary"
              disabled={downloading}
            >
              {downloading ? "Generating PDF..." : "Download Tickets (PDF)"}
            </button>

            {/* Wallet Pass Buttons */}
            {(walletPassEnabled?.apple || walletPassEnabled?.google) && (
              <div className="order-confirmation__wallet-buttons">
                {walletPassEnabled.apple && (
                  <button
                    onClick={handleAddToAppleWallet}
                    className="order-confirmation__btn order-confirmation__btn--wallet"
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
                    className="order-confirmation__btn order-confirmation__btn--wallet"
                  >
                    Save to Google Wallet
                  </a>
                )}
              </div>
            )}

            <a
              href={`/event/${slug}/`}
              className="order-confirmation__btn order-confirmation__btn--secondary"
            >
              Back to Event
            </a>
          </div>
        </div>
      </div>

      <footer className="footer">
        <div className="container">
          <div className="footer__inner">
            <span className="footer__copy">
              &copy; {year} {branding.copyright_text || `${branding.org_name || "FERAL PRESENTS"}. ALL RIGHTS RESERVED.`}
            </span>
            <span className="footer__status">
              STATUS: <span className="text-red">ONLINE</span>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
