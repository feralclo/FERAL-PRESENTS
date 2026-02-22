import { cn } from "@/lib/utils";
import {
  Visa,
  Mastercard,
  Maestro,
  AmericanExpress,
  Discover,
  DinersClub,
  JCB,
  UnionPay,
} from "react-svg-credit-card-payment-icons/icons/logo-border";
import {
  Applepay,
  Paywithgoogle,
  Klarna,
} from "react-pay-icons";

interface PaymentMethodsStripProps {
  variant?: "midnight" | "aura";
}

const SIZE = { width: 38, height: 24 };
const RESPONSIVE = "max-md:w-[32px] max-md:h-[20px]";

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 38 24"
      width={38}
      height={24}
      role="img"
      aria-label="Link"
      className={cn(RESPONSIVE, "rounded-[3px]")}
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

// Row 1: 7 icons — major cards + wallets
const TOP_ROW = [
  { Component: Visa, label: "Visa", pkg: "card" },
  { Component: Mastercard, label: "Mastercard", pkg: "card" },
  { Component: Maestro, label: "Maestro", pkg: "card" },
  { Component: AmericanExpress, label: "American Express", pkg: "card" },
  { Component: Applepay, label: "Apple Pay", pkg: "pay" },
  { Component: Paywithgoogle, label: "Google Pay", pkg: "pay" },
  { Component: Klarna, label: "Klarna", pkg: "pay" },
] as const;

// Row 2: 5 icons — remaining networks + Link
const BOTTOM_ROW = [
  { Component: Discover, label: "Discover", pkg: "card" },
  { Component: DinersClub, label: "Diners Club", pkg: "card" },
  { Component: JCB, label: "JCB", pkg: "card" },
  { Component: UnionPay, label: "UnionPay", pkg: "card" },
] as const;

function IconRow({
  icons,
  showLink,
  gapClass,
}: {
  icons: ReadonlyArray<{ Component: React.ComponentType<Record<string, unknown>>; label: string; pkg: string }>;
  showLink?: boolean;
  gapClass: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center", gapClass)}>
      {icons.map(({ Component, label, pkg }) =>
        pkg === "card" ? (
          <Component
            key={label}
            width={SIZE.width}
            height={SIZE.height}
            className={cn(RESPONSIVE, "rounded-[3px]")}
            aria-label={label}
          />
        ) : (
          <Component
            key={label}
            style={SIZE}
            className={cn(RESPONSIVE, "rounded-[3px]")}
            aria-label={label}
          />
        )
      )}
      {showLink && <LinkIcon />}
    </div>
  );
}

export function PaymentMethodsStrip({ variant = "midnight" }: PaymentMethodsStripProps) {
  const gapClass = variant === "midnight" ? "gap-3" : "gap-2.5";

  return (
    <div className={cn("flex flex-col items-center", variant === "midnight" ? "gap-2" : "gap-1.5")}>
      <IconRow icons={TOP_ROW} gapClass={gapClass} />
      <IconRow icons={BOTTOM_ROW} showLink gapClass={gapClass} />
    </div>
  );
}
