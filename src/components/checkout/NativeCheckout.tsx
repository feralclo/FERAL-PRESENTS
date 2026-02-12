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
import { OrderConfirmation } from "./OrderConfirmation";
import { getStripeClient } from "@/lib/stripe/client";
import type { Event, TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";
import { getCurrencySymbol, toSmallestUnit } from "@/lib/stripe/config";
import "@/styles/checkout-page.css";

/* ================================================================
   TYPES
   ================================================================ */

interface NativeCheckoutProps {
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
    billingDetails: {
      name: string;
      email: string;
      address?: { country: string };
    }
  ) => Promise<{
    error?: { message?: string };
    paymentIntent?: { id: string; status: string };
  }>;
}

/* ================================================================
   COUNTRIES LIST — for billing country dropdown
   ================================================================ */

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

/* ================================================================
   CARD ELEMENT STYLE — shared across all card inputs
   ================================================================ */

const CARD_ELEMENT_STYLE = {
  base: {
    fontSize: "14px",
    color: "#ffffff",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSmoothing: "antialiased",
    "::placeholder": {
      color: "#555555",
    },
  },
  invalid: {
    color: "#ff6b6b",
  },
};

/* ================================================================
   MAIN CHECKOUT COMPONENT
   ================================================================ */

export function NativeCheckout({ slug, event }: NativeCheckoutProps) {
  const searchParams = useSearchParams();
  const cartParam = searchParams.get("cart");
  const piParam = searchParams.get("pi");

  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  // Suppress scanlines/noise on checkout pages
  useEffect(() => {
    document.documentElement.classList.add("checkout-active");
    return () => document.documentElement.classList.remove("checkout-active");
  }, []);

  // Parse cart from URL
  const cartLines: CartLine[] = useMemo(() => {
    if (!cartParam) return [];
    const ttMap = new Map(
      (event.ticket_types || []).map((tt) => [tt.id, tt])
    );
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

  // Handle express checkout redirect from ticket page (?pi=xxx)
  useEffect(() => {
    if (piParam && !completedOrder) {
      (async () => {
        try {
          const res = await fetch("/api/stripe/confirm-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_intent_id: piParam }),
          });
          const data = await res.json();
          if (res.ok && data.data) {
            setCompletedOrder(data.data);
          }
        } catch {
          // Will show checkout form as fallback
        }
      })();
    }
  }, [piParam, completedOrder]);

  // Show loading for express redirect
  if (piParam && !completedOrder) {
    return (
      <div className="checkout-page">
        <CheckoutHeader slug={slug} />
        <div className="stripe-payment-loading" style={{ minHeight: "60vh" }}>
          <div className="stripe-payment-loading__spinner" />
          <span className="stripe-payment-loading__text">
            Confirming your order...
          </span>
        </div>
      </div>
    );
  }

  // Show confirmation
  if (completedOrder) {
    return (
      <OrderConfirmation
        order={completedOrder}
        slug={slug}
        eventName={event.name}
      />
    );
  }

  // Test mode checkout (no Stripe)
  if (!isStripe) {
    return (
      <TestModeCheckout
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

  // Stripe checkout
  return (
    <StripeCheckoutPage
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

/* ================================================================
   STRIPE CHECKOUT PAGE
   Two-column on desktop (form left, order summary right).
   Collapsible order summary on mobile.
   ================================================================ */

function StripeCheckoutPage({
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

  // Load Stripe.js + fetch account config in parallel for speed
  useEffect(() => {
    // Pre-warm Stripe.js loading immediately
    getStripeClient();

    (async () => {
      try {
        const res = await fetch("/api/stripe/account");
        const data = await res.json();
        const acctId = data.stripe_account_id || undefined;
        setStripePromise(getStripeClient(acctId));
      } catch {
        setStripePromise(getStripeClient());
      }
      setStripeReady(true);
    })();
  }, []);

  if (!stripeReady || !stripePromise) {
    return (
      <div className="checkout-page">
        <CheckoutHeader slug={slug} />
        <div className="stripe-payment-loading" style={{ minHeight: "60vh" }}>
          <div className="stripe-payment-loading__spinner" />
          <span className="stripe-payment-loading__text">
            Securing checkout...
          </span>
        </div>
      </div>
    );
  }

  const amountInSmallest = toSmallestUnit(subtotal);

  // Elements options for ExpressCheckoutElement (needs mode: "payment")
  const expressElementsOptions: StripeElementsOptions = {
    mode: "payment",
    amount: amountInSmallest,
    currency: event.currency.toLowerCase(),
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#ff0033",
        colorBackground: "#1a1a1a",
        colorText: "#ffffff",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      },
    },
  };

  return (
    <div className="checkout-page">
      <CheckoutHeader slug={slug} />

      {/* Mobile: collapsible order summary */}
      <OrderSummaryMobile
        cartLines={cartLines}
        symbol={symbol}
        subtotal={subtotal}
        event={event}
      />

      <div className="checkout-layout">
        <div className="checkout-layout__main">
          <Elements stripe={stripePromise} options={expressElementsOptions}>
            <SinglePageCheckoutForm
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

        {/* Desktop: sidebar order summary */}
        <aside className="checkout-layout__sidebar">
          <OrderSummaryDesktop
            cartLines={cartLines}
            symbol={symbol}
            subtotal={subtotal}
            event={event}
          />
        </aside>
      </div>

      <CheckoutFooter />
    </div>
  );
}

/* ================================================================
   SINGLE-PAGE CHECKOUT FORM
   Inside outer Elements context (mode: "payment") for Express.
   Card fields use a nested Elements context for individual elements.
   ================================================================ */

function SinglePageCheckoutForm({
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

  // Form state
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameOnCard, setNameOnCard] = useState("");
  const [country, setCountry] = useState(event.currency === "EUR" ? "BE" : "GB");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [expressAvailable, setExpressAvailable] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "klarna">("card");
  const cardRef = useRef<CardFieldsHandle>(null);

  // Handle Express Checkout click — configure wallet sheet
  const handleExpressClick = useCallback(
    (event: StripeExpressCheckoutElementClickEvent) => {
      event.resolve({
        emailRequired: true,
        phoneNumberRequired: true,
      });
    },
    []
  );

  // Handle Express Checkout confirm — create PI, confirm, create order
  const handleExpressConfirm = useCallback(
    async (expressEvent: StripeExpressCheckoutElementConfirmEvent) => {
      if (!stripe || !elements) return;

      setProcessing(true);
      setError("");

      try {
        // Extract customer data from wallet
        const billing = expressEvent.billingDetails;
        const nameParts = (billing?.name || "").split(" ");
        const walletFirstName = nameParts[0] || "";
        const walletLastName = nameParts.slice(1).join(" ") || walletFirstName;
        const walletEmail = billing?.email || "";
        const walletPhone = billing?.phone || "";

        if (!walletEmail) {
          setError("Email is required.");
          setProcessing(false);
          return;
        }

        // 1. Create PaymentIntent
        const res = await fetch("/api/stripe/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: event.id,
            items: cartLines.map((l) => ({
              ticket_type_id: l.ticket_type_id,
              qty: l.qty,
              merch_size: l.merch_size,
            })),
            customer: {
              first_name: walletFirstName,
              last_name: walletLastName,
              email: walletEmail.toLowerCase(),
              phone: walletPhone || undefined,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create payment.");
          setProcessing(false);
          return;
        }

        // 2. Confirm payment
        const { error: confirmError } = await stripe.confirmPayment({
          elements,
          clientSecret: data.client_secret,
          confirmParams: {
            return_url: `${window.location.origin}/event/${slug}/checkout/?pi=${data.payment_intent_id}`,
          },
          redirect: "if_required",
        });

        if (confirmError) {
          setError(confirmError.message || "Payment failed.");
          setProcessing(false);
          return;
        }

        // 3. Create order
        const orderRes = await fetch("/api/stripe/confirm-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_intent_id: data.payment_intent_id }),
        });

        const orderData = await orderRes.json();
        if (orderRes.ok && orderData.data) {
          onComplete(orderData.data);
        } else {
          onComplete({
            id: "",
            org_id: "feral",
            order_number: "Processing...",
            event_id: event.id,
            customer_id: "",
            status: "completed",
            subtotal,
            fees: 0,
            total: subtotal,
            currency: event.currency,
            payment_method: "stripe",
            payment_ref: data.payment_intent_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as Order);
        }
      } catch {
        setError("An error occurred. Please try again.");
        setProcessing(false);
      }
    },
    [stripe, elements, event, cartLines, slug, subtotal, onComplete]
  );

  // Handle form submission (card or Klarna)
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      setError("");

      // Validate customer fields
      if (!email.trim()) {
        setError("Email is required.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Please enter a valid email address.");
        return;
      }
      if (!firstName.trim() || !lastName.trim()) {
        setError("First name and last name are required.");
        return;
      }
      if (cartLines.length === 0) {
        setError("Your cart is empty.");
        return;
      }

      setProcessing(true);

      try {
        // 1. Create PaymentIntent
        const res = await fetch("/api/stripe/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: event.id,
            items: cartLines.map((l) => ({
              ticket_type_id: l.ticket_type_id,
              qty: l.qty,
              merch_size: l.merch_size,
            })),
            customer: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim().toLowerCase(),
            },
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create payment.");
          setProcessing(false);
          return;
        }

        if (paymentMethod === "card") {
          // 2a. Confirm card payment via CardFields handle
          if (!cardRef.current) {
            setError("Card form not ready. Please try again.");
            setProcessing(false);
            return;
          }

          const result = await cardRef.current.confirmPayment(
            data.client_secret,
            {
              name: nameOnCard.trim() || `${firstName.trim()} ${lastName.trim()}`,
              email: email.trim().toLowerCase(),
              address: { country },
            }
          );

          if (result.error) {
            setError(result.error.message || "Payment failed. Please try again.");
            setProcessing(false);
            return;
          }

          if (
            result.paymentIntent &&
            result.paymentIntent.status === "requires_action"
          ) {
            setError(
              "Additional verification required. Please follow the prompts."
            );
            setProcessing(false);
            return;
          }
        } else {
          // 2b. Confirm Klarna payment (redirects to Klarna)
          const stripeInstance = await stripePromise;
          if (!stripeInstance) {
            setError("Payment system not ready. Please try again.");
            setProcessing(false);
            return;
          }

          const { error: klarnaError } = await stripeInstance.confirmKlarnaPayment(
            data.client_secret,
            {
              payment_method: {
                billing_details: {
                  email: email.trim().toLowerCase(),
                  name: `${firstName.trim()} ${lastName.trim()}`,
                  address: { country },
                },
              },
              return_url: `${window.location.origin}/event/${slug}/checkout/?pi=${data.payment_intent_id}`,
            }
          );

          if (klarnaError) {
            setError(
              klarnaError.message || "Klarna payment failed. Please try again."
            );
            setProcessing(false);
            return;
          }
          // User has been redirected to Klarna — nothing more to do
          return;
        }

        // 3. Confirm order (card path only — Klarna confirms via redirect)
        const orderRes = await fetch("/api/stripe/confirm-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_intent_id: data.payment_intent_id }),
        });

        const orderData = await orderRes.json();
        if (orderRes.ok && orderData.data) {
          onComplete(orderData.data);
        } else {
          onComplete({
            id: "",
            org_id: "feral",
            order_number: "Processing...",
            event_id: event.id,
            customer_id: "",
            status: "completed",
            subtotal,
            fees: 0,
            total: subtotal,
            currency: event.currency,
            payment_method: "stripe",
            payment_ref: data.payment_intent_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as Order);
        }
      } catch {
        setError("An error occurred. Please try again.");
        setProcessing(false);
      }
    },
    [
      email,
      firstName,
      lastName,
      nameOnCard,
      country,
      cartLines,
      event,
      slug,
      subtotal,
      paymentMethod,
      stripePromise,
      onComplete,
    ]
  );

  // Card Elements options (separate from Express Elements — Link disabled)
  const cardElementsOptions: StripeElementsOptions = {
    fonts: [
      {
        cssSrc:
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap",
      },
    ],
  };

  const isReady =
    paymentMethod === "card" ? cardReady : true;

  return (
    <div className="native-checkout">
      <div className="native-checkout__inner">
        {/* ── EXPRESS CHECKOUT ── */}
        <div
          className="express-checkout-section"
          style={{ display: expressAvailable ? "block" : "none" }}
        >
          <h2 className="native-checkout__heading">Express Checkout</h2>
          <div className="express-checkout">
            <ExpressCheckoutElement
              onClick={handleExpressClick}
              onConfirm={handleExpressConfirm}
              onReady={({ availablePaymentMethods }) => {
                if (!availablePaymentMethods) {
                  setExpressAvailable(false);
                }
              }}
              options={{
                buttonType: {
                  applePay: "buy",
                  googlePay: "buy",
                },
                buttonHeight: 54,
                layout: {
                  maxColumns: 1,
                  maxRows: 1,
                },
                paymentMethods: {
                  applePay: "auto",
                  googlePay: "auto",
                  link: "never",
                  klarna: "never",
                  amazonPay: "never",
                  paypal: "never",
                },
              }}
            />
          </div>
        </div>

        {/* ── DIVIDER ── */}
        {expressAvailable && (
          <div className="checkout-divider">
            <span className="checkout-divider__line" />
            <span className="checkout-divider__text">or pay with card</span>
            <span className="checkout-divider__line" />
          </div>
        )}

        {/* ── CHECKOUT FORM ── */}
        <form onSubmit={handleSubmit} className="native-checkout__form">
          {/* Contact */}
          <div className="native-checkout__section">
            <h2 className="native-checkout__heading">Contact</h2>
            <input
              type="email"
              className="native-checkout__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          {/* Customer Details */}
          <div className="native-checkout__section">
            <h2 className="native-checkout__heading">Details</h2>
            <div className="native-checkout__row">
              <input
                type="text"
                className="native-checkout__input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                required
                autoComplete="given-name"
              />
              <input
                type="text"
                className="native-checkout__input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                required
                autoComplete="family-name"
              />
            </div>
          </div>

          {/* Payment */}
          <div className="native-checkout__section">
            <h2 className="native-checkout__heading">Payment Details</h2>
            <p className="native-checkout__subtitle">
              <svg className="native-checkout__subtitle-lock" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              All transactions are secure and encrypted.
            </p>

            {/* ── CARD PAYMENT BOX ── */}
            <div
              className={`payment-box${paymentMethod === "card" ? " payment-box--active" : ""}`}
              onClick={() => paymentMethod !== "card" && setPaymentMethod("card")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setPaymentMethod("card")}
            >
              <div className="payment-box__header">
                <span className={`payment-box__radio${paymentMethod === "card" ? " payment-box__radio--checked" : ""}`} />
                <span className="payment-box__title">Credit / Debit Card</span>
                <span className="payment-box__icons">
                  {/* Visa */}
                  <svg viewBox="0 0 750 471" className="payment-box__card-icon" aria-label="Visa">
                    <rect width="750" height="471" rx="40" fill="#1A1F71" />
                    <path d="M278.2 334.2h-60.6l37.9-233.9h60.6L278.2 334.2z" fill="#fff" />
                    <path d="M524.3 105.1c-12-4.6-30.7-9.5-54.1-9.5-59.7 0-101.7 31.7-102 77.1-.3 33.6 30 52.3 52.9 63.5 23.5 11.4 31.4 18.7 31.3 28.9-.2 15.6-18.8 22.7-36.1 22.7-24.1 0-36.9-3.5-56.7-12.2l-7.8-3.7-8.4 52.2c14.1 6.5 40.1 12.1 67.1 12.4 63.5 0 104.7-31.3 105.2-79.8.2-26.6-15.9-46.8-50.8-63.5-21.2-10.8-34.1-18-33.9-28.9 0-9.7 10.9-20 34.6-20 19.7-.3 34 4.2 45.1 9l5.4 2.7 8.2-50.9z" fill="#fff" />
                    <path d="M661.6 100.3h-46.7c-14.5 0-25.3 4.2-31.7 19.3L487 334.2h63.5s10.4-28.8 12.7-35.1h77.6c1.8 8.2 7.4 35.1 7.4 35.1H704L661.6 100.3zm-74.8 184.6c5-13.5 24.2-65.5 24.2-65.5-.4.6 5-13.6 8-22.4l4.1 20.3s11.6 56.1 14.1 67.6h-50.4z" fill="#fff" />
                    <path d="M232.8 100.3L173.6 261l-6.4-32.5c-11-37.5-45.5-78.2-84-98.5l54.1 204h64l95.1-233.9h-63.6z" fill="#fff" />
                    <path d="M120.8 100.3H24.6L24 105c75.9 19.4 126.2 66.2 147 122.5L149 121.1c-3.5-14.5-14.1-19.6-28.2-20.8z" fill="#F7B600" />
                  </svg>
                  {/* Mastercard */}
                  <svg viewBox="0 0 750 471" className="payment-box__card-icon" aria-label="Mastercard">
                    <rect width="750" height="471" rx="40" fill="#000" />
                    <circle cx="299" cy="235.5" r="148" fill="#EB001B" />
                    <circle cx="451" cy="235.5" r="148" fill="#F79E1B" />
                    <path d="M375 119.8a148 148 0 00-76 115.7 148 148 0 0076 115.7 148 148 0 0076-115.7 148 148 0 00-76-115.7z" fill="#FF5F00" />
                  </svg>
                  {/* Amex */}
                  <svg viewBox="0 0 750 471" className="payment-box__card-icon" aria-label="Amex">
                    <rect width="750" height="471" rx="40" fill="#2557D6" />
                    <path d="M0 235.5h750" stroke="#fff" strokeWidth="0" />
                    <path fillRule="evenodd" clipRule="evenodd" d="M83.5 326.5V195l41.8-50h73l16.5 22 17-22h375v121.8L590 284l17.3 42.5H471l-17-22.2-17.3 22.2H124.5l-8.7-20.8H96l-8.8 20.8H83.5zm29.3-10.5h29l45-107h-32l-21 52.5-22.5-52.5h-31.5L125 316h-12.2zm125.7 0h88.5v-23h-58v-20h56.5v-22.5H269v-19h58v-23h-88.5V316zm107 0h30l-2-23 36.5-.5 10 23.5h31.5l-44-108.5h-34L345.5 316zm42-44l12.5-32 12 32h-24.5zm69.5 44h27.5v-68.5l42 68.5h30.5V207.5h-27.5v64l-39-64H484V316zm89.5 0h27.5v-85.5h32v-23H514v23h32.5V316z" fill="#fff" />
                  </svg>
                  {/* +2 badge */}
                  <span className="payment-box__more">+2</span>
                </span>
              </div>

              {/* Card content — collapsible */}
              <div className={`payment-box__content${paymentMethod === "card" ? " payment-box__content--open" : ""}`}>
                <Elements stripe={stripePromise} options={cardElementsOptions}>
                  <CardFields
                    ref={cardRef}
                    onReady={() => setCardReady(true)}
                  />
                </Elements>

                {/* Name on card */}
                <input
                  type="text"
                  className="native-checkout__input payment-box__name-input"
                  value={nameOnCard}
                  onChange={(e) => setNameOnCard(e.target.value)}
                  placeholder="Name on card"
                  autoComplete="cc-name"
                />

                {/* Country */}
                <select
                  className="native-checkout__input payment-box__country-select"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── KLARNA PAYMENT BOX ── */}
            <div
              className={`payment-box payment-box--klarna${paymentMethod === "klarna" ? " payment-box--active" : ""}`}
              onClick={() => paymentMethod !== "klarna" && setPaymentMethod("klarna")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setPaymentMethod("klarna")}
            >
              <div className="payment-box__header">
                <span className={`payment-box__radio${paymentMethod === "klarna" ? " payment-box__radio--checked" : ""}`} />
                <span className="payment-box__title">Klarna</span>
                <svg viewBox="0 0 750 471" className="payment-box__klarna-logo" aria-label="Klarna">
                  <rect width="750" height="471" rx="40" fill="#FFB3C7" />
                  <path d="M255 120h55c0 46.5-21.5 87.5-55 115l110 116h-77l-90-106.5V351h-55V120h55v101c27.5-24.5 46.5-60 57-101zm192 0h55v231h-55V120zm148 178a41 41 0 110 82 41 41 0 010-82z" fill="#0A0B09" />
                </svg>
              </div>

              {/* Klarna content — collapsible */}
              <div className={`payment-box__content${paymentMethod === "klarna" ? " payment-box__content--open" : ""}`}>
                <div className="klarna-info">
                  <p className="klarna-info__text">
                    Pay later or in instalments with Klarna. You&apos;ll be redirected to Klarna to complete your purchase securely.
                  </p>
                </div>

                {/* Country for Klarna */}
                <select
                  className="native-checkout__input payment-box__country-select"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && <div className="native-checkout__error">{error}</div>}

          {/* Pay Button */}
          <button
            type="submit"
            className="native-checkout__submit"
            disabled={processing || !isReady || !stripe}
          >
            {processing
              ? "Processing..."
              : paymentMethod === "klarna"
                ? "CONTINUE TO KLARNA"
                : "PAY NOW"}
          </button>

          {/* Trust Signal */}
          <div className="checkout-trust">
            <svg
              className="checkout-trust__lock"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="5"
                y="11"
                width="14"
                height="10"
                rx="2"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M8 11V7a4 4 0 018 0v4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>Secured by Stripe. Your payment details are encrypted.</span>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================
   CARD FIELDS — Individual Stripe card elements with custom UI
   Renders card number, expiry, CVC with custom placeholders and layout.
   Uses forwardRef + useImperativeHandle to expose confirmPayment.
   ================================================================ */

const CardFields = forwardRef<CardFieldsHandle, { onReady: () => void }>(
  function CardFields({ onReady }, ref) {
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

    useImperativeHandle(
      ref,
      () => ({
        confirmPayment: async (clientSecret, billingDetails) => {
          if (!stripe || !elements) {
            return { error: { message: "Payment not ready. Please try again." } };
          }

          const cardNumber = elements.getElement(CardNumberElement);
          if (!cardNumber) {
            return { error: { message: "Card details not available." } };
          }

          const result = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
              card: cardNumber,
              billing_details: billingDetails,
            },
          });

          return result;
        },
      }),
      [stripe, elements]
    );

    return (
      <div className="card-fields">
        {/* Card Number */}
        <div className="card-fields__number-wrapper">
          <CardNumberElement
            onReady={() => setNumberReady(true)}
            options={{
              style: CARD_ELEMENT_STYLE,
              placeholder: "Card number",
              showIcon: false,
              disableLink: true,
            }}
          />
          <svg
            className="card-fields__lock-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="5"
              y="11"
              width="14"
              height="10"
              rx="2"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <path
              d="M8 11V7a4 4 0 018 0v4"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Expiry + CVC row (side by side on desktop, stacked on mobile) */}
        <div className="card-fields__row">
          <div className="card-fields__expiry">
            <CardExpiryElement
              onReady={() => setExpiryReady(true)}
              options={{
                style: CARD_ELEMENT_STYLE,
                placeholder: "Expiration date (MM/YY)",
              }}
            />
          </div>
          <div className="card-fields__cvc-wrapper">
            <CardCvcElement
              onReady={() => setCvcReady(true)}
              options={{
                style: CARD_ELEMENT_STYLE,
                placeholder: "Security code",
              }}
            />
            {/* Shield/CVC icon */}
            <svg
              className="card-fields__cvc-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2L4 6v5c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M9 12l2 2 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    );
  }
);

/* ================================================================
   TEST MODE CHECKOUT
   For events with payment_method="test" — no Stripe.
   ================================================================ */

function TestModeCheckout({
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

      if (!firstName.trim() || !lastName.trim() || !email.trim()) {
        setError("Please fill in all required fields.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Please enter a valid email address.");
        return;
      }
      if (cartLines.length === 0) {
        setError("Your cart is empty.");
        return;
      }

      setSubmitting(true);

      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: event.id,
            items: cartLines.map((l) => ({
              ticket_type_id: l.ticket_type_id,
              qty: l.qty,
              merch_size: l.merch_size,
            })),
            customer: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim().toLowerCase(),
            },
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Something went wrong. Please try again.");
          setSubmitting(false);
          return;
        }

        onComplete(json.data);
      } catch {
        setError("Network error. Please check your connection and try again.");
        setSubmitting(false);
      }
    },
    [firstName, lastName, email, cartLines, event.id, onComplete]
  );

  return (
    <div className="checkout-page">
      <CheckoutHeader slug={slug} />

      {/* Mobile: collapsible order summary */}
      <OrderSummaryMobile
        cartLines={cartLines}
        symbol={symbol}
        subtotal={subtotal}
        event={event}
      />

      <div className="checkout-layout">
        <div className="checkout-layout__main">
          <div className="native-checkout">
            <div className="native-checkout__inner">
              <form onSubmit={handleSubmit} className="native-checkout__form">
                <div className="native-checkout__section">
                  <h2 className="native-checkout__heading">Your Details</h2>
                  <input
                    type="email"
                    className="native-checkout__input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                  <div className="native-checkout__row">
                    <input
                      type="text"
                      className="native-checkout__input"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      required
                      autoComplete="given-name"
                    />
                    <input
                      type="text"
                      className="native-checkout__input"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      required
                      autoComplete="family-name"
                    />
                  </div>
                </div>

                {error && <div className="native-checkout__error">{error}</div>}

                <button
                  type="submit"
                  className="native-checkout__submit"
                  disabled={submitting}
                >
                  {submitting ? "Processing..." : "PAY NOW"}
                </button>

                <div className="native-checkout__test-badge">
                  TEST MODE — No real payment will be processed
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Desktop: sidebar order summary */}
        <aside className="checkout-layout__sidebar">
          <OrderSummaryDesktop
            cartLines={cartLines}
            symbol={symbol}
            subtotal={subtotal}
            event={event}
          />
        </aside>
      </div>

      <CheckoutFooter />
    </div>
  );
}

/* ================================================================
   SHARED UI COMPONENTS
   ================================================================ */

function CheckoutHeader({ slug }: { slug: string }) {
  return (
    <div className="checkout-header">
      <a href={`/event/${slug}/`} className="checkout-header__back">
        <span className="checkout-header__back-arrow">&larr;</span>
        <span>Back</span>
      </a>
      <a href={`/event/${slug}/`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/FERAL%20LOGO.svg"
          alt="FERAL PRESENTS"
          className="checkout-header__logo"
        />
      </a>
      <div className="checkout-header__secure">
        <svg
          className="checkout-header__lock"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="5"
            y="11"
            width="14"
            height="10"
            rx="2"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M8 11V7a4 4 0 018 0v4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

/* ================================================================
   ORDER SUMMARY — MOBILE (collapsible, Shopify-style)
   Shows "Order summary [chevron] .... £total" toggle bar.
   Expands to show items + subtotal + total.
   ================================================================ */

function OrderSummaryMobile({
  cartLines,
  symbol,
  subtotal,
  event,
}: {
  cartLines: CartLine[];
  symbol: string;
  subtotal: number;
  event?: Event & { ticket_types: TicketTypeRow[] };
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="order-summary-mobile">
      <button
        className="order-summary-mobile__toggle"
        onClick={() => setExpanded(!expanded)}
        type="button"
        aria-expanded={expanded}
      >
        <div className="order-summary-mobile__toggle-left">
          <svg
            className="order-summary-mobile__cart-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1="3"
              y1="6"
              x2="21"
              y2="6"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M16 10a4 4 0 01-8 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="order-summary-mobile__toggle-label">
            {expanded ? "Hide" : "Show"} order summary
          </span>
          <svg
            className={`order-summary-mobile__chevron${expanded ? " order-summary-mobile__chevron--up" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="order-summary-mobile__toggle-total">
          {symbol}{subtotal.toFixed(2)}
        </span>
      </button>

      {expanded && (
        <div className="order-summary-mobile__content">
          <OrderItems cartLines={cartLines} symbol={symbol} event={event} />
          <div className="order-summary__divider" />
          <div className="order-summary__totals">
            <div className="order-summary__row">
              <span>Subtotal</span>
              <span>{symbol}{subtotal.toFixed(2)}</span>
            </div>
            <div className="order-summary__row order-summary__row--total">
              <span>Total</span>
              <span>
                <span className="order-summary__currency">{event?.currency || "GBP"}</span>
                {" "}{symbol}{subtotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   ORDER SUMMARY — DESKTOP (sticky sidebar)
   Always visible, shows items + subtotal + total.
   ================================================================ */

function OrderSummaryDesktop({
  cartLines,
  symbol,
  subtotal,
  event,
}: {
  cartLines: CartLine[];
  symbol: string;
  subtotal: number;
  event?: Event & { ticket_types: TicketTypeRow[] };
}) {
  return (
    <div className="order-summary-desktop">
      <OrderItems cartLines={cartLines} symbol={symbol} event={event} />
      <div className="order-summary__divider" />
      <div className="order-summary__totals">
        <div className="order-summary__row">
          <span>Subtotal</span>
          <span>{symbol}{subtotal.toFixed(2)}</span>
        </div>
        <div className="order-summary__row order-summary__row--total">
          <span>Total</span>
          <span>
            <span className="order-summary__currency">{event?.currency || "GBP"}</span>
            {" "}{symbol}{subtotal.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   ORDER ITEMS — shared between mobile and desktop summaries
   Renders each cart line with optional image, name, qty, price.
   ================================================================ */

function OrderItems({
  cartLines,
  symbol,
  event,
}: {
  cartLines: CartLine[];
  symbol: string;
  event?: Event & { ticket_types: TicketTypeRow[] };
}) {
  const getMerchImage = (line: CartLine): string | null => {
    if (!line.merch_size || !event?.ticket_types) return null;
    const tt = event.ticket_types.find((t) => t.id === line.ticket_type_id);
    return tt?.merch_images?.front || null;
  };

  // Event cover image for non-merch items (use cover_image first, then hero_image,
  // then media API fallback). Kept as a small thumbnail so it doesn't slow down load.
  const eventImage = event?.cover_image || event?.hero_image
    || (event?.id ? `/api/media/event_${event.id}_cover` : null);

  return (
    <div className="order-summary__items">
      {cartLines.map((line, i) => {
        const merchImg = getMerchImage(line);
        const thumbnail = merchImg || eventImage;
        return (
          <div key={i} className="order-summary__item">
            <div className="order-summary__item-visual">
              {thumbnail ? (
                <div className="order-summary__item-image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbnail} alt="" className="order-summary__item-img" />
                </div>
              ) : (
                <div className="order-summary__item-placeholder">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="order-summary__item-ticket-icon"
                  >
                    <rect
                      x="2"
                      y="4"
                      width="20"
                      height="16"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M2 10h20M9 4v16"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              )}
              <span className="order-summary__item-badge">{line.qty}</span>
            </div>
            <div className="order-summary__item-info">
              <span className="order-summary__item-name">{line.name}</span>
              {line.merch_size && (
                <span className="order-summary__item-variant">
                  Size: {line.merch_size}
                </span>
              )}
            </div>
            <span className="order-summary__item-price">
              {symbol}{(line.price * line.qty).toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CheckoutFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__inner">
          <span className="footer__copy">
            &copy; 2026 FERAL PRESENTS. ALL RIGHTS RESERVED.
          </span>
          <span className="footer__status">
            STATUS: <span className="text-red">ONLINE</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
