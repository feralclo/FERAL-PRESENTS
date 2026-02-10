"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { OrderConfirmation } from "./OrderConfirmation";
import { StripePaymentForm } from "./StripePaymentForm";
import type { Event, TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";
import { getCurrencySymbol } from "@/lib/stripe/config";
import "@/styles/checkout-page.css";

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

type CheckoutStep = "details" | "payment" | "confirmation";

export function NativeCheckout({ slug, event }: NativeCheckoutProps) {
  const searchParams = useSearchParams();
  const cartParam = searchParams.get("cart");

  // Checkout step
  const [step, setStep] = useState<CheckoutStep>("details");

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Completed order state
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  // Parse cart from URL params
  const cartLines: CartLine[] = useMemo(() => {
    if (!cartParam) return [];

    const ttMap = new Map(
      (event.ticket_types || []).map((tt) => [tt.id, tt])
    );

    const lines: CartLine[] = [];
    const parts = cartParam.split(",");
    for (const part of parts) {
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

  // Validate customer details and move to payment step (Stripe) or submit directly (test)
  const handleDetailsSubmit = useCallback(
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

      if (isStripe) {
        // Move to payment step — StripePaymentForm handles the rest
        setStep("payment");
        return;
      }

      // Test mode: submit directly to /api/orders
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

        setCompletedOrder(json.data);
        setStep("confirmation");
      } catch {
        setError("Network error. Please check your connection and try again.");
        setSubmitting(false);
      }
    },
    [firstName, lastName, email, phone, cartLines, event.id, isStripe]
  );

  // Handle Stripe payment success
  const handleStripeSuccess = useCallback(
    async (paymentIntentId: string) => {
      // Fetch the created order (webhook should have created it)
      // Poll for order with exponential backoff
      let order: Order | null = null;
      const maxAttempts = 10;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const delay = Math.min(1000 * Math.pow(1.5, attempt), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));

        try {
          const res = await fetch(
            `/api/orders?payment_ref=${encodeURIComponent(paymentIntentId)}&event_id=${encodeURIComponent(event.id)}`
          );
          const json = await res.json();

          if (json.data && json.data.length > 0) {
            // Fetch full order with tickets
            const orderRes = await fetch(`/api/orders/${json.data[0].id}`);
            const orderJson = await orderRes.json();
            if (orderJson.data) {
              order = orderJson.data;
              break;
            }
          }
        } catch {
          // Continue polling
        }
      }

      if (order) {
        setCompletedOrder(order);
        setStep("confirmation");
      } else {
        // Payment succeeded but order not found yet — show basic confirmation
        setCompletedOrder({
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
          payment_ref: paymentIntentId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setStep("confirmation");
      }
    },
    [event.id, event.currency, subtotal]
  );

  // Show confirmation if order completed
  if (step === "confirmation" && completedOrder) {
    return (
      <OrderConfirmation
        order={completedOrder}
        slug={slug}
        eventName={event.name}
      />
    );
  }

  // Step 2: Stripe Payment Element
  if (step === "payment" && isStripe) {
    return (
      <>
        {/* Header */}
        <CheckoutHeader slug={slug} />

        {/* Order Summary */}
        <OrderSummaryStrip cartLines={cartLines} symbol={symbol} />

        {/* Customer summary + Payment */}
        <div className="native-checkout">
          <div className="native-checkout__inner">
            <div className="native-checkout__customer-summary">
              <div className="native-checkout__customer-summary-row">
                <span className="native-checkout__customer-summary-label">Name</span>
                <span className="native-checkout__customer-summary-value">
                  {firstName} {lastName}
                </span>
              </div>
              <div className="native-checkout__customer-summary-row">
                <span className="native-checkout__customer-summary-label">Email</span>
                <span className="native-checkout__customer-summary-value">
                  {email}
                </span>
              </div>
              {phone && (
                <div className="native-checkout__customer-summary-row">
                  <span className="native-checkout__customer-summary-label">Phone</span>
                  <span className="native-checkout__customer-summary-value">
                    {phone}
                  </span>
                </div>
              )}
            </div>

            {error && <div className="native-checkout__error">{error}</div>}

            <StripePaymentForm
              eventId={event.id}
              eventName={event.name}
              currency={event.currency}
              items={cartLines.map((l) => ({
                ticket_type_id: l.ticket_type_id,
                qty: l.qty,
                merch_size: l.merch_size,
              }))}
              customer={{
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email: email.trim().toLowerCase(),
                phone: phone.trim() || undefined,
              }}
              onSuccess={handleStripeSuccess}
              onError={(msg) => setError(msg)}
              onBack={() => {
                setStep("details");
                setError("");
              }}
              subtotal={subtotal}
              totalQty={totalQty}
            />
          </div>
        </div>

        <CheckoutFooter />
      </>
    );
  }

  // Step 1: Customer Details Form
  return (
    <>
      <CheckoutHeader slug={slug} />
      <OrderSummaryStrip cartLines={cartLines} symbol={symbol} />

      {/* Native Checkout Form */}
      <div className="native-checkout">
        <div className="native-checkout__inner">
          <div className="native-checkout__section">
            <h2 className="native-checkout__heading">Your Details</h2>
            <form onSubmit={handleDetailsSubmit} className="native-checkout__form">
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
                <label className="native-checkout__label">Email *</label>
                <input
                  type="email"
                  className="native-checkout__input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="native-checkout__field">
                <label className="native-checkout__label">
                  Phone (optional)
                </label>
                <input
                  type="tel"
                  className="native-checkout__input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+44 7700 000000"
                  autoComplete="tel"
                />
              </div>

              {error && <div className="native-checkout__error">{error}</div>}

              <div className="native-checkout__total">
                <div className="native-checkout__total-row">
                  <span>
                    {totalQty} ticket{totalQty !== 1 ? "s" : ""}
                  </span>
                  <span className="native-checkout__total-price">
                    {symbol}
                    {subtotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className="native-checkout__submit"
                disabled={submitting}
              >
                {submitting
                  ? "Processing..."
                  : isStripe
                    ? "CONTINUE TO PAYMENT"
                    : "PAY NOW"}
              </button>

              {event.payment_method === "test" && (
                <div className="native-checkout__test-badge">
                  TEST MODE — No real payment will be processed
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      <CheckoutFooter />
    </>
  );
}

/** Shared checkout header */
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
        <span>Secure Checkout</span>
      </div>
    </div>
  );
}

/** Shared order summary strip */
function OrderSummaryStrip({
  cartLines,
  symbol,
}: {
  cartLines: CartLine[];
  symbol: string;
}) {
  return (
    <div className="checkout-summary">
      <div className="checkout-summary__label">Order Summary</div>
      <div className="checkout-summary__items">
        {cartLines.map((line, i) => (
          <div key={i} className="checkout-summary__item">
            <span className="checkout-summary__qty">{line.qty}x</span>
            <span className="checkout-summary__name">{line.name}</span>
            {line.merch_size && (
              <span className="checkout-summary__size">
                {line.merch_size}
              </span>
            )}
            <span className="checkout-summary__price">
              {symbol}
              {(line.price * line.qty).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shared footer */
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
