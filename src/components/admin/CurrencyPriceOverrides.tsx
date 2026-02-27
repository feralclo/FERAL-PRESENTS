"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { SUPPORTED_CURRENCIES } from "@/lib/stripe/config";

/** Currency metadata for the override grid */
const CURRENCY_META: Record<string, { flag: string; symbol: string; label: string }> = {
  GBP: { flag: "🇬🇧", symbol: "£", label: "GBP" },
  EUR: { flag: "🇪🇺", symbol: "€", label: "EUR" },
  USD: { flag: "🇺🇸", symbol: "$", label: "USD" },
  CAD: { flag: "🇨🇦", symbol: "CA$", label: "CAD" },
  AUD: { flag: "🇦🇺", symbol: "A$", label: "AUD" },
  CHF: { flag: "🇨🇭", symbol: "", label: "CHF" },
  SEK: { flag: "🇸🇪", symbol: "kr", label: "SEK" },
  NOK: { flag: "🇳🇴", symbol: "kr", label: "NOK" },
  DKK: { flag: "🇩🇰", symbol: "kr", label: "DKK" },
};

interface CurrencyPriceOverridesProps {
  baseCurrency: string;
  basePrice: number;
  overrides: Record<string, number> | null;
  onChange: (overrides: Record<string, number> | null) => void;
}

export function CurrencyPriceOverrides({
  baseCurrency,
  basePrice,
  overrides,
  onChange,
}: CurrencyPriceOverridesProps) {
  const [open, setOpen] = useState(false);
  const base = baseCurrency.toUpperCase();
  const baseMeta = CURRENCY_META[base];
  const baseSymbol = baseMeta?.symbol || base;

  // Auto-open if there are existing overrides
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && overrides && Object.keys(overrides).length > 0) {
      setOpen(true);
      initializedRef.current = true;
    }
  }, [overrides]);

  // Currencies to show (all supported except the base)
  const currencies = SUPPORTED_CURRENCIES
    .map((c) => c.toUpperCase())
    .filter((c) => c !== base);

  const handleChange = useCallback(
    (currency: string, value: string) => {
      const current = { ...(overrides || {}) };

      if (value === "" || value === undefined) {
        delete current[currency];
      } else {
        const num = parseFloat(value);
        if (!isNaN(num) && num >= 0) {
          current[currency] = num;
        }
      }

      onChange(Object.keys(current).length > 0 ? current : null);
    },
    [overrides, onChange]
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-muted-foreground/50 hover:text-primary/70 transition-colors font-mono tracking-wide"
      >
        Set prices for other currencies ▸
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground/70">
          Set prices for other currencies
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
        >
          ▾ Hide
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
        Leave blank to auto-convert from {baseSymbol}{basePrice}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {currencies.map((currency) => {
          const meta = CURRENCY_META[currency];
          if (!meta) return null;
          const currentValue = overrides?.[currency];

          return (
            <div key={currency} className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground/50 shrink-0 w-[72px] font-mono">
                {meta.flag} {meta.label} {meta.symbol}
              </span>
              <Input
                type="number"
                value={currentValue ?? ""}
                onChange={(e) => handleChange(currency, e.target.value)}
                placeholder="auto"
                min="0"
                step="0.01"
                className="h-7 text-xs font-mono tabular-nums px-2"
              />
            </div>
          );
        })}
      </div>

      <p className="text-[9px] text-muted-foreground/30">
        Empty fields use auto-converted rates
      </p>
    </div>
  );
}
