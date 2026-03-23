"use client";

import { useState, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2, Lock } from "lucide-react";

// Same card element style as NativeCheckout
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

function CardForm({ clientSecret, guestName, guestEmail, onSuccess, onError }: {
  clientSecret: string;
  guestName: string;
  guestEmail: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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
    <div className="guest-list-checkout">
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

      {/* Security line */}
      <div className="flex items-center gap-1.5 mb-4">
        <Lock className="h-3 w-3 text-white/30" />
        <p className="text-[11px] text-white/30">All transactions are secure and encrypted.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Guest name (read-only, pre-filled) */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm text-white/60">
          {guestName}
        </div>

        {/* Guest email (read-only, pre-filled) */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm text-white/60">
          {guestEmail}
        </div>

        {/* Card Number — showIcon: true lets Stripe render the real card brand */}
        <div className="relative">
          <CardNumberElement
            options={{
              style: CARD_ELEMENT_STYLE,
              placeholder: "Card number",
              showIcon: true,
              disableLink: true,
            }}
          />
        </div>

        {/* Expiry + CVC */}
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
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
          Secure your spot
        </button>
      </form>

      <p className="mt-3 text-center text-[10px] text-white/20">
        Secure checkout powered by Stripe
      </p>
    </div>
  );
}

interface PaymentSectionProps {
  clientSecret: string;
  stripeAccountId: string | null;
  accentColor: string;
  guestName: string;
  guestEmail: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}

export default function PaymentSection({
  clientSecret,
  stripeAccountId,
  accentColor,
  guestName,
  guestEmail,
  onSuccess,
  onError,
}: PaymentSectionProps) {
  const stripePromise = useMemo(() => loadStripe(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
  ), [stripeAccountId]);

  return (
    <Elements stripe={stripePromise} options={{
      appearance: {
        theme: "night",
        variables: { colorPrimary: accentColor || "#8B5CF6" },
      },
    }}>
      <CardForm
        clientSecret={clientSecret}
        guestName={guestName}
        guestEmail={guestEmail}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  );
}
