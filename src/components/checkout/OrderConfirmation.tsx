"use client";

import { useState, useEffect, useRef } from "react";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import type { Order } from "@/types/orders";
import "@/styles/checkout-page.css";

interface OrderConfirmationProps {
  order: Order;
  slug: string;
  eventName: string;
}

export function OrderConfirmation({
  order,
  slug,
  eventName,
}: OrderConfirmationProps) {
  const { trackPurchase } = useMetaTracking();
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);
  const purchaseTracked = useRef(false);

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

  // Generate QR codes client-side for instant display
  useEffect(() => {
    async function loadQRCodes() {
      if (!order.tickets || order.tickets.length === 0) return;

      // Dynamically import qrcode for client-side use
      const QRCode = (await import("qrcode")).default;
      const baseUrl =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://feralpresents.com";

      const codes: Record<string, string> = {};
      for (const ticket of order.tickets) {
        try {
          codes[ticket.ticket_code] = await QRCode.toDataURL(
            `${baseUrl}/api/tickets/${ticket.ticket_code}`,
            {
              errorCorrectionLevel: "M",
              margin: 2,
              width: 200,
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
            src="/images/FERAL%20LOGO.svg"
            alt="FERAL PRESENTS"
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
                {order.currency === "GBP" ? "£" : "€"}
                {Number(order.total).toFixed(2)}
              </span>
            </div>
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
              &copy; 2026 FERAL PRESENTS. ALL RIGHTS RESERVED.
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
