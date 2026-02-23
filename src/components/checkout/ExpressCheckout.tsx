"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
import { getStripeClient, preloadStripeAccount } from "@/lib/stripe/client";
import { toSmallestUnit } from "@/lib/stripe/config";
import type { Order } from "@/types/orders";
import { useOrgId } from "@/components/OrgProvider";

interface ExpressCheckoutProps {
  eventId: string;
  currency: string;
  /** Display price total, e.g. 52.92 */
  amount: number;
  items: { ticket_type_id: string; qty: number; merch_size?: string }[];
  onSuccess: (order: Order) => void;
  onError: (message: string) => void;
  /** Called when express payment methods are confirmed available */
  onAvailable?: () => void;
  /** Discount code to apply (validated server-side during payment-intent creation) */
  discountCode?: string;
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
  onAvailable,
  discountCode,
}: ExpressCheckoutProps) {
  const stripe = useStripe();
  const elements = useElements();
  const orgId = useOrgId();
  const [available, setAvailable] = useState(true);

  // Sync Elements amount when cart total changes (e.g. ticket added/removed).
  // Stripe requires amount > 0; use 50 (smallest-unit minimum) as floor.
  useEffect(() => {
    if (!elements) return;
    elements.update({ amount: toSmallestUnit(amount) || 50 });
  }, [elements, amount]);

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
            discount_code: discountCode || undefined,
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
            event_id: eventId,
            stripe_account_id: data.stripe_account_id,
          }),
        });

        const orderData = await orderRes.json();
        if (orderRes.ok && orderData.data) {
          onSuccess(orderData.data);
        } else {
          // Payment succeeded — order will be reconciled via webhook
          onSuccess({
            id: "",
            org_id: orgId,
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
    [stripe, elements, eventId, items, amount, currency, onSuccess, onError, discountCode]
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
          } else {
            onAvailable?.();
          }
        }}
        options={{
          buttonType: {
            applePay: "plain",
            googlePay: "plain",
          },
          buttonTheme: {
            applePay: "white",
            googlePay: "white",
          },
          buttonHeight: 48,
          layout: {
            maxColumns: 2,
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
  );
}

/**
 * ExpressCheckout — Standalone express checkout for use outside the checkout page.
 *
 * Used on the ticket/event page to show Apple Pay / Google Pay buttons.
 * Creates its own Elements context with deferred intent mode.
 *
 * Only shows Apple Pay (iPhone/Safari) or Google Pay (Android/Chrome).
 * All other express methods (Link, Klarna, etc.) are blocked.
 *
 * NOTE: Apple Pay requires domain registration in Stripe Dashboard:
 *   Dashboard → Settings → Payment methods → Apple Pay → Add domain
 *   Google Pay works automatically on Chrome with a saved card.
 */
export function ExpressCheckout(props: ExpressCheckoutProps) {
  const [stripeAccountId, setStripeAccountId] = useState<string | undefined>(
    undefined
  );
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Use cached preload — resolves instantly if preloadStripe() was called
    // earlier (e.g. on ticket widget mount). Falls back to fetching if not.
    (async () => {
      const accountId = await preloadStripeAccount();
      setStripeAccountId(accountId);
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div className="express-checkout">
        <div className="express-checkout__skeleton" />
      </div>
    );
  }

  const stripePromise = getStripeClient(stripeAccountId);
  const amountInSmallest = toSmallestUnit(props.amount) || 50; // Stripe requires > 0

  const elementsOptions: StripeElementsOptions = {
    mode: "payment",
    amount: amountInSmallest,
    currency: props.currency.toLowerCase(),
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#ffffff",
        colorBackground: "#0e0e0e",
        borderRadius: "12px",
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <ExpressCheckoutInner {...props} />
    </Elements>
  );
}
