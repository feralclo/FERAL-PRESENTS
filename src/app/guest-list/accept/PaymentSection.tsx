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

function CardForm({ clientSecret, guestName, guestEmail, formattedPrice, onSuccess, onError }: {
  clientSecret: string;
  guestName: string;
  guestEmail: string;
  formattedPrice?: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(guestName);
  const [email, setEmail] = useState(guestEmail);
  const [expressAvailable, setExpressAvailable] = useState(false);
  const [expressReady, setExpressReady] = useState(false);

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
    <div className="guest-list-checkout space-y-4">
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

      {/* Express Checkout — Apple Pay / Google Pay */}
      {expressReady && !expressAvailable ? null : (
        <div className={expressAvailable ? "mb-4" : ""} style={expressReady ? undefined : { position: "absolute", visibility: "hidden", pointerEvents: "none" }}>
          <ExpressCheckoutElement
            onConfirm={async (_event: StripeExpressCheckoutElementConfirmEvent) => {
              if (!stripe || !elements) return;
              const { error, paymentIntent } = await stripe.confirmPayment({
                elements,
                clientSecret,
                confirmParams: { return_url: window.location.href },
                redirect: "if_required",
              });
              if (error) onError(error.message || "Payment failed");
              else if (paymentIntent) onSuccess(paymentIntent.id);
            }}
            onReady={({ availablePaymentMethods }) => {
              setExpressReady(true);
              setExpressAvailable(!!availablePaymentMethods?.applePay || !!availablePaymentMethods?.googlePay);
            }}
            options={{
              paymentMethods: { applePay: "auto", googlePay: "auto", link: "never" },
              buttonType: { applePay: "plain", googlePay: "plain" },
              buttonTheme: { applePay: "white-outline", googlePay: "white" },
              layout: { maxColumns: 2, maxRows: 1 },
            }}
          />
        </div>
      )}

      {/* Divider */}
      {expressAvailable && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-white/[0.08]" />
          <span className="text-[10px] uppercase tracking-wider text-white/20">or pay with card</span>
          <div className="flex-1 h-px bg-white/[0.08]" />
        </div>
      )}

      {/* Contact section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-white/60">Contact</h3>
          <button type="button" onClick={() => setEditing(!editing)}
            className="text-[11px] text-primary/70 hover:text-primary transition-colors">
            {editing ? "Done" : "Change"}
          </button>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          {editing ? (
            <div className="p-4 space-y-3">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[15px] text-white/90 outline-none placeholder:text-white/30 focus:border-white/25" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[15px] text-white/90 outline-none placeholder:text-white/30 focus:border-white/25" />
            </div>
          ) : (
            <div className="px-4 py-3 space-y-1">
              <p className="text-[15px] text-white/90">{name}</p>
              <p className="text-[15px] text-white/60">{email}</p>
            </div>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 px-1">
          <svg className="h-3 w-3 text-white/25 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M22 7l-10 6L2 7" />
          </svg>
          <p className="text-[11px] text-white/25">Your tickets will be sent to this email</p>
        </div>
      </div>

      {/* Payment details */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-white/60">Payment Details</h3>
          <div className="flex items-center gap-1">
            <Lock className="h-3 w-3 text-white/20" />
            <span className="text-[10px] text-white/20">Encrypted</span>
          </div>
        </div>

        {/* Card box */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          {/* Card type header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <span className="text-[13px] font-medium text-white/80">Credit / Debit Card</span>
            <div className="flex items-center gap-1">
              <span className="inline-flex h-[22px] items-center rounded-[4px] bg-[#1A1F71] px-2 text-[9px] font-bold text-white">VISA</span>
              <span className="inline-flex h-[22px] w-[34px] items-center justify-center rounded-[4px] bg-[#252525]">
                <svg width="20" height="12" viewBox="0 0 20 12" fill="none"><circle cx="7" cy="6" r="5.5" fill="#EB001B"/><circle cx="13" cy="6" r="5.5" fill="#F79E1B"/><path d="M10 1.8a5.5 5.5 0 010 8.4 5.5 5.5 0 000-8.4z" fill="#FF5F00"/></svg>
              </span>
              <span className="inline-flex h-[22px] items-center rounded-[4px] bg-[#006FCF] px-2 text-[9px] font-bold text-white">AMEX</span>
            </div>
          </div>

          {/* Card fields */}
          <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
            <CardNumberElement options={{ style: CARD_ELEMENT_STYLE, placeholder: "Card number", showIcon: false, disableLink: true }} />
            <div className="grid grid-cols-2 gap-3">
              <CardExpiryElement options={{ style: CARD_ELEMENT_STYLE, placeholder: "MM / YY" }} />
              <CardCvcElement options={{ style: CARD_ELEMENT_STYLE, placeholder: "CVC" }} />
            </div>
            <button type="submit" disabled={!stripe || processing}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              {formattedPrice ? `Pay ${formattedPrice}` : "Secure your spot"}
            </button>
          </form>
        </div>
      </div>

      <p className="text-center text-[10px] text-white/15">
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
  formattedPrice?: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}

export default function PaymentSection({
  clientSecret, stripeAccountId, accentColor, guestName, guestEmail, formattedPrice, onSuccess, onError,
}: PaymentSectionProps) {
  const stripePromise = useMemo(() => loadStripe(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
  ), [stripeAccountId]);

  return (
    <Elements stripe={stripePromise} options={{
      clientSecret,
      appearance: { theme: "night", variables: { colorPrimary: accentColor || "#8B5CF6" } },
    }}>
      <CardForm clientSecret={clientSecret} guestName={guestName} guestEmail={guestEmail} formattedPrice={formattedPrice} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
