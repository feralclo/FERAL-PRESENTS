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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AuraCheckoutHeader } from "./AuraCheckoutHeader";
import { AuraOrderConfirmation } from "./AuraOrderConfirmation";
import { AuraFooter } from "./AuraFooter";
import { getStripeClient } from "@/lib/stripe/client";
import { Lock, Mail, CreditCard, Loader2 } from "lucide-react";
import type { Event, TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";
import { getCurrencySymbol, toSmallestUnit } from "@/lib/stripe/config";

import "@/styles/aura.css";
import "@/styles/aura-effects.css";

interface AuraCheckoutProps {
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
    color: "#fafaf9",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSmoothing: "antialiased",
    "::placeholder": { color: "#78716c" },
  },
  invalid: { color: "#ef4444" },
};

/* ═══════════════════════════════════════════
   Main Checkout Entry Point
   ═══════════════════════════════════════════ */
export function AuraCheckout({ slug, event }: AuraCheckoutProps) {
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
        } catch { /* fallback */ }
      })();
    }
  }, [piParam, completedOrder, event.id]);

  if (piParam && !completedOrder) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <AuraCheckoutHeader slug={slug} />
        <div className="flex flex-col items-center justify-center gap-4 py-32">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Confirming your order...</p>
        </div>
      </div>
    );
  }

  if (completedOrder) {
    return (
      <AuraOrderConfirmation
        order={completedOrder}
        slug={slug}
        eventName={event.name}
        walletPassEnabled={walletPassEnabled}
      />
    );
  }

  if (!isStripe) {
    return (
      <AuraTestCheckout
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
    <AuraStripeCheckout
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

/* ═══════════════════════════════════════════
   Order Summary Sidebar
   ═══════════════════════════════════════════ */
function AuraOrderSummary({
  cartLines,
  symbol,
  subtotal,
}: {
  cartLines: CartLine[];
  symbol: string;
  subtotal: number;
  event: Event & { ticket_types: TicketTypeRow[] };
}) {
  return (
    <Card className="border-border/40 py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-0">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Order Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="space-y-3">
          {cartLines.map((line, i) => (
            <div key={i} className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {line.qty}&times; {line.name}
                </p>
                {line.merch_size && (
                  <Badge variant="secondary" className="text-[9px] py-0 px-1.5 mt-0.5">
                    Size: {line.merch_size}
                  </Badge>
                )}
              </div>
              <span className="text-sm font-medium tabular-nums">
                {symbol}{(line.price * line.qty).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <Separator className="opacity-30" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-display text-xl font-bold tabular-nums">
            {symbol}{subtotal.toFixed(2)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════
   Stripe Checkout
   ═══════════════════════════════════════════ */
function AuraStripeCheckout({
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
      <div className="min-h-screen bg-background text-foreground">
        <AuraCheckoutHeader slug={slug} />
        <div className="flex flex-col items-center justify-center gap-4 py-32">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Securing checkout...</p>
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
        colorPrimary: "#f59e0b",
        colorBackground: "#1c1917",
        colorText: "#fafaf9",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      },
    },
    fonts: [
      { cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AuraCheckoutHeader slug={slug} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
            <Elements stripe={stripePromise} options={elementsOptions}>
              <AuraCheckoutForm
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
              <AuraOrderSummary cartLines={cartLines} symbol={symbol} subtotal={subtotal} event={event} />
            </div>
          </div>
        </div>
      </div>
      <AuraFooter />
    </div>
  );
}

/* ═══════════════════════════════════════════
   Checkout Form (inside Stripe Elements)
   ═══════════════════════════════════════════ */
function AuraCheckoutForm({
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

        if (!walletEmail) { setError("Email is required."); setProcessing(false); return; }

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
    [email, firstName, lastName, nameOnCard, country, cartLines, event, subtotal, onComplete]
  );

  return (
    <div className="space-y-6">
      {/* Express Checkout */}
      {expressAvailable && (
        <Card className="border-border/40 py-0 gap-0">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
          </CardContent>
        </Card>
      )}

      {expressAvailable && (
        <div className="flex items-center gap-3">
          <Separator className="flex-1 opacity-30" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">or pay with card</span>
          <Separator className="flex-1 opacity-30" />
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Contact */}
        <Card className="border-border/40 py-0 gap-0">
          <CardContent className="p-5 space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Mail size={12} />
              Contact
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              autoComplete="email"
              className="bg-card/50"
            />
            <p className="text-[11px] text-muted-foreground">Your tickets will be sent to this email</p>
          </CardContent>
        </Card>

        {/* Details */}
        <Card className="border-border/40 py-0 gap-0">
          <CardContent className="p-5 space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Your Details
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                required
                autoComplete="given-name"
                className="bg-card/50"
              />
              <Input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                required
                autoComplete="family-name"
                className="bg-card/50"
              />
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        <Card className="border-border/40 py-0 gap-0">
          <CardContent className="p-5 space-y-4">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CreditCard size={12} />
              Payment
            </Label>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Lock size={11} className="text-aura-success" />
              All transactions are secure and encrypted
            </p>

            <AuraCardFields ref={cardRef} onReady={() => setCardReady(true)} />

            <Input
              type="text"
              value={nameOnCard}
              onChange={(e) => setNameOnCard(e.target.value)}
              placeholder="Name on card"
              autoComplete="cc-name"
              className="bg-card/50"
            />

            <div className="relative">
              <select
                className="flex h-9 w-full rounded-md border border-input bg-card/50 px-3 py-1 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none appearance-none"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Pay button */}
        <Button
          type="submit"
          size="lg"
          className="w-full aura-glow-accent aura-press rounded-full font-semibold text-base"
          disabled={processing || !cardReady || !stripe}
        >
          {processing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Processing...
            </>
          ) : (
            `Pay ${symbol}${subtotal.toFixed(2)}`
          )}
        </Button>

        {/* Trust */}
        <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
          <Lock size={11} />
          Secured by Stripe
        </p>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Card Fields (Stripe Elements)
   ═══════════════════════════════════════════ */
const AuraCardFields = forwardRef<CardFieldsHandle, { onReady: () => void }>(
  function AuraCardFields({ onReady }, ref) {
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
        <div className="relative flex h-9 items-center rounded-md border border-input bg-card/50 px-3">
          <CardNumberElement
            onReady={() => setNumberReady(true)}
            options={{ style: CARD_ELEMENT_STYLE, placeholder: "Card number", showIcon: false, disableLink: true }}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex h-9 items-center rounded-md border border-input bg-card/50 px-3">
            <CardExpiryElement
              onReady={() => setExpiryReady(true)}
              options={{ style: CARD_ELEMENT_STYLE, placeholder: "MM / YY" }}
              className="w-full"
            />
          </div>
          <div className="flex h-9 items-center rounded-md border border-input bg-card/50 px-3">
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

/* ═══════════════════════════════════════════
   Test Mode Checkout
   ═══════════════════════════════════════════ */
function AuraTestCheckout({
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
    <div className="min-h-screen bg-background text-foreground">
      <AuraCheckoutHeader slug={slug} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="space-y-5">
              <Card className="border-border/40 py-0 gap-0">
                <CardContent className="p-5 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Your Details
                  </Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required autoComplete="email" className="bg-card/50" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required autoComplete="given-name" className="bg-card/50" />
                    <Input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" required autoComplete="family-name" className="bg-card/50" />
                  </div>
                </CardContent>
              </Card>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" size="lg" className="w-full aura-press rounded-full font-semibold" disabled={submitting}>
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Processing...</>
                ) : (
                  "Complete Order"
                )}
              </Button>

              <div className="rounded-lg border border-aura-warning/30 bg-aura-warning/10 px-4 py-3 text-center text-xs text-aura-warning">
                TEST MODE — No real payment will be processed
              </div>
            </form>
          </div>
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-6">
              <AuraOrderSummary cartLines={cartLines} symbol={symbol} subtotal={subtotal} event={event} />
            </div>
          </div>
        </div>
      </div>
      <AuraFooter />
    </div>
  );
}
