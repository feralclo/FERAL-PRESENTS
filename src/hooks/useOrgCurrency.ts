"use client";

import { useState, useEffect } from "react";
import { useOrgId } from "@/components/OrgProvider";
import { generalKey } from "@/lib/constants";
import { getCurrencySymbol } from "@/lib/stripe/config";

/**
 * Fetches the org's base currency from {org_id}_general settings.
 * Falls back to "GBP" / "£".
 */
export function useOrgCurrency(): {
  currency: string;
  currencySymbol: string;
  country: string;
  loading: boolean;
} {
  const orgId = useOrgId();
  const [currency, setCurrency] = useState("GBP");
  const [country, setCountry] = useState("GB");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/settings?key=${generalKey(orgId)}`);
        if (!res.ok) throw new Error();
        const { data } = await res.json();
        if (!cancelled && data) {
          if (data.base_currency) setCurrency(data.base_currency.toUpperCase());
          if (data.country) setCountry(data.country.toUpperCase());
        }
      } catch {
        // Keep defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return {
    currency,
    currencySymbol: getCurrencySymbol(currency),
    country,
    loading,
  };
}
