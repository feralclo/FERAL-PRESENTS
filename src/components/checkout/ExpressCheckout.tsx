"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Elements,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type {
  StripeExpressCheckoutElementConfirmEvent,
  StripeExpressCheckoutElementClickEvent,
  StripeElementsOptions,
} from "@stripe/stripe-js";
import { getStripeClient } from "@/lib/stripe/client";
import { toSmallestUnit } from "@/lib/stripe/config";
import type { Order } from "@/types/orders";

interface ExpressCheckoutProps {
  eventId: string;
  currency: string;
  /** Display price total, e.g. 52.92 */
  amount: number;
  items: { ticket_type_id: string; qty: number; merch_size?: string }[];
  onSuccess: (order: Order) => void;
  onError: (message: string) => void;
}

/**
 * Inner component that renders the ExpressCheckoutElement within Stripe context.
 */
function ExpressCheckoutInner({
  eventId,
  items,
  amount,
  currency,
  onSuccess,
  onError,
}: ExpressCheckoutProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [available, setAvailable] = useState(true);

  const handleClick = useCallback(
    (event: StripeExpressCheckoutElementClickEvent) => {
      event.resolve({
        emailRequired: true,
        phoneNumberRequired: true,
      });
    },
    []
  );

  const handleConfirm = useCallback(
    async (event: StripeExpressCheckoutElementConfirmEvent) => {
      if (!stripe || !elements) return;

      try {
        // Extract customer info from wallet
        const billingDetails = event.billingDetails;
        const nameParts = (billingDetails?.name || "").split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || firstName;
        const email = billingDetails?.email || "";
        const phone = billingDetails?.phone || "";

        if (!email) {
          onError("Email is required.");
          return;
        }

        // 1. Create PaymentIntent with customer data from wallet
        const res = await fetch("/api/stripe/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            items,
            customer: {
              first_name: firstName,
              last_name: lastName,
              email: email.toLowerCase(),
              phone: phone || undefined,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          onError(data.error || "Failed to create payment.");
          return;
        }

        // 2. Confirm payment with the wallet's payment method
        const { error: confirmError } = await stripe.confirmPayment({
          elements,
          clientSecret: data.client_secret,
          confirmParams: {
            return_url: window.location.origin + window.location.pathname,
          },
          redirect: "if_required",
        });

        if (confirmError) {
          onError(confirmError.message || "Payment failed.");
          return;
        }

        // 3. Create order
        const orderRes = await fetch("/api/stripe/confirm-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_intent_id: data.payment_intent_id,
          }),
        });

        const orderData = await orderRes.json();
        if (orderRes.ok && orderData.data) {
          onSuccess(orderData.data);
        } else {
          // Payment succeeded — order will be reconciled via webhook
          onSuccess({
            id: "",
            org_id: "feral",
            order_number: "Processing...",
            event_id: eventId,
            customer_id: "",
            status: "completed",
            subtotal: amount,
            fees: 0,
            total: amount,
            currency,
            payment_method: "stripe",
            payment_ref: data.payment_intent_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as Order);
        }
      } catch {
        onError("An error occurred. Please try again.");
      }
    },
    [stripe, elements, eventId, items, amount, currency, onSuccess, onError]
  );

  if (!available) return null;

  return (
    <div className="express-checkout">
      <ExpressCheckoutElement
        onClick={handleClick}
        onConfirm={handleConfirm}
        onReady={({ availablePaymentMethods }) => {
          if (!availablePaymentMethods) {
            setAvailable(false);
          }
        }}
        options={{
          buttonType: {
            applePay: "buy",
            googlePay: "buy",
          },
          buttonHeight: 48,
          layout: {
            maxColumns: 2,
            maxRows: 1,
          },
        }}
      />
    </div>
  );
}

/**
 * ExpressCheckout — Standalone express checkout for use outside the checkout page.
 *
 * Used on the ticket/event page to show Apple Pay / Google Pay buttons.
 * Creates its own Elements context with deferred intent mode.
 * When the user confirms in the wallet:
 *   1. Creates PaymentIntent with customer data from wallet
 *   2. Confirms payment
 *   3. Creates order
 *   4. Calls onSuccess with the order
 */
export function ExpressCheckout(props: ExpressCheckoutProps) {
  const [stripeAccountId, setStripeAccountId] = useState<string | undefined>(
    undefined
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch("/api/stripe/account");
        const data = await res.json();
        setStripeAccountId(data.stripe_account_id || undefined);
      } catch {
        // No connected account — use platform
      }
      setReady(true);
    }
    fetchConfig();
  }, []);

  if (!ready) return null;

  const stripePromise = getStripeClient(stripeAccountId);
  const amountInSmallest = toSmallestUnit(props.amount);

  const elementsOptions: StripeElementsOptions = {
    mode: "payment",
    amount: amountInSmallest,
    currency: props.currency.toLowerCase(),
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#ff0033",
        colorBackground: "#0e0e0e",
        borderRadius: "0px",
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <ExpressCheckoutInner {...props} />
    </Elements>
  );
}
