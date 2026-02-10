"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
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

  // Loading state — controlled by WeeZTix progress callbacks
  const [loadingHidden, setLoadingHidden] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Preparing your tickets");
  const [loadingDetail, setLoadingDetail] = useState("Connecting to checkout\u2026");
  const [loadingProgress, setLoadingProgress] = useState(10);
  const [timerActive, setTimerActive] = useState(false);

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

  // WeeZTix progress callback
  const handleProgress = useCallback((pct: number, detail: string) => {
    setLoadingProgress(pct);
    setLoadingDetail(detail);
    if (pct >= 60) {
      setLoadingStatus("Securing your tickets");
    }
    if (pct >= 100) {
      setLoadingStatus("All set");
    }
  }, []);

  // WeeZTix ready callback — hide loading, start timer
  const handleReady = useCallback(() => {
    setLoadingHidden(true);
    setTimerActive(true);
  }, []);

  return (
    <>
      {/* Loading Screen — full-screen overlay, hides when WeeZTix is ready */}
      <LoadingScreen
        hidden={loadingHidden}
        status={loadingStatus}
        detail={loadingDetail}
        progress={loadingProgress}
      />

      {/* Checkout Header — matches original checkout/index.html exactly */}
      <div className="checkout-header">
        <a href={`/event/${slug}/`} className="checkout-header__back">
          <span className="checkout-header__back-arrow">&larr;</span>
          <span>Back</span>
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
          <svg
            className="checkout-header__lock"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="5"
              y="11"
              width="14"
              height="10"
              rx="2"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M8 11V7a4 4 0 018 0v4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>Secure Checkout</span>
        </div>
      </div>

      {/* Timer — starts when loading screen hides */}
      <CheckoutTimer active={timerActive} />

      {/* Order Summary */}
      <OrderSummary items={cartItems} />

      {/* WeeZTix Embed Container */}
      <WeeZTixEmbed
        cartItems={cartItems}
        onProgress={handleProgress}
        onReady={handleReady}
      />

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
