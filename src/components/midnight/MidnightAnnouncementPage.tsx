"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { MidnightFooter } from "./MidnightFooter";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventTracking } from "@/hooks/useEventTracking";
import { isEditorPreview } from "@/components/event/ThemeEditorBridge";
import { Check, Bell } from "lucide-react";
import type { Event, TicketTypeRow } from "@/types/events";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface MidnightAnnouncementPageProps {
  event: Event & { ticket_types: TicketTypeRow[] };
  ticketsLiveAt: Date;
  settings: Record<string, unknown> | null;
}

export function MidnightAnnouncementPage({
  event,
  ticketsLiveAt,
  settings: _settings,
}: MidnightAnnouncementPageProps) {
  const headerHidden = useHeaderScroll();
  const countdown = useCountdown(ticketsLiveAt);
  const tracking = useEventTracking();

  const storageKey = `feral_announced_${event.id}`;
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Track page view
  useEffect(() => {
    if (isEditorPreview()) return;
    tracking.trackPageView();
  }, [tracking]);

  // Check localStorage for existing signup
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey)) {
        setSubmitted(true);
      }
    } catch {
      // localStorage unavailable
    }
  }, [storageKey]);

  // Reload page when countdown reaches zero
  useEffect(() => {
    if (countdown.passed) {
      window.location.reload();
    }
  }, [countdown.passed]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || submitting) return;

      setSubmitting(true);
      setError("");

      try {
        const res = await fetch("/api/announcement/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            event_id: event.id,
          }),
        });

        if (res.ok) {
          setSubmitted(true);
          try {
            localStorage.setItem(storageKey, "1");
          } catch {
            // ignore
          }
        } else {
          const json = await res.json().catch(() => ({}));
          setError(json.error || "Something went wrong");
        }
      } catch {
        setError("Network error. Please try again.");
      }

      setSubmitting(false);
    },
    [email, event.id, storageKey, submitting]
  );

  const pad = (n: number) => String(n).padStart(2, "0");

  const heroImage =
    event.hero_image ||
    event.cover_image ||
    `/api/media/event_${event.id}_banner`;

  const dateDisplay = (() => {
    const d = new Date(event.date_start);
    return d
      .toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
      .toUpperCase();
  })();

  const locationDisplay = [event.venue_name, event.city]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      {/* Navigation */}
      <header
        className={`header${headerHidden ? " header--hidden" : ""}`}
        id="header"
      >
        <VerifiedBanner />
        <Header />
      </header>

      <main className="relative min-h-screen bg-background overflow-hidden">
        {/* Full-viewport hero background */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${heroImage})`,
            filter: "brightness(0.55)",
          }}
        />

        {/* Radial vignette overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 40%, transparent 20%, rgba(0, 0, 0, 0.7) 100%)",
          }}
        />

        {/* Directional gradient — darker at bottom for footer blend */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.6) 100%)",
          }}
        />

        {/* Content — centered card */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-5 py-24 max-md:py-20 max-md:pt-[calc(var(--header-height)+32px)]">
          <div className="midnight-announcement-card w-full max-w-[480px] rounded-2xl p-8 max-md:p-6">
            {/* Coming Soon badge */}
            <div className="flex items-center gap-2 mb-6 max-md:mb-5">
              <span className="relative flex size-2">
                <span
                  className="absolute inline-flex size-full rounded-full opacity-75"
                  style={{
                    backgroundColor: "var(--color-primary)",
                    animation: "midnight-pulse 2s ease-in-out infinite",
                  }}
                />
                <span
                  className="relative inline-flex size-2 rounded-full"
                  style={{ backgroundColor: "var(--color-primary)" }}
                />
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/70">
                {event.announcement_title || "Coming Soon"}
              </span>
            </div>

            {/* Event name — cinematic typography */}
            <h1 className="font-[family-name:var(--font-mono)] text-[clamp(1.75rem,5vw,2.5rem)] font-bold uppercase leading-[1.1] tracking-[0.04em] text-foreground mb-4 max-md:mb-3">
              {event.name}
            </h1>

            {/* Date & venue */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-8 max-md:mb-6">
              <span className="font-[family-name:var(--font-sans)] text-sm text-foreground/60">
                {dateDisplay}
              </span>
              {locationDisplay && (
                <>
                  <span className="text-foreground/20">&middot;</span>
                  <span className="font-[family-name:var(--font-sans)] text-sm text-foreground/60">
                    {locationDisplay}
                  </span>
                </>
              )}
            </div>

            {/* Countdown */}
            <div className="flex gap-3 max-md:gap-2.5 mb-8 max-md:mb-6">
              {[
                { value: countdown.days, label: "days" },
                { value: countdown.hours, label: "hrs" },
                { value: countdown.mins, label: "min" },
                { value: countdown.secs, label: "sec" },
              ].map(({ value, label }) => (
                <div
                  key={label}
                  className="midnight-countdown-unit flex-1 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] py-3 max-md:py-2.5 text-center"
                >
                  <div className="font-[family-name:var(--font-mono)] text-2xl max-md:text-xl font-bold text-foreground tabular-nums tracking-wide">
                    {pad(value)}
                  </div>
                  <div className="font-[family-name:var(--font-sans)] text-[10px] uppercase tracking-[0.12em] text-foreground/35 mt-1">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.1] to-transparent mb-6 max-md:mb-5" />

            {/* Subtitle */}
            <p className="font-[family-name:var(--font-sans)] text-[13px] leading-relaxed text-foreground/55 mb-5 max-md:mb-4">
              {event.announcement_subtitle ||
                "Be the first to know when tickets drop."}
            </p>

            {submitted ? (
              /* Success state */
              <div className="flex items-center gap-3 py-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-center size-10 rounded-full bg-foreground/10">
                  <Check className="size-5 text-foreground" />
                </div>
                <div>
                  <span className="block font-[family-name:var(--font-sans)] text-sm font-medium text-foreground/90">
                    You&apos;re on the list
                  </span>
                  <span className="block font-[family-name:var(--font-sans)] text-xs text-foreground/40 mt-0.5">
                    We&apos;ll email you when tickets go live
                  </span>
                </div>
              </div>
            ) : (
              /* Email signup form */
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full h-12 px-4 rounded-xl bg-foreground/[0.05] border border-foreground/[0.1] text-foreground text-sm font-[family-name:var(--font-sans)] placeholder:text-foreground/30 focus:outline-none focus:border-foreground/25 transition-colors"
                  style={{ fontSize: "16px" }}
                  autoComplete="email"
                />
                {error && (
                  <p className="text-xs text-red-400">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="midnight-announcement-cta w-full h-12 rounded-xl text-[13px] font-bold tracking-[0.05em] uppercase cursor-pointer active:scale-[0.98] transition-transform duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Bell className="size-3.5" />
                  {submitting ? "Signing up..." : "Notify Me"}
                </button>
              </form>
            )}
          </div>

          {/* Privacy note */}
          <p className="mt-5 font-[family-name:var(--font-sans)] text-[11px] text-foreground/25 tracking-wide">
            No spam &middot; Unsubscribe anytime
          </p>
        </div>
      </main>

      <MidnightFooter />
    </>
  );
}
