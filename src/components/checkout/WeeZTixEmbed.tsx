"use client";

import { useEffect, useRef } from "react";
import { WEEZTIX_SHOP_ID } from "@/lib/constants";
import type { ParsedCartItem } from "@/types/tickets";

declare global {
  interface Window {
    OpenTicket?: {
      ShopInjector?: new (config: Record<string, unknown>) => {
        init: () => void;
        shop: {
          sendMessage: (msg: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface WeeZTixEmbedProps {
  cartItems: ParsedCartItem[];
  onReady?: () => void;
}

/**
 * WeeZTix ShopInjector embed component.
 * Dynamically loads the injector script, initializes the shop,
 * and adds cart items.
 *
 * This is the most critical payment integration — handles real money.
 * Matches existing checkout/index.html lines 856-998 exactly.
 */
export function WeeZTixEmbed({ cartItems, onReady }: WeeZTixEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Load the WeeZTix injector script
    const script = document.createElement("script");
    script.src = "https://v1.widget.shop.eventix.io/injector.js";
    script.async = true;
    document.body.appendChild(script);

    // Poll for the ShopInjector to be available
    let attempts = 0;
    const maxAttempts = 100; // 10 seconds

    const pollInterval = setInterval(() => {
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        console.error("[WeeZTix] ShopInjector failed to load");
        onReady?.();
        return;
      }

      if (!window.OpenTicket?.ShopInjector) return;

      clearInterval(pollInterval);

      try {
        const ShopInjector = window.OpenTicket.ShopInjector;
        const injector = new ShopInjector({
          shopId: WEEZTIX_SHOP_ID,
          element: containerRef.current,
          styles: {
            primaryColor: "#ff0033",
            backgroundColor: "#0e0e0e",
            textColor: "#ffffff",
          },
          onCartData: () => {
            // Cart data updated — WeeZTix has acknowledged the items
          },
          onReady: () => {
            // Shop is ready — add cart items
            cartItems.forEach((item) => {
              for (let i = 0; i < item.qty; i++) {
                injector.shop.sendMessage({
                  action: "add",
                  guid: item.ticketId,
                  type: "ticket",
                });
              }
            });

            onReady?.();
          },
        });

        injector.init();

        // Resize observer for iframe
        if (containerRef.current) {
          const iframe = containerRef.current.querySelector("iframe");
          if (iframe) {
            iframe.style.width = "100%";
            iframe.style.minHeight = "2400px";
            iframe.style.border = "none";
          }
        }
      } catch (err) {
        console.error("[WeeZTix] Initialization error:", err);
        onReady?.();
      }
    }, 100);

    return () => {
      clearInterval(pollInterval);
    };
  }, [cartItems, onReady]);

  return (
    <div
      id="eventix-shop-container"
      ref={containerRef}
      style={{ minHeight: "600px" }}
    />
  );
}
