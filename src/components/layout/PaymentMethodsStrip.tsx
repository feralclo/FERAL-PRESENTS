import { cn } from "@/lib/utils";
import {
  Visa,
  Mastercard,
  Maestro,
  Amex,
  Applepay,
  Paywithgoogle,
  Klarna,
  Discover,
  DinersClub,
  Jcb,
  UnionPay,
} from "react-pay-icons";

interface PaymentMethodsStripProps {
  variant?: "midnight" | "aura";
}

const ICON_STYLE = { width: 38, height: 24 };

const ICONS = [
  { Component: Visa, label: "Visa" },
  { Component: Mastercard, label: "Mastercard" },
  { Component: Maestro, label: "Maestro" },
  { Component: Amex, label: "American Express" },
  { Component: Applepay, label: "Apple Pay" },
  { Component: Paywithgoogle, label: "Google Pay" },
  { Component: Klarna, label: "Klarna" },
  { Component: Discover, label: "Discover" },
  { Component: DinersClub, label: "Diners Club" },
  { Component: Jcb, label: "JCB" },
  { Component: UnionPay, label: "UnionPay" },
] as const;

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 38 24"
      width={38}
      height={24}
      role="img"
      aria-label="Link"
      className="max-md:w-[32px] max-md:h-[20px] rounded-[3px]"
    >
      <rect width="38" height="24" rx="3" fill="#00D66F" />
      <text
        x="19"
        y="15.5"
        textAnchor="middle"
        fill="white"
        fontSize="10"
        fontWeight="700"
        fontFamily="Inter, -apple-system, sans-serif"
      >
        Link
      </text>
    </svg>
  );
}

export function PaymentMethodsStrip({ variant = "midnight" }: PaymentMethodsStripProps) {
  const gapClass = variant === "midnight" ? "gap-3" : "gap-2.5";

  return (
    <div
      className={cn(
        "mx-auto flex flex-wrap items-center justify-center",
        // Cap width on mobile so 12 icons wrap into balanced rows (7+5 or 6+6)
        // instead of 10+2
        "max-md:max-w-[280px]",
        gapClass
      )}
    >
      {ICONS.map(({ Component, label }) => (
        <Component
          key={label}
          style={ICON_STYLE}
          className="max-md:w-[32px] max-md:h-[20px] rounded-[3px]"
          aria-label={label}
        />
      ))}
      <LinkIcon />
    </div>
  );
}
