"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { subscribeToKlaviyo, identifyInKlaviyo } from "@/lib/klaviyo";
import { usePopupSettings } from "@/hooks/usePopupSettings";
import { useBranding } from "@/hooks/useBranding";
import { cn } from "@/lib/utils";

type Screen = "commitment" | "email" | "code";

/* ── Analytics ── */
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

/* ── Dismiss persistence ── */
function isDismissed(days: number): boolean {
  try {
    const ts = localStorage.getItem("feral_dp_shown");
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < days * 24 * 60 * 60 * 1000;
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

/**
 * Midnight-themed discount popup with glass treatment.
 * 3-screen flow: micro-commitment → email capture → code reveal.
 * Config driven by usePopupSettings (admin-configurable via site_settings).
 */
export function MidnightDiscountPopup() {
  const config = usePopupSettings();
  const branding = useBranding();

  const [isOpen, setIsOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>("commitment");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [countdown, setCountdown] = useState(config.countdown_seconds || 299);
  const exitIntentRef = useRef<((e: MouseEvent) => void) | null>(null);
  const hasOpenedRef = useRef(false);
  const page = typeof window !== "undefined" ? window.location.pathname : "";

  // Countdown timer — ticks while popup is open, stops on code reveal
  useEffect(() => {
    if (!isOpen || screen === "code") return;
    const id = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [isOpen, screen]);

  const timerMinutes = String(Math.floor(countdown / 60)).padStart(2, "0");
  const timerSeconds = String(countdown % 60).padStart(2, "0");
  const timerUrgent = countdown < 60;

  // Show popup after delay (if not dismissed and enabled).
  // Waits for cookie consent to be resolved first so the two
  // overlays never compete for the user's attention.
  useEffect(() => {
    if (!config.enabled) {
      window.dispatchEvent(new CustomEvent("feral_popup_dismissed"));
      return;
    }

    if (isDismissed(config.dismiss_days)) {
      window.dispatchEvent(new CustomEvent("feral_popup_dismissed"));
      return;
    }

    const isMobile = window.innerWidth < 768;
    const delay = isMobile ? config.mobile_delay : config.desktop_delay;

    function openPopup() {
      if (hasOpenedRef.current || isDismissed(config.dismiss_days)) return;
      // Don't interrupt if a dialog is already open
      if (document.querySelector('[data-slot="dialog-overlay"]')) return;
      hasOpenedRef.current = true;
      setIsOpen(true);
      trackPopupEvent("impressions", page);
    }

    let popupTimer: ReturnType<typeof setTimeout>;
    let consentHandler: (() => void) | null = null;

    function startPopupSchedule() {
      popupTimer = setTimeout(openPopup, delay);

      // Desktop: exit intent
      if (!isMobile && config.exit_intent) {
        const handleMouseLeave = (e: MouseEvent) => {
          if (e.clientY <= 0) {
            openPopup();
            document.removeEventListener("mouseout", handleMouseLeave);
          }
        };
        exitIntentRef.current = handleMouseLeave;
        document.addEventListener("mouseout", handleMouseLeave);
      }
    }

    // If cookie consent already resolved, start popup timer immediately.
    // Otherwise wait for consent to be given before starting the timer —
    // prevents the popup overlay from appearing behind the cookie card.
    const hasCookieConsent = !!localStorage.getItem("feral_cookie_consent");

    if (hasCookieConsent) {
      startPopupSchedule();
    } else {
      consentHandler = () => startPopupSchedule();
      window.addEventListener("feral_consent_update", consentHandler, { once: true });
    }

    return () => {
      clearTimeout(popupTimer);
      if (consentHandler) {
        window.removeEventListener("feral_consent_update", consentHandler);
      }
      if (exitIntentRef.current) {
        document.removeEventListener("mouseout", exitIntentRef.current);
      }
    };
  }, [config.enabled, config.dismiss_days, config.mobile_delay, config.desktop_delay, config.exit_intent, page]);

  const close = useCallback(() => {
    setIsOpen(false);
    markDismissed();
    trackPopupEvent("dismissed", page);
    window.dispatchEvent(new CustomEvent("feral_popup_dismissed"));
  }, [page]);

  const handleCommit = useCallback(() => {
    setScreen("email");
    trackPopupEvent("engaged", page);
  }, [page]);

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setEmailError("Please enter a valid email");
        return;
      }
      setEmailError("");

      if (config.klaviyo_enabled) {
        await subscribeToKlaviyo(email);
        identifyInKlaviyo(email);
      }

      // Capture customer in Entry backend (fire-and-forget)
      fetch("/api/popup/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      }).catch(() => {});

      trackPopupEvent("conversions", page, email.trim());

      // Store discount code for auto-apply at checkout + email for abandoned cart bridge
      try {
        sessionStorage.setItem("feral_popup_discount", config.discount_code);
        sessionStorage.setItem("feral_popup_email", email.trim());
      } catch {
        // ignore
      }

      // Notify MidnightEventPage so it can create abandoned cart + show discounted prices
      window.dispatchEvent(
        new CustomEvent("feral_popup_email_captured", {
          detail: { email: email.trim() },
        })
      );

      setScreen("code");
    },
    [email, page, config.klaviyo_enabled, config.discount_code]
  );

  const handleUseCode = useCallback(() => {
    close();
    const ticketsSection = document.getElementById("tickets");
    if (ticketsSection) {
      ticketsSection.scrollIntoView({ behavior: "smooth" });
    }
  }, [close]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) close();
    },
    [close]
  );

  // Don't render anything if disabled
  if (!config.enabled) return null;

  const logoUrl = branding.logo_url || "/images/FERAL%20LOGO.svg";

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay */}
        <DialogPrimitive.Overlay
          data-slot="dialog-overlay"
          className={cn(
            "fixed inset-0 z-[1000] bg-black/75",
            "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0",
            "motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0",
            // Mobile: no blur for perf. Desktop: soft blur
            "md:backdrop-blur-sm"
          )}
        />

        {/* Content */}
        <DialogPrimitive.Content
          data-theme="midnight"
          className={cn(
            "fixed top-1/2 left-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2",
            "w-[calc(100vw-40px)] max-w-[380px]",
            "rounded-2xl p-6 pt-5",
            // Glass treatment: desktop blur, mobile solid
            "max-md:bg-[#1a1a1a] max-md:border max-md:border-white/[0.08]",
            "md:bg-white/[0.08] md:border md:border-white/[0.10] md:backdrop-blur-[40px] md:saturate-[140%]",
            // Depth shadow + ambient glow
            "shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_1px_rgba(255,255,255,0.08)_inset,0_1px_0_rgba(255,255,255,0.06)_inset]",
            // Entry animation
            "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-[0.97]",
            "motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-[0.97]",
            "duration-200",
            // Focus management
            "outline-none"
          )}
        >
          {/* Accessibility — screen-reader-only titles */}
          <DialogPrimitive.Title className="sr-only">
            Exclusive Discount
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Get an exclusive discount code by entering your email
          </DialogPrimitive.Description>

          {/* Glass close button */}
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className={cn(
              "absolute top-3 right-3 z-10",
              "flex h-10 w-10 items-center justify-center rounded-full",
              "bg-white/[0.06] border border-white/[0.08]",
              "text-white/40 hover:text-white/80 hover:bg-white/[0.12] hover:border-white/[0.15]",
              "transition-all duration-200 cursor-pointer",
              "touch-manipulation"
            )}
          >
            <X size={16} />
          </button>

          {/* ═══ Screen 1: Commitment ═══ */}
          {screen === "commitment" && (
            <div className="flex flex-col items-center text-center">
              {/* Logo */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="h-8 w-auto mb-5 opacity-70"
              />

              {/* Section label — red accent with pulsing dot */}
              <p className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.15em] text-[#ff0033]/70 mb-3">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#ff0033] midnight-popup-pulse" />
                Limited Time Offer
              </p>

              {/* Headline */}
              <h2 className="font-[family-name:var(--font-sans)] text-[22px] font-bold text-white leading-tight mb-2">
                {config.headline}
              </h2>

              {/* Subheadline */}
              <p className="font-[family-name:var(--font-sans)] text-[15px] text-white/50 mb-4">
                {config.subheadline}
              </p>

              {/* Timer pill */}
              <div className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-5",
                "bg-white/[0.04] border border-white/[0.08]"
              )}>
                <span className={cn(
                  "font-[family-name:var(--font-mono)] text-[11px] font-medium tracking-[0.04em]",
                  timerUrgent ? "text-[#ff0033]/90" : "text-white/60"
                )}>
                  Expires in
                </span>
                <span className={cn(
                  "font-[family-name:var(--font-mono)] text-[13px] font-bold tracking-[0.06em] tabular-nums",
                  timerUrgent ? "text-[#ff0033]" : "text-white/80"
                )}>
                  {timerMinutes}:{timerSeconds}
                </span>
              </div>

              {/* CTA Button — frosted accent glass */}
              <button
                type="button"
                onClick={handleCommit}
                className={cn(
                  "w-full h-12 rounded-xl midnight-popup-cta-urgent",
                  "text-white",
                  "font-[family-name:var(--font-sans)] text-[14px] font-bold tracking-[0.02em]",
                  "active:scale-[0.97]",
                  "cursor-pointer touch-manipulation"
                )}
              >
                {config.cta_text}
              </button>

              {/* Dismiss button — glass */}
              <button
                type="button"
                onClick={close}
                className={cn(
                  "w-full h-12 mt-2.5 rounded-xl",
                  "bg-white/[0.04] border border-white/[0.06]",
                  "font-[family-name:var(--font-sans)] text-[13px] font-medium text-white/35",
                  "hover:text-white/50 hover:bg-white/[0.06]",
                  "transition-all duration-200",
                  "cursor-pointer touch-manipulation"
                )}
              >
                {config.dismiss_text}
              </button>

            </div>
          )}

          {/* ═══ Screen 2: Email Capture ═══ */}
          {screen === "email" && (
            <div className="flex flex-col items-center text-center">
              {/* Logo */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="h-8 w-auto mb-5 opacity-70"
              />

              {/* Section label — red accent */}
              <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.15em] text-[#ff0033]/50 mb-3">
                Almost There
              </p>

              {/* Headline */}
              <h2 className="font-[family-name:var(--font-sans)] text-[22px] font-bold text-white leading-tight mb-2">
                Enter Your Email
              </h2>

              {/* Subheadline */}
              <p className="font-[family-name:var(--font-sans)] text-[15px] text-white/50 mb-3.5">
                We&apos;ll send your exclusive code
              </p>

              {/* Timer pill */}
              <div className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-4",
                "bg-white/[0.04] border border-white/[0.08]"
              )}>
                <span className={cn(
                  "font-[family-name:var(--font-mono)] text-[11px] font-medium tracking-[0.04em]",
                  timerUrgent ? "text-[#ff0033]/90" : "text-white/60"
                )}>
                  Expires in
                </span>
                <span className={cn(
                  "font-[family-name:var(--font-mono)] text-[13px] font-bold tracking-[0.06em] tabular-nums",
                  timerUrgent ? "text-[#ff0033]" : "text-white/80"
                )}>
                  {timerMinutes}:{timerSeconds}
                </span>
              </div>

              {/* Error */}
              {emailError && (
                <p className="font-[family-name:var(--font-sans)] text-[12px] text-red-400 mb-3">
                  {emailError}
                </p>
              )}

              {/* Email form */}
              <form onSubmit={handleEmailSubmit} className="w-full">
                <input
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  autoComplete="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  className={cn(
                    "w-full h-12 px-4 rounded-xl mb-3",
                    "bg-white/[0.06] border border-white/[0.10]",
                    // 16px prevents iOS Safari auto-zoom on focus
                    "font-[family-name:var(--font-sans)] text-[16px] text-white placeholder:text-white/25",
                    "outline-none focus:border-white/[0.20] focus:bg-white/[0.08]",
                    "transition-all duration-200",
                    "touch-manipulation"
                  )}
                />

                {/* Submit — frosted accent glass */}
                <button
                  type="submit"
                  className={cn(
                    "w-full h-12 rounded-xl midnight-popup-cta-urgent",
                    "text-white",
                    "font-[family-name:var(--font-sans)] text-[14px] font-bold tracking-[0.02em]",
                    "active:scale-[0.97]",
                    "cursor-pointer touch-manipulation"
                  )}
                >
                  Get My Discount
                </button>
              </form>

            </div>
          )}

          {/* ═══ Screen 3: Code Reveal ═══ */}
          {screen === "code" && (
            <div className="flex flex-col items-center text-center">
              {/* Logo */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="h-8 w-auto mb-5 opacity-70"
              />

              {/* Section label — victory state, no urgency */}
              <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.15em] text-white/40 mb-3">
                Discount Unlocked
              </p>

              {/* Headline */}
              <h2 className="font-[family-name:var(--font-sans)] text-[22px] font-bold text-white leading-tight mb-2">
                You&apos;re In
              </h2>

              {/* Subheadline */}
              <p className="font-[family-name:var(--font-sans)] text-[15px] text-white/50 mb-5">
                Here&apos;s your exclusive discount code
              </p>

              {/* Code container — glass */}
              <div
                className={cn(
                  "w-full py-4 px-5 rounded-xl mb-4",
                  "bg-white/[0.04] border border-white/[0.12]"
                )}
              >
                <p className="font-[family-name:var(--font-mono)] text-[9px] font-medium uppercase tracking-[0.15em] text-white/20 mb-2">
                  Your Code
                </p>
                <p className="font-[family-name:var(--font-mono)] text-[20px] font-bold tracking-[0.10em] text-white">
                  {config.discount_code}
                </p>
              </div>

              {/* Note */}
              <p className="font-[family-name:var(--font-sans)] text-[11px] text-white/30 mb-5">
                This code won&apos;t be shown again. It will be applied automatically at checkout.
              </p>

              {/* CTA — solid white + ambient glow */}
              <button
                type="button"
                onClick={handleUseCode}
                className={cn(
                  "w-full h-12 rounded-xl midnight-popup-cta",
                  "bg-white text-[#0e0e0e]",
                  "font-[family-name:var(--font-sans)] text-[13px] font-bold tracking-[0.02em]",
                  "active:scale-[0.97] transition-transform duration-150",
                  "cursor-pointer touch-manipulation"
                )}
              >
                Apply Discount &amp; Browse Tickets
              </button>
            </div>
          )}

          {/* Inset light catch — top edge */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent rounded-t-2xl pointer-events-none" />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
