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

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

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

      {/* Pre-filled guest info */}
      <div className="mb-4 space-y-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Name</p>
          <p className="text-sm text-white/70">{guestName}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Email</p>
          <p className="text-sm text-white/70">{guestEmail}</p>
        </div>
      </div>

      {/* Payment details box */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/80">Payment Details</h3>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-white/30" />
            <p className="text-[11px] text-white/30">All transactions are secure and encrypted.</p>
          </div>
        </div>

        {/* Credit / Debit Card label with brand icons */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white/80">Credit / Debit Card</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center rounded bg-[#1A1F71] px-1.5 py-0.5 text-[9px] font-bold text-white">VISA</span>
            <span className="inline-flex items-center justify-center rounded bg-[#FF5F00] px-1.5 py-0.5 text-[9px] font-bold text-white">MC</span>
            <span className="inline-flex items-center justify-center rounded bg-[#006FCF] px-1.5 py-0.5 text-[9px] font-bold text-white">AMEX</span>
          </div>
        </div>

        {/* Card form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Card Number */}
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
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
            Secure your spot
          </button>
        </form>
      </div>
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
