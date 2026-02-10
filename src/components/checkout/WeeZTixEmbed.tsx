"use client";

import { useEffect, useRef } from "react";
import { WEEZTIX_SHOP_ID } from "@/lib/constants";
import type { ParsedCartItem } from "@/types/tickets";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    OpenTicket?: {
      ShopInjector?: new () => {
        init: (config: Record<string, unknown>) => Promise<void>;
        shop: {
          sendMessage: (msg: Record<string, unknown>) => void;
          onCartData: (cb: (data: any) => void) => void;
        };
      };
    };
    ShopInjector?: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface WeeZTixEmbedProps {
  cartItems: ParsedCartItem[];
  onProgress?: (pct: number, detail: string) => void;
  onReady?: () => void;
}

/**
 * WeeZTix ShopInjector embed component.
 * Matches checkout/index.html lines 856-998 exactly.
 *
 * Flow:
 * 1. Load injector.js script
 * 2. Poll for window.OpenTicket.ShopInjector
 * 3. new ShopInjector() — NO args
 * 4. await injector.init(config) — config has url, guid, container (string ID)
 * 5. injector.shop.onCartData(cb) — track ticket additions
 * 6. injector.shop.sendMessage({ action: 'add', guid, type: 'ticket' }) — add tickets one by one
 */
export function WeeZTixEmbed({ cartItems, onProgress, onReady }: WeeZTixEmbedProps) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const totalQty = cartItems.reduce((sum, item) => sum + item.qty, 0);

    // Load the WeeZTix injector script
    const script = document.createElement("script");
    script.src = "https://v1.widget.shop.eventix.io/injector.js";
    script.async = true;
    document.body.appendChild(script);

    (async () => {
      // Step 1: Wait for OpenTicket.ShopInjector to be available
      onProgress?.(25, "Loading payment system\u2026");

      await new Promise<void>((resolve) => {
        function check() {
          if (window.OpenTicket && window.OpenTicket.ShopInjector) {
            resolve();
          } else {
            setTimeout(check, 200);
          }
        }
        check();
      });

      onProgress?.(40, "Initialising shop\u2026");

      // Step 2: Get persisted campaign data (matches original)
      function getPersistedValues(): Record<string, unknown> {
        try {
          const sessionValue = window.sessionStorage.getItem(
            "@openticket:persist-campaign-data:entries"
          );
          if (sessionValue) return JSON.parse(sessionValue);
          const cookies = document.cookie.split(";");
          for (const c of cookies) {
            const trimmed = c.trim();
            if (trimmed.startsWith("@openticket:persist-campaign-data:entries=")) {
              return JSON.parse(trimmed.split("=").slice(1).join("="));
            }
          }
        } catch {
          // ignore
        }
        return {};
      }

      const config: Record<string, unknown> = {
        url: "https://shop.weeztix.com/" + WEEZTIX_SHOP_ID,
        guid: WEEZTIX_SHOP_ID,
        container: "eventix-shop-container",
        cookiePreferences: {
          functional: true,
          analytical: true,
          organiserMarketing: true,
          embeddedContent: true,
        },
      };

      const persistedValues = getPersistedValues();
      if (Object.keys(persistedValues).length > 0) {
        config.trackingInfo = persistedValues;
      }

      try {
        // Step 3: Create injector with NO args, init with config
        const ShopInjector = window.OpenTicket!.ShopInjector!;
        window.ShopInjector = new ShopInjector();
        await window.ShopInjector.init(config);

        onProgress?.(60, `Adding ${totalQty} ${totalQty === 1 ? "ticket" : "tickets"} to cart\u2026`);

        // Step 4: Set up iframe resize via MutationObserver
        const container = document.getElementById("eventix-shop-container");
        if (container) {
          const observer = new MutationObserver(() => {
            const iframe = container.querySelector("iframe");
            if (iframe) {
              window.addEventListener("message", (e) => {
                if (e.data && typeof e.data.height === "number") {
                  const h = Math.max(2400, e.data.height + 100);
                  iframe.style.height = h + "px";
                  iframe.style.minHeight = h + "px";
                }
              });
              observer.disconnect();
            }
          });
          observer.observe(container, { childList: true, subtree: true });
        }

        // Step 5: Build ticket queue and add one by one
        const ticketQueue = cartItems.map((item) => ({
          id: item.ticketId,
          remaining: item.qty,
          added: 0,
        }));
        let currentTicketIndex = 0;
        let totalTicketsAdded = 0;

        function getCurrentTicket() {
          while (
            currentTicketIndex < ticketQueue.length &&
            ticketQueue[currentTicketIndex].remaining <= 0
          ) {
            currentTicketIndex++;
          }
          return ticketQueue[currentTicketIndex] || null;
        }

        function addNextTicket() {
          const ticket = getCurrentTicket();
          if (!ticket) return;
          window.ShopInjector.shop.sendMessage({
            action: "add",
            guid: ticket.id,
            type: "ticket",
          });
        }

        // Step 6: Track cart data updates
        window.ShopInjector.shop.onCartData(
          (data: Record<string, { tickets?: Record<string, { count?: number }> }> | null) => {
            if (totalTicketsAdded >= totalQty) return;

            let cartTotal = 0;
            ticketQueue.forEach((ticket) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const d = data as any;
              if (d && d.tickets && d.tickets[ticket.id]) {
                const count = d.tickets[ticket.id].count || 0;
                ticket.added = count;
                cartTotal += count;
              }
            });

            if (cartTotal > totalTicketsAdded) {
              totalTicketsAdded = cartTotal;

              // Update remaining counts
              ticketQueue.forEach((ticket) => {
                const target = cartItems.find((c) => c.ticketId === ticket.id);
                if (target) {
                  ticket.remaining = target.qty - ticket.added;
                }
              });

              // Update progress
              const pct = 60 + Math.round((totalTicketsAdded / totalQty) * 35);
              onProgress?.(pct, `Added ${totalTicketsAdded} of ${totalQty} ${totalQty === 1 ? "ticket" : "tickets"}`);

              if (totalTicketsAdded >= totalQty) {
                // All tickets added — checkout ready
                onProgress?.(100, "Ready");
                setTimeout(() => onReady?.(), 400);
              } else {
                setTimeout(addNextTicket, 150);
              }
            }
          }
        );

        // Start adding tickets after a short delay
        setTimeout(addNextTicket, 500);

        // Fallback: hide loading after 12s no matter what
        setTimeout(() => {
          onProgress?.(100, "Ready");
          setTimeout(() => onReady?.(), 300);
        }, 12000);
      } catch (err) {
        console.error("[WeeZTix] Initialization error:", err);
        onProgress?.(100, "Ready");
        onReady?.();
      }
    })();

    return () => {
      // Cleanup: script stays in DOM (WeeZTix manages its own lifecycle)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div id="eventix-shop-container" style={{ minHeight: "600px" }} />;
}
