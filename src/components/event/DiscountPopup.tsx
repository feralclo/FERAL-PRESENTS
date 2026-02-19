"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { subscribeToKlaviyo, identifyInKlaviyo } from "@/lib/klaviyo";
import { DISCOUNT_CODE, POPUP_DISMISS_DAYS } from "@/lib/constants";
import "@/styles/popup.css";

type Screen = "commitment" | "email" | "code";

function trackPopupEvent(eventType: string, page: string, email?: string) {
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      table: "popup",
      event_type: eventType,
      page,
      user_agent: navigator.userAgent,
      ...(email ? { email: email.toLowerCase().trim() } : {}),
    }),
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
  mobileDelay?: number;
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
    if (isDismissed()) {
      // Popup won't show — notify toast it doesn't need to wait
      window.dispatchEvent(new CustomEvent("feral_popup_dismissed"));
      return;
    }

    const isMobile = window.innerWidth < 768;
    const delay = isMobile ? mobileDelay : desktopDelay;

    const timer = setTimeout(() => {
      if (!isDismissed()) {
        // Don't interrupt if a dialog (e.g. merch modal) is already open
        if (document.querySelector('[data-slot="dialog-overlay"]')) return;
        setIsOpen(true);
        trackPopupEvent("impressions", page);
      }
    }, delay);

    // Desktop: exit intent
    function handleMouseLeave(e: MouseEvent) {
      if (e.clientY <= 0 && !isDismissed()) {
        // Don't interrupt if a dialog is already open
        if (document.querySelector('[data-slot="dialog-overlay"]')) return;
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
    // Signal other components that the popup has been dismissed
    window.dispatchEvent(new CustomEvent("feral_popup_dismissed"));
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setEmailError("Please enter a valid email");
        return;
      }
      setEmailError("");

      await subscribeToKlaviyo(email);
      identifyInKlaviyo(email);

      trackPopupEvent("conversions", page, email.trim());

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
    const ticketsSection = document.getElementById("tickets");
    if (ticketsSection) {
      ticketsSection.scrollIntoView({ behavior: "smooth" });
    }
  }, [close]);

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const timerDisplay = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div
      className={`dp-overlay${isOpen ? " dp-overlay--visible" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="dp-modal">
        <button className="dp-close" onClick={close} aria-label="Close">
          &times;
        </button>

        {/* Screen 1: Micro-commitment */}
        <div className={`dp-screen${screen === "commitment" ? " dp-screen--active" : ""}`}>
          <div className="dp-body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/FERAL LOGO.svg" alt="FERAL" className="dp-logo" />
            <h2 className="dp-headline">Unlock Feral Raver Discount</h2>
            <p className="dp-sub">Save it before it&apos;s gone</p>
            <div className="dp-buttons">
              <button className="dp-btn dp-btn--primary" onClick={handleCommit}>
                Save My Discount
              </button>
              <button className="dp-btn dp-btn--secondary" onClick={handleDismiss}>
                Nah, I&apos;ll Pay Full Price
              </button>
            </div>
            <div className="dp-timer">
              <div className="dp-timer__label">Expires in</div>
              <div className="dp-timer__time">{timerDisplay}</div>
            </div>
          </div>
        </div>

        {/* Screen 2: Email capture */}
        <div className={`dp-screen${screen === "email" ? " dp-screen--active" : ""}`}>
          <div className="dp-body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/FERAL LOGO.svg" alt="FERAL" className="dp-logo" />
            <h2 className="dp-headline">Unlock Feral Raver Discount</h2>
            <p className="dp-sub">Enter your email to get the code</p>
            <div className={`dp-error${emailError ? " dp-error--visible" : ""}`}>
              {emailError || "Please enter a valid email"}
            </div>
            <form onSubmit={handleEmailSubmit}>
              <input
                type="email"
                className="dp-input"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
              <button
                type="submit"
                className="dp-btn dp-btn--primary"
                style={{ width: "100%" }}
              >
                Get My Discount
              </button>
            </form>
            <div className="dp-timer">
              <div className="dp-timer__label">Expires in</div>
              <div className="dp-timer__time">{timerDisplay}</div>
            </div>
          </div>
        </div>

        {/* Screen 3: Discount code reveal */}
        <div className={`dp-screen${screen === "code" ? " dp-screen--active" : ""}`}>
          <div className="dp-body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/FERAL LOGO.svg" alt="FERAL" className="dp-logo" />
            <h2 className="dp-headline">You&apos;re In</h2>
            <p className="dp-sub">
              Here&apos;s your exclusive discount code. Use it at checkout.
            </p>
            <div className="dp-code">
              <span className="dp-code__value">{DISCOUNT_CODE}</span>
            </div>
            <div className="dp-urgency">
              <div className="dp-urgency__label">Code expires in</div>
              <div className="dp-urgency__countdown">24:00:00</div>
            </div>
            <p className="dp-note">
              This code won&apos;t be shown again. Use it now before it expires.
            </p>
            <button
              className="dp-btn dp-btn--primary dp-done-btn"
              onClick={handleUseCode}
            >
              Use Code Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
