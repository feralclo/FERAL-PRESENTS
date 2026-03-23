"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, CheckCircle2, XCircle, Calendar, MapPin } from "lucide-react";

type PageStatus = "loading" | "ready" | "confirming" | "success" | "error" | "already_done";

interface AcceptData {
  guest: {
    name: string;
    access_level: string;
    access_label: string;
    qty?: number;
  };
  event: {
    name: string;
    venue_name?: string;
    date_start?: string;
    doors_time?: string;
  } | null;
  branding?: {
    org_name: string;
    logo_url: string | null;
    accent_color: string;
  };
  status: string;
  message?: string;
  payment_amount?: number;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return dateStr; }
}

// Payment form component (rendered inside Stripe Elements)
function PaymentForm({ amount, currency, onSuccess, onError }: {
  amount: string;
  currency: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (result.error) {
      onError(result.error.message || "Payment failed");
      setProcessing(false);
    } else if (result.paymentIntent) {
      onSuccess(result.paymentIntent.id);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <button type="submit" disabled={!stripe || processing}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Pay {currency}{amount} & confirm
      </button>
    </form>
  );
}

export default function AcceptPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<PageStatus>("loading");
  const [data, setData] = useState<AcceptData | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{ amount: string; symbol: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Fetch guest data via RSVP endpoint (extended with payment_amount)
        const res = await fetch(`/api/guest-list/rsvp/${token}`);
        if (!res.ok) { setStatus("error"); return; }
        const json = await res.json();
        setData(json);

        if (json.status === "approved") {
          setStatus("already_done");
          return;
        }

        const paymentAmount = json.payment_amount || 0;

        if (paymentAmount > 0) {
          // Create PaymentIntent
          const piRes = await fetch("/api/guest-list/application-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });

          if (piRes.ok) {
            const piJson = await piRes.json();
            setClientSecret(piJson.client_secret);
            setStripeAccountId(piJson.stripe_account_id || null);
            setPaymentInfo({
              amount: (piJson.amount / 100).toFixed(2),
              symbol: piJson.currency_symbol || "£",
            });
          } else {
            const piJson = await piRes.json();
            if (piJson.error === "Already paid") {
              setStatus("already_done");
              return;
            }
          }
        }

        setStatus("ready");
      } catch { setStatus("error"); }
    }
    if (token) load();
  }, [token]);

  const handleFreeConfirm = async () => {
    setStatus("confirming");
    try {
      const res = await fetch(`/api/guest-list/rsvp/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const json = await res.json();
      if (json.status === "approved" || json.status === "accepted") {
        setStatus("success");
      }
    } catch { setStatus("error"); }
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    // Confirm payment → issue ticket
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

  const logo = data?.branding?.logo_url ? (
    <div className="mb-6 flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.branding.logo_url} alt={data.branding.org_name || ""} className="h-8 w-auto max-w-[140px] object-contain opacity-80" />
    </div>
  ) : data?.branding?.org_name ? (
    <p className="mb-6 text-center font-mono text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground/60">{data.branding.org_name}</p>
  ) : null;

  const isPaid = (data?.payment_amount || 0) > 0;
  const event = data?.event;

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
            <div className="mt-6 rounded-xl border border-border/60 bg-card/50 p-4 text-left">
              <p className="text-sm font-semibold text-foreground">{event.name}</p>
              {event.venue_name && <p className="mt-1 text-xs text-muted-foreground">{event.venue_name}</p>}
              {event.date_start && <p className="mt-1 text-xs text-muted-foreground">{formatDate(event.date_start)}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ready — show confirmation or payment form
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stripePromise = useMemo(() => loadStripe(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
  ), [stripeAccountId]);

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {logo}

        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">You've been accepted.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isPaid
              ? `Complete your booking to confirm your spot.`
              : `Confirm your spot and we'll send your ticket.`
            }
          </p>
        </div>

        {/* Event details */}
        {event && (
          <div className="mt-5 rounded-xl border border-border/60 bg-card/50 p-4">
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
            {isPaid && paymentInfo && (
              <p className="mt-3 font-mono text-lg font-bold text-foreground">{paymentInfo.symbol}{paymentInfo.amount}</p>
            )}
          </div>
        )}

        {/* Applicant info (read-only) */}
        {data?.guest && (
          <div className="mt-4 rounded-lg border border-border/30 bg-card/20 px-3 py-2">
            <p className="text-sm text-foreground">{data.guest.name}</p>
          </div>
        )}

        {/* Payment error */}
        {paymentError && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
            <p className="text-xs text-destructive">{paymentError}</p>
          </div>
        )}

        {/* Free confirmation */}
        {!isPaid && (
          <div className="mt-6">
            <button type="button" onClick={handleFreeConfirm} disabled={status === "confirming"}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
              {status === "confirming" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm your spot
            </button>
          </div>
        )}

        {/* Paid — Stripe Elements */}
        {isPaid && clientSecret && paymentInfo && (
          <div className="mt-6">
            <Elements stripe={stripePromise} options={{
              clientSecret,
              appearance: {
                theme: "night",
                variables: {
                  colorPrimary: data?.branding?.accent_color || "#8B5CF6",
                  colorBackground: "#111117",
                  colorText: "#f0f0f5",
                  borderRadius: "8px",
                },
              },
            }}>
              <PaymentForm
                amount={paymentInfo.amount}
                currency={paymentInfo.symbol}
                onSuccess={handlePaymentSuccess}
                onError={(msg) => setPaymentError(msg)}
              />
            </Elements>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-muted-foreground/50">
          If you didn't expect this, you can safely ignore it.
        </p>
      </div>
    </div>
  );
}
