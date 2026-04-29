"use client";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCurrencyContext } from "@/components/CurrencyProvider";
import {
  TIER_TEXT_CLASSES,
  TIER_PRICE_CLASSES,
  TIER_DESC_CLASSES,
  TIER_DESC_DEFAULT,
  TIER_QTY_ACTIVE_CLASSES,
} from "@/components/midnight/tier-styles";
import type { TicketTypeRow } from "@/types/events";

/**
 * Refined Original — same 2-row layout, every element rethought.
 * Internal preview at /preview/ticket-cards/.
 */

const SAMPLE_TICKETS: TicketTypeRow[] = [
  {
    id: "t1",
    org_id: "feral",
    event_id: "demo",
    name: "Final Release",
    description: "",
    price: 24,
    sold: 0,
    sort_order: 1,
    includes_merch: false,
    status: "active",
    min_per_order: 1,
    max_per_order: 10,
    tier: "standard",
    created_at: "",
    updated_at: "",
  },
  {
    id: "t2",
    org_id: "feral",
    event_id: "demo",
    name: "Group Ticket — Admits 4",
    description: "Must arrive together",
    price: 59,
    sold: 0,
    sort_order: 2,
    includes_merch: false,
    status: "active",
    min_per_order: 1,
    max_per_order: 10,
    tier: "standard",
    created_at: "",
    updated_at: "",
  },
  {
    id: "t3",
    org_id: "feral",
    event_id: "demo",
    name: "VIP Experience",
    description: "Queue jump + welcome drink",
    price: 80,
    sold: 0,
    sort_order: 3,
    includes_merch: false,
    status: "active",
    min_per_order: 1,
    max_per_order: 10,
    tier: "platinum",
    created_at: "",
    updated_at: "",
  },
  {
    id: "t4",
    org_id: "feral",
    event_id: "demo",
    name: "Early Birds",
    description: "Standard entry",
    price: 15,
    sold: 100,
    capacity: 100,
    sort_order: 4,
    includes_merch: false,
    status: "sold_out",
    min_per_order: 1,
    max_per_order: 10,
    tier: "standard",
    created_at: "",
    updated_at: "",
  },
];

const RETHINKS = [
  ["Padding", "px-5 py-5 (~140px tall)", "px-4 py-3 (~90px tall)"],
  ["Card spacing", "mb-2.5 between cards", "mb-1.5 — tighter rhythm"],
  ["Name", "text-sm semibold", "text-[13px] bold, tighter tracking — more authoritative"],
  ["Description", "text-[12px], leading-relaxed, mt-1.5", "text-[11px], leading-snug, mt-1 — quieter"],
  ["Price", "text-base mono bold (top-right corner)", "same, but baseline-aligned with name"],
  ["Stepper buttons", "44×44 chunky bordered container", "32×32 in a slim pill, rounded-full"],
  ["Stepper qty", "text-base font-bold min-w-8", "text-sm font-semibold min-w-5"],
  ["Active state", "border highlight + bg shift", "+ 2px accent stripe on left edge for clearer 'selected' read"],
  ["Sold out", "'Sold out' replaces stepper", "same, in cleaner 10px tracked-out caps"],
];

export default function TicketCardPreviewPage() {
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const update = (id: string, delta: number) => {
    setQtys((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(10, (prev[id] || 0) + delta)),
    }));
  };

  return (
    <div data-theme="midnight" className="min-h-screen bg-[#0a0a0c] text-foreground overflow-x-hidden">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        <header className="mb-8">
          <h1 className="font-[family-name:var(--font-sans)] text-2xl md:text-3xl font-bold tracking-[-0.01em] mb-2">
            Refined original
          </h1>
          <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.12em] uppercase text-foreground/40">
            Same 2-row layout. Every element rethought.
          </p>
        </header>

        {/* The cards */}
        <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-3 max-w-[400px] w-full mx-auto mb-10">
          {SAMPLE_TICKETS.map((tt) => (
            <RefinedCard
              key={tt.id}
              ticket={tt}
              qty={qtys[tt.id] || 0}
              onAdd={() => update(tt.id, 1)}
              onRemove={() => update(tt.id, -1)}
            />
          ))}
        </div>

        {/* Rethink table */}
        <section className="max-w-[680px] mx-auto">
          <h2 className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] uppercase text-foreground/40 mb-3">
            What changed
          </h2>
          <div className="rounded-xl border border-foreground/[0.06] divide-y divide-foreground/[0.04]">
            {RETHINKS.map(([label, was, now]) => (
              <div key={label} className="grid grid-cols-[100px_1fr_1fr] gap-3 px-4 py-3 text-[12px] items-start">
                <span className="font-[family-name:var(--font-sans)] font-semibold text-foreground/80 uppercase tracking-[0.04em] text-[11px]">
                  {label}
                </span>
                <span className="font-[family-name:var(--font-display)] text-foreground/40 leading-snug">
                  <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.15em] uppercase text-foreground/30 block mb-0.5">
                    Was
                  </span>
                  {was}
                </span>
                <span className="font-[family-name:var(--font-display)] text-foreground/80 leading-snug">
                  <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.15em] uppercase text-foreground/50 block mb-0.5">
                    Now
                  </span>
                  {now}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const TIER_EFFECT: Record<string, string> = {
  platinum: "midnight-metallic-platinum",
  black: "midnight-metallic-obsidian",
  valentine: "midnight-metallic-valentine",
};

// ============================================================
// Refined Original — the proposal
// ============================================================
function RefinedCard({
  ticket: tt,
  qty,
  onAdd,
  onRemove,
}: {
  ticket: TicketTypeRow;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { convertPrice, formatPrice: fmtPrice } = useCurrencyContext();
  const tier = tt.tier || "standard";
  const tierEffect = TIER_EFFECT[tier] || "";
  const isSoldOut = tt.status === "sold_out";
  const isActive = qty > 0;
  const priceDisplay = fmtPrice(convertPrice(Number(tt.price), tt.price_overrides));

  return (
    <article
      role="article"
      aria-label={`${tt.name} — ${priceDisplay}`}
      className={cn(
        "relative px-4 py-3 mb-1.5 rounded-xl transition-all duration-200",
        "max-[480px]:px-3.5 max-[480px]:py-2.5",
        // Sold out
        isSoldOut && "opacity-40 pointer-events-none",
        // Standard tier
        !tierEffect && "bg-foreground/[0.025] border border-foreground/[0.06]",
        !tierEffect && !isSoldOut && "hover:border-foreground/[0.12] hover:bg-foreground/[0.04]",
        !tierEffect && isActive && !isSoldOut && "border-foreground/[0.18] bg-foreground/[0.045]",
        // Tier
        tierEffect,
        tierEffect && isActive && !isSoldOut && "midnight-active",
      )}
    >
      {/* Active accent stripe — subtle visual cue that this row is selected */}
      <span
        className={cn(
          "absolute left-0 top-3 bottom-3 w-[2px] rounded-full transition-all duration-300",
          isActive && !tierEffect ? "bg-foreground/50" : "bg-transparent",
        )}
        aria-hidden
      />

      {/* Row 1: name + description (left) | price (right) */}
      <div className="relative z-[1] flex justify-between items-start gap-3 mb-2.5 max-[480px]:mb-2">
        <div className="flex-1 min-w-0">
          <h4
            className={cn(
              "font-[family-name:var(--font-sans)] text-[13px] max-[480px]:text-[12px] font-bold tracking-[0.06em] uppercase leading-tight",
              TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard,
            )}
          >
            {tt.name}
          </h4>
          {tt.description ? (
            <p
              className={cn(
                "font-[family-name:var(--font-display)] text-[11px] tracking-[0.01em] leading-snug mt-1",
                TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT,
              )}
            >
              {tt.description}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 font-[family-name:var(--font-mono)] text-base font-bold tracking-[0.5px] tabular-nums leading-none mt-0.5",
            TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard,
          )}
        >
          {priceDisplay}
        </span>
      </div>

      {/* Row 2: stepper right-aligned (or sold-out label) */}
      <div className="relative z-[1] flex justify-end items-center">
        {isSoldOut ? (
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.2em] uppercase text-foreground/40">
            Sold out
          </span>
        ) : (
          <div
            className={cn(
              "inline-flex items-center bg-foreground/[0.03] rounded-full border transition-colors duration-200 p-px",
              isActive ? "border-foreground/[0.20]" : "border-foreground/[0.08]",
            )}
          >
            <button
              type="button"
              onClick={onRemove}
              disabled={qty === 0}
              className="w-8 h-8 flex items-center justify-center rounded-full text-foreground/70 hover:bg-foreground/[0.08] active:scale-90 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer touch-manipulation"
              aria-label={`Remove ${tt.name}`}
            >
              <span className="text-base leading-none">−</span>
            </button>
            <span
              className={cn(
                "font-[family-name:var(--font-mono)] text-sm font-semibold min-w-5 text-center tabular-nums px-1 select-none",
                isActive
                  ? TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground"
                  : "text-foreground/40",
              )}
            >
              {qty}
            </span>
            <button
              type="button"
              onClick={onAdd}
              className="w-8 h-8 flex items-center justify-center rounded-full text-foreground hover:bg-foreground/[0.08] active:scale-90 transition cursor-pointer touch-manipulation"
              aria-label={`Add ${tt.name}`}
            >
              <span className="text-base leading-none">+</span>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
