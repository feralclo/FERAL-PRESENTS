"use client";

import { useState, useEffect, useCallback } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import { Check } from "lucide-react";

interface MidnightAnnouncementWidgetProps {
  eventId: string;
  ticketsLiveAt: Date;
  title?: string | null;
  subtitle?: string | null;
}

export function MidnightAnnouncementWidget({
  eventId,
  ticketsLiveAt,
  title,
  subtitle,
}: MidnightAnnouncementWidgetProps) {
  const countdown = useCountdown(ticketsLiveAt);

  const storageKey = `feral_announced_${eventId}`;
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
            event_id: eventId,
            first_name: firstName.trim() || undefined,
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
    [email, firstName, eventId, storageKey, submitting]
  );

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="sticky top-[calc(var(--header-height)+24px)] max-lg:relative max-lg:top-0 max-lg:px-[var(--midnight-content-px)]">
      <div className="midnight-glass rounded-2xl border border-foreground/[0.06] p-6 max-md:p-5">
        {/* Title */}
        <h2 className="font-[family-name:var(--font-mono)] text-sm font-bold uppercase tracking-[0.15em] text-foreground/90 mb-5">
          {title || "Coming Soon"}
        </h2>

        {/* Countdown */}
        <div className="flex gap-3 mb-5">
          {[
            { value: countdown.days, label: "days" },
            { value: countdown.hours, label: "hrs" },
            { value: countdown.mins, label: "min" },
            { value: countdown.secs, label: "sec" },
          ].map(({ value, label }) => (
            <div key={label} className="flex-1 text-center">
              <div className="font-[family-name:var(--font-mono)] text-2xl font-bold text-foreground tabular-nums tracking-wide">
                {pad(value)}
              </div>
              <div className="font-[family-name:var(--font-sans)] text-[10px] uppercase tracking-[0.12em] text-foreground/40 mt-1">
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Subtitle */}
        <p className="font-[family-name:var(--font-sans)] text-[13px] leading-relaxed text-foreground/60 mb-6">
          {subtitle || "Sign up to be the first to know when tickets drop."}
        </p>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent mb-6" />

        {submitted ? (
          /* Success state */
          <div className="flex items-center gap-3 py-3 animate-in fade-in duration-300">
            <div className="flex items-center justify-center size-8 rounded-full bg-foreground/10">
              <Check className="size-4 text-foreground" />
            </div>
            <span className="font-[family-name:var(--font-sans)] text-sm text-foreground/80">
              You&apos;re on the list!
            </span>
          </div>
        ) : (
          /* Signup form */
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full h-12 px-4 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-foreground text-sm font-[family-name:var(--font-sans)] placeholder:text-foreground/30 focus:outline-none focus:border-foreground/20 transition-colors"
              style={{ fontSize: "16px" }}
              autoComplete="email"
            />
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name (optional)"
              className="w-full h-12 px-4 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-foreground text-sm font-[family-name:var(--font-sans)] placeholder:text-foreground/30 focus:outline-none focus:border-foreground/20 transition-colors"
              style={{ fontSize: "16px" }}
              autoComplete="given-name"
            />
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-white text-[#0e0e0e] text-[13px] font-bold tracking-[0.03em] cursor-pointer active:scale-[0.98] transition-transform duration-150 disabled:opacity-50"
            >
              {submitting ? "Signing up..." : "Notify Me"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
