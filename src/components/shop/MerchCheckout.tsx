"use client";

import { useState, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js";
import { getStripeClient, preloadStripeAccount } from "@/lib/stripe/client";
import { getCurrencySymbol, toSmallestUnit, getPaymentErrorMessage } from "@/lib/stripe/config";
import { useBranding } from "@/hooks/useBranding";
import type { ShopCartItem } from "@/hooks/useShopCart";
import type { MerchCollection } from "@/types/merch-store";
import type { Event } from "@/types/events";
import { MerchOrderConfirmation } from "./MerchOrderConfirmation";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

/* ================================================================
   TYPES
   ================================================================ */

interface MerchCheckoutProps {
  collection: MerchCollection;
  event: Event;
  cartItems: ShopCartItem[];
  totalPrice: number;
  currency: string;
  onBack: () => void;
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
    error?: { message?: string; code?: string; decline_code?: string };
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
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
];

/* ================================================================
   CARD FIELDS — Inner component using Stripe Elements hooks
   ================================================================ */

const CardFields = forwardRef<CardFieldsHandle>(function CardFields(_, ref) {
  const stripe = useStripe();
  const elements = useElements();

  useImperativeHandle(ref, () => ({
    confirmPayment: async (clientSecret, billingDetails) => {
      if (!stripe || !elements) {
        return { error: { message: "Stripe not ready" } };
      }

      const cardNumber = elements.getElement(CardNumberElement);
      if (!cardNumber) {
        return { error: { message: "Card fields not ready" } };
      }

      return stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardNumber,
          billing_details: billingDetails,
        },
      });
    },
  }));

  const elementStyle = {
    base: {
      fontSize: "14px",
      color: "#f0f0f5",
      fontFamily: "'Inter', sans-serif",
      "::placeholder": { color: "#666" },
    },
    invalid: { color: "#F43F5E" },
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)] mb-1.5">
          Card Number
        </label>
        <div className="rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-3 py-3">
          <CardNumberElement options={{ style: elementStyle, showIcon: true }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)] mb-1.5">
            Expiry
          </label>
          <div className="rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-3 py-3">
            <CardExpiryElement options={{ style: elementStyle }} />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)] mb-1.5">
            CVC
          </label>
          <div className="rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-3 py-3">
            <CardCvcElement options={{ style: elementStyle }} />
          </div>
        </div>
      </div>
    </div>
  );
});

/* ================================================================
   CHECKOUT FORM — Inner component wrapped by Elements
   ================================================================ */

function CheckoutForm({
  collection,
  event,
  cartItems,
  totalPrice,
  currency,
  onBack,
  stripeAccountId,
}: MerchCheckoutProps & { stripeAccountId: string | null }) {
  const branding = useBranding();
  const symbol = getCurrencySymbol(currency);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("GB");

  // Payment state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [cardRef, setCardRef] = useState<CardFieldsHandle | null>(null);

  const isValid = firstName.trim() && lastName.trim() && email.trim() && email.includes("@");

  const handleSubmit = useCallback(async () => {
    if (!isValid || processing || !cardRef) return;

    setProcessing(true);
    setError(null);

    try {
      // 1. Create PaymentIntent
      const piRes = await fetch("/api/merch-store/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_slug: collection.slug,
          items: cartItems.map((item) => ({
            collection_item_id: item.collection_item_id,
            qty: item.qty,
            merch_size: item.merch_size,
          })),
          customer: {
            email: email.trim().toLowerCase(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim() || undefined,
          },
        }),
      });

      const piData = await piRes.json();

      if (!piRes.ok || !piData.client_secret) {
        setError(piData.error || "Failed to create payment. Please try again.");
        setProcessing(false);
        return;
      }

      // 2. Confirm payment with Stripe
      const result = await cardRef.confirmPayment(piData.client_secret, {
        name: `${firstName.trim()} ${lastName.trim()}`,
        email: email.trim().toLowerCase(),
        address: { country },
      });

      if (result.error) {
        setError(getPaymentErrorMessage(result.error));
        setProcessing(false);
        return;
      }

      if (result.paymentIntent?.status !== "succeeded") {
        setError("Payment was not completed. Please try again.");
        setProcessing(false);
        return;
      }

      // 3. Confirm order on our server
      const confirmRes = await fetch("/api/merch-store/confirm-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_intent_id: result.paymentIntent.id,
          stripe_account_id: stripeAccountId,
          event_id: event.id,
        }),
      });

      const confirmData = await confirmRes.json();

      if (!confirmRes.ok || !confirmData.data) {
        // Payment went through but order creation failed — show partial success
        setError("Payment received but order confirmation failed. Please contact support.");
        setProcessing(false);
        return;
      }

      setCompletedOrder(confirmData.data);
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Merch checkout error:", err);
    }

    setProcessing(false);
  }, [isValid, processing, cardRef, collection.slug, cartItems, email, firstName, lastName, phone, country, stripeAccountId, event.id]);

  // Show order confirmation
  if (completedOrder) {
    return (
      <MerchOrderConfirmation
        order={completedOrder}
        collection={collection}
        event={event}
        currency={currency}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-sm text-[var(--text-secondary,#888)] transition-colors hover:text-[var(--text-primary,#fff)]"
        >
          &larr; Back to collection
        </button>
        <h1 className="font-[var(--font-mono,'Space_Mono',monospace)] text-xl font-bold text-[var(--text-primary,#fff)]">
          Checkout
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary,#888)]">
          Pre-order from {collection.title}
        </p>
      </div>

      {/* Order summary */}
      <div className="mb-6 rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)] mb-3">
          Order Summary
        </p>
        <div className="space-y-2">
          {cartItems.map((item) => (
            <div
              key={`${item.collection_item_id}-${item.merch_size || ""}`}
              className="flex items-center justify-between text-sm"
            >
              <div className="text-[var(--text-primary,#fff)]">
                <span>{item.product_name}</span>
                {item.merch_size && (
                  <span className="ml-1.5 text-[var(--text-secondary,#888)]">
                    ({item.merch_size})
                  </span>
                )}
                {item.qty > 1 && (
                  <span className="ml-1.5 text-[var(--text-secondary,#888)]">
                    &times;{item.qty}
                  </span>
                )}
              </div>
              <span className="font-[var(--font-mono,'Space_Mono',monospace)] text-[var(--text-primary,#fff)]">
                {symbol}{(item.unit_price * item.qty).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-[var(--card-border,#2a2a2a)] pt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text-primary,#fff)]">Total</span>
          <span className="font-[var(--font-mono,'Space_Mono',monospace)] text-lg font-bold text-[var(--text-primary,#fff)]">
            {symbol}{totalPrice.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Customer details */}
      <div className="mb-6 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)]">
          Your Details
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name *"
              className="w-full rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-3 py-2.5 text-sm text-[var(--text-primary,#fff)] placeholder:text-[var(--text-secondary,#888)]/40 outline-none focus:border-white/30"
            />
          </div>
          <div>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name *"
              className="w-full rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-3 py-2.5 text-sm text-[var(--text-primary,#fff)] placeholder:text-[var(--text-secondary,#888)]/40 outline-none focus:border-white/30"
            />
          </div>
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address *"
          className="w-full rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-3 py-2.5 text-sm text-[var(--text-primary,#fff)] placeholder:text-[var(--text-secondary,#888)]/40 outline-none focus:border-white/30"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional)"
          className="w-full rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-3 py-2.5 text-sm text-[var(--text-primary,#fff)] placeholder:text-[var(--text-secondary,#888)]/40 outline-none focus:border-white/30"
        />
      </div>

      {/* Payment */}
      <div className="mb-6 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)]">
          Payment
        </p>
        <CardFields ref={setCardRef} />
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)] mb-1.5">
            Country
          </label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-3 py-2.5 text-sm text-[var(--text-primary,#fff)] outline-none focus:border-white/30"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Pre-order info */}
      <div className="mb-6 rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary,#888)]">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <path d="m16 8 5 3-5 3V8Z" />
              <line x1="6" y1="12" x2="10" y2="12" />
            </svg>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[var(--text-primary,#fff)]">
              Collect at the Event
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary,#888)]">
              {collection.pickup_instructions ||
                "Present your QR code at the merch stand to collect your order."}
            </p>
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isValid || processing}
        className="w-full rounded-xl py-3.5 text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation active:scale-[0.98]"
        style={{
          backgroundColor: processing ? "transparent" : "#fff",
          color: processing ? "var(--text-primary, #fff)" : "#0e0e0e",
          border: processing ? "1px solid var(--card-border, #2a2a2a)" : "none",
        }}
      >
        {processing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Processing...
          </span>
        ) : (
          `Pre-order — ${symbol}${totalPrice.toFixed(2)}`
        )}
      </button>

      <p className="mt-3 text-center text-[10px] text-[var(--text-secondary,#888)]/50">
        Secure payment powered by Stripe
      </p>
    </div>
  );
}

/* ================================================================
   MAIN COMPONENT — Wraps CheckoutForm in Stripe Elements
   ================================================================ */

export function MerchCheckout(props: MerchCheckoutProps) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch connected account and load Stripe
    preloadStripeAccount()
      .then((accountId) => {
        setStripeAccountId(accountId || null);
        setStripePromise(getStripeClient(accountId));
      })
      .catch(() => {
        setLoadError("Unable to load payment system. Please refresh and try again.");
      });
  }, []);

  const safeAmount = Math.max(toSmallestUnit(props.totalPrice), 50); // Stripe minimum is 50 (£0.50)

  const elementsOptions: StripeElementsOptions = useMemo(
    () => ({
      mode: "payment" as const,
      amount: safeAmount,
      currency: (props.currency || "GBP").toLowerCase(),
      appearance: {
        theme: "night" as const,
        variables: {
          colorPrimary: "#ff0033",
          colorBackground: "#0e0e0e",
          colorText: "#f0f0f5",
          colorDanger: "#F43F5E",
          fontFamily: "'Inter', sans-serif",
          borderRadius: "8px",
        },
      },
    }),
    [safeAmount, props.currency]
  );

  // Empty cart guard
  if (!props.cartItems || props.cartItems.length === 0 || props.totalPrice <= 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-[var(--text-secondary,#888)]">Your cart is empty.</p>
        <button
          onClick={props.onBack}
          className="mt-4 text-sm text-[var(--text-primary,#fff)] underline underline-offset-4"
        >
          Back to collection
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-red-400">{loadError}</p>
        <button
          onClick={props.onBack}
          className="mt-4 text-sm text-[var(--text-primary,#fff)] underline underline-offset-4"
        >
          Back to collection
        </button>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--text-secondary,#888)] border-t-transparent" />
        <span className="ml-3 text-sm text-[var(--text-secondary,#888)]">Loading payment...</span>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <CheckoutForm {...props} stripeAccountId={stripeAccountId} />
    </Elements>
  );
}
