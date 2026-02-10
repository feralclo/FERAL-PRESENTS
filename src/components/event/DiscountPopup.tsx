"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { subscribeToKlaviyo, identifyInKlaviyo } from "@/lib/klaviyo";
import { DISCOUNT_CODE, POPUP_DISMISS_DAYS, ORG_ID } from "@/lib/constants";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Screen = "commitment" | "email" | "code";

function trackPopupEvent(eventType: string, page: string) {
  fetch(`${SUPABASE_URL}/rest/v1/popup_events`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      event_type: eventType,
      page,
      user_agent: navigator.userAgent,
      org_id: ORG_ID,
    }),
    cache: "no-store",
  }).catch(() => {});
}

function isDismissed(): boolean {
  try {
    const ts = localStorage.getItem("feral_dp_shown");
    if (!ts) return false;
    const elapsed = Date.now() - parseInt(ts, 10);
    return elapsed < POPUP_DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem("feral_dp_shown", String(Date.now()));
  } catch {
    // ignore
  }
}

interface DiscountPopupProps {
  /** Delay in ms before showing (mobile) */
  mobileDelay?: number;
  /** Delay in ms before showing (desktop fallback) */
  desktopDelay?: number;
}

/**
 * 3-screen discount popup with email capture.
 * Matches existing popup system: micro-commitment → email → code reveal.
 * Tracks events to Supabase popup_events table.
 */
export function DiscountPopup({
  mobileDelay = 6000,
  desktopDelay = 12000,
}: DiscountPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>("commitment");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [countdown, setCountdown] = useState(299); // 4:59
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const page = typeof window !== "undefined" ? window.location.pathname : "";

  // Show popup after delay (if not dismissed)
  useEffect(() => {
    if (isDismissed()) return;

    const isMobile = window.innerWidth < 768;
    const delay = isMobile ? mobileDelay : desktopDelay;

    const timer = setTimeout(() => {
      if (!isDismissed()) {
        setIsOpen(true);
        trackPopupEvent("impressions", page);
      }
    }, delay);

    // Desktop: exit intent
    function handleMouseLeave(e: MouseEvent) {
      if (e.clientY <= 0 && !isDismissed()) {
        setIsOpen(true);
        trackPopupEvent("impressions", page);
        document.removeEventListener("mouseout", handleMouseLeave);
      }
    }

    if (!isMobile) {
      document.addEventListener("mouseout", handleMouseLeave);
    }

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseout", handleMouseLeave);
    };
  }, [mobileDelay, desktopDelay, page]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen) return;
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    markDismissed();
    trackPopupEvent("dismissed", page);
  }, [page]);

  const handleCommit = useCallback(() => {
    setScreen("email");
    trackPopupEvent("engaged", page);
  }, [page]);

  const handleDismiss = useCallback(() => {
    close();
  }, [close]);

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.includes("@") || !email.includes(".")) {
        setEmailError("Please enter a valid email");
        return;
      }
      setEmailError("");

      await subscribeToKlaviyo(email);
      identifyInKlaviyo(email);

      trackPopupEvent("conversions", page);

      // Store code expiry (24h)
      try {
        localStorage.setItem(
          "feral_code_expiry",
          String(Date.now() + 24 * 60 * 60 * 1000)
        );
      } catch {
        // ignore
      }

      setScreen("code");
    },
    [email, page]
  );

  const handleUseCode = useCallback(() => {
    close();
    // Scroll to tickets
    const ticketsSection = document.getElementById("tickets");
    if (ticketsSection) {
      ticketsSection.scrollIntoView({ behavior: "smooth" });
    }
  }, [close]);

  if (!isOpen) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div className="dp-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dp-modal">
        <button className="dp-close" onClick={close}>
          &times;
        </button>

        {screen === "commitment" && (
          <div className="dp-screen dp-screen--commitment">
            <div className="dp-icon">🔥</div>
            <h3 className="dp-title">Unlock Feral Raver Discount</h3>
            <p className="dp-subtitle">
              Exclusive 10% off. Only for the next{" "}
              <span className="dp-timer">
                {minutes}:{seconds.toString().padStart(2, "0")}
              </span>
            </p>
            <button className="dp-btn dp-btn--primary" onClick={handleCommit}>
              Save My Discount
            </button>
            <button className="dp-btn dp-btn--ghost" onClick={handleDismiss}>
              Nah, I&apos;ll Pay Full Price
            </button>
          </div>
        )}

        {screen === "email" && (
          <div className="dp-screen dp-screen--email">
            <h3 className="dp-title">Almost there...</h3>
            <p className="dp-subtitle">
              Enter your email to unlock your exclusive discount code.
            </p>
            <form onSubmit={handleEmailSubmit}>
              <input
                type="email"
                className="dp-input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
              {emailError && <p className="dp-error">{emailError}</p>}
              <button type="submit" className="dp-btn dp-btn--primary">
                Unlock My Code
              </button>
            </form>
          </div>
        )}

        {screen === "code" && (
          <div className="dp-screen dp-screen--code">
            <div className="dp-icon">✅</div>
            <h3 className="dp-title">Your Code is Ready</h3>
            <div className="dp-code">{DISCOUNT_CODE}</div>
            <p className="dp-subtitle">
              Use at checkout. Expires in 24 hours.
            </p>
            <button className="dp-btn dp-btn--primary" onClick={handleUseCode}>
              Use Code Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
