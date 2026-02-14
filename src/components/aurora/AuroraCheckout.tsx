"use client";

import { useState, useMemo, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useSearchParams } from "next/navigation";
import {
  Elements,
  ExpressCheckoutElement,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type {
  Stripe,
  StripeElementsOptions,
  StripeExpressCheckoutElementConfirmEvent,
  StripeExpressCheckoutElementClickEvent,
} from "@stripe/stripe-js";
import { AuroraCheckoutHeader } from "./AuroraCheckoutHeader";
import { AuroraOrderConfirmation } from "./AuroraOrderConfirmation";
import { AuroraFooter } from "./AuroraFooter";
import { AuroraCard, AuroraCardContent } from "./ui/card";
import { AuroraButton } from "./ui/button";
import { AuroraInput } from "./ui/input";
import { getStripeClient } from "@/lib/stripe/client";
import type { Event, TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";
import { getCurrencySymbol, toSmallestUnit } from "@/lib/stripe/config";
import "@/styles/aurora.css";
import "@/styles/aurora-effects.css";

interface AuroraCheckoutProps {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
}

interface CartLine {
  ticket_type_id: string;
  name: string;
  qty: number;
  price: number;
  merch_size?: string;
}

interface CardFieldsHandle {
  confirmPayment: (
    clientSecret: string,
    billingDetails: { name: string; email: string; address?: { country: string } }
  ) => Promise<{
    error?: { message?: string };
    paymentIntent?: { id: string; status: string };
  }>;
}

const COUNTRIES = [
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czech Republic" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "NZ", name: "New Zealand" },
];

const CARD_ELEMENT_STYLE = {
  base: {
    fontSize: "14px",
    color: "#e8ecf4",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSmoothing: "antialiased",
    "::placeholder": {
      color: "#7b8ba8",
    },
  },
  invalid: {
    color: "#ef4444",
  },
};

export function AuroraCheckout({ slug, event }: AuroraCheckoutProps) {
  const searchParams = useSearchParams();
  const cartParam = searchParams.get("cart");
  const piParam = searchParams.get("pi");

  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [walletPassEnabled, setWalletPassEnabled] = useState<{ apple?: boolean; google?: boolean }>({});

  useEffect(() => {
    fetch("/api/settings?key=feral_wallet_passes")
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setWalletPassEnabled({
            apple: json.data.apple_wallet_enabled || false,
            google: json.data.google_wallet_enabled || false,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("checkout-active");
    return () => document.documentElement.classList.remove("checkout-active");
  }, []);

  const cartLines: CartLine[] = useMemo(() => {
    if (!cartParam) return [];
    const ttMap = new Map((event.ticket_types || []).map((tt) => [tt.id, tt]));
    const lines: CartLine[] = [];
    for (const part of cartParam.split(",")) {
      const segments = part.split(":");
      if (segments.length >= 2) {
        const ticketTypeId = segments[0];
        const qty = parseInt(segments[1], 10) || 1;
        const size = segments[2] || undefined;
        const tt = ttMap.get(ticketTypeId);
        lines.push({
          ticket_type_id: ticketTypeId,
          name: tt?.name || "Ticket",
          qty,
          price: tt ? Number(tt.price) : 0,
          merch_size: size,
        });
      }
    }
    return lines;
  }, [cartParam, event.ticket_types]);

  const subtotal = cartLines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const totalQty = cartLines.reduce((sum, l) => sum + l.qty, 0);
  const symbol = getCurrencySymbol(event.currency);
  const isStripe = event.payment_method === "stripe";

  // Handle express checkout redirect
  useEffect(() => {
    if (piParam && !completedOrder) {
      (async () => {
        try {
          const res = await fetch("/api/stripe/confirm-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_intent_id: piParam, event_id: event.id }),
          });
          const data = await res.json();
          if (res.ok && data.data) setCompletedOrder(data.data);
        } catch { /* fallback to checkout form */ }
      })();
    }
  }, [piParam, completedOrder, event.id]);

  if (piParam && !completedOrder) {
    return (
      <div className="min-h-screen bg-aurora-bg">
        <AuroraCheckoutHeader slug={slug} />
        <div className="flex flex-col items-center justify-center gap-4 py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-aurora-text-secondary">Confirming your order...</p>
        </div>
      </div>
    );
  }

  if (completedOrder) {
    return (
      <AuroraOrderConfirmation
        order={completedOrder}
        slug={slug}
        eventName={event.name}
        walletPassEnabled={walletPassEnabled}
      />
    );
  }

  if (!isStripe) {
    return (
      <AuroraTestCheckout
        slug={slug}
        event={event}
        cartLines={cartLines}
        subtotal={subtotal}
        totalQty={totalQty}
        symbol={symbol}
        onComplete={setCompletedOrder}
      />
    );
  }

  return (
    <AuroraStripeCheckout
      slug={slug}
      event={event}
      cartLines={cartLines}
      subtotal={subtotal}
      totalQty={totalQty}
      symbol={symbol}
      onComplete={setCompletedOrder}
    />
  );
}

/* ── Order Summary Sidebar ── */
function AuroraOrderSummary({
  cartLines,
  symbol,
  subtotal,
  event,
}: {
  cartLines: CartLine[];
  symbol: string;
  subtotal: number;
  event: Event & { ticket_types: TicketTypeRow[] };
}) {
  return (
    <AuroraCard glass className="p-5 space-y-4">
      <h3 className="text-sm font-medium text-aurora-text-secondary uppercase tracking-wider">
        Order Summary
      </h3>
      <div className="space-y-3">
        {cartLines.map((line, i) => (
          <div key={i} className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-aurora-text truncate">
                {line.qty}&times; {line.name}
              </p>
              {line.merch_size && (
                <p className="text-xs text-aurora-text-secondary">Size: {line.merch_size}</p>
              )}
            </div>
            <span className="text-sm font-medium text-aurora-text tabular-nums">
              {symbol}{(line.price * line.qty).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-aurora-border/50 pt-3 flex items-center justify-between">
        <span className="text-sm text-aurora-text-secondary">Total</span>
        <span className="text-lg font-bold text-aurora-text">
          {symbol}{subtotal.toFixed(2)}
        </span>
      </div>
    </AuroraCard>
  );
}

/* ── Stripe Checkout ── */
function AuroraStripeCheckout({
  slug,
  event,
  cartLines,
  subtotal,
  totalQty,
  symbol,
  onComplete,
}: {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  cartLines: CartLine[];
  subtotal: number;
  totalQty: number;
  symbol: string;
  onComplete: (order: Order) => void;
}) {
  const [stripeReady, setStripeReady] = useState(false);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    getStripeClient();
    (async () => {
      try {
        const res = await fetch("/api/stripe/account");
        const data = await res.json();
        setStripePromise(getStripeClient(data.stripe_account_id || undefined));
      } catch {
        setStripePromise(getStripeClient());
      }
      setStripeReady(true);
    })();
  }, []);

  if (!stripeReady || !stripePromise) {
    return (
      <div className="min-h-screen bg-aurora-bg">
        <AuroraCheckoutHeader slug={slug} />
        <div className="flex flex-col items-center justify-center gap-4 py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-aurora-text-secondary">Securing checkout...</p>
        </div>
      </div>
    );
  }

  const elementsOptions: StripeElementsOptions = {
    mode: "payment",
    amount: toSmallestUnit(subtotal),
    currency: event.currency.toLowerCase(),
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#6366f1",
        colorBackground: "#111b2e",
        colorText: "#e8ecf4",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      },
    },
    fonts: [
      { cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" },
    ],
  };

  return (
    <div className="min-h-screen bg-aurora-bg">
      <AuroraCheckoutHeader slug={slug} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
            <Elements stripe={stripePromise} options={elementsOptions}>
              <AuroraCheckoutForm
                slug={slug}
                event={event}
                cartLines={cartLines}
                subtotal={subtotal}
                totalQty={totalQty}
                symbol={symbol}
                onComplete={onComplete}
                stripePromise={stripePromise}
              />
            </Elements>
          </div>
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-6">
              <AuroraOrderSummary
                cartLines={cartLines}
                symbol={symbol}
                subtotal={subtotal}
                event={event}
              />
            </div>
          </div>
        </div>
      </div>
      <AuroraFooter />
    </div>
  );
}

/* ── Checkout Form ── */
function AuroraCheckoutForm({
  slug,
  event,
  cartLines,
  subtotal,
  totalQty,
  symbol,
  onComplete,
  stripePromise,
}: {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  cartLines: CartLine[];
  subtotal: number;
  totalQty: number;
  symbol: string;
  onComplete: (order: Order) => void;
  stripePromise: Promise<Stripe | null>;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameOnCard, setNameOnCard] = useState("");
  const [country, setCountry] = useState(event.currency === "EUR" ? "BE" : "GB");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [expressAvailable, setExpressAvailable] = useState(true);
  const cardRef = useRef<CardFieldsHandle>(null);

  const handleExpressClick = useCallback(
    (event: StripeExpressCheckoutElementClickEvent) => {
      event.resolve({ emailRequired: true, phoneNumberRequired: true });
    },
    []
  );

  const handleExpressConfirm = useCallback(
    async (expressEvent: StripeExpressCheckoutElementConfirmEvent) => {
      if (!stripe || !elements) return;
      setProcessing(true);
      setError("");

      try {
        const billing = expressEvent.billingDetails;
        const nameParts = (billing?.name || "").split(" ");
        const walletFirstName = nameParts[0] || "";
        const walletLastName = nameParts.slice(1).join(" ") || walletFirstName;
        const walletEmail = billing?.email || "";

        if (!walletEmail) {
          setError("Email is required.");
          setProcessing(false);
          return;
        }

        const res = await fetch("/api/stripe/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: event.id,
            items: cartLines.map((l) => ({ ticket_type_id: l.ticket_type_id, qty: l.qty, merch_size: l.merch_size })),
            customer: { first_name: walletFirstName, last_name: walletLastName, email: walletEmail.toLowerCase() },
          }),
        });

        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to create payment."); setProcessing(false); return; }

        const { error: confirmError } = await stripe.confirmPayment({
          elements,
          clientSecret: data.client_secret,
          confirmParams: { return_url: `${window.location.origin}/event/${slug}/checkout/?pi=${data.payment_intent_id}` },
          redirect: "if_required",
        });

        if (confirmError) { setError(confirmError.message || "Payment failed."); setProcessing(false); return; }

        const orderRes = await fetch("/api/stripe/confirm-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_intent_id: data.payment_intent_id, event_id: event.id, stripe_account_id: data.stripe_account_id }),
        });

        const orderData = await orderRes.json();
        if (orderRes.ok && orderData.data) {
          onComplete(orderData.data);
        } else {
          onComplete({
            id: "", org_id: "feral", order_number: "Processing...", event_id: event.id,
            customer_id: "", status: "completed", subtotal, fees: 0, total: subtotal,
            currency: event.currency, payment_method: "stripe", payment_ref: data.payment_intent_id,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          } as Order);
        }
      } catch {
        setError("An error occurred. Please try again.");
        setProcessing(false);
      }
    },
    [stripe, elements, event, cartLines, slug, subtotal, onComplete]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!email.trim()) { setError("Email is required."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }
      if (!firstName.trim() || !lastName.trim()) { setError("First name and last name are required."); return; }
      if (cartLines.length === 0) { setError("Your cart is empty."); return; }

      setProcessing(true);

      try {
        const res = await fetch("/api/stripe/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: event.id,
            items: cartLines.map((l) => ({ ticket_type_id: l.ticket_type_id, qty: l.qty, merch_size: l.merch_size })),
            customer: { first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim().toLowerCase() },
          }),
        });

        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to create payment."); setProcessing(false); return; }

        if (!cardRef.current) { setError("Card form not ready."); setProcessing(false); return; }

        const result = await cardRef.current.confirmPayment(data.client_secret, {
          name: nameOnCard.trim() || `${firstName.trim()} ${lastName.trim()}`,
          email: email.trim().toLowerCase(),
          address: { country },
        });

        if (result.error) { setError(result.error.message || "Payment failed."); setProcessing(false); return; }

        const orderRes = await fetch("/api/stripe/confirm-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_intent_id: data.payment_intent_id, event_id: event.id, stripe_account_id: data.stripe_account_id }),
        });

        const orderData = await orderRes.json();
        if (orderRes.ok && orderData.data) {
          onComplete(orderData.data);
        } else {
          onComplete({
            id: "", org_id: "feral", order_number: "Processing...", event_id: event.id,
            customer_id: "", status: "completed", subtotal, fees: 0, total: subtotal,
            currency: event.currency, payment_method: "stripe", payment_ref: data.payment_intent_id,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          } as Order);
        }
      } catch {
        setError("An error occurred. Please try again.");
        setProcessing(false);
      }
    },
    [email, firstName, lastName, nameOnCard, country, cartLines, event, slug, subtotal, onComplete]
  );

  return (
    <div className="space-y-6">
      {/* Express Checkout */}
      {expressAvailable && (
        <AuroraCard glass className="p-5 space-y-3">
          <h2 className="text-sm font-medium text-aurora-text-secondary uppercase tracking-wider">
            Express Checkout
          </h2>
          <ExpressCheckoutElement
            onClick={handleExpressClick}
            onConfirm={handleExpressConfirm}
            onReady={({ availablePaymentMethods }) => {
              if (!availablePaymentMethods) setExpressAvailable(false);
            }}
            options={{
              buttonType: { applePay: "buy", googlePay: "buy" },
              buttonHeight: 48,
              layout: { maxColumns: 1, maxRows: 1 },
              paymentMethods: { applePay: "auto", googlePay: "auto", link: "never", klarna: "never", amazonPay: "never", paypal: "never" },
            }}
          />
        </AuroraCard>
      )}

      {expressAvailable && (
        <div className="flex items-center gap-3 text-xs text-aurora-text-secondary">
          <div className="flex-1 h-px bg-aurora-border" />
          <span>or pay with card</span>
          <div className="flex-1 h-px bg-aurora-border" />
        </div>
      )}

      {/* Checkout Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Contact */}
        <AuroraCard glass className="p-5 space-y-4">
          <h2 className="text-sm font-medium text-aurora-text-secondary uppercase tracking-wider">
            Contact
          </h2>
          <AuroraInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoComplete="email"
          />
          <p className="text-xs text-aurora-text-secondary flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M2 7l10 7 10-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Your tickets will be sent to this email
          </p>
        </AuroraCard>

        {/* Details */}
        <AuroraCard glass className="p-5 space-y-4">
          <h2 className="text-sm font-medium text-aurora-text-secondary uppercase tracking-wider">
            Details
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <AuroraInput
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              required
              autoComplete="given-name"
            />
            <AuroraInput
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              required
              autoComplete="family-name"
            />
          </div>
        </AuroraCard>

        {/* Payment */}
        <AuroraCard glass className="p-5 space-y-4">
          <h2 className="text-sm font-medium text-aurora-text-secondary uppercase tracking-wider">
            Payment
          </h2>
          <p className="text-xs text-aurora-text-secondary flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-aurora-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 018 0v4" strokeLinecap="round" />
            </svg>
            All transactions are secure and encrypted
          </p>

          <AuroraCardFields ref={cardRef} onReady={() => setCardReady(true)} />

          <AuroraInput
            type="text"
            value={nameOnCard}
            onChange={(e) => setNameOnCard(e.target.value)}
            placeholder="Name on card"
            autoComplete="cc-name"
          />

          <div className="relative">
            <select
              className="h-11 w-full rounded-xl border border-aurora-border bg-aurora-surface px-4 text-sm text-aurora-text appearance-none"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-aurora-text-secondary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </AuroraCard>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Pay Button */}
        <AuroraButton
          type="submit"
          variant="primary"
          size="xl"
          glow
          className="w-full"
          disabled={processing || !cardReady || !stripe}
        >
          {processing ? "Processing..." : `Pay ${symbol}${subtotal.toFixed(2)}`}
        </AuroraButton>

        {/* Trust */}
        <p className="text-center text-xs text-aurora-text-secondary flex items-center justify-center gap-1.5">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 018 0v4" strokeLinecap="round" />
          </svg>
          Secured by Stripe
        </p>
      </form>
    </div>
  );
}

/* ── Card Fields ── */
const AuroraCardFields = forwardRef<CardFieldsHandle, { onReady: () => void }>(
  function AuroraCardFields({ onReady }, ref) {
    const stripe = useStripe();
    const elements = useElements();
    const [numberReady, setNumberReady] = useState(false);
    const [expiryReady, setExpiryReady] = useState(false);
    const [cvcReady, setCvcReady] = useState(false);
    const readyNotified = useRef(false);

    useEffect(() => {
      if (numberReady && expiryReady && cvcReady && !readyNotified.current) {
        readyNotified.current = true;
        onReady();
      }
    }, [numberReady, expiryReady, cvcReady, onReady]);

    useImperativeHandle(ref, () => ({
      confirmPayment: async (clientSecret, billingDetails) => {
        if (!stripe || !elements) return { error: { message: "Payment not ready." } };
        const cardNumber = elements.getElement(CardNumberElement);
        if (!cardNumber) return { error: { message: "Card details not available." } };
        return await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardNumber, billing_details: billingDetails },
        });
      },
    }), [stripe, elements]);

    return (
      <div className="space-y-3">
        <div className="relative h-11 rounded-xl border border-aurora-border bg-aurora-surface px-4 flex items-center">
          <CardNumberElement
            onReady={() => setNumberReady(true)}
            options={{ style: CARD_ELEMENT_STYLE, placeholder: "Card number", showIcon: false, disableLink: true }}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-11 rounded-xl border border-aurora-border bg-aurora-surface px-4 flex items-center">
            <CardExpiryElement
              onReady={() => setExpiryReady(true)}
              options={{ style: CARD_ELEMENT_STYLE, placeholder: "MM / YY" }}
              className="w-full"
            />
          </div>
          <div className="h-11 rounded-xl border border-aurora-border bg-aurora-surface px-4 flex items-center">
            <CardCvcElement
              onReady={() => setCvcReady(true)}
              options={{ style: CARD_ELEMENT_STYLE, placeholder: "CVC" }}
              className="w-full"
            />
          </div>
        </div>
      </div>
    );
  }
);

/* ── Test Mode Checkout ── */
function AuroraTestCheckout({
  slug,
  event,
  cartLines,
  subtotal,
  totalQty,
  symbol,
  onComplete,
}: {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  cartLines: CartLine[];
  subtotal: number;
  totalQty: number;
  symbol: string;
  onComplete: (order: Order) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      if (!firstName.trim() || !lastName.trim() || !email.trim()) { setError("Please fill in all fields."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email."); return; }
      if (cartLines.length === 0) { setError("Your cart is empty."); return; }

      setSubmitting(true);
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: event.id,
            items: cartLines.map((l) => ({ ticket_type_id: l.ticket_type_id, qty: l.qty, merch_size: l.merch_size })),
            customer: { first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim().toLowerCase() },
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Something went wrong."); setSubmitting(false); return; }
        onComplete(json.data);
      } catch {
        setError("Network error.");
        setSubmitting(false);
      }
    },
    [firstName, lastName, email, cartLines, event.id, onComplete]
  );

  return (
    <div className="min-h-screen bg-aurora-bg">
      <AuroraCheckoutHeader slug={slug} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="space-y-6">
              <AuroraCard glass className="p-5 space-y-4">
                <h2 className="text-sm font-medium text-aurora-text-secondary uppercase tracking-wider">
                  Your Details
                </h2>
                <AuroraInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required autoComplete="email" />
                <div className="grid grid-cols-2 gap-3">
                  <AuroraInput type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required autoComplete="given-name" />
                  <AuroraInput type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" required autoComplete="family-name" />
                </div>
              </AuroraCard>

              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <AuroraButton type="submit" variant="primary" size="xl" glow className="w-full" disabled={submitting}>
                {submitting ? "Processing..." : "Complete Order"}
              </AuroraButton>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-400">
                TEST MODE — No real payment will be processed
              </div>
            </form>
          </div>
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-6">
              <AuroraOrderSummary cartLines={cartLines} symbol={symbol} subtotal={subtotal} event={event} />
            </div>
          </div>
        </div>
      </div>
      <AuroraFooter />
    </div>
  );
}
