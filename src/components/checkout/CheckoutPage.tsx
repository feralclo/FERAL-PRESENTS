"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { WeeZTixEmbed } from "./WeeZTixEmbed";
import { CheckoutTimer } from "./CheckoutTimer";
import { LoadingScreen } from "./LoadingScreen";
import { OrderSummary } from "./OrderSummary";
import { DiscountPopup } from "@/components/event/DiscountPopup";
import { useTraffic } from "@/hooks/useTraffic";
import { useDataLayer } from "@/hooks/useDataLayer";
import { DEFAULT_TICKETS } from "@/lib/constants";
import type { ParsedCartItem } from "@/types/tickets";
import "@/styles/checkout-page.css";

// Ticket ID → display name mapping
const TICKET_NAMES: Record<string, string> = {
  [DEFAULT_TICKETS.GENERAL]: "General Release",
  [DEFAULT_TICKETS.VIP]: "VIP Ticket",
  [DEFAULT_TICKETS.VIP_TEE]: "VIP Black + Tee",
};

function parseCart(cartParam: string | null): ParsedCartItem[] {
  if (!cartParam) {
    return [
      {
        ticketId: DEFAULT_TICKETS.GENERAL,
        name: "General Release",
        qty: 1,
      },
    ];
  }

  const items: ParsedCartItem[] = [];
  const parts = cartParam.split(",");
  for (const part of parts) {
    const segments = part.split(":");
    if (segments.length >= 2) {
      const ticketId = segments[0];
      const qty = parseInt(segments[1], 10) || 1;
      const size = segments[2] || undefined;
      const name = TICKET_NAMES[ticketId] || "Ticket";
      items.push({ ticketId, name, qty, size });
    }
  }
  return items;
}

interface CheckoutPageProps {
  slug: string;
}

export function CheckoutPage({ slug }: CheckoutPageProps) {
  const searchParams = useSearchParams();
  const cartParam = searchParams.get("cart");
  const qtyParam = searchParams.get("qty");
  const { push } = useDataLayer();
  useTraffic();

  const [loading, setLoading] = useState(true);

  // Parse cart items from URL
  const cartItems = useMemo(() => {
    if (cartParam) return parseCart(cartParam);
    // Legacy format: ?qty=N
    if (qtyParam) {
      const qty = parseInt(qtyParam, 10) || 1;
      return [
        {
          ticketId: DEFAULT_TICKETS.GENERAL,
          name: "General Release",
          qty,
        },
      ];
    }
    return parseCart(null);
  }, [cartParam, qtyParam]);

  // Track checkout event
  useEffect(() => {
    const ids = cartItems.map((item) => item.ticketId);
    push({
      event: "initiate_checkout",
      content_ids: ids,
      content_type: "product",
      currency: "GBP",
      num_items: cartItems.reduce((sum, item) => sum + item.qty, 0),
    });
  }, [cartItems, push]);

  return (
    <>
      <header className="header" id="header">
        <div className="announcement-banner">
          <span className="announcement-banner__shield">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
                fill="#fff"
              />
              <path
                d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z"
                fill="#ff0033"
              />
            </svg>
          </span>
          <span className="announcement-banner__verified">
            Official FERAL ticket store
          </span>
        </div>
        <Header />
      </header>

      <main className="checkout-page" style={{ paddingTop: "100px" }}>
        <div className="container">
          <div className="checkout-layout">
            <div className="checkout-layout__main">
              <h1
                className="checkout-heading"
                style={{
                  fontFamily: "var(--font-space-mono), 'Space Mono', monospace",
                  fontSize: "1.5rem",
                  letterSpacing: "2px",
                  color: "#fff",
                  marginBottom: "1rem",
                }}
              >
                CHECKOUT
              </h1>

              <CheckoutTimer />
              <OrderSummary items={cartItems} />

              {loading && <LoadingScreen />}

              <WeeZTixEmbed
                cartItems={cartItems}
                onReady={() => setLoading(false)}
              />
            </div>
          </div>
        </div>
      </main>

      <DiscountPopup mobileDelay={6000} desktopDelay={12000} />

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
