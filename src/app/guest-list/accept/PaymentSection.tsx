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
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardNumber } });
    if (error) { onError(error.message || "Payment failed"); setProcessing(false); }
    else if (paymentIntent) { onSuccess(paymentIntent.id); }
  };

  return (
    <div className="guest-list-checkout">
      <style>{`
        .guest-list-checkout .StripeElement {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 14px 16px;
          transition: border-color 0.15s ease;
        }
        .guest-list-checkout .StripeElement--focus {
          border-color: rgba(255, 255, 255, 0.25);
        }
        .guest-list-checkout .StripeElement--invalid {
          border-color: rgba(239, 68, 68, 0.50);
        }
      `}</style>

      {/* Guest info */}
      <div className="mb-5 space-y-3">
        <div>
          <p className="text-[11px] font-medium text-white/40 mb-1">Name</p>
          <p className="text-sm text-white/80">{guestName}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-white/40 mb-1">Email</p>
          <p className="text-sm text-white/80">{guestEmail}</p>
        </div>
      </div>

      {/* Payment details header — matches main checkout */}
      <div className="mb-3">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-white/70">Payment Details</h3>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Lock className="h-3 w-3 text-white/25" />
          <p className="text-[11px] text-white/25">All transactions are secure and encrypted.</p>
        </div>
      </div>

      {/* Card box — contained like main checkout */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        {/* Credit / Debit Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <span className="text-[13px] font-medium text-white/80">Credit / Debit Card</span>
          <div className="flex items-center gap-1">
            <span className="inline-flex h-[22px] items-center rounded-[4px] bg-[#1A1F71] px-2 text-[9px] font-bold text-white leading-none">VISA</span>
            <span className="inline-flex h-[22px] w-[34px] items-center justify-center rounded-[4px] bg-[#252525]">
              <svg width="20" height="12" viewBox="0 0 20 12" fill="none"><circle cx="7" cy="6" r="5.5" fill="#EB001B"/><circle cx="13" cy="6" r="5.5" fill="#F79E1B"/><path d="M10 1.8a5.5 5.5 0 010 8.4 5.5 5.5 0 000-8.4z" fill="#FF5F00"/></svg>
            </span>
            <span className="inline-flex h-[22px] items-center rounded-[4px] bg-[#006FCF] px-2 text-[9px] font-bold text-white leading-none">AMEX</span>
          </div>
        </div>

        {/* Card fields */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          <CardNumberElement
            options={{
              style: CARD_ELEMENT_STYLE,
              placeholder: "Card number",
              showIcon: false,
              disableLink: true,
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <CardExpiryElement options={{ style: CARD_ELEMENT_STYLE, placeholder: "Expiration date (MM/YY)" }} />
            <CardCvcElement options={{ style: CARD_ELEMENT_STYLE, placeholder: "Security code" }} />
          </div>

          <button type="submit" disabled={!stripe || processing}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
            Secure your spot
          </button>
        </form>
      </div>

      <p className="mt-3 text-center text-[10px] text-white/15">
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
  clientSecret, stripeAccountId, accentColor, guestName, guestEmail, onSuccess, onError,
}: PaymentSectionProps) {
  const stripePromise = useMemo(() => loadStripe(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
  ), [stripeAccountId]);

  return (
    <Elements stripe={stripePromise} options={{
      appearance: { theme: "night", variables: { colorPrimary: accentColor || "#8B5CF6" } },
    }}>
      <CardForm clientSecret={clientSecret} guestName={guestName} guestEmail={guestEmail} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
