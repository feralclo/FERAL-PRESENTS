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
import { CheckoutTimer } from "./CheckoutTimer";
import { getStripeClient } from "@/lib/stripe/client";
import type { Event, TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";
import { getCurrencySymbol, toSmallestUnit } from "@/lib/stripe/config";
import { useBranding } from "@/hooks/useBranding";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { calculateCheckoutVat, DEFAULT_VAT_SETTINGS } from "@/lib/vat";
import type { VatSettings } from "@/types/settings";
import { SETTINGS_KEYS } from "@/lib/constants";
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

interface DiscountInfo {
  code: string;
  type: string;
  value: number;
  /** The calculated discount amount in major currency units. */
  amount: number;
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
    fontSize: "16px", // ≥16px prevents iOS Safari auto-zoom on focus
    color: "#ffffff",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSmoothing: "antialiased",
    "::placeholder": {
      color: "#555555",
    },
  },
  invalid: {
    color: "#ef4444",
  },
};

/* ================================================================
   MAIN CHECKOUT COMPONENT
   ================================================================ */

export function NativeCheckout({ slug, event }: NativeCheckoutProps) {
  const searchParams = useSearchParams();
  const cartParam = searchParams.get("cart");
  const piParam = searchParams.get("pi");
  const { trackPageView } = useMetaTracking();

  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [walletPassEnabled, setWalletPassEnabled] = useState<{ apple?: boolean; google?: boolean }>({});
  const [vatSettings, setVatSettings] = useState<VatSettings | null>(null);

  // Track PageView on checkout page load
  useEffect(() => {
    trackPageView();
  }, [trackPageView]);

  // Fetch wallet pass + VAT settings in parallel
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

    fetch(`/api/settings?key=${SETTINGS_KEYS.VAT}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setVatSettings({ ...DEFAULT_VAT_SETTINGS, ...json.data });
        }
      })
      .catch(() => {});
  }, []);

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
            body: JSON.stringify({ payment_intent_id: piParam, event_id: event.id }),
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
        walletPassEnabled={walletPassEnabled}
      />
    );
  }

  // Guard: empty cart — show message instead of a broken £0.00 checkout
  if (cartLines.length === 0) {
    return (
      <div className="checkout-page">
        <CheckoutHeader slug={slug} />
        <div className="native-checkout">
          <div className="native-checkout__inner" style={{ textAlign: "center", paddingTop: "48px" }}>
            <h2 className="native-checkout__heading" style={{ borderBottom: "none" }}>
              Your cart is empty
            </h2>
            <p style={{ color: "#888", fontSize: "14px", marginTop: "12px", marginBottom: "24px" }}>
              No tickets selected. Head back to pick your tickets.
            </p>
            <a
              href={`/event/${slug}/#tickets`}
              className="native-checkout__submit"
              style={{ display: "block", textDecoration: "none", textAlign: "center", maxWidth: "320px", margin: "0 auto" }}
            >
              BROWSE TICKETS
            </a>
          </div>
        </div>
        <CheckoutFooter />
      </div>
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
        vatSettings={vatSettings}
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
      vatSettings={vatSettings}
      onComplete={setCompletedOrder}
    />
  );
}

/* ================================================================
   DISCOUNT CODE INPUT — shared between mobile and desktop summaries
   ================================================================ */

function DiscountCodeInput({
  eventId,
  subtotal,
  discount,
  onApply,
  onRemove,
}: {
  eventId: string;
  subtotal: number;
  discount: DiscountInfo | null;
  onApply: (d: DiscountInfo) => void;
  onRemove: () => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleApply = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          event_id: eventId,
          subtotal,
        }),
      });
      const data = await res.json();
      if (data.valid && data.discount) {
        const d = data.discount;
        const amount =
          d.type === "percentage"
            ? Math.round((subtotal * d.value) / 100 * 100) / 100
            : Math.min(d.value, subtotal);
        onApply({ code: d.code, type: d.type, value: d.value, amount });
        setCode("");
      } else {
        setError(data.error || "Invalid discount code");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  if (discount) {
    return (
      <div className="discount-code discount-code--applied">
        <div className="discount-code__applied">
          <div className="discount-code__applied-info">
            <svg className="discount-code__tag-icon" viewBox="0 0 24 24" fill="none">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="7" cy="7" r="1" fill="currentColor"/>
            </svg>
            <span className="discount-code__applied-code">{discount.code}</span>
          </div>
          <button
            className="discount-code__remove"
            onClick={onRemove}
            type="button"
            aria-label="Remove discount"
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="discount-code">
      <div className="discount-code__form">
        <input
          type="text"
          className="discount-code__input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Discount code"
          enterKeyHint="send"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleApply())}
        />
        <button
          className="discount-code__apply-btn"
          onClick={handleApply}
          disabled={loading || !code.trim()}
          type="button"
        >
          {loading ? "\u2026" : "Apply"}
        </button>
      </div>
      {error && <div className="discount-code__error">{error}</div>}
    </div>
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
  vatSettings,
  onComplete,
}: {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  cartLines: CartLine[];
  subtotal: number;
  totalQty: number;
  symbol: string;
  vatSettings: VatSettings | null;
  onComplete: (order: Order) => void;
}) {
  const [stripeReady, setStripeReady] = useState(false);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountInfo | null>(null);

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

  const discountAmount = appliedDiscount?.amount || 0;
  const afterDiscount = Math.max(subtotal - discountAmount, 0);
  const vatBreakdown = calculateCheckoutVat(afterDiscount, vatSettings);
  // VAT-exclusive: add VAT on top. VAT-inclusive: total unchanged.
  const total = vatBreakdown && !vatSettings?.prices_include_vat
    ? vatBreakdown.gross
    : afterDiscount;
  const amountInSmallest = toSmallestUnit(total);

  // Shared Elements options — single context for Express + Card elements
  const elementsOptions: StripeElementsOptions = {
    mode: "payment",
    amount: amountInSmallest || 100, // Stripe requires > 0; server enforces the real amount
    currency: event.currency.toLowerCase(),
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#ffffff",
        colorBackground: "#1a1a1a",
        colorText: "#ffffff",
        colorDanger: "#ef4444",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSizeBase: "16px", // ≥16px prevents iOS Safari auto-zoom on focus
        borderRadius: "8px",
      },
    },
    fonts: [
      {
        cssSrc:
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap",
      },
    ],
  };

  return (
    <div className="checkout-page">
      <CheckoutHeader slug={slug} />

      {/* Reservation timer */}
      <CheckoutTimer active={true} />

      {/* Mobile: always-visible order summary */}
      <OrderSummaryMobile
        cartLines={cartLines}
        symbol={symbol}
        subtotal={subtotal}
        event={event}
        discount={appliedDiscount}
        onApplyDiscount={setAppliedDiscount}
        onRemoveDiscount={() => setAppliedDiscount(null)}
        vatSettings={vatSettings}
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
              stripePromise={stripePromise}
              discountCode={appliedDiscount?.code || null}
              totalAmount={total}
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
            discount={appliedDiscount}
            onApplyDiscount={setAppliedDiscount}
            onRemoveDiscount={() => setAppliedDiscount(null)}
            vatSettings={vatSettings}
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
  discountCode,
  totalAmount,
}: {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  cartLines: CartLine[];
  subtotal: number;
  totalQty: number;
  symbol: string;
  onComplete: (order: Order) => void;
  stripePromise: Promise<Stripe | null>;
  discountCode: string | null;
  totalAmount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { trackAddPaymentInfo } = useMetaTracking();
  const { trackEngagement } = useTraffic();

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
  const [expressLoaded, setExpressLoaded] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "klarna">("card");
  const cardRef = useRef<CardFieldsHandle>(null);

  // Sync Elements amount when total changes (e.g. discount code applied/removed)
  // without remounting — preserves any card details the user already entered
  useEffect(() => {
    if (!elements) return;
    const amountInSmallest = toSmallestUnit(totalAmount) || 100;
    elements.update({ amount: amountInSmallest });
  }, [elements, totalAmount]);

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
            discount_code: discountCode || undefined,
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
          body: JSON.stringify({
            payment_intent_id: data.payment_intent_id,
            event_id: event.id,
            stripe_account_id: data.stripe_account_id,
          }),
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
    [stripe, elements, event, cartLines, slug, subtotal, onComplete, discountCode]
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

      // Track AddPaymentInfo — user submitted the checkout form with payment details
      trackAddPaymentInfo(
        {
          content_ids: cartLines.map((l) => l.ticket_type_id),
          content_type: "product",
          value: totalAmount,
          currency: event.currency || "GBP",
          num_items: totalQty,
        },
        { em: email.trim().toLowerCase(), fn: firstName.trim(), ln: lastName.trim() }
      );

      setProcessing(true);
      trackEngagement("payment_processing");

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
            discount_code: discountCode || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          trackEngagement("payment_failed");
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
            trackEngagement("payment_failed");
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
            trackEngagement("payment_failed");
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
          body: JSON.stringify({
            payment_intent_id: data.payment_intent_id,
            event_id: event.id,
            stripe_account_id: data.stripe_account_id,
          }),
        });

        const orderData = await orderRes.json();
        if (orderRes.ok && orderData.data) {
          trackEngagement("payment_success");
          onComplete(orderData.data);
        } else {
          trackEngagement("payment_success");
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
        trackEngagement("payment_failed");
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
      discountCode,
      trackEngagement,
    ]
  );

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
          {expressLoaded && (
            <div className="express-checkout__label">Express checkout</div>
          )}
          <div className="express-checkout">
            {!expressLoaded && (
              <div className="express-checkout__skeleton" />
            )}
            <div
              className="express-checkout__element"
              style={{ opacity: expressLoaded ? 1 : 0 }}
            >
              <ExpressCheckoutElement
                onClick={handleExpressClick}
                onConfirm={handleExpressConfirm}
                onReady={({ availablePaymentMethods }) => {
                  setExpressLoaded(true);
                  if (!availablePaymentMethods) {
                    setExpressAvailable(false);
                  }
                }}
                options={{
                  buttonType: {
                    applePay: "plain",
                    googlePay: "plain",
                  },
                  buttonTheme: {
                    applePay: "white-outline",
                    googlePay: "white",
                  },
                  buttonHeight: 44,
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
            <label htmlFor="checkout-email" className="sr-only">Email</label>
            <input
              id="checkout-email"
              type="email"
              className="native-checkout__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              autoComplete="email"
              autoFocus
            />
            <p className="native-checkout__email-hint">
              <svg className="native-checkout__email-hint-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M2 7l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Your tickets will be sent to this email
            </p>
          </div>

          {/* Customer Details */}
          <div className="native-checkout__section">
            <h2 className="native-checkout__heading">Details</h2>
            <div className="native-checkout__row">
              <div>
                <label htmlFor="checkout-first-name" className="sr-only">First name</label>
                <input
                  id="checkout-first-name"
                  type="text"
                  className="native-checkout__input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  required
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label htmlFor="checkout-last-name" className="sr-only">Last name</label>
                <input
                  id="checkout-last-name"
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

            {/* ── UNIFIED PAYMENT OPTIONS CONTAINER ── */}
            <div className="payment-options">
              {/* Card option */}
              <div
                className={`payment-option${paymentMethod === "card" ? " payment-option--active" : ""}`}
                onClick={() => { if (paymentMethod !== "card") { setPaymentMethod("card"); trackEngagement("payment_method_selected"); } }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") { setPaymentMethod("card"); trackEngagement("payment_method_selected"); } }}
              >
                <div className="payment-option__header">
                  <span className={`payment-option__radio${paymentMethod === "card" ? " payment-option__radio--checked" : ""}`} />
                  <span className="payment-option__title">Credit / Debit Card</span>
                  <span className="payment-option__icons">
                    {/* Visa */}
                    <span className="payment-option__card-badge" style={{ background: "#1A1F71" }}>
                      <svg viewBox="0 0 32 20" fill="none" aria-label="Visa">
                        <text x="16" y="13.5" textAnchor="middle" fill="#fff" fontSize="8.5" fontWeight="700" fontStyle="italic" fontFamily="Arial,sans-serif">VISA</text>
                      </svg>
                    </span>
                    {/* Mastercard */}
                    <span className="payment-option__card-badge" style={{ background: "#252525" }}>
                      <svg viewBox="0 0 32 20" fill="none" aria-label="Mastercard">
                        <circle cx="12.5" cy="10" r="6" fill="#EB001B"/>
                        <circle cx="19.5" cy="10" r="6" fill="#F79E1B"/>
                        <path d="M16 5.4a6 6 0 010 9.2 6 6 0 000-9.2z" fill="#FF5F00"/>
                      </svg>
                    </span>
                    {/* Amex */}
                    <span className="payment-option__card-badge" style={{ background: "#2557D6" }}>
                      <svg viewBox="0 0 32 20" fill="none" aria-label="Amex">
                        <text x="16" y="13" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="Arial,sans-serif">AMEX</text>
                      </svg>
                    </span>
                    <span className="payment-option__more">+2</span>
                  </span>
                </div>

                {/* Card content — collapsible */}
                <div className={`payment-option__content${paymentMethod === "card" ? " payment-option__content--open" : ""}`}>
                  <CardFields
                    ref={cardRef}
                    onReady={() => setCardReady(true)}
                  />

                  {/* Name on card */}
                  <label htmlFor="checkout-cc-name" className="sr-only">Name on card</label>
                  <input
                    id="checkout-cc-name"
                    type="text"
                    className="native-checkout__input payment-option__name-input"
                    value={nameOnCard}
                    onChange={(e) => setNameOnCard(e.target.value)}
                    placeholder="Name on card"
                    autoComplete="cc-name"
                  />

                  {/* Country */}
                  <div className="payment-option__select-wrapper">
                    <label htmlFor="checkout-country" className="sr-only">Country</label>
                    <select
                      id="checkout-country"
                      className="native-checkout__input payment-option__country-select"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      autoComplete="country"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <svg className="payment-option__select-chevron" viewBox="0 0 24 24" fill="none">
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Klarna option */}
              <div
                className={`payment-option${paymentMethod === "klarna" ? " payment-option--active" : ""}`}
                onClick={() => { if (paymentMethod !== "klarna") { setPaymentMethod("klarna"); trackEngagement("payment_method_selected"); } }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") { setPaymentMethod("klarna"); trackEngagement("payment_method_selected"); } }}
              >
                <div className="payment-option__header">
                  <span className={`payment-option__radio${paymentMethod === "klarna" ? " payment-option__radio--checked" : ""}`} />
                  <span className="payment-option__title">Klarna</span>
                  <span className="payment-option__card-badge payment-option__card-badge--klarna" style={{ background: "#FFB3C7" }}>
                    <svg viewBox="0 0 32 20" fill="none" aria-label="Klarna">
                      <text x="16" y="13" textAnchor="middle" fill="#0A0B09" fontSize="6.5" fontWeight="800" fontFamily="Arial,sans-serif">Klarna</text>
                    </svg>
                  </span>
                </div>

                {/* Klarna content — collapsible */}
                <div className={`payment-option__content${paymentMethod === "klarna" ? " payment-option__content--open" : ""}`}>
                  <div className="klarna-detail">
                    <p className="klarna-detail__headline">
                      Pay in 30 days or 3 interest-free payments of{" "}
                      <strong>{symbol}{(subtotal / 3).toFixed(2)}</strong>
                    </p>
                    <p className="klarna-detail__terms">
                      18+, T&amp;Cs apply. Credit subject to status.
                    </p>
                    <div className="klarna-detail__redirect">
                      {/* Redirect / external link icon */}
                      <svg className="klarna-detail__redirect-icon" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                        <rect x="6" y="8" width="12" height="9" rx="1" fill="currentColor" opacity="0.15"/>
                        <rect x="6" y="6" width="12" height="2.5" rx="0.5" fill="currentColor" opacity="0.3"/>
                        <circle cx="8" cy="7.2" r="0.6" fill="currentColor"/>
                        <circle cx="9.8" cy="7.2" r="0.6" fill="currentColor"/>
                        <circle cx="11.6" cy="7.2" r="0.6" fill="currentColor"/>
                      </svg>
                      <span className="klarna-detail__redirect-text">
                        After submission, you will be redirected to securely complete next steps.
                      </span>
                    </div>
                  </div>
                </div>
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
              ? "Processing\u2026"
              : paymentMethod === "klarna"
                ? "Continue to Klarna"
                : `Pay ${symbol}${totalAmount.toFixed(2)}`}
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
            <span>Secured by Stripe &middot; End-to-end encrypted</span>
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
  vatSettings,
  onComplete,
}: {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  cartLines: CartLine[];
  subtotal: number;
  totalQty: number;
  symbol: string;
  vatSettings: VatSettings | null;
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

      {/* Reservation timer */}
      <CheckoutTimer active={true} />

      {/* Mobile: always-visible order summary */}
      <OrderSummaryMobile
        cartLines={cartLines}
        symbol={symbol}
        subtotal={subtotal}
        event={event}
        vatSettings={vatSettings}
      />

      <div className="checkout-layout">
        <div className="checkout-layout__main">
          <div className="native-checkout">
            <div className="native-checkout__inner">
              <form onSubmit={handleSubmit} className="native-checkout__form">
                <div className="native-checkout__section">
                  <h2 className="native-checkout__heading">Your Details</h2>
                  <label htmlFor="test-email" className="sr-only">Email</label>
                  <input
                    id="test-email"
                    type="email"
                    className="native-checkout__input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                  <p className="native-checkout__email-hint">
                    <svg className="native-checkout__email-hint-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M2 7l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Your tickets will be sent to this email
                  </p>
                  <div className="native-checkout__row">
                    <div>
                      <label htmlFor="test-first-name" className="sr-only">First name</label>
                      <input
                        id="test-first-name"
                        type="text"
                        className="native-checkout__input"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        required
                        autoComplete="given-name"
                      />
                    </div>
                    <div>
                      <label htmlFor="test-last-name" className="sr-only">Last name</label>
                      <input
                        id="test-last-name"
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
            vatSettings={vatSettings}
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
  const branding = useBranding();

  return (
    <div className="checkout-header">
      <a href={`/event/${slug}/`} className="checkout-header__back">
        <span className="checkout-header__back-arrow">&larr;</span>
        <span>Back</span>
      </a>
      <a href={`/event/${slug}/`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.logo_url || "/images/FERAL%20LOGO.svg"}
          alt={branding.org_name || "FERAL PRESENTS"}
          className="checkout-header__logo"
          style={branding.logo_width ? { width: branding.logo_width } : undefined}
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
  discount,
  onApplyDiscount,
  onRemoveDiscount,
  vatSettings,
}: {
  cartLines: CartLine[];
  symbol: string;
  subtotal: number;
  event?: Event & { ticket_types: TicketTypeRow[] };
  discount?: DiscountInfo | null;
  onApplyDiscount?: (d: DiscountInfo) => void;
  onRemoveDiscount?: () => void;
  vatSettings?: VatSettings | null;
}) {
  const discountAmt = discount?.amount || 0;
  const afterDiscount = Math.max(subtotal - discountAmt, 0);
  const vatBreakdown = calculateCheckoutVat(afterDiscount, vatSettings ?? null);
  const total = vatBreakdown && vatSettings && !vatSettings.prices_include_vat
    ? vatBreakdown.gross
    : afterDiscount;

  return (
    <div className="order-summary-mobile">
      <div className="order-summary-mobile__content">
        <OrderItems cartLines={cartLines} symbol={symbol} event={event} />
        <div className="order-summary__divider" />
        {event && onApplyDiscount && onRemoveDiscount && (
          <DiscountCodeInput
            eventId={event.id}
            subtotal={subtotal}
            discount={discount || null}
            onApply={onApplyDiscount}
            onRemove={onRemoveDiscount}
          />
        )}
        <div className="order-summary__totals">
          <div className="order-summary__row">
            <span>Subtotal</span>
            <span>{symbol}{subtotal.toFixed(2)}</span>
          </div>
          {discount && (
            <div className="order-summary__row order-summary__row--discount">
              <span>Discount ({discount.code})</span>
              <span>-{symbol}{discountAmt.toFixed(2)}</span>
            </div>
          )}
          {vatBreakdown && vatSettings?.prices_include_vat && (
            <div className="order-summary__row order-summary__row--vat">
              <span>Includes VAT ({vatSettings.vat_rate}%)</span>
              <span>{symbol}{vatBreakdown.vat.toFixed(2)}</span>
            </div>
          )}
          {vatBreakdown && vatSettings && !vatSettings.prices_include_vat && (
            <div className="order-summary__row">
              <span>VAT ({vatSettings.vat_rate}%)</span>
              <span>{symbol}{vatBreakdown.vat.toFixed(2)}</span>
            </div>
          )}
          <div className="order-summary__row order-summary__row--total">
            <span>Total</span>
            <span>
              <span className="order-summary__currency">{event?.currency || "GBP"}</span>
              {" "}{symbol}{total.toFixed(2)}
            </span>
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
  discount,
  onApplyDiscount,
  onRemoveDiscount,
  vatSettings,
}: {
  cartLines: CartLine[];
  symbol: string;
  subtotal: number;
  event?: Event & { ticket_types: TicketTypeRow[] };
  discount?: DiscountInfo | null;
  onApplyDiscount?: (d: DiscountInfo) => void;
  onRemoveDiscount?: () => void;
  vatSettings?: VatSettings | null;
}) {
  const discountAmt = discount?.amount || 0;
  const afterDiscount = Math.max(subtotal - discountAmt, 0);
  const vatBreakdown = calculateCheckoutVat(afterDiscount, vatSettings ?? null);
  const total = vatBreakdown && vatSettings && !vatSettings.prices_include_vat
    ? vatBreakdown.gross
    : afterDiscount;

  return (
    <div className="order-summary-desktop">
      <OrderItems cartLines={cartLines} symbol={symbol} event={event} />
      <div className="order-summary__divider" />
      {event && onApplyDiscount && onRemoveDiscount && (
        <DiscountCodeInput
          eventId={event.id}
          subtotal={subtotal}
          discount={discount || null}
          onApply={onApplyDiscount}
          onRemove={onRemoveDiscount}
        />
      )}
      <div className="order-summary__totals">
        <div className="order-summary__row">
          <span>Subtotal</span>
          <span>{symbol}{subtotal.toFixed(2)}</span>
        </div>
        {discount && (
          <div className="order-summary__row order-summary__row--discount">
            <span>Discount ({discount.code})</span>
            <span>-{symbol}{discountAmt.toFixed(2)}</span>
          </div>
        )}
        {vatBreakdown && vatSettings?.prices_include_vat && (
          <div className="order-summary__row order-summary__row--vat">
            <span>Includes VAT ({vatSettings.vat_rate}%)</span>
            <span>{symbol}{vatBreakdown.vat.toFixed(2)}</span>
          </div>
        )}
        {vatBreakdown && vatSettings && !vatSettings.prices_include_vat && (
          <div className="order-summary__row">
            <span>VAT ({vatSettings.vat_rate}%)</span>
            <span>{symbol}{vatBreakdown.vat.toFixed(2)}</span>
          </div>
        )}
        <div className="order-summary__row order-summary__row--total">
          <span>Total</span>
          <span>
            <span className="order-summary__currency">{event?.currency || "GBP"}</span>
            {" "}{symbol}{total.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   ORDER ITEMS — shared between mobile and desktop summaries
   Each cart line renders as a ticket card. Lines with merch_size
   show the ticket info PLUS a nested merch sub-item below.
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
  const getTicketType = (id: string): TicketTypeRow | undefined =>
    event?.ticket_types?.find((t) => t.id === id);

  // Format event date
  const eventDate = event?.date_start
    ? new Date(event.date_start).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const eventTime = event?.doors_time || (event?.date_start
    ? new Date(event.date_start).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null);

  const eventMeta = [eventDate, event?.venue_name].filter(Boolean).join(" · ");

  return (
    <div className="order-items">
      {cartLines.map((line, i) => {
        const tt = getTicketType(line.ticket_type_id);
        const hasMerch = !!line.merch_size;
        const merchImg = hasMerch ? (tt?.merch_images?.front || null) : null;
        const merchName = tt?.merch_name
          || (tt?.merch_type ? `${event?.name || ""} ${tt.merch_type}` : null);

        return (
          <div key={i} className="order-item">
            {/* Ticket row */}
            <div className="order-item__ticket">
              <div className="order-item__ticket-icon">
                <img src="/images/ticketicon.svg" alt="" draggable={false} />
                <span className="order-item__ticket-qty">{line.qty}</span>
              </div>
              <div className="order-item__info">
                <span className="order-item__name">{line.name}</span>
                {event?.name && (
                  <span className="order-item__event">{event.name}</span>
                )}
                {eventMeta && (
                  <span className="order-item__meta">{eventMeta}</span>
                )}
                {eventTime && (
                  <span className="order-item__meta">Doors {eventTime}</span>
                )}
              </div>
              <span className="order-item__price">
                {symbol}{(line.price * line.qty).toFixed(2)}
              </span>
            </div>

            {/* Merch sub-item */}
            {hasMerch && (
              <div className="order-item__merch">
                <div className="order-item__merch-thumb">
                  {merchImg ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={merchImg} alt="" className="order-item__merch-img" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" className="order-item__merch-placeholder">
                      <path d="M12 3l-2 3h4l-2-3zM6 6h12l1 3H5l1-3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      <path d="M5 9h14v10a2 2 0 01-2 2H7a2 2 0 01-2-2V9z" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  )}
                </div>
                <div className="order-item__merch-info">
                  <span className="order-item__merch-label">Included merch</span>
                  <span className="order-item__merch-name">
                    {merchName || line.name}
                  </span>
                  <span className="order-item__merch-size">
                    Size: {line.merch_size}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CheckoutFooter() {
  const branding = useBranding();
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__inner">
          <span className="footer__copy">
            &copy; {year} {branding.copyright_text || `${branding.org_name || "FERAL PRESENTS"}. ALL RIGHTS RESERVED.`}
          </span>
        </div>
      </div>
    </footer>
  );
}
