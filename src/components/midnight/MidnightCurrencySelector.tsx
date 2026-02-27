"use client";

import { useState, useRef, useEffect } from "react";
import { useCurrencyContext } from "@/components/CurrencyProvider";
import { getCurrencySymbol } from "@/lib/stripe/config";

const CURRENCY_LIST = [
  { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧" },
  { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺" },
  { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar", flag: "🇨🇦" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "🇦🇺" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", flag: "🇨🇭" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona", flag: "🇸🇪" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone", flag: "🇳🇴" },
  { code: "DKK", symbol: "kr", name: "Danish Krone", flag: "🇩🇰" },
];

/**
 * Currency selector for the Midnight theme footer.
 * Clean dropdown with currency codes and flags.
 */
export function MidnightCurrencySelector() {
  const { currency, setCurrency, ratesLoaded, baseCurrency } = useCurrencyContext();
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  if (!ratesLoaded) return null;

  const current = CURRENCY_LIST.find((c) => c.code === currency) || {
    code: currency,
    symbol: getCurrencySymbol(currency),
    name: currency,
    flag: "",
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="
          flex items-center gap-2 px-3 py-1.5 rounded-md
          border border-foreground/[0.08] hover:border-foreground/[0.15]
          bg-foreground/[0.03] hover:bg-foreground/[0.05]
          font-[family-name:var(--font-mono)] text-[10px] tracking-[0.08em] uppercase
          text-foreground/40 hover:text-foreground/60
          transition-all duration-200 cursor-pointer
        "
      >
        {/* Globe icon */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>{current.code}</span>
        <span className="text-foreground/20">{current.symbol}</span>
        {/* Chevron */}
        <svg
          width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`opacity-40 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="
            absolute bottom-full mb-2 left-0 w-[220px]
            bg-[#141414] border border-foreground/[0.10] rounded-lg
            shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50
            overflow-hidden backdrop-blur-sm
          "
        >
          <div className="px-3 py-2 border-b border-foreground/[0.06]">
            <span className="font-[family-name:var(--font-mono)] text-[8px] tracking-[0.14em] uppercase text-foreground/25">
              Select currency
            </span>
          </div>
          <div className="py-1 max-h-[280px] overflow-y-auto">
            {CURRENCY_LIST.map((c) => {
              const isActive = c.code === currency;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setCurrency(c.code);
                    setOpen(false);
                  }}
                  className={`
                    w-full text-left px-3 py-2 flex items-center gap-2.5
                    font-[family-name:var(--font-mono)] text-[11px] tracking-[0.04em]
                    transition-colors duration-100 cursor-pointer
                    ${isActive
                      ? "text-foreground bg-foreground/[0.06]"
                      : "text-foreground/45 hover:text-foreground/70 hover:bg-foreground/[0.03]"
                    }
                  `}
                >
                  <span className="text-sm leading-none">{c.flag}</span>
                  <span className="flex-1">
                    <span className="font-medium">{c.code}</span>
                    <span className="text-foreground/25 ml-1.5 text-[10px]">{c.name}</span>
                  </span>
                  {isActive && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/40">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
