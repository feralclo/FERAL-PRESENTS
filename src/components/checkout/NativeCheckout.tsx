"use client";

import { useState, useMemo, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useSearchParams } from "next/navigation";
import {
  Elements,
  ExpressCheckoutElement,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type {
  Stripe,
  StripeElementsOptions,
  StripeExpressCheckoutElementConfirmEvent,
  StripeExpressCheckoutElementClickEvent,
} from "@stripe/stripe-js";
import { OrderConfirmation } from "./OrderConfirmation";
import { CheckoutTimer } from "./CheckoutTimer";
import { getStripeClient, preloadStripeAccount } from "@/lib/stripe/client";
import type { Event, TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";
import { getCurrencySymbol, toSmallestUnit } from "@/lib/stripe/config";
import { useBranding } from "@/hooks/useBranding";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { calculateCheckoutVat, DEFAULT_VAT_SETTINGS } from "@/lib/vat";
import type { VatSettings } from "@/types/settings";
import { SETTINGS_KEYS } from "@/lib/constants";
import { isRestrictedCheckoutEmail } from "@/lib/checkout-guards";
import { CheckoutServiceUnavailable } from "./CheckoutServiceUnavailable";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

/* ================================================================
   TYPES
   ================================================================ */

/** Pre-filled cart data from abandoned cart recovery email click */
interface RestoreData {
  email: string;
  firstName: string;
  lastName: string;
  cartParam: string;
}

interface NativeCheckoutProps {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  restoreData?: RestoreData | null;
}

interface CartLine {
  ticket_type_id: string;
  name: string;
  qty: number;
  price: number;
  merch_size?: string;
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
    error?: { message?: string };
    paymentIntent?: { id: string; status: string };
  }>;
}

interface DiscountInfo {
  code: string;
  type: string;
  value: number;
  /** The calculated discount amount in major currency units. */
  amount: number;
}

/* ================================================================
   COUNTRIES LIST — for billing country dropdown
   ================================================================ */

const COUNTRIES = [
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czech Republic" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "NZ", name: "New Zealand" },
];

/* ================================================================
   CARD ELEMENT STYLE — shared across all card inputs
   ================================================================ */

const CARD_ELEMENT_STYLE = {
  base: {
    fontSize: "16px", // ≥16px prevents iOS Safari auto-zoom on focus
    color: "#ffffff",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSmoothing: "antialiased",
    "::placeholder": {
      color: "#555555",
    },
  },
  invalid: {
    color: "#ef4444",
  },
};

/* ================================================================
   SVG ICONS — reusable inline icons
   ================================================================ */

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 7l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ================================================================
   MAIN CHECKOUT COMPONENT
   ================================================================ */

export function NativeCheckout({ slug, event, restoreData }: NativeCheckoutProps) {
  const searchParams = useSearchParams();
  const cartParam = restoreData?.cartParam || searchParams.get("cart");
  const piParam = searchParams.get("pi");
  const { trackPageView } = useMetaTracking();

  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [capturedEmail, setCapturedEmail] = useState<string>(() => {
    if (restoreData?.email) {
      if (isRestrictedCheckoutEmail(restoreData.email)) return "";
      return restoreData.email;
    }
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("feral_checkout_email") || "";
        if (stored && isRestrictedCheckoutEmail(stored)) {
          sessionStorage.removeItem("feral_checkout_email");
          return "";
        }
        return stored;
      } catch {
        return "";
      }
    }
    return "";
  });

  // Persist restored email to sessionStorage so page refresh keeps it
  useEffect(() => {
    if (restoreData?.email && !isRestrictedCheckoutEmail(restoreData.email) && typeof window !== "undefined") {
      try {
        sessionStorage.setItem("feral_checkout_email", restoreData.email);
      } catch {}
    }
  }, [restoreData?.email]);
  const [walletPassEnabled, setWalletPassEnabled] = useState<{ apple?: boolean; google?: boolean }>({});
  const [vatSettings, setVatSettings] = useState<VatSettings | null>(null);

  // Track PageView on checkout page load
  useEffect(() => {
    trackPageView();
  }, [trackPageView]);

  // Fetch wallet pass + VAT settings in parallel
  useEffect(() => {
    fetch("/api/settings?key=feral_wallet_passes")
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setWalletPassEnabled({
            apple: json.data.apple_wallet_enabled || false,
            google: json.data.google_wallet_enabled || false,
          });
        }
      })
      .catch(() => {});

    fetch(`/api/settings?key=${SETTINGS_KEYS.VAT}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setVatSettings({ ...DEFAULT_VAT_SETTINGS, ...json.data });
        }
      })
      .catch(() => {});
  }, []);

  // Suppress scanlines/noise on checkout pages
  useEffect(() => {
    document.documentElement.classList.add("checkout-active");
    return () => document.documentElement.classList.remove("checkout-active");
  }, []);

  // Parse cart from URL
  const cartLines: CartLine[] = useMemo(() => {
    if (!cartParam) return [];
    const ttMap = new Map(
      (event.ticket_types || []).map((tt) => [tt.id, tt])
    );
    const lines: CartLine[] = [];
    for (const part of cartParam.split(",")) {
      const segments = part.split(":");
      if (segments.length >= 2) {
        const ticketTypeId = segments[0];
        const qty = parseInt(segments[1], 10) || 1;
        const size = segments[2] || undefined;
        const tt = ttMap.get(ticketTypeId);
        lines.push({
          ticket_type_id: ticketTypeId,
          name: tt?.name || "Ticket",
          qty,
          price: tt ? Number(tt.price) : 0,
          merch_size: size,
        });
      }
    }
    return lines;
  }, [cartParam, event.ticket_types]);

  const subtotal = cartLines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const totalQty = cartLines.reduce((sum, l) => sum + l.qty, 0);
  const symbol = getCurrencySymbol(event.currency);
  const isStripe = event.payment_method === "stripe";

  // ── Stripe pre-initialization ─────────────────────────────────────────
  const [stripeReady, setStripeReady] = useState(false);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    if (!isStripe) return;

    (async () => {
      const accountId = await preloadStripeAccount();
      setStripePromise(getStripeClient(accountId));
      setStripeReady(true);
    })();
  }, [isStripe]);

  // Handle express checkout redirect from ticket page (?pi=xxx)
  useEffect(() => {
    if (piParam && !completedOrder) {
      (async () => {
        try {
          const res = await fetch("/api/stripe/confirm-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_intent_id: piParam, event_id: event.id }),
          });
          const data = await res.json();
          if (res.ok && data.data) {
            setCompletedOrder(data.data);
          }
        } catch {
          // Will show checkout form as fallback
        }
      })();
    }
  }, [piParam, completedOrder]);

  // Show loading for express redirect
  if (piParam && !completedOrder) {
    return (
      <div className="midnight-checkout min-h-screen flex flex-col">
        <CheckoutHeader slug={slug} />
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 gap-4" style={{ minHeight: "60vh" }}>
          <div className="w-6 h-6 border-2 border-white/[0.08] border-t-white rounded-full midnight-spinner" />
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[2px] uppercase text-foreground/35">
            Confirming your order...
          </span>
        </div>
      </div>
    );
  }

  // Show confirmation
  if (completedOrder) {
    return (
      <OrderConfirmation
        order={completedOrder}
        slug={slug}
        eventName={event.name}
        walletPassEnabled={walletPassEnabled}
      />
    );
  }

  // Guard: restricted email domain
  if (serviceUnavailable) {
    return <CheckoutServiceUnavailable slug={slug} />;
  }

  // Guard: empty cart
  if (cartLines.length === 0) {
    return (
      <div className="midnight-checkout min-h-screen flex flex-col">
        <CheckoutHeader slug={slug} />
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
          <h2 className="font-[family-name:var(--font-mono)] text-sm tracking-[2.5px] uppercase text-foreground font-bold">
            Your cart is empty
          </h2>
          <p className="text-foreground/50 text-sm mt-3 mb-6">
            No tickets selected. Head back to pick your tickets.
          </p>
          <a
            href={`/event/${slug}/#tickets`}
            className="inline-block w-full max-w-[320px] bg-white text-[#111] font-[family-name:var(--font-sans)] text-[15px] font-semibold tracking-[0.3px] py-4 px-6 rounded-[10px] text-center no-underline transition-all duration-150 hover:bg-[#f5f5f5] active:bg-[#ebebeb] active:scale-[0.99]"
          >
            BROWSE TICKETS
          </a>
        </div>
        <CheckoutFooter />
      </div>
    );
  }

  // Email capture gate
  if (!capturedEmail && cartLines.length > 0) {
    return (
      <EmailCapture
        slug={slug}
        event={event}
        cartLines={cartLines}
        subtotal={subtotal}
        totalQty={totalQty}
        symbol={symbol}
        vatSettings={vatSettings}
        onContinue={(email) => {
          if (isRestrictedCheckoutEmail(email)) {
            setServiceUnavailable(true);
            return;
          }
          try {
            sessionStorage.setItem("feral_checkout_email", email);
          } catch {}
          setCapturedEmail(email);

          // Fire-and-forget: create customer + abandoned cart
          fetch("/api/checkout/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              event_id: event.id,
              items: cartLines.map((l) => ({
                ticket_type_id: l.ticket_type_id,
                qty: l.qty,
                name: l.name,
                price: l.price,
                merch_size: l.merch_size,
              })),
              subtotal,
              currency: event.currency || "GBP",
            }),
          }).catch(() => {});
        }}
      />
    );
  }

  // Test mode checkout
  if (!isStripe) {
    return (
      <TestModeCheckout
        slug={slug}
        event={event}
        cartLines={cartLines}
        subtotal={subtotal}
        totalQty={totalQty}
        symbol={symbol}
        vatSettings={vatSettings}
        onComplete={setCompletedOrder}
        capturedEmail={capturedEmail}
        onChangeEmail={() => setCapturedEmail("")}
      />
    );
  }

  // Stripe checkout
  return (
    <StripeCheckoutPage
      slug={slug}
      event={event}
      cartLines={cartLines}
      subtotal={subtotal}
      totalQty={totalQty}
      symbol={symbol}
      vatSettings={vatSettings}
      onComplete={setCompletedOrder}
      capturedEmail={capturedEmail}
      onChangeEmail={() => setCapturedEmail("")}
      restoreData={restoreData}
      stripeReady={stripeReady}
      stripePromise={stripePromise}
    />
  );
}

/* ================================================================
   DISCOUNT CODE INPUT
   ================================================================ */

function DiscountCodeInput({
  eventId,
  subtotal,
  discount,
  onApply,
  onRemove,
}: {
  eventId: string;
  subtotal: number;
  discount: DiscountInfo | null;
  onApply: (d: DiscountInfo) => void;
  onRemove: () => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleApply = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          event_id: eventId,
          subtotal,
        }),
      });
      const data = await res.json();
      if (data.valid && data.discount) {
        const d = data.discount;
        const amount =
          d.type === "percentage"
            ? Math.round((subtotal * d.value) / 100 * 100) / 100
            : Math.min(d.value, subtotal);
        onApply({ code: d.code, type: d.type, value: d.value, amount });
        setCode("");
      } else {
        setError(data.error || "Invalid discount code");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  if (discount) {
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between bg-[rgba(78,203,113,0.06)] border border-dashed border-[rgba(78,203,113,0.25)] rounded-lg py-2.5 px-3.5">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 shrink-0 text-[#4ecb71]" viewBox="0 0 24 24" fill="none">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="7" cy="7" r="1" fill="currentColor"/>
            </svg>
            <span className="font-[family-name:var(--font-mono)] text-[13px] font-bold tracking-[1.5px] text-[#4ecb71]">
              {discount.code}
            </span>
          </div>
          <button
            className="text-foreground/40 text-xl leading-none p-2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center transition-colors duration-150 hover:text-foreground"
            onClick={onRemove}
            type="button"
            aria-label="Remove discount"
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-mono)] text-base tracking-[1px] uppercase py-[11px] px-3.5 outline-none transition-colors duration-150 placeholder:text-foreground/35 placeholder:normal-case placeholder:tracking-normal placeholder:font-[family-name:var(--font-sans)] focus:border-white/[0.30]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Discount code"
          enterKeyHint="send"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleApply())}
        />
        <button
          className="bg-white/[0.10] border border-white/[0.25] rounded-lg text-foreground font-[family-name:var(--font-sans)] text-[13px] font-semibold py-3 px-5 min-h-[44px] whitespace-nowrap transition-all duration-150 hover:bg-white/[0.18] hover:border-white/[0.40] disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
          onClick={handleApply}
          disabled={loading || !code.trim()}
          type="button"
        >
          {loading ? "\u2026" : "Apply"}
        </button>
      </div>
      {error && (
        <div className="font-[family-name:var(--font-sans)] text-xs text-destructive mt-2">{error}</div>
      )}
    </div>
  );
}

/* ================================================================
   STRIPE CHECKOUT PAGE
   Two-column on desktop (form left, order summary right).
   ================================================================ */

function StripeCheckoutPage({
  slug,
  event,
  cartLines,
  subtotal,
  totalQty,
  symbol,
  vatSettings,
  onComplete,
  capturedEmail,
  onChangeEmail,
  restoreData,
  stripeReady,
  stripePromise,
}: {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  cartLines: CartLine[];
  subtotal: number;
  totalQty: number;
  symbol: string;
  vatSettings: VatSettings | null;
  onComplete: (order: Order) => void;
  capturedEmail: string;
  onChangeEmail: () => void;
  restoreData?: RestoreData | null;
  stripeReady: boolean;
  stripePromise: Promise<Stripe | null> | null;
}) {
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountInfo | null>(null);

  if (!stripeReady || !stripePromise) {
    return (
      <div className="midnight-checkout min-h-screen flex flex-col">
        <CheckoutHeader slug={slug} />
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 gap-4" style={{ minHeight: "60vh" }}>
          <div className="w-6 h-6 border-2 border-white/[0.08] border-t-white rounded-full midnight-spinner" />
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[2px] uppercase text-foreground/35">
            Securing checkout...
          </span>
        </div>
      </div>
    );
  }

  const discountAmount = appliedDiscount?.amount || 0;
  const afterDiscount = Math.max(subtotal - discountAmount, 0);
  const vatBreakdown = calculateCheckoutVat(afterDiscount, vatSettings);
  const total = vatBreakdown && !vatSettings?.prices_include_vat
    ? vatBreakdown.gross
    : afterDiscount;
  const amountInSmallest = toSmallestUnit(total);

  const elementsOptions: StripeElementsOptions = {
    mode: "payment",
    amount: amountInSmallest || 100,
    currency: event.currency.toLowerCase(),
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#ffffff",
        colorBackground: "#1a1a1a",
        colorText: "#ffffff",
        colorDanger: "#ef4444",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSizeBase: "16px",
        borderRadius: "12px",
      },
    },
    fonts: [
      {
        cssSrc:
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap",
      },
    ],
  };

  return (
    <div className="midnight-checkout min-h-screen flex flex-col">
      <CheckoutHeader slug={slug} />
      <CheckoutTimer active={true} />

      {/* Mobile: always-visible order summary */}
      <OrderSummaryMobile
        cartLines={cartLines}
        symbol={symbol}
        subtotal={subtotal}
        event={event}
        discount={appliedDiscount}
        onApplyDiscount={setAppliedDiscount}
        onRemoveDiscount={() => setAppliedDiscount(null)}
        vatSettings={vatSettings}
      />

      <div className="flex-1 relative lg:bg-[linear-gradient(to_right,transparent_calc(50%+220px),rgba(255,255,255,0.06)_calc(50%+220px),rgba(255,255,255,0.06)_calc(50%+221px),transparent_calc(50%+221px))]">
        <div className="flex flex-col lg:flex-row max-w-[1200px] mx-auto w-full">
          <div className="flex-1 min-w-0 lg:pr-8">
            <Elements stripe={stripePromise} options={elementsOptions}>
              <SinglePageCheckoutForm
                slug={slug}
                event={event}
                cartLines={cartLines}
                subtotal={subtotal}
                totalQty={totalQty}
                symbol={symbol}
                onComplete={onComplete}
                stripePromise={stripePromise}
                discountCode={appliedDiscount?.code || null}
                totalAmount={total}
                capturedEmail={capturedEmail}
                onChangeEmail={onChangeEmail}
                restoreData={restoreData}
              />
            </Elements>
          </div>

          {/* Desktop: sidebar order summary */}
          <aside className="hidden lg:block w-[360px] shrink-0 pl-8 pt-8 sticky top-24 self-start">
            <OrderSummaryDesktop
              cartLines={cartLines}
              symbol={symbol}
              subtotal={subtotal}
              event={event}
              discount={appliedDiscount}
              onApplyDiscount={setAppliedDiscount}
              onRemoveDiscount={() => setAppliedDiscount(null)}
              vatSettings={vatSettings}
            />
          </aside>
        </div>
      </div>

      <CheckoutFooter />
    </div>
  );
}

/* ================================================================
   SINGLE-PAGE CHECKOUT FORM
   ================================================================ */

function SinglePageCheckoutForm({
  slug,
  event,
  cartLines,
  subtotal,
  totalQty,
  symbol,
  onComplete,
  stripePromise,
  discountCode,
  totalAmount,
  capturedEmail,
  onChangeEmail,
  restoreData,
}: {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  cartLines: CartLine[];
  subtotal: number;
  totalQty: number;
  symbol: string;
  onComplete: (order: Order) => void;
  stripePromise: Promise<Stripe | null>;
  discountCode: string | null;
  totalAmount: number;
  capturedEmail: string;
  onChangeEmail: () => void;
  restoreData?: RestoreData | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { trackAddPaymentInfo } = useMetaTracking();
  const { trackEngagement } = useTraffic();

  const [email, setEmail] = useState(capturedEmail);
  const [firstName, setFirstName] = useState(restoreData?.firstName || "");
  const [lastName, setLastName] = useState(restoreData?.lastName || "");
  const [nameOnCard, setNameOnCard] = useState("");
  const [country, setCountry] = useState(event.currency === "EUR" ? "BE" : "GB");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [expressAvailable, setExpressAvailable] = useState(true);
  const [expressLoaded, setExpressLoaded] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "klarna">("card");
  const cardRef = useRef<CardFieldsHandle>(null);
  const nameCaptureTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const captureNameOnBlur = useCallback(() => {
    if (nameCaptureTimer.current) clearTimeout(nameCaptureTimer.current);
    nameCaptureTimer.current = setTimeout(() => {
      const fn = firstName.trim();
      const ln = lastName.trim();
      if (!fn && !ln) return;
      fetch("/api/checkout/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: capturedEmail || email,
          first_name: fn || undefined,
          last_name: ln || undefined,
          event_id: event.id,
          items: cartLines.map((l) => ({
            ticket_type_id: l.ticket_type_id,
            qty: l.qty,
            name: l.name,
            price: l.price,
            merch_size: l.merch_size,
          })),
          subtotal,
          currency: event.currency || "GBP",
        }),
      }).catch(() => {});
    }, 500);
  }, [firstName, lastName, capturedEmail, email, event.id, event.currency, cartLines, subtotal]);

  useEffect(() => {
    if (!elements) return;
    const amountInSmallest = toSmallestUnit(totalAmount) || 100;
    elements.update({ amount: amountInSmallest });
  }, [elements, totalAmount]);

  const handleExpressClick = useCallback(
    (event: StripeExpressCheckoutElementClickEvent) => {
      event.resolve({
        emailRequired: true,
        phoneNumberRequired: true,
      });
    },
    []
  );

  const handleExpressConfirm = useCallback(
    async (expressEvent: StripeExpressCheckoutElementConfirmEvent) => {
      if (!stripe || !elements) return;

      setProcessing(true);
      setError("");

      try {
        const billing = expressEvent.billingDetails;
        const nameParts = (billing?.name || "").split(" ");
        const walletFirstName = nameParts[0] || "";
        const walletLastName = nameParts.slice(1).join(" ") || walletFirstName;
        const walletEmail = billing?.email || "";
        const walletPhone = billing?.phone || "";

        if (!walletEmail) {
          setError("Email is required.");
          setProcessing(false);
          return;
        }

        const res = await fetch("/api/stripe/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: event.id,
            items: cartLines.map((l) => ({
              ticket_type_id: l.ticket_type_id,
              qty: l.qty,
              merch_size: l.merch_size,
            })),
            customer: {
              first_name: walletFirstName,
              last_name: walletLastName,
              email: walletEmail.toLowerCase(),
              phone: walletPhone || undefined,
            },
            discount_code: discountCode || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create payment.");
          setProcessing(false);
          return;
        }

        const { error: confirmError } = await stripe.confirmPayment({
          elements,
          clientSecret: data.client_secret,
          confirmParams: {
            return_url: `${window.location.origin}/event/${slug}/checkout/?pi=${data.payment_intent_id}`,
          },
          redirect: "if_required",
        });

        if (confirmError) {
          setError(confirmError.message || "Payment failed.");
          setProcessing(false);
          return;
        }

        const orderRes = await fetch("/api/stripe/confirm-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_intent_id: data.payment_intent_id,
            event_id: event.id,
            stripe_account_id: data.stripe_account_id,
          }),
        });

        const orderData = await orderRes.json();
        if (orderRes.ok && orderData.data) {
          onComplete(orderData.data);
        } else {
          onComplete({
            id: "",
            org_id: "feral",
            order_number: "Processing...",
            event_id: event.id,
            customer_id: "",
            status: "completed",
            subtotal,
            fees: 0,
            total: subtotal,
            currency: event.currency,
            payment_method: "stripe",
            payment_ref: data.payment_intent_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as Order);
        }
      } catch {
        setError("An error occurred. Please try again.");
        setProcessing(false);
      }
    },
    [stripe, elements, event, cartLines, slug, subtotal, onComplete, discountCode]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      setError("");

      if (!email.trim()) {
        setError("Email is required.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Please enter a valid email address.");
        return;
      }
      if (!firstName.trim() || !lastName.trim()) {
        setError("First name and last name are required.");
        return;
      }
      if (cartLines.length === 0) {
        setError("Your cart is empty.");
        return;
      }

      trackAddPaymentInfo(
        {
          content_ids: cartLines.map((l) => l.ticket_type_id),
          content_type: "product",
          value: totalAmount,
          currency: event.currency || "GBP",
          num_items: totalQty,
        },
        { em: email.trim().toLowerCase(), fn: firstName.trim(), ln: lastName.trim() }
      );

      setProcessing(true);
      trackEngagement("payment_processing");

      try {
        const res = await fetch("/api/stripe/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: event.id,
            items: cartLines.map((l) => ({
              ticket_type_id: l.ticket_type_id,
              qty: l.qty,
              merch_size: l.merch_size,
            })),
            customer: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim().toLowerCase(),
            },
            discount_code: discountCode || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          trackEngagement("payment_failed");
          setError(data.error || "Failed to create payment.");
          setProcessing(false);
          return;
        }

        if (paymentMethod === "card") {
          if (!cardRef.current) {
            setError("Card form not ready. Please try again.");
            setProcessing(false);
            return;
          }

          const result = await cardRef.current.confirmPayment(
            data.client_secret,
            {
              name: nameOnCard.trim() || `${firstName.trim()} ${lastName.trim()}`,
              email: email.trim().toLowerCase(),
              address: { country },
            }
          );

          if (result.error) {
            trackEngagement("payment_failed");
            setError(result.error.message || "Payment failed. Please try again.");
            setProcessing(false);
            return;
          }

          if (
            result.paymentIntent &&
            result.paymentIntent.status === "requires_action"
          ) {
            setError(
              "Additional verification required. Please follow the prompts."
            );
            setProcessing(false);
            return;
          }
        } else {
          const stripeInstance = await stripePromise;
          if (!stripeInstance) {
            setError("Payment system not ready. Please try again.");
            setProcessing(false);
            return;
          }

          const { error: klarnaError } = await stripeInstance.confirmKlarnaPayment(
            data.client_secret,
            {
              payment_method: {
                billing_details: {
                  email: email.trim().toLowerCase(),
                  name: `${firstName.trim()} ${lastName.trim()}`,
                  address: { country },
                },
              },
              return_url: `${window.location.origin}/event/${slug}/checkout/?pi=${data.payment_intent_id}`,
            }
          );

          if (klarnaError) {
            trackEngagement("payment_failed");
            setError(
              klarnaError.message || "Klarna payment failed. Please try again."
            );
            setProcessing(false);
            return;
          }
          return;
        }

        const orderRes = await fetch("/api/stripe/confirm-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_intent_id: data.payment_intent_id,
            event_id: event.id,
            stripe_account_id: data.stripe_account_id,
          }),
        });

        const orderData = await orderRes.json();
        if (orderRes.ok && orderData.data) {
          trackEngagement("payment_success");
          onComplete(orderData.data);
        } else {
          trackEngagement("payment_success");
          onComplete({
            id: "",
            org_id: "feral",
            order_number: "Processing...",
            event_id: event.id,
            customer_id: "",
            status: "completed",
            subtotal,
            fees: 0,
            total: subtotal,
            currency: event.currency,
            payment_method: "stripe",
            payment_ref: data.payment_intent_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as Order);
        }
      } catch {
        trackEngagement("payment_failed");
        setError("An error occurred. Please try again.");
        setProcessing(false);
      }
    },
    [
      email,
      firstName,
      lastName,
      nameOnCard,
      country,
      cartLines,
      event,
      slug,
      subtotal,
      paymentMethod,
      stripePromise,
      onComplete,
      discountCode,
      trackEngagement,
    ]
  );

  const isReady = paymentMethod === "card" ? cardReady : true;

  return (
    <div className="max-w-[620px] mx-auto py-8 px-6 pb-[max(48px,env(safe-area-inset-bottom))]">
      <div className="w-full">
        {/* ── EXPRESS CHECKOUT ── */}
        <div
          className="mb-1"
          style={{ display: expressAvailable ? "block" : "none" }}
        >
          {expressLoaded && (
            <div className="express-checkout__label font-[family-name:var(--font-mono)] text-[9px] font-bold tracking-[0.2em] uppercase text-foreground/25 text-center mb-3">
              Express checkout
            </div>
          )}
          <div className="express-checkout min-h-[48px] w-full relative">
            {!expressLoaded && (
              <div className="express-checkout__skeleton midnight-skeleton-shimmer w-full h-12 rounded-xl bg-white/[0.03] overflow-hidden relative" />
            )}
            <div
              className="express-checkout__element transition-opacity duration-200"
              style={{ opacity: expressLoaded ? 1 : 0 }}
            >
              <ExpressCheckoutElement
                onClick={handleExpressClick}
                onConfirm={handleExpressConfirm}
                onReady={({ availablePaymentMethods: methods }) => {
                  setExpressLoaded(true);
                  if (!methods) {
                    setExpressAvailable(false);
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
          </div>
        </div>

        {/* ── DIVIDER ── */}
        {expressAvailable && (
          <div className="checkout-divider flex items-center gap-4 py-6">
            <span className="checkout-divider__line flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
            <span className="checkout-divider__text font-[family-name:var(--font-mono)] text-[9px] font-bold tracking-[0.2em] uppercase text-foreground/20 whitespace-nowrap">
              or pay with card
            </span>
            <span className="checkout-divider__line flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
          </div>
        )}

        {/* ── CHECKOUT FORM ── */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Contact */}
          <div className="flex flex-col gap-4">
            <h2 className="font-[family-name:var(--font-mono)] text-sm tracking-[2.5px] uppercase text-foreground font-bold m-0 pb-3.5 border-b border-white/[0.06]">
              Contact
            </h2>
            {capturedEmail ? (
              <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.08] rounded-lg py-3.5 px-4">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <EmailIcon className="w-4 h-4 text-foreground/35 shrink-0" />
                  <span className="font-[family-name:var(--font-sans)] text-sm text-foreground/80 overflow-hidden text-ellipsis whitespace-nowrap">
                    {email}
                  </span>
                </div>
                <button
                  type="button"
                  className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/50 shrink-0 py-1 px-2 transition-colors duration-150 hover:text-foreground hover:underline touch-manipulation"
                  onClick={onChangeEmail}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <label htmlFor="checkout-email" className="sr-only">Email</label>
                <input
                  id="checkout-email"
                  type="email"
                  className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-sans)] text-base py-[15px] px-4 outline-none transition-colors duration-150 placeholder:text-foreground/35 focus:border-white/[0.30]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                  autoComplete="email"
                  autoFocus
                />
                <p className="flex items-center gap-1.5 -mt-2 font-[family-name:var(--font-sans)] text-xs text-foreground/40 tracking-[0.2px]">
                  <EmailIcon className="w-3.5 h-3.5 text-foreground/35 shrink-0" />
                  Your tickets will be sent to this email
                </p>
              </>
            )}
          </div>

          {/* Customer Details */}
          <div className="flex flex-col gap-4">
            <h2 className="font-[family-name:var(--font-mono)] text-sm tracking-[2.5px] uppercase text-foreground font-bold m-0 pb-3.5 border-b border-white/[0.06]">
              Details
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="checkout-first-name" className="sr-only">First name</label>
                <input
                  id="checkout-first-name"
                  type="text"
                  className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-sans)] text-base py-[15px] px-4 outline-none transition-colors duration-150 placeholder:text-foreground/35 focus:border-white/[0.30]"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={captureNameOnBlur}
                  placeholder="First name"
                  required
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label htmlFor="checkout-last-name" className="sr-only">Last name</label>
                <input
                  id="checkout-last-name"
                  type="text"
                  className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-sans)] text-base py-[15px] px-4 outline-none transition-colors duration-150 placeholder:text-foreground/35 focus:border-white/[0.30]"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={captureNameOnBlur}
                  placeholder="Last name"
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="flex flex-col gap-4">
            <h2 className="font-[family-name:var(--font-mono)] text-sm tracking-[2.5px] uppercase text-foreground font-bold m-0 pb-3.5 border-b border-white/[0.06]">
              Payment Details
            </h2>
            <p className="flex items-center gap-1.5 font-[family-name:var(--font-sans)] text-xs text-foreground/40 tracking-[0.2px] m-0">
              <LockIcon className="w-3.5 h-3.5 text-foreground/35 shrink-0" />
              All transactions are secure and encrypted.
            </p>

            {/* Payment options accordion */}
            <div className="border border-white/[0.10] rounded-lg overflow-hidden">
              {/* Card option */}
              <div
                className={`cursor-pointer transition-colors duration-150 ${paymentMethod === "card" ? "bg-white/[0.02] cursor-default" : "hover:bg-white/[0.015]"}`}
                onClick={() => { if (paymentMethod !== "card") { setPaymentMethod("card"); trackEngagement("payment_method_selected"); } }}
                role="radio"
                aria-checked={paymentMethod === "card"}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") { setPaymentMethod("card"); trackEngagement("payment_method_selected"); } }}
              >
                <div className="flex items-center gap-3 py-3.5 px-4">
                  <span className={`w-[18px] h-[18px] border-2 rounded-full shrink-0 relative transition-colors duration-200 ${paymentMethod === "card" ? "border-white midnight-radio--checked" : "border-white/20"}`} />
                  <span className={`flex-1 font-[family-name:var(--font-sans)] text-sm font-medium tracking-[0.2px] whitespace-nowrap transition-colors duration-150 ${paymentMethod === "card" ? "text-foreground" : "text-foreground/50"}`}>
                    Credit / Debit Card
                  </span>
                  <span className="flex items-center gap-[5px] shrink-0">
                    <span className="inline-flex items-center justify-center w-[34px] h-[22px] rounded-[3px] shrink-0 overflow-hidden" style={{ background: "#1A1F71" }}>
                      <svg viewBox="0 0 32 20" fill="none" aria-label="Visa" className="w-full h-full block">
                        <text x="16" y="13.5" textAnchor="middle" fill="#fff" fontSize="8.5" fontWeight="700" fontStyle="italic" fontFamily="Arial,sans-serif">VISA</text>
                      </svg>
                    </span>
                    <span className="inline-flex items-center justify-center w-[34px] h-[22px] rounded-[3px] shrink-0 overflow-hidden" style={{ background: "#252525" }}>
                      <svg viewBox="0 0 32 20" fill="none" aria-label="Mastercard" className="w-full h-full block">
                        <circle cx="12.5" cy="10" r="6" fill="#EB001B"/>
                        <circle cx="19.5" cy="10" r="6" fill="#F79E1B"/>
                        <path d="M16 5.4a6 6 0 010 9.2 6 6 0 000-9.2z" fill="#FF5F00"/>
                      </svg>
                    </span>
                    <span className="inline-flex items-center justify-center w-[34px] h-[22px] rounded-[3px] shrink-0 overflow-hidden" style={{ background: "#2557D6" }}>
                      <svg viewBox="0 0 32 20" fill="none" aria-label="Amex" className="w-full h-full block">
                        <text x="16" y="13" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="Arial,sans-serif">AMEX</text>
                      </svg>
                    </span>
                    <span className="inline-flex items-center justify-center min-w-[26px] h-[22px] px-1 bg-white/[0.06] border border-white/[0.10] rounded-[3px] font-[family-name:var(--font-sans)] text-[10px] font-semibold text-foreground/40 leading-none">
                      +2
                    </span>
                  </span>
                </div>

                {/* Card content — collapsible */}
                <div className={`midnight-collapse${paymentMethod === "card" ? " midnight-collapse--open" : ""}`}>
                  <CardFields
                    ref={cardRef}
                    onReady={() => setCardReady(true)}
                  />

                  <label htmlFor="checkout-cc-name" className="sr-only">Name on card</label>
                  <input
                    id="checkout-cc-name"
                    type="text"
                    className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-sans)] text-base py-[15px] px-4 outline-none transition-colors duration-150 placeholder:text-foreground/35 focus:border-white/[0.30] mt-3"
                    value={nameOnCard}
                    onChange={(e) => setNameOnCard(e.target.value)}
                    placeholder="Name on card"
                    autoComplete="cc-name"
                  />

                  <div className="relative mt-3">
                    <label htmlFor="checkout-country" className="sr-only">Country</label>
                    <select
                      id="checkout-country"
                      className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-sans)] text-base py-[15px] px-4 pr-11 outline-none transition-colors duration-150 focus:border-white/[0.30] appearance-none cursor-pointer"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      autoComplete="country"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/50 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Klarna option */}
              <div
                className={`cursor-pointer transition-colors duration-150 border-t border-white/[0.08] ${paymentMethod === "klarna" ? "bg-white/[0.02] cursor-default" : "hover:bg-white/[0.015]"}`}
                onClick={() => { if (paymentMethod !== "klarna") { setPaymentMethod("klarna"); trackEngagement("payment_method_selected"); } }}
                role="radio"
                aria-checked={paymentMethod === "klarna"}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") { setPaymentMethod("klarna"); trackEngagement("payment_method_selected"); } }}
              >
                <div className="flex items-center gap-3 py-3.5 px-4">
                  <span className={`w-[18px] h-[18px] border-2 rounded-full shrink-0 relative transition-colors duration-200 ${paymentMethod === "klarna" ? "border-white midnight-radio--checked" : "border-white/20"}`} />
                  <span className={`flex-1 font-[family-name:var(--font-sans)] text-sm font-medium tracking-[0.2px] whitespace-nowrap transition-colors duration-150 ${paymentMethod === "klarna" ? "text-foreground" : "text-foreground/50"}`}>
                    Klarna
                  </span>
                  <span className="inline-flex items-center justify-center w-11 h-[22px] rounded-[3px] shrink-0 overflow-hidden ml-auto" style={{ background: "#FFB3C7" }}>
                    <svg viewBox="0 0 32 20" fill="none" aria-label="Klarna" className="w-full h-full block">
                      <text x="16" y="13" textAnchor="middle" fill="#0A0B09" fontSize="6.5" fontWeight="800" fontFamily="Arial,sans-serif">Klarna</text>
                    </svg>
                  </span>
                </div>

                <div className={`midnight-collapse${paymentMethod === "klarna" ? " midnight-collapse--open" : ""}`}>
                  <div className="py-0.5">
                    <p className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/80 leading-relaxed m-0 mb-1.5">
                      Pay in 30 days or 3 interest-free payments of{" "}
                      <strong className="text-foreground font-semibold">{symbol}{(totalAmount / 3).toFixed(2)}</strong>
                    </p>
                    <p className="font-[family-name:var(--font-sans)] text-[11px] text-foreground/40 leading-snug m-0 mb-3.5">
                      18+, T&amp;Cs apply. Credit subject to status.
                    </p>
                    <div className="flex items-start gap-2.5 py-2.5 px-3 bg-white/[0.025] border border-white/[0.06] rounded-lg">
                      <svg className="w-5 h-5 text-foreground/40 shrink-0 mt-px" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                        <rect x="6" y="8" width="12" height="9" rx="1" fill="currentColor" opacity="0.15"/>
                        <rect x="6" y="6" width="12" height="2.5" rx="0.5" fill="currentColor" opacity="0.3"/>
                        <circle cx="8" cy="7.2" r="0.6" fill="currentColor"/>
                        <circle cx="9.8" cy="7.2" r="0.6" fill="currentColor"/>
                        <circle cx="11.6" cy="7.2" r="0.6" fill="currentColor"/>
                      </svg>
                      <span className="font-[family-name:var(--font-sans)] text-xs text-foreground/50 leading-relaxed">
                        After submission, you will be redirected to securely complete next steps.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/[0.08] border border-destructive/20 text-destructive font-[family-name:var(--font-mono)] text-[11px] tracking-[0.5px] py-3 px-4 text-center rounded-lg">
              {error}
            </div>
          )}

          {/* Pay Button */}
          <button
            type="submit"
            className="w-full bg-white text-[#111] font-[family-name:var(--font-sans)] text-[15px] font-semibold tracking-[0.3px] py-4 px-6 rounded-[10px] transition-all duration-150 mt-2 hover:bg-[#f5f5f5] active:bg-[#ebebeb] active:scale-[0.99] disabled:bg-white/[0.08] disabled:text-foreground/35 disabled:cursor-not-allowed touch-manipulation"
            disabled={processing || !isReady || !stripe}
          >
            {processing
              ? "Processing\u2026"
              : paymentMethod === "klarna"
                ? "Continue to Klarna"
                : `Pay ${symbol}${totalAmount.toFixed(2)}`}
          </button>

          {/* Trust Signal */}
          <div className="flex items-center justify-center gap-1.5 pt-0 font-[family-name:var(--font-sans)] text-[11px] tracking-[0.1px] text-foreground/40">
            <LockIcon className="w-[13px] h-[13px] text-foreground/40 shrink-0" />
            <span>Secured by Stripe &middot; End-to-end encrypted</span>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================
   CARD FIELDS — Individual Stripe card elements with custom UI
   ================================================================ */

const CardFields = forwardRef<CardFieldsHandle, { onReady: () => void }>(
  function CardFields({ onReady }, ref) {
    const stripe = useStripe();
    const elements = useElements();
    const [numberReady, setNumberReady] = useState(false);
    const [expiryReady, setExpiryReady] = useState(false);
    const [cvcReady, setCvcReady] = useState(false);
    const readyNotified = useRef(false);

    useEffect(() => {
      if (numberReady && expiryReady && cvcReady && !readyNotified.current) {
        readyNotified.current = true;
        onReady();
      }
    }, [numberReady, expiryReady, cvcReady, onReady]);

    useImperativeHandle(
      ref,
      () => ({
        confirmPayment: async (clientSecret, billingDetails) => {
          if (!stripe || !elements) {
            return { error: { message: "Payment not ready. Please try again." } };
          }

          const cardNumber = elements.getElement(CardNumberElement);
          if (!cardNumber) {
            return { error: { message: "Card details not available." } };
          }

          const result = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
              card: cardNumber,
              billing_details: billingDetails,
            },
          });

          return result;
        },
      }),
      [stripe, elements]
    );

    return (
      <div className="flex flex-col gap-3">
        {/* Card Number */}
        <div className="midnight-card-number relative">
          <CardNumberElement
            onReady={() => setNumberReady(true)}
            options={{
              style: CARD_ELEMENT_STYLE,
              placeholder: "Card number",
              showIcon: false,
              disableLink: true,
            }}
          />
          <LockIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-foreground/35 pointer-events-none z-[1]" />
        </div>

        {/* Expiry + CVC */}
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
          <div>
            <CardExpiryElement
              onReady={() => setExpiryReady(true)}
              options={{
                style: CARD_ELEMENT_STYLE,
                placeholder: "Expiration date (MM/YY)",
              }}
            />
          </div>
          <div className="midnight-card-cvc relative">
            <CardCvcElement
              onReady={() => setCvcReady(true)}
              options={{
                style: CARD_ELEMENT_STYLE,
                placeholder: "Security code",
              }}
            />
            <svg
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-foreground/35 pointer-events-none z-[1]"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M12 2L4 6v5c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M9 12l2 2 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    );
  }
);

/* ================================================================
   TEST MODE CHECKOUT
   ================================================================ */

function TestModeCheckout({
  slug,
  event,
  cartLines,
  subtotal,
  totalQty,
  symbol,
  vatSettings,
  onComplete,
  capturedEmail,
  onChangeEmail,
}: {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  cartLines: CartLine[];
  subtotal: number;
  totalQty: number;
  symbol: string;
  vatSettings: VatSettings | null;
  onComplete: (order: Order) => void;
  capturedEmail: string;
  onChangeEmail: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(capturedEmail);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const nameCaptureTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const captureNameOnBlur = useCallback(() => {
    if (nameCaptureTimer.current) clearTimeout(nameCaptureTimer.current);
    nameCaptureTimer.current = setTimeout(() => {
      const fn = firstName.trim();
      const ln = lastName.trim();
      if (!fn && !ln) return;
      fetch("/api/checkout/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: capturedEmail || email,
          first_name: fn || undefined,
          last_name: ln || undefined,
          event_id: event.id,
          items: cartLines.map((l) => ({
            ticket_type_id: l.ticket_type_id,
            qty: l.qty,
            name: l.name,
            price: l.price,
            merch_size: l.merch_size,
          })),
          subtotal,
          currency: event.currency || "GBP",
        }),
      }).catch(() => {});
    }, 500);
  }, [firstName, lastName, capturedEmail, email, event.id, event.currency, cartLines, subtotal]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!firstName.trim() || !lastName.trim() || !email.trim()) {
        setError("Please fill in all required fields.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Please enter a valid email address.");
        return;
      }
      if (cartLines.length === 0) {
        setError("Your cart is empty.");
        return;
      }

      setSubmitting(true);

      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: event.id,
            items: cartLines.map((l) => ({
              ticket_type_id: l.ticket_type_id,
              qty: l.qty,
              merch_size: l.merch_size,
            })),
            customer: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim().toLowerCase(),
            },
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Something went wrong. Please try again.");
          setSubmitting(false);
          return;
        }

        onComplete(json.data);
      } catch {
        setError("Network error. Please check your connection and try again.");
        setSubmitting(false);
      }
    },
    [firstName, lastName, email, cartLines, event.id, onComplete]
  );

  return (
    <div className="midnight-checkout min-h-screen flex flex-col">
      <CheckoutHeader slug={slug} />
      <CheckoutTimer active={true} />

      <OrderSummaryMobile
        cartLines={cartLines}
        symbol={symbol}
        subtotal={subtotal}
        event={event}
        vatSettings={vatSettings}
      />

      <div className="flex-1 relative lg:bg-[linear-gradient(to_right,transparent_calc(50%+220px),rgba(255,255,255,0.06)_calc(50%+220px),rgba(255,255,255,0.06)_calc(50%+221px),transparent_calc(50%+221px))]">
        <div className="flex flex-col lg:flex-row max-w-[1200px] mx-auto w-full">
          <div className="flex-1 min-w-0 lg:pr-8">
            <div className="max-w-[620px] mx-auto py-8 px-6 pb-[max(48px,env(safe-area-inset-bottom))]">
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <h2 className="font-[family-name:var(--font-mono)] text-sm tracking-[2.5px] uppercase text-foreground font-bold m-0 pb-3.5 border-b border-white/[0.06]">
                    Your Details
                  </h2>
                  {capturedEmail ? (
                    <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.08] rounded-lg py-3.5 px-4">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <EmailIcon className="w-4 h-4 text-foreground/35 shrink-0" />
                        <span className="font-[family-name:var(--font-sans)] text-sm text-foreground/80 overflow-hidden text-ellipsis whitespace-nowrap">
                          {email}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/50 shrink-0 py-1 px-2 transition-colors duration-150 hover:text-foreground hover:underline touch-manipulation"
                        onClick={onChangeEmail}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <label htmlFor="test-email" className="sr-only">Email</label>
                      <input
                        id="test-email"
                        type="email"
                        className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-sans)] text-base py-[15px] px-4 outline-none transition-colors duration-150 placeholder:text-foreground/35 focus:border-white/[0.30]"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                        autoComplete="email"
                        autoFocus
                      />
                      <p className="flex items-center gap-1.5 -mt-2 font-[family-name:var(--font-sans)] text-xs text-foreground/40 tracking-[0.2px]">
                        <EmailIcon className="w-3.5 h-3.5 text-foreground/35 shrink-0" />
                        Your tickets will be sent to this email
                      </p>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="test-first-name" className="sr-only">First name</label>
                      <input
                        id="test-first-name"
                        type="text"
                        className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-sans)] text-base py-[15px] px-4 outline-none transition-colors duration-150 placeholder:text-foreground/35 focus:border-white/[0.30]"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        onBlur={captureNameOnBlur}
                        placeholder="First name"
                        required
                        autoComplete="given-name"
                      />
                    </div>
                    <div>
                      <label htmlFor="test-last-name" className="sr-only">Last name</label>
                      <input
                        id="test-last-name"
                        type="text"
                        className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-sans)] text-base py-[15px] px-4 outline-none transition-colors duration-150 placeholder:text-foreground/35 focus:border-white/[0.30]"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        onBlur={captureNameOnBlur}
                        placeholder="Last name"
                        required
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-destructive/[0.08] border border-destructive/20 text-destructive font-[family-name:var(--font-mono)] text-[11px] tracking-[0.5px] py-3 px-4 text-center rounded-lg">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-white text-[#111] font-[family-name:var(--font-sans)] text-[15px] font-semibold tracking-[0.3px] py-4 px-6 rounded-[10px] transition-all duration-150 hover:bg-[#f5f5f5] active:bg-[#ebebeb] active:scale-[0.99] disabled:bg-white/[0.08] disabled:text-foreground/35 disabled:cursor-not-allowed touch-manipulation"
                  disabled={submitting}
                >
                  {submitting ? "Processing..." : "PAY NOW"}
                </button>

                <div className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-[#ffc107] text-center py-2.5 bg-[rgba(255,193,7,0.06)] border border-dashed border-[rgba(255,193,7,0.2)] rounded-lg">
                  TEST MODE — No real payment will be processed
                </div>
              </form>
            </div>
          </div>

          <aside className="hidden lg:block w-[360px] shrink-0 pl-8 pt-8 sticky top-24 self-start">
            <OrderSummaryDesktop
              cartLines={cartLines}
              symbol={symbol}
              subtotal={subtotal}
              event={event}
              vatSettings={vatSettings}
            />
          </aside>
        </div>
      </div>

      <CheckoutFooter />
    </div>
  );
}

/* ================================================================
   EMAIL CAPTURE PAGE
   ================================================================ */

function EmailCapture({
  slug,
  event,
  cartLines,
  subtotal,
  totalQty,
  symbol,
  vatSettings,
  onContinue,
}: {
  slug: string;
  event: Event & { ticket_types: TicketTypeRow[] };
  cartLines: CartLine[];
  subtotal: number;
  totalQty: number;
  symbol: string;
  vatSettings: VatSettings | null;
  onContinue: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const { trackEngagement } = useTraffic();

  useEffect(() => {
    document.documentElement.classList.add("checkout-active");
    return () => document.documentElement.classList.remove("checkout-active");
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!email.trim()) {
        setError("Please enter your email address.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError("Please enter a valid email address.");
        return;
      }

      trackEngagement("email_captured");
      onContinue(email.trim().toLowerCase());
    },
    [email, trackEngagement, onContinue]
  );

  return (
    <div className="midnight-checkout min-h-screen flex flex-col">
      <CheckoutHeader slug={slug} />
      <CheckoutTimer active={true} />

      {/* Collapsible order summary */}
      <div className="border-b border-white/[0.06] bg-[rgba(20,20,20,0.4)] w-full">
        <button
          type="button"
          className="flex items-center justify-between w-full max-w-[1200px] mx-auto py-3.5 px-6 bg-transparent touch-manipulation"
          onClick={() => setSummaryOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-foreground/50 shrink-0" viewBox="0 0 24 24" fill="none">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span className="font-[family-name:var(--font-sans)] text-[13px] font-medium text-foreground/50">
              Order summary ({cartLines.length} {cartLines.length === 1 ? "item" : "items"})
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-mono)] text-sm font-bold text-foreground">
              {symbol}{subtotal.toFixed(2)}
            </span>
            <ChevronIcon className={`w-4 h-4 text-foreground/50 transition-transform duration-250 ${summaryOpen ? "rotate-180" : ""}`} />
          </span>
        </button>
        <div className={`midnight-summary-collapse${summaryOpen ? " midnight-summary-collapse--open" : ""}`}>
          <div className="max-w-[1200px] mx-auto px-6 pb-4">
            <OrderItems cartLines={cartLines} symbol={symbol} event={event} />
          </div>
        </div>
      </div>

      {/* Email capture form */}
      <div className="flex-1 flex items-center justify-center py-12 px-6">
        <div className="max-w-[440px] w-full text-center">
          <div className="relative w-16 h-16 mx-auto mb-7 drop-shadow-[0_2px_8px_rgba(255,255,255,0.08)]">
            <svg viewBox="0 0 66 66" fill="none" className="w-full h-full">
              <path fill="#ffffff" d="M 33.011719 8.5625 C 33.160156 8.5625 33.269531 8.558594 33.335938 8.550781 C 35.378906 8.324219 36.777344 7.265625 37.535156 5.371094 C 37.636719 5.117188 37.726562 4.65625 37.808594 3.984375 C 37.878906 3.40625 37.992188 2.996094 38.152344 2.757812 C 38.542969 2.15625 39.164062 1.855469 40.015625 1.855469 C 43.054688 1.847656 46.144531 1.84375 49.285156 1.847656 C 50.269531 1.851562 50.957031 2.207031 51.355469 2.914062 C 51.527344 3.222656 51.613281 3.683594 51.613281 4.289062 C 51.609375 22.871094 51.605469 35.164062 51.605469 41.167969 C 51.605469 41.25 51.535156 41.320312 51.453125 41.320312 C 39.59375 41.3125 33.445312 41.3125 33.011719 41.3125 C 32.578125 41.3125 26.429688 41.3125 14.570312 41.316406 C 14.484375 41.316406 14.414062 41.246094 14.414062 41.164062 L 14.414062 4.285156 C 14.414062 3.679688 14.5 3.222656 14.675781 2.910156 C 15.070312 2.203125 15.761719 1.847656 16.742188 1.84375 C 19.886719 1.84375 22.972656 1.84375 26.011719 1.851562 C 26.863281 1.855469 27.484375 2.15625 27.878906 2.753906 C 28.035156 2.996094 28.148438 3.402344 28.21875 3.980469 C 28.300781 4.65625 28.390625 5.117188 28.492188 5.371094 C 29.25 7.265625 30.652344 8.324219 32.691406 8.550781 C 32.757812 8.558594 32.867188 8.5625 33.011719 8.5625 Z" />
              <path fill="#ffffff" d="M 33.007812 45.449219 C 38.574219 45.449219 44.351562 45.445312 50.34375 45.4375 C 50.734375 45.4375 51.113281 45.449219 51.480469 45.476562 C 51.550781 45.480469 51.601562 45.539062 51.601562 45.609375 L 51.601562 62.242188 C 51.601562 62.277344 51.601562 62.3125 51.589844 62.347656 C 51.304688 63.355469 50.566406 63.863281 49.378906 63.875 C 49.359375 63.875 46.253906 63.875 40.058594 63.871094 C 39.121094 63.871094 38.195312 63.394531 37.886719 62.449219 C 37.78125 62.121094 37.792969 61.496094 37.710938 61.105469 C 37.257812 58.996094 35.960938 57.707031 33.816406 57.238281 C 33.546875 57.179688 33.277344 57.152344 33.007812 57.152344 C 32.738281 57.152344 32.46875 57.179688 32.199219 57.242188 C 30.054688 57.707031 28.757812 58.996094 28.304688 61.105469 C 28.222656 61.496094 28.238281 62.121094 28.128906 62.449219 C 27.820312 63.394531 26.898438 63.871094 25.957031 63.871094 C 19.765625 63.875 16.65625 63.878906 16.636719 63.878906 C 15.449219 63.867188 14.710938 63.359375 14.425781 62.351562 C 14.417969 62.316406 14.414062 62.28125 14.414062 62.246094 L 14.410156 45.613281 C 14.410156 45.542969 14.460938 45.484375 14.53125 45.480469 C 14.902344 45.453125 15.28125 45.4375 15.671875 45.4375 C 21.660156 45.445312 27.4375 45.449219 33.007812 45.449219 Z" />
            </svg>
            <span
              className="absolute top-[33%] left-1/2 -translate-x-1/2 -translate-y-1/2 font-[family-name:var(--font-mono)] text-sm font-bold text-[#111] leading-none pointer-events-none"
              style={totalQty >= 100 ? { fontSize: "9px" } : totalQty >= 10 ? { fontSize: "11px" } : undefined}
            >
              {totalQty}
            </span>
          </div>

          <h1 className="font-[family-name:var(--font-sans)] text-2xl font-semibold tracking-[-0.3px] text-foreground leading-snug m-0 mb-2.5">
            Secure your tickets
          </h1>

          <p className="font-[family-name:var(--font-sans)] text-sm text-foreground/40 leading-relaxed m-0 mb-8">
            Your tickets and confirmation will be sent here
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label htmlFor="capture-email" className="sr-only">
              Email address
            </label>
            <input
              id="capture-email"
              type="email"
              className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-sans)] text-base py-[15px] px-4 outline-none transition-colors duration-150 placeholder:text-foreground/35 focus:border-white/[0.30] text-center"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              autoComplete="email"
              autoFocus
            />

            {error && (
              <div className="bg-destructive/[0.08] border border-destructive/20 text-destructive font-[family-name:var(--font-mono)] text-[11px] tracking-[0.5px] py-3 px-4 text-center rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-white text-[#111] font-[family-name:var(--font-sans)] text-[15px] font-semibold tracking-[0.3px] py-4 px-6 rounded-[10px] transition-all duration-150 hover:bg-[#f5f5f5] active:bg-[#ebebeb] active:scale-[0.99] touch-manipulation"
            >
              CONTINUE TO PAYMENT
            </button>
          </form>

          <p className="flex items-center justify-center gap-1.5 mt-5 font-[family-name:var(--font-sans)] text-xs text-foreground/35">
            <LockIcon className="w-3.5 h-3.5 text-foreground/25 shrink-0" />
            Your information is secure and won&rsquo;t be shared
          </p>
        </div>
      </div>

      <CheckoutFooter />
    </div>
  );
}

/* ================================================================
   SHARED UI COMPONENTS
   ================================================================ */

function CheckoutHeader({ slug }: { slug: string }) {
  const branding = useBranding();

  return (
    <div className="bg-[rgba(0,0,0,0.9)] backdrop-blur-[16px] border-b border-white/[0.04] px-6 h-20 flex items-center justify-center sticky top-0 z-[100]">
      <a href={`/event/${slug}/`} className="absolute left-6 top-1/2 -translate-y-1/2 font-[family-name:var(--font-mono)] text-[10px] tracking-[1px] uppercase text-foreground/35 no-underline transition-colors duration-150 flex items-center gap-1.5 hover:text-foreground">
        <span className="text-sm leading-none">&larr;</span>
        <span>Back</span>
      </a>
      <a href={`/event/${slug}/`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.logo_url || "/images/FERAL%20LOGO.svg"}
          alt={branding.org_name || "FERAL PRESENTS"}
          className="h-[52px] w-auto block"
          style={branding.logo_width ? { width: branding.logo_width } : undefined}
        />
      </a>
      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center">
        <LockIcon className="w-4 h-4 text-foreground/20" />
      </div>
    </div>
  );
}

/* ================================================================
   ORDER SUMMARY — MOBILE
   ================================================================ */

function OrderSummaryMobile({
  cartLines,
  symbol,
  subtotal,
  event,
  discount,
  onApplyDiscount,
  onRemoveDiscount,
  vatSettings,
}: {
  cartLines: CartLine[];
  symbol: string;
  subtotal: number;
  event?: Event & { ticket_types: TicketTypeRow[] };
  discount?: DiscountInfo | null;
  onApplyDiscount?: (d: DiscountInfo) => void;
  onRemoveDiscount?: () => void;
  vatSettings?: VatSettings | null;
}) {
  const discountAmt = discount?.amount || 0;
  const afterDiscount = Math.max(subtotal - discountAmt, 0);
  const vatBreakdown = calculateCheckoutVat(afterDiscount, vatSettings ?? null);
  const total = vatBreakdown && vatSettings && !vatSettings.prices_include_vat
    ? vatBreakdown.gross
    : afterDiscount;

  return (
    <div className="border-b border-white/[0.06] bg-[rgba(20,20,20,0.4)] lg:hidden">
      <div className="max-w-[1200px] mx-auto py-4 px-6 pb-5">
        <OrderItems cartLines={cartLines} symbol={symbol} event={event} />
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent my-5" />
        {event && onApplyDiscount && onRemoveDiscount && (
          <DiscountCodeInput
            eventId={event.id}
            subtotal={subtotal}
            discount={discount || null}
            onApply={onApplyDiscount}
            onRemove={onRemoveDiscount}
          />
        )}
        <OrderTotals
          symbol={symbol}
          subtotal={subtotal}
          discount={discount}
          discountAmt={discountAmt}
          vatBreakdown={vatBreakdown}
          vatSettings={vatSettings}
          total={total}
          currency={event?.currency}
        />
      </div>
    </div>
  );
}

/* ================================================================
   ORDER SUMMARY — DESKTOP
   ================================================================ */

function OrderSummaryDesktop({
  cartLines,
  symbol,
  subtotal,
  event,
  discount,
  onApplyDiscount,
  onRemoveDiscount,
  vatSettings,
}: {
  cartLines: CartLine[];
  symbol: string;
  subtotal: number;
  event?: Event & { ticket_types: TicketTypeRow[] };
  discount?: DiscountInfo | null;
  onApplyDiscount?: (d: DiscountInfo) => void;
  onRemoveDiscount?: () => void;
  vatSettings?: VatSettings | null;
}) {
  const discountAmt = discount?.amount || 0;
  const afterDiscount = Math.max(subtotal - discountAmt, 0);
  const vatBreakdown = calculateCheckoutVat(afterDiscount, vatSettings ?? null);
  const total = vatBreakdown && vatSettings && !vatSettings.prices_include_vat
    ? vatBreakdown.gross
    : afterDiscount;

  return (
    <div className="pb-8">
      <OrderItems cartLines={cartLines} symbol={symbol} event={event} />
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent my-5" />
      {event && onApplyDiscount && onRemoveDiscount && (
        <DiscountCodeInput
          eventId={event.id}
          subtotal={subtotal}
          discount={discount || null}
          onApply={onApplyDiscount}
          onRemove={onRemoveDiscount}
        />
      )}
      <OrderTotals
        symbol={symbol}
        subtotal={subtotal}
        discount={discount}
        discountAmt={discountAmt}
        vatBreakdown={vatBreakdown}
        vatSettings={vatSettings}
        total={total}
        currency={event?.currency}
      />
    </div>
  );
}

/* ================================================================
   ORDER TOTALS — shared between mobile and desktop summaries
   ================================================================ */

function OrderTotals({
  symbol,
  subtotal,
  discount,
  discountAmt,
  vatBreakdown,
  vatSettings,
  total,
  currency,
}: {
  symbol: string;
  subtotal: number;
  discount?: DiscountInfo | null;
  discountAmt: number;
  vatBreakdown: ReturnType<typeof calculateCheckoutVat>;
  vatSettings?: VatSettings | null;
  total: number;
  currency?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between font-[family-name:var(--font-sans)] text-[13px] text-foreground/50">
        <span>Subtotal</span>
        <span>{symbol}{subtotal.toFixed(2)}</span>
      </div>
      {discount && (
        <div className="flex items-center justify-between font-[family-name:var(--font-sans)] text-[13px] text-[#4ecb71]">
          <span>Discount ({discount.code})</span>
          <span>-{symbol}{discountAmt.toFixed(2)}</span>
        </div>
      )}
      {vatBreakdown && vatSettings?.prices_include_vat && (
        <div className="flex items-center justify-between font-[family-name:var(--font-sans)] text-xs text-foreground/50">
          <span>Includes VAT ({vatSettings.vat_rate}%)</span>
          <span>{symbol}{vatBreakdown.vat.toFixed(2)}</span>
        </div>
      )}
      {vatBreakdown && vatSettings && !vatSettings.prices_include_vat && (
        <div className="flex items-center justify-between font-[family-name:var(--font-sans)] text-[13px] text-foreground/50">
          <span>VAT ({vatSettings.vat_rate}%)</span>
          <span>{symbol}{vatBreakdown.vat.toFixed(2)}</span>
        </div>
      )}
      <div className="flex items-center justify-between font-[family-name:var(--font-sans)] text-base font-semibold text-foreground pt-2.5 border-t border-white/[0.06]">
        <span>Total</span>
        <span>
          <span className="text-[11px] text-foreground/40 font-normal tracking-[0.5px]">{currency || "GBP"}</span>
          {" "}{symbol}{total.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

/* ================================================================
   ORDER ITEMS — shared between mobile and desktop summaries
   ================================================================ */

function OrderItems({
  cartLines,
  symbol,
  event,
}: {
  cartLines: CartLine[];
  symbol: string;
  event?: Event & { ticket_types: TicketTypeRow[] };
}) {
  const getTicketType = (id: string): TicketTypeRow | undefined =>
    event?.ticket_types?.find((t) => t.id === id);

  const eventDate = event?.date_start
    ? new Date(event.date_start).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const eventTime = event?.doors_time || (event?.date_start
    ? new Date(event.date_start).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null);

  const eventMeta = [eventDate, event?.venue_name].filter(Boolean).join(" \u00B7 ");

  return (
    <div className="flex flex-col">
      {cartLines.map((line, i) => {
        const tt = getTicketType(line.ticket_type_id);
        const hasMerch = !!line.merch_size;
        const merchImg = hasMerch ? (tt?.merch_images?.front || null) : null;
        const merchName = tt?.merch_name
          || (tt?.merch_type ? `${event?.name || ""} ${tt.merch_type}` : null);

        return (
          <div key={i} className={i > 0 ? "border-t border-white/[0.06] mt-3.5 pt-3.5" : ""}>
            {/* Ticket row */}
            <div className="flex items-start gap-2.5">
              <div className="relative w-12 h-12 shrink-0 ml-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/ticketicon.svg" alt="" draggable={false} className="w-full h-full object-contain object-[center_top] drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]" />
                <span className="absolute top-[33%] left-1/2 -translate-x-1/2 -translate-y-1/2 font-[family-name:var(--font-mono)] text-[13px] font-bold text-foreground leading-none">
                  {line.qty}
                </span>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5 pt-0.5">
                <span className="font-[family-name:var(--font-sans)] text-[13px] font-semibold text-foreground leading-snug overflow-hidden text-ellipsis whitespace-nowrap">
                  {line.name}
                </span>
                {event?.name && (
                  <span className="font-[family-name:var(--font-sans)] text-[11px] font-medium text-foreground/60 leading-snug overflow-hidden text-ellipsis whitespace-nowrap">
                    {event.name}
                  </span>
                )}
                {eventMeta && (
                  <span className="font-[family-name:var(--font-sans)] text-[11px] text-foreground/35 leading-snug">
                    {eventMeta}
                  </span>
                )}
                {eventTime && (
                  <span className="font-[family-name:var(--font-sans)] text-[11px] text-foreground/35 leading-snug">
                    Doors {eventTime}
                  </span>
                )}
              </div>
              <span className="shrink-0 font-[family-name:var(--font-mono)] text-[13px] font-semibold text-foreground pt-0.5">
                {symbol}{(line.price * line.qty).toFixed(2)}
              </span>
            </div>

            {/* Merch sub-item */}
            {hasMerch && (
              <div className="flex items-center gap-3 mt-2.5 pl-[62px]">
                <div className="w-11 h-11 shrink-0 bg-white/[0.03] border border-white/[0.06] rounded-md overflow-hidden flex items-center justify-center">
                  {merchImg ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={merchImg} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-foreground/25">
                      <path d="M12 3l-2 3h4l-2-3zM6 6h12l1 3H5l1-3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      <path d="M5 9h14v10a2 2 0 01-2 2H7a2 2 0 01-2-2V9z" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-px">
                  <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[1px] uppercase text-foreground/35 leading-none">
                    Included merch
                  </span>
                  <span className="font-[family-name:var(--font-sans)] text-xs font-medium text-foreground/80 leading-snug overflow-hidden text-ellipsis whitespace-nowrap">
                    {merchName || line.name}
                  </span>
                  <span className="font-[family-name:var(--font-sans)] text-[11px] text-foreground/40">
                    Size: {line.merch_size}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CheckoutFooter() {
  const branding = useBranding();
  const year = new Date().getFullYear();

  return (
    <footer className="py-8 px-6">
      <div className="max-w-[1200px] mx-auto text-center">
        <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-foreground/20">
          &copy; {year} {branding.copyright_text || `${branding.org_name || "FERAL PRESENTS"}. ALL RIGHTS RESERVED.`}
        </span>
      </div>
    </footer>
  );
}
