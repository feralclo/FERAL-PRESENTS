"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

interface Sale {
  id: string;
  order_number: string;
  total: number;
  currency: string;
  created_at: string;
  event?: { name: string };
}

function getCurrencySymbol(currency?: string): string {
  switch (currency?.toUpperCase()) {
    case "USD": return "$";
    case "EUR": return "\u20AC";
    case "GBP": return "\u00A3";
    default: return "\u00A3";
  }
}

export default function RepSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rep-portal/sales");
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          setError(errJson?.error || "Failed to load sales (" + res.status + ")");
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (json.data) setSales(json.data);
      } catch { setError("Failed to load sales — check your connection"); }
      setLoading(false);
    })();
  }, [loadKey]);

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-6 w-6 border-2 border-[var(--rep-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <button
          onClick={() => { setError(""); setLoading(true); setLoadKey((k) => k + 1); }}
          className="text-xs text-[var(--rep-accent)] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Sales</h1>
        <p className="text-sm text-[var(--rep-text-muted)]">
          Orders placed with your discount code
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-card)] p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--rep-text-muted)] mb-1">Total Sales</p>
          <p className="text-2xl font-bold text-white font-mono tabular-nums">{sales.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-card)] p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--rep-text-muted)] mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-[var(--rep-success)] font-mono tabular-nums">
            {getCurrencySymbol(sales[0]?.currency)}{totalRevenue.toFixed(0)}
          </p>
        </div>
      </div>

      {/* Sales List */}
      {sales.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--rep-accent)]/10 mb-4">
            <TrendingUp size={22} className="text-[var(--rep-accent)]" />
          </div>
          <p className="text-sm text-white font-medium mb-1">No sales yet</p>
          <p className="text-xs text-[var(--rep-text-muted)]">Share your code to start earning</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sales.map((sale) => (
            <div key={sale.id} className="flex items-center justify-between rounded-xl border border-[var(--rep-border)] bg-[var(--rep-card)] px-4 py-3">
              <div>
                <p className="text-xs font-mono text-white">{sale.order_number}</p>
                <p className="text-[10px] text-[var(--rep-text-muted)]">
                  {sale.event?.name || "—"} · {new Date(sale.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <p className="text-sm font-bold font-mono text-[var(--rep-success)] tabular-nums">
                {getCurrencySymbol(sale.currency)}{Number(sale.total).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
