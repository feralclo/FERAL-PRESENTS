"use client";

import { useState, useRef, useEffect } from "react";
import { useCurrencyContext } from "@/components/CurrencyProvider";
import { SUPPORTED_CURRENCIES, getCurrencySymbol } from "@/lib/stripe/config";
import type { CurrencyInfo } from "@/lib/currency/types";

const CURRENCY_LIST: CurrencyInfo[] = [
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "SEK", symbol: "SEK", name: "Swedish Krona" },
  { code: "NOK", symbol: "NOK", name: "Norwegian Krone" },
  { code: "DKK", symbol: "DKK", name: "Danish Krone" },
];

/**
 * Currency selector for the Midnight theme footer.
 * Shows "Prices shown in EUR · Change" text.
 * Opens a dropdown on click with all supported currencies.
 */
export function MidnightCurrencySelector() {
  const { currency, setCurrency, ratesLoaded, isConverted, baseCurrency } = useCurrencyContext();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Don't show selector if rates haven't loaded or only base currency available
  if (!ratesLoaded) return null;

  const currentInfo = CURRENCY_LIST.find((c) => c.code === currency) || {
    code: currency,
    symbol: getCurrencySymbol(currency),
    name: currency,
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.10em] uppercase text-foreground/30 hover:text-foreground/50 transition-colors duration-200 cursor-pointer"
      >
        Prices shown in {currency}
        {isConverted && " (converted)"}
        {" · "}
        <span className="underline underline-offset-2">Change</span>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 min-w-[200px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 overflow-hidden">
          {CURRENCY_LIST.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                setCurrency(c.code);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.06em] transition-colors duration-100 cursor-pointer flex items-center justify-between gap-3 ${
                c.code === currency
                  ? "text-foreground bg-foreground/[0.06]"
                  : "text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.03]"
              }`}
            >
              <span>
                <span className="inline-block w-8">{c.symbol}</span>
                {c.name}
              </span>
              {c.code === currency && (
                <span className="text-foreground/30 text-[9px]">
                  {c.code === baseCurrency ? "base" : ""}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
