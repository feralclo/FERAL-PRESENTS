"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
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
  const [stripeAccountId, setStripeAccountId] = useState<string | undefined>(
    undefined
  );
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
        setStripeAccountId(acctId);
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

  const elementsOptions: StripeElementsOptions = {
    mode: "payment",
    amount: amountInSmallest,
    currency: event.currency.toLowerCase(),
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#ff0033",
        colorBackground: "#1a1a1a",
        colorText: "#ffffff",
        colorDanger: "#ff0033",
        colorTextPlaceholder: "#555555",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSizeBase: "14px",
        borderRadius: "0px",
        spacingUnit: "4px",
        spacingGridRow: "16px",
        spacingGridColumn: "12px",
      },
      rules: {
        ".Input": {
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          padding: "13px 16px",
          transition: "border-color 0.15s ease",
          fontSize: "14px",
          color: "#ffffff",
        },
        ".Input:focus": {
          borderColor: "rgba(255, 0, 51, 0.5)",
          boxShadow: "none",
        },
        ".Input--invalid": {
          borderColor: "rgba(255, 0, 51, 0.5)",
          color: "#ffffff",
        },
        ".Label": {
          fontFamily: "'Space Mono', monospace",
          fontSize: "9px",
          letterSpacing: "2px",
          textTransform: "uppercase" as const,
          color: "#666666",
          fontWeight: "400",
        },
        ".Tab": {
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          color: "#aaaaaa",
          fontFamily: "'Space Mono', monospace",
          fontSize: "11px",
          letterSpacing: "1px",
        },
        ".Tab:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          color: "#ffffff",
        },
        ".Tab--selected": {
          backgroundColor: "rgba(255, 0, 51, 0.08)",
          borderColor: "rgba(255, 0, 51, 0.3)",
          color: "#ffffff",
        },
        ".TabIcon--selected": {
          fill: "#ff0033",
        },
        ".Error": {
          fontFamily: "'Space Mono', monospace",
          fontSize: "11px",
          color: "#ff0033",
        },
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
          <Elements stripe={stripePromise} options={elementsOptions}>
            <SinglePageCheckoutForm
              slug={slug}
              event={event}
              cartLines={cartLines}
              subtotal={subtotal}
              totalQty={totalQty}
              symbol={symbol}
              onComplete={onComplete}
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
   Inside Elements context — has access to Stripe + Elements.
   Contains both ExpressCheckout and Card payment.
   ================================================================ */

function SinglePageCheckoutForm({
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
  const stripe = useStripe();
  const elements = useElements();

  // Form state
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [paymentReady, setPaymentReady] = useState(false);
  const [expressAvailable, setExpressAvailable] = useState(true);

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

  // Handle card form submission
  const handleCardSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements) return;

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
        // Validate Stripe elements
        const { error: submitError } = await elements.submit();
        if (submitError) {
          setError(submitError.message || "Please check your card details.");
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
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim().toLowerCase(),
              phone: phone.trim() || undefined,
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
          setError(confirmError.message || "Payment failed. Please try again.");
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
    [stripe, elements, email, firstName, lastName, phone, cartLines, event, slug, subtotal, onComplete]
  );

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

        {/* ── CARD PAYMENT FORM ── */}
        <form onSubmit={handleCardSubmit} className="native-checkout__form">
          {/* Contact */}
          <div className="native-checkout__section">
            <h2 className="native-checkout__heading">Contact</h2>
            <div className="native-checkout__field">
              <label className="native-checkout__label" htmlFor="checkout-email">
                Email *
              </label>
              <input
                id="checkout-email"
                type="email"
                className="native-checkout__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoComplete="email"
                autoFocus
              />
            </div>
          </div>

          {/* Customer Details */}
          <div className="native-checkout__section">
            <h2 className="native-checkout__heading">Details</h2>
            <div className="native-checkout__row">
              <div className="native-checkout__field">
                <label className="native-checkout__label" htmlFor="checkout-fname">
                  First Name *
                </label>
                <input
                  id="checkout-fname"
                  type="text"
                  className="native-checkout__input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  required
                  autoComplete="given-name"
                />
              </div>
              <div className="native-checkout__field">
                <label className="native-checkout__label" htmlFor="checkout-lname">
                  Last Name *
                </label>
                <input
                  id="checkout-lname"
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
            <div className="native-checkout__field">
              <label className="native-checkout__label" htmlFor="checkout-phone">
                Phone (optional)
              </label>
              <input
                id="checkout-phone"
                type="tel"
                className="native-checkout__input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 7700 000000"
                autoComplete="tel"
              />
            </div>
          </div>

          {/* Payment */}
          <div className="native-checkout__section">
            <h2 className="native-checkout__heading">Payment</h2>
            <div className="stripe-payment-element-wrapper">
              <PaymentElement
                onReady={() => setPaymentReady(true)}
                options={{
                  layout: "tabs",
                  business: { name: "FERAL PRESENTS" },
                  wallets: {
                    applePay: "never",
                    googlePay: "never",
                    link: "never",
                  },
                }}
              />
            </div>
          </div>

          {/* Error */}
          {error && <div className="native-checkout__error">{error}</div>}

          {/* Pay Button */}
          <button
            type="submit"
            className="native-checkout__submit"
            disabled={processing || !paymentReady || !stripe}
          >
            {processing ? "Processing..." : "PAY NOW"}
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
  const [phone, setPhone] = useState("");
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
              phone: phone.trim() || undefined,
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
    [firstName, lastName, email, phone, cartLines, event.id, onComplete]
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
                  <div className="native-checkout__field">
                    <label className="native-checkout__label">Email *</label>
                    <input
                      type="email"
                      className="native-checkout__input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      autoComplete="email"
                      autoFocus
                    />
                  </div>

                  <div className="native-checkout__row">
                    <div className="native-checkout__field">
                      <label className="native-checkout__label">First Name *</label>
                      <input
                        type="text"
                        className="native-checkout__input"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        required
                        autoComplete="given-name"
                      />
                    </div>
                    <div className="native-checkout__field">
                      <label className="native-checkout__label">Last Name *</label>
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

                  <div className="native-checkout__field">
                    <label className="native-checkout__label">Phone (optional)</label>
                    <input
                      type="tel"
                      className="native-checkout__input"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+44 7700 000000"
                      autoComplete="tel"
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

      <div
        className={`order-summary-mobile__content${expanded ? " order-summary-mobile__content--expanded" : ""}`}
      >
        <div className="order-summary-mobile__content-inner">
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
      </div>
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
