"use client";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCurrencyContext } from "@/components/CurrencyProvider";
import {
  TIER_TEXT_CLASSES,
  TIER_PRICE_CLASSES,
  TIER_DESC_CLASSES,
  TIER_DESC_DEFAULT,
  TIER_QTY_ACTIVE_CLASSES,
  TIER_BUTTON_CLASSES,
} from "@/components/midnight/tier-styles";
import type { TicketTypeRow } from "@/types/events";

/**
 * Visual playground: 4 different ticket card layouts side-by-side.
 * Internal — not linked from prod nav.
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

const VARIANTS = [
  {
    key: "hierarchy",
    name: "A — Hierarchy",
    blurb:
      "Two-row layout, tightened. Name + price top, stepper bottom-right. Closest to original feel — restrained.",
  },
  {
    key: "pill",
    name: "B — Pill Stepper",
    blurb:
      "Single row. Price + small bordered pill stepper on the right. The stepper feels like an intentional UI element — defined but not chunky.",
  },
  {
    key: "ghost",
    name: "C — Ghost (current)",
    blurb:
      "Single row. Price + borderless ghost +/− buttons. Most minimal — buttons feel native to the card.",
  },
  {
    key: "stack",
    name: "D — Stacked Right",
    blurb:
      "Single row. Right column has price stacked above a tiny stepper, both right-aligned. Strongest price hierarchy.",
  },
] as const;

type VariantKey = (typeof VARIANTS)[number]["key"];

export default function TicketCardPreviewPage() {
  // Independent qty state per variant so each can be interacted with separately
  const [qtys, setQtys] = useState<Record<string, Record<string, number>>>(() =>
    Object.fromEntries(VARIANTS.map((v) => [v.key, {}])),
  );
  const [activeVariant, setActiveVariant] = useState<VariantKey | "all">("all");

  const update = (variant: VariantKey, ticketId: string, delta: number) => {
    setQtys((prev) => {
      const cur = prev[variant][ticketId] || 0;
      const next = Math.max(0, Math.min(10, cur + delta));
      return { ...prev, [variant]: { ...prev[variant], [ticketId]: next } };
    });
  };

  return (
    <div data-theme="midnight" className="min-h-screen bg-[#0a0a0c] text-foreground overflow-x-hidden">
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <header className="mb-8">
          <h1 className="font-[family-name:var(--font-sans)] text-2xl md:text-3xl font-bold tracking-[-0.01em] mb-2">
            Ticket card variants
          </h1>
          <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.12em] uppercase text-foreground/40 mb-4">
            Internal preview · pick the one that lands
          </p>
          <p className="text-sm text-foreground/60 max-w-prose mb-6">
            Each variant uses identical sample tickets so the only thing changing is the layout. Tap +/− on any
            card to see the active state.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveVariant("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] tracking-[0.06em] uppercase font-bold transition-colors",
                activeVariant === "all"
                  ? "bg-foreground text-background"
                  : "bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/[0.10]",
              )}
            >
              Show all
            </button>
            {VARIANTS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setActiveVariant(v.key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] tracking-[0.06em] uppercase font-bold transition-colors",
                  activeVariant === v.key
                    ? "bg-foreground text-background"
                    : "bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/[0.10]",
                )}
              >
                {v.key}
              </button>
            ))}
          </div>
        </header>

        <div
          className={cn(
            "grid gap-8",
            activeVariant === "all" ? "md:grid-cols-2" : "md:grid-cols-1 max-w-md mx-auto",
          )}
        >
          {VARIANTS.filter((v) => activeVariant === "all" || v.key === activeVariant).map((v) => (
            <section key={v.key} className="flex flex-col">
              <div className="mb-3">
                <h2 className="font-[family-name:var(--font-sans)] text-base font-bold mb-1">{v.name}</h2>
                <p className="text-[12px] text-foreground/50 leading-relaxed">{v.blurb}</p>
              </div>

              {/* Phone-frame container — constrained to phone width */}
              <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-3 max-w-[380px] w-full mx-auto">
                {SAMPLE_TICKETS.map((tt) => {
                  const qty = qtys[v.key][tt.id] || 0;
                  const onAdd = () => update(v.key, tt.id, 1);
                  const onRemove = () => update(v.key, tt.id, -1);
                  if (v.key === "hierarchy") return <CardHierarchy key={tt.id} ticket={tt} qty={qty} onAdd={onAdd} onRemove={onRemove} />;
                  if (v.key === "pill") return <CardPill key={tt.id} ticket={tt} qty={qty} onAdd={onAdd} onRemove={onRemove} />;
                  if (v.key === "ghost") return <CardGhost key={tt.id} ticket={tt} qty={qty} onAdd={onAdd} onRemove={onRemove} />;
                  return <CardStack key={tt.id} ticket={tt} qty={qty} onAdd={onAdd} onRemove={onRemove} />;
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Shared bits
// ============================================================

interface VProps {
  ticket: TicketTypeRow;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}

function useTicketState(tt: TicketTypeRow, qty: number) {
  const { convertPrice, formatPrice: fmtPrice } = useCurrencyContext();
  const tier = tt.tier || "standard";
  const isSoldOut = tt.status === "sold_out";
  const isActive = qty > 0;
  const priceDisplay = fmtPrice(convertPrice(Number(tt.price), tt.price_overrides));
  return { tier, isSoldOut, isActive, priceDisplay };
}

const TIER_EFFECT: Record<string, string> = {
  platinum: "midnight-metallic-platinum",
  black: "midnight-metallic-obsidian",
  valentine: "midnight-metallic-valentine",
};

function cardShellClass(tier: string, isActive: boolean, isSoldOut: boolean) {
  const tierEffect = TIER_EFFECT[tier] || "";
  return cn(
    "relative rounded-xl transition-all duration-200 mb-2",
    isSoldOut && "opacity-40 pointer-events-none",
    !tierEffect && "bg-foreground/[0.025] border border-foreground/[0.06]",
    !tierEffect && !isSoldOut && "hover:border-foreground/[0.12]",
    !tierEffect && isActive && !isSoldOut && "border-foreground/[0.15] bg-foreground/[0.05]",
    tierEffect,
    tierEffect && isActive && !isSoldOut && "midnight-active",
  );
}

// ============================================================
// A — HIERARCHY (two rows, tightened original)
// ============================================================
function CardHierarchy({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn(cardShellClass(tier, isActive, isSoldOut), "px-4 py-3.5")}>
      {/* Row 1: name + price */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0 mr-3">
          <span className={cn("font-[family-name:var(--font-sans)] text-sm font-semibold tracking-[0.04em] uppercase block leading-tight", TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard)}>
            {tt.name}
          </span>
          {tt.description ? (
            <span className={cn("font-[family-name:var(--font-display)] text-[12px] tracking-[0.01em] block leading-snug mt-0.5", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>
              {tt.description}
            </span>
          ) : null}
        </div>
        <span className={cn("font-[family-name:var(--font-mono)] text-base font-bold tracking-[0.5px] shrink-0", TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard)}>
          {priceDisplay}
        </span>
      </div>
      {/* Row 2: stepper right-aligned */}
      <div className="flex justify-end">
        {isSoldOut ? (
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">Sold out</span>
        ) : (
          <div className="flex items-center gap-0.5 bg-foreground/[0.03] rounded-lg border border-foreground/[0.06] p-0.5">
            <Button variant="ghost" size="icon" className={cn("w-9 h-9 text-base rounded-md hover:bg-foreground/[0.08] active:scale-[0.92] transition", TIER_BUTTON_CLASSES[tier])} onClick={onRemove}>&minus;</Button>
            <span className={cn("font-[family-name:var(--font-mono)] text-sm font-semibold min-w-6 text-center tabular-nums", isActive ? (TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground") : "text-foreground/50")}>{qty}</span>
            <Button variant="ghost" size="icon" className={cn("w-9 h-9 text-base rounded-md hover:bg-foreground/[0.08] active:scale-[0.92] transition", TIER_BUTTON_CLASSES[tier])} onClick={onAdd}>+</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// B — PILL (single row, refined bordered stepper)
// ============================================================
function CardPill({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn(cardShellClass(tier, isActive, isSoldOut), "px-4 py-3.5")}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn("font-[family-name:var(--font-sans)] text-sm font-semibold tracking-[0.04em] uppercase block leading-tight", TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard)}>
            {tt.name}
          </span>
          {tt.description ? (
            <span className={cn("font-[family-name:var(--font-display)] text-[12px] tracking-[0.01em] block leading-snug mt-1 truncate", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>
              {tt.description}
            </span>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className={cn("font-[family-name:var(--font-mono)] text-base font-bold tracking-[0.5px]", TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard)}>
            {priceDisplay}
          </span>
          {isSoldOut ? (
            <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">Sold out</span>
          ) : (
            <div className="flex items-center bg-foreground/[0.04] rounded-full border border-foreground/[0.08]">
              <Button variant="ghost" size="icon" className={cn("w-8 h-8 text-base rounded-full hover:bg-foreground/[0.10] active:scale-[0.92] transition", TIER_BUTTON_CLASSES[tier])} onClick={onRemove}>&minus;</Button>
              <span className={cn("font-[family-name:var(--font-mono)] text-sm font-semibold min-w-5 text-center tabular-nums", isActive ? (TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground") : "text-foreground/50")}>{qty}</span>
              <Button variant="ghost" size="icon" className={cn("w-8 h-8 text-base rounded-full hover:bg-foreground/[0.10] active:scale-[0.92] transition", TIER_BUTTON_CLASSES[tier])} onClick={onAdd}>+</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// C — GHOST (current pushed v2)
// ============================================================
function CardGhost({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn(cardShellClass(tier, isActive, isSoldOut), "px-4 py-3.5")}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn("font-[family-name:var(--font-sans)] text-sm font-semibold tracking-[0.04em] uppercase block leading-tight", TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard)}>
            {tt.name}
          </span>
          {tt.description ? (
            <span className={cn("font-[family-name:var(--font-display)] text-[12px] tracking-[0.01em] block leading-snug mt-1 truncate", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>
              {tt.description}
            </span>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className={cn("font-[family-name:var(--font-mono)] text-lg font-bold tracking-[0.5px]", TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard)}>
            {priceDisplay}
          </span>
          {isSoldOut ? (
            <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">Sold out</span>
          ) : (
            <div className="flex items-center">
              <Button variant="ghost" size="icon" className={cn("w-9 h-9 text-base rounded-full hover:bg-foreground/[0.08] active:scale-[0.9] transition", isActive ? "text-foreground/80" : "text-foreground/40", TIER_BUTTON_CLASSES[tier])} onClick={onRemove}>&minus;</Button>
              <span className={cn("font-[family-name:var(--font-mono)] text-sm font-semibold min-w-5 text-center tabular-nums", isActive ? (TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground") : "text-foreground/40")}>{qty}</span>
              <Button variant="ghost" size="icon" className={cn("w-9 h-9 text-base rounded-full hover:bg-foreground/[0.08] active:scale-[0.9] transition text-foreground/80", TIER_BUTTON_CLASSES[tier])} onClick={onAdd}>+</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// D — STACKED RIGHT (price above stepper, right-aligned column)
// ============================================================
function CardStack({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn(cardShellClass(tier, isActive, isSoldOut), "px-4 py-3")}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn("font-[family-name:var(--font-sans)] text-sm font-semibold tracking-[0.04em] uppercase block leading-tight", TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard)}>
            {tt.name}
          </span>
          {tt.description ? (
            <span className={cn("font-[family-name:var(--font-display)] text-[12px] tracking-[0.01em] block leading-snug mt-1 truncate", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>
              {tt.description}
            </span>
          ) : null}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span className={cn("font-[family-name:var(--font-mono)] text-lg font-bold tracking-[0.5px] leading-none", TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard)}>
            {priceDisplay}
          </span>
          {isSoldOut ? (
            <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">Sold out</span>
          ) : (
            <div className="flex items-center -mr-1.5">
              <Button variant="ghost" size="icon" className={cn("w-7 h-7 text-sm rounded-full hover:bg-foreground/[0.08] active:scale-[0.92] transition", isActive ? "text-foreground/80" : "text-foreground/40", TIER_BUTTON_CLASSES[tier])} onClick={onRemove}>&minus;</Button>
              <span className={cn("font-[family-name:var(--font-mono)] text-[12px] font-semibold min-w-4 text-center tabular-nums", isActive ? (TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground") : "text-foreground/40")}>{qty}</span>
              <Button variant="ghost" size="icon" className={cn("w-7 h-7 text-sm rounded-full hover:bg-foreground/[0.08] active:scale-[0.92] transition text-foreground/80", TIER_BUTTON_CLASSES[tier])} onClick={onAdd}>+</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
