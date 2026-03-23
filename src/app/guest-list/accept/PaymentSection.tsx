"use client";

import { useState, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";

function PaymentForm({ onSuccess, onError }: {
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (result.error) {
      onError(result.error.message || "Payment failed");
      setProcessing(false);
    } else if (result.paymentIntent) {
      onSuccess(result.paymentIntent.id);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <button type="submit" disabled={!stripe || processing}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Secure your spot
      </button>
    </form>
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
          colorBackground: "#18181b",
          colorText: "#f0f0f5",
          borderRadius: "8px",
        },
      },
    }}>
      <PaymentForm onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
