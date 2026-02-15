"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js";
import { getStripeClient } from "@/lib/stripe/client";
import { getCurrencySymbol } from "@/lib/stripe/config";

interface StripePaymentFormProps {
  eventId: string;
  eventName: string;
  currency: string;
  items: { ticket_type_id: string; qty: number; merch_size?: string }[];
  customer: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  };
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
  onBack: () => void;
  subtotal: number;
  totalQty: number;
}

/**
 * Inner form component that has access to Stripe context.
 */
function PaymentForm({
  currency,
  onSuccess,
  onError,
  onBack,
  subtotal,
  totalQty,
}: {
  currency: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
  onBack: () => void;
  subtotal: number;
  totalQty: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!stripe || !elements) return;

      setProcessing(true);
      onError("");

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (error) {
        onError(error.message || "Payment failed. Please try again.");
        setProcessing(false);
        return;
      }

      if (paymentIntent && paymentIntent.status === "succeeded") {
        onSuccess(paymentIntent.id);
      } else if (paymentIntent && paymentIntent.status === "requires_action") {
        // 3D Secure or other action — Stripe handles this automatically
        onError("Additional verification required. Please follow the prompts.");
        setProcessing(false);
      } else {
        onError("Payment was not completed. Please try again.");
        setProcessing(false);
      }
    },
    [stripe, elements, onSuccess, onError]
  );

  const symbol = getCurrencySymbol(currency);

  return (
    <form onSubmit={handleSubmit} className="native-checkout__form">
      <div className="stripe-payment-section">
        <h2 className="native-checkout__heading">Payment</h2>
        <div className="stripe-payment-element-wrapper">
          <PaymentElement
            onReady={() => setReady(true)}
            options={{
              layout: "accordion",
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
        disabled={processing || !ready || !stripe}
      >
        {processing
          ? "Processing..."
          : `PAY ${symbol}${subtotal.toFixed(2)}`}
      </button>

      <button
        type="button"
        className="native-checkout__back-btn"
        onClick={onBack}
        disabled={processing}
      >
        &larr; Edit Details
      </button>
    </form>
  );
}

/**
 * StripePaymentForm — Creates a PaymentIntent and renders the Stripe Payment Element.
 *
 * This is shown as step 2 of checkout after the customer fills in their details.
 * The Payment Element handles Card, Apple Pay, Google Pay, Klarna, etc. — all
 * styled to match the platform's dark theme with zero Stripe branding.
 */
export function StripePaymentForm({
  eventId,
  eventName,
  currency,
  items,
  customer,
  onSuccess,
  onError,
  onBack,
  subtotal,
  totalQty,
}: StripePaymentFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeAccount, setStripeAccount] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function createPaymentIntent() {
      try {
        const res = await fetch("/api/stripe/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            items,
            customer: {
              first_name: customer.first_name,
              last_name: customer.last_name,
              email: customer.email,
              phone: customer.phone,
            },
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          onError(data.error || "Failed to initialize payment.");
          setLoading(false);
          return;
        }

        if (cancelled) return;

        setClientSecret(data.client_secret);
        setStripeAccount(data.stripe_account_id || null);

        // Load Stripe.js with the connected account context if applicable
        const promise = getStripeClient(data.stripe_account_id || undefined);
        setStripePromise(promise);
        setLoading(false);
      } catch {
        if (!cancelled) {
          onError("Network error. Please check your connection.");
          setLoading(false);
        }
      }
    }

    createPaymentIntent();
    return () => {
      cancelled = true;
    };
    // Only run once on mount — customer/items won't change during this step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (loading || !clientSecret || !stripePromise) {
    return (
      <div className="stripe-payment-loading">
        <div className="stripe-payment-loading__spinner" />
        <span className="stripe-payment-loading__text">
          Initializing secure payment...
        </span>
      </div>
    );
  }

  const elementsOptions: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#ff0033",
        colorBackground: "#1a1a1a",
        colorText: "#ffffff",
        colorDanger: "#ff0033",
        colorTextPlaceholder: "#555555",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSizeBase: "16px", // ≥16px prevents iOS Safari auto-zoom on focus
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
          fontSize: "16px", // ≥16px prevents iOS Safari auto-zoom on focus
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
    <Elements stripe={stripePromise} options={elementsOptions} key={clientSecret}>
      <PaymentForm
        currency={currency}
        onSuccess={onSuccess}
        onError={onError}
        onBack={onBack}
        subtotal={subtotal}
        totalQty={totalQty}
      />
    </Elements>
  );
}
