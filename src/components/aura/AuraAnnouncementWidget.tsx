"use client";

import { useState, useEffect, useCallback } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";

interface AuraAnnouncementWidgetProps {
  eventId: string;
  ticketsLiveAt: Date;
  title?: string | null;
  subtitle?: string | null;
}

export function AuraAnnouncementWidget({
  eventId,
  ticketsLiveAt,
  title,
  subtitle,
}: AuraAnnouncementWidgetProps) {
  const countdown = useCountdown(ticketsLiveAt);

  const storageKey = `feral_announced_${eventId}`;
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey)) {
        setSubmitted(true);
      }
    } catch {
      // localStorage unavailable
    }
  }, [storageKey]);

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
    <Card>
      <CardContent className="p-6 space-y-5">
        <h2 className="text-lg font-semibold tracking-tight">
          {title || "Coming Soon"}
        </h2>

        {/* Countdown */}
        <div className="flex gap-3">
          {[
            { value: countdown.days, label: "days" },
            { value: countdown.hours, label: "hrs" },
            { value: countdown.mins, label: "min" },
            { value: countdown.secs, label: "sec" },
          ].map(({ value, label }) => (
            <div
              key={label}
              className="flex-1 rounded-lg bg-muted/50 py-3 text-center"
            >
              <div className="text-xl font-bold tabular-nums">{pad(value)}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {label}
              </div>
            </div>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {subtitle || "Sign up to be the first to know when tickets drop."}
        </p>

        {submitted ? (
          <div className="flex items-center gap-3 py-2 animate-in fade-in duration-300">
            <div className="flex items-center justify-center size-8 rounded-full bg-primary/10">
              <Check className="size-4 text-primary" />
            </div>
            <span className="text-sm text-foreground">
              You&apos;re on the list!
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              style={{ fontSize: "16px" }}
              autoComplete="email"
            />
            <Input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name (optional)"
              style={{ fontSize: "16px" }}
              autoComplete="given-name"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing up..." : "Notify Me"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
