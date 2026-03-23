"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Calendar, MapPin, Shield } from "lucide-react";

type PageStatus = "loading" | "ready" | "show_payment" | "confirming" | "success" | "error" | "already_done";

interface AcceptData {
  guest: { name: string; email?: string; access_level: string; access_label: string; qty?: number };
  event: { name: string; venue_name?: string; date_start?: string; doors_time?: string; currency?: string } | null;
  branding?: { org_name: string; logo_url: string | null; accent_color: string };
  status: string;
  message?: string;
  payment_amount?: number;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return dateStr; }
}

const PaymentSection = lazy(() => import("../PaymentSection"));

export default function AcceptPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<PageStatus>("loading");
  const [data, setData] = useState<AcceptData | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{ amount: string; symbol: string } | null>(null);

  const isPaid = (data?.payment_amount || 0) > 0;
  const event = data?.event;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/guest-list/rsvp/${token}`);
        if (!res.ok) { setStatus("error"); return; }
        const json = await res.json();
        setData(json);

        if (json.status === "approved") { setStatus("already_done"); return; }

        setStatus("ready");
      } catch { setStatus("error"); }
    }
    if (token) load();
  }, [token]);

  // Step 2: when user clicks "Confirm your spot" for paid, create PI
  const handleConfirmStep = async () => {
    if (!isPaid) {
      // Free — just RSVP directly
      setStatus("confirming");
      try {
        const res = await fetch(`/api/guest-list/rsvp/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "accept" }),
        });
        const json = await res.json();
        if (json.status === "approved" || json.status === "accepted") setStatus("success");
      } catch { setStatus("error"); }
      return;
    }

    // Paid — create PaymentIntent then show payment form
    setStatus("confirming");
    try {
      const piRes = await fetch("/api/guest-list/application-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (piRes.ok) {
        const piJson = await piRes.json();
        setClientSecret(piJson.client_secret);
        setStripeAccountId(piJson.stripe_account_id || null);
        setPaymentInfo({ amount: (piJson.amount / 100).toFixed(2), symbol: piJson.currency_symbol || "£" });
        setStatus("show_payment");
      } else {
        const piJson = await piRes.json();
        if (piJson.error === "Already paid") { setStatus("already_done"); return; }
        setPaymentError(piJson.error || "Something went wrong");
        setStatus("ready");
      }
    } catch {
      setPaymentError("Network error. Please try again.");
      setStatus("ready");
    }
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    try {
      const res = await fetch("/api/guest-list/application-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_intent_id: paymentIntentId, token }),
      });
      if (!res.ok) {
        const json = await res.json();
        setPaymentError(json.error || "Failed to issue ticket. Contact the promoter.");
        return;
      }
    } catch {
      setPaymentError("Network error confirming your ticket. Please contact the promoter.");
      return;
    }
    setStatus("success");
  };

  // Logo
  const logo = data?.branding?.logo_url ? (
    <div className="mb-8 flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.branding.logo_url} alt={data.branding.org_name || ""} className="h-8 w-auto max-w-[140px] object-contain opacity-80" />
    </div>
  ) : data?.branding?.org_name ? (
    <p className="mb-8 text-center font-mono text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground/60">{data.branding.org_name}</p>
  ) : null;

  // Loading
  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/60" /></div>;
  }

  // Error
  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10"><XCircle className="h-7 w-7 text-destructive" /></div>
          <h1 className="mt-5 text-lg font-bold text-foreground">Link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">This link is no longer valid.</p>
        </div>
      </div>
    );
  }

  // Already done
  if (status === "already_done") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          {logo}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10"><CheckCircle2 className="h-7 w-7 text-success" /></div>
          <h1 className="mt-5 text-lg font-bold text-foreground">You're confirmed.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Check your email for your ticket.</p>
        </div>
      </div>
    );
  }

  // Success
  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          {logo}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10"><CheckCircle2 className="h-7 w-7 text-success" /></div>
          <h1 className="mt-5 text-lg font-bold text-foreground">You're in.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your ticket has been sent to your email.</p>
          {event && (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
              <p className="text-sm font-semibold text-foreground">{event.name}</p>
              {event.venue_name && <p className="mt-1 text-xs text-muted-foreground">{event.venue_name}</p>}
              {event.date_start && <p className="mt-1 text-xs text-muted-foreground">{formatDate(event.date_start)}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Step 2: Show payment form (after clicking confirm)
  if (status === "show_payment" && clientSecret && paymentInfo) {
    return (
      <div className="flex min-h-screen justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {logo}

          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Confirm your guest list</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A {paymentInfo.symbol}{paymentInfo.amount} booking fee is required to secure your spot.
            </p>
          </div>

          {event && (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-foreground">{event.name}</p>
              {event.venue_name && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" /><span>{event.venue_name}</span>
                </div>
              )}
              {event.date_start && (
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 shrink-0" /><span>{formatDate(event.date_start)}</span>
                </div>
              )}
            </div>
          )}

          {paymentError && (
            <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
              <p className="text-xs text-destructive">{paymentError}</p>
            </div>
          )}

          <div className="mt-6">
            <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary/60" /></div>}>
              <PaymentSection
                clientSecret={clientSecret}
                stripeAccountId={stripeAccountId}
                accentColor={data?.branding?.accent_color || "#8B5CF6"}
                guestName={data?.guest?.name || ""}
                guestEmail={data?.guest?.email || ""}
                formattedPrice={paymentInfo ? `${paymentInfo.symbol}${paymentInfo.amount}` : undefined}
                onSuccess={handlePaymentSuccess}
                onError={(msg) => setPaymentError(msg)}
              />
            </Suspense>
          </div>

        </div>
      </div>
    );
  }

  // Step 1: "You've been accepted" — confirm button (no payment shown yet)
  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {logo}

        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 mb-5">
            <Shield className="h-7 w-7 text-success" />
          </div>
          <h1 className="text-xl font-bold text-foreground">You've been accepted.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {data?.guest?.name?.split(/\s+/)[0]}, you're on the guest list for {event?.name || "this event"}.
            {isPaid ? " Confirm your attendance to secure your spot." : " Confirm below and we'll send your ticket."}
          </p>
        </div>

        {event && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold text-foreground">{event.name}</p>
            {event.venue_name && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" /><span>{event.venue_name}</span>
              </div>
            )}
            {event.date_start && (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" /><span>{formatDate(event.date_start)}</span>
              </div>
            )}
          </div>
        )}

        {paymentError && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
            <p className="text-xs text-destructive">{paymentError}</p>
          </div>
        )}

        <div className="mt-6">
          <button type="button" onClick={handleConfirmStep} disabled={status === "confirming"}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {status === "confirming" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm your spot
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/40">
          If you didn't expect this, you can safely ignore it.
        </p>
      </div>
    </div>
  );
}
