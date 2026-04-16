"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MidnightWaitlistWidgetProps {
  eventId: string;
  eventName: string;
}

type State = "idle" | "loading" | "success" | "already_joined" | "error";

export function MidnightWaitlistWidget({ eventId, eventName }: MidnightWaitlistWidgetProps) {
  const [state, setState] = useState<State>("idle");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("loading");
    setError("");

    try {
      const res = await fetch("/api/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          event_id: eventId,
          first_name: firstName.trim() || undefined,
          marketing_consent: marketingConsent,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong — please try again.");
        setState("error");
        return;
      }

      if (data.already_joined) {
        setState("already_joined");
        return;
      }

      setPosition(data.position ?? null);
      setState("success");
    } catch {
      setError("Something went wrong — please try again.");
      setState("error");
    }
  }

  return (
    <aside
      className="sticky top-[calc(var(--header-height,80px)+24px)] lg:z-50 scroll-mt-[var(--header-height,80px)] max-lg:scroll-mt-[calc(var(--header-height,80px)-20px)] max-lg:relative [overflow-anchor:none]"
      id="tickets"
    >
      <Card className="glass rounded-2xl max-lg:rounded-none max-lg:border-0 max-lg:shadow-none max-lg:backdrop-blur-0 max-lg:bg-transparent p-0 gap-0">
        <CardContent className="p-8 max-lg:p-6 max-[480px]:p-4">
          {/* Sold Out header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-[family-name:var(--font-sans)] text-lg font-bold tracking-[-0.01em]">
                Sold Out
              </h3>
              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.2em] uppercase text-foreground/40 border border-foreground/10 px-2 py-0.5 rounded">
                Waitlist
              </span>
            </div>
            <p className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.1em] uppercase text-foreground/30">
              {eventName} is sold out — join the waitlist below
            </p>
          </div>

          {/* Success state */}
          {(state === "success" || state === "already_joined") ? (
            <div className="text-center py-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: "rgba(var(--accent-rgb, 255 0 51) / 0.12)", border: "1px solid rgba(var(--accent-rgb, 255 0 51) / 0.25)" }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent, #ff0033)" }} />
                </svg>
              </div>
              <p className="font-[family-name:var(--font-sans)] text-base font-semibold mb-1">
                {state === "already_joined" ? "You're already on the list" : "You're on the waitlist!"}
              </p>
              {state === "success" && position !== null && (
                <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.1em] uppercase text-foreground/40 mb-3">
                  Position{" "}
                  <span className="text-foreground/70 font-bold">#{position}</span>
                </p>
              )}
              <p className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/50 leading-relaxed">
                {state === "already_joined"
                  ? "We already have your details. We'll email you if a space opens up."
                  : "We'll email you immediately if a space opens up. First come, first served."}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Name field */}
              <input
                type="text"
                placeholder="First name (optional)"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={cn(
                  "w-full h-[44px] px-4 rounded-xl text-sm",
                  "bg-white/[0.05] border border-white/[0.08] text-foreground placeholder:text-foreground/30",
                  "focus:outline-none focus:border-white/20 focus:bg-white/[0.07] transition-colors"
                )}
              />

              {/* Email field */}
              <input
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={cn(
                  "w-full h-[44px] px-4 rounded-xl text-sm",
                  "bg-white/[0.05] border border-white/[0.08] text-foreground placeholder:text-foreground/30",
                  "focus:outline-none focus:border-white/20 focus:bg-white/[0.07] transition-colors"
                )}
              />

              {/* Marketing consent */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      "w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center",
                      marketingConsent
                        ? "border-[var(--accent,#ff0033)]"
                        : "border-white/20 bg-white/[0.04] group-hover:border-white/30"
                    )}
                    style={marketingConsent ? { background: "var(--accent, #ff0033)" } : {}}
                  >
                    {marketingConsent && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="font-[family-name:var(--font-sans)] text-[11px] text-foreground/40 leading-relaxed">
                  Keep me updated about future events and news
                </span>
              </label>

              {/* Error message */}
              {state === "error" && (
                <p className="font-[family-name:var(--font-sans)] text-[12px] text-red-400/80">{error}</p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={state === "loading" || !email.trim()}
                className={cn(
                  "w-full h-[48px] mt-1 text-[13px] max-[480px]:text-xs font-bold tracking-[0.03em] uppercase rounded-xl transition-all duration-300 cursor-pointer",
                  "bg-white/[0.08] border border-white/[0.12] text-foreground",
                  "hover:bg-white/[0.12] hover:border-white/[0.18]",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                {state === "loading" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                    <span>Joining...</span>
                  </span>
                ) : (
                  "Join Waitlist"
                )}
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}
