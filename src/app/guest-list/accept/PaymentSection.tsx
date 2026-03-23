"use client";

import { useState, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  ExpressCheckoutElement,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { StripeExpressCheckoutElementConfirmEvent } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";

// Same style as NativeCheckout
const CARD_ELEMENT_STYLE = {
  base: {
    fontSize: "16px",
    color: "#ffffff",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSmoothing: "antialiased",
    "::placeholder": { color: "#555555" },
  },
  invalid: { color: "#ef4444" },
};

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PaymentForm({ clientSecret, onSuccess, onError }: {
  clientSecret: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [expressAvailable, setExpressAvailable] = useState(false);

  // Express Checkout (Apple Pay / Google Pay) confirm handler
  const handleExpressConfirm = async (_event: StripeExpressCheckoutElementConfirmEvent) => {
    if (!stripe || !elements) return;

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (error) {
      onError(error.message || "Payment failed");
    } else if (paymentIntent) {
      onSuccess(paymentIntent.id);
    }
  };

  // Card form submit handler
  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    const cardNumber = elements.getElement(CardNumberElement);
    if (!cardNumber) return;

    setProcessing(true);

    const { error, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      { payment_method: { card: cardNumber } },
    );

    if (error) {
      onError(error.message || "Payment failed");
      setProcessing(false);
    } else if (paymentIntent) {
      onSuccess(paymentIntent.id);
    }
  };

  return (
    <div className="flex flex-col gap-4 guest-list-checkout">
      <style>{`
        .guest-list-checkout .StripeElement {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.10);
          border-radius: 8px;
          padding: 15px 16px;
          transition: border-color 0.15s ease;
        }
        .guest-list-checkout .StripeElement--focus {
          border-color: rgba(255, 255, 255, 0.30);
        }
        .guest-list-checkout .StripeElement--invalid {
          border-color: rgba(239, 68, 68, 0.50);
        }
      `}</style>

      {/* Express Checkout — Apple Pay / Google Pay */}
      <ExpressCheckoutElement
        onConfirm={handleExpressConfirm}
        onReady={({ availablePaymentMethods }) => {
          setExpressAvailable(!!availablePaymentMethods?.applePay || !!availablePaymentMethods?.googlePay);
        }}
        options={{
          buttonType: { applePay: "plain", googlePay: "plain" },
          buttonTheme: { applePay: "white-outline", googlePay: "white" },
          layout: { maxColumns: 2, maxRows: 1 },
        }}
      />

      {/* Divider */}
      {expressAvailable && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[11px] text-muted-foreground/40 uppercase tracking-wider">or pay with card</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
      )}

      {/* Card form */}
      <form onSubmit={handleCardSubmit} className="flex flex-col gap-3">
        <div className="relative">
          <CardNumberElement
            options={{
              style: CARD_ELEMENT_STYLE,
              placeholder: "Card number",
              showIcon: false,
              disableLink: true,
            }}
          />
          <LockIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-white/25 pointer-events-none z-[1]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <CardExpiryElement
              options={{ style: CARD_ELEMENT_STYLE, placeholder: "MM / YY" }}
            />
          </div>
          <div>
            <CardCvcElement
              options={{ style: CARD_ELEMENT_STYLE, placeholder: "CVC" }}
            />
          </div>
        </div>

        <button type="submit" disabled={!stripe || processing}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Secure your spot
        </button>
      </form>
    </div>
  );
}

interface PaymentSectionProps {
  clientSecret: string;
  stripeAccountId: string | null;
  accentColor: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}

export default function PaymentSection({
  clientSecret,
  stripeAccountId,
  accentColor,
  onSuccess,
  onError,
}: PaymentSectionProps) {
  const stripePromise = useMemo(() => loadStripe(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
  ), [stripeAccountId]);

  return (
    <Elements stripe={stripePromise} options={{
      clientSecret,
      appearance: {
        theme: "night",
        variables: {
          colorPrimary: accentColor || "#8B5CF6",
          colorBackground: "transparent",
        },
      },
    }}>
      <PaymentForm clientSecret={clientSecret} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
