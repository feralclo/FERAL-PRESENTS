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
 * Visual playground: bold reimaginings of the ticket card.
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
    key: "editorial",
    name: "Editorial",
    blurb:
      "No card boxes. Tickets become a typographic menu, separated by thin dividers — like the cocktail list at a Soho member's club. Tap '+ Add' to reveal an inline stepper. Selected row gets a 2px accent stripe on the left edge. Premium = restraint.",
  },
  {
    key: "reveal",
    name: "Reveal",
    blurb:
      "Each ticket collapses to a single 44px line: name · price · +. Tap to expand — description and stepper unfold below. You can see 6 tickets where we used to fit 2. Active rows stay expanded with quantity badge in the collapsed state.",
  },
  {
    key: "tile",
    name: "Tile Grid",
    blurb:
      "Two-column grid on mobile, four-column on desktop. Tickets are squarish tiles — name + price stacked, stepper at the bottom. You scan a grid instead of reading a list. Premium tiers can fill horizontally with tier color/treatment.",
  },
] as const;

type VariantKey = (typeof VARIANTS)[number]["key"];

export default function TicketCardPreviewPage() {
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
        <header className="mb-10">
          <h1 className="font-[family-name:var(--font-sans)] text-2xl md:text-3xl font-bold tracking-[-0.01em] mb-2">
            Three rethinks
          </h1>
          <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.12em] uppercase text-foreground/40 mb-4">
            Different philosophies · pick the vibe
          </p>
          <p className="text-sm text-foreground/60 mb-6 leading-relaxed">
            Each variant uses identical sample tickets so the only thing changing is the design philosophy.
            Tap on tickets to interact.
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
                {v.name}
              </button>
            ))}
          </div>
        </header>

        <div
          className={cn(
            "grid gap-10",
            activeVariant === "all" ? "lg:grid-cols-3" : "max-w-md mx-auto",
          )}
        >
          {VARIANTS.filter((v) => activeVariant === "all" || v.key === activeVariant).map((v) => (
            <section key={v.key} className="flex flex-col">
              <div className="mb-4">
                <h2 className="font-[family-name:var(--font-sans)] text-lg font-bold tracking-[-0.01em] mb-2">
                  {v.name}
                </h2>
                <p className="text-[12px] text-foreground/50 leading-relaxed">{v.blurb}</p>
              </div>

              <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-3 max-w-[380px] w-full mx-auto">
                {v.key === "editorial" && <EditorialList tickets={SAMPLE_TICKETS} qtys={qtys.editorial} update={(id, d) => update("editorial", id, d)} />}
                {v.key === "reveal" && <RevealList tickets={SAMPLE_TICKETS} qtys={qtys.reveal} update={(id, d) => update("reveal", id, d)} />}
                {v.key === "tile" && <TileList tickets={SAMPLE_TICKETS} qtys={qtys.tile} update={(id, d) => update("tile", id, d)} />}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ListProps {
  tickets: TicketTypeRow[];
  qtys: Record<string, number>;
  update: (id: string, delta: number) => void;
}

function useTicketState(tt: TicketTypeRow, qty: number) {
  const { convertPrice, formatPrice: fmtPrice } = useCurrencyContext();
  const tier = tt.tier || "standard";
  const isSoldOut = tt.status === "sold_out";
  const isActive = qty > 0;
  const priceDisplay = fmtPrice(convertPrice(Number(tt.price), tt.price_overrides));
  return { tier, isSoldOut, isActive, priceDisplay };
}

// ============================================================
// 1. EDITORIAL — typographic menu, no boxes
// ============================================================
function EditorialList({ tickets, qtys, update }: ListProps) {
  return (
    <div>
      {tickets.map((tt, i) => (
        <EditorialRow
          key={tt.id}
          ticket={tt}
          qty={qtys[tt.id] || 0}
          isLast={i === tickets.length - 1}
          onAdd={() => update(tt.id, 1)}
          onRemove={() => update(tt.id, -1)}
        />
      ))}
    </div>
  );
}

function EditorialRow({
  ticket: tt,
  qty,
  isLast,
  onAdd,
  onRemove,
}: {
  ticket: TicketTypeRow;
  qty: number;
  isLast: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div
      className={cn(
        "relative transition-colors duration-200",
        isSoldOut && "opacity-40",
      )}
    >
      {/* Active accent stripe (left edge) */}
      <div
        className={cn(
          "absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all duration-300",
          isActive ? "bg-foreground/80" : "bg-transparent",
        )}
        aria-hidden
      />
      <div
        className={cn(
          "flex items-center gap-3 py-4 px-3 transition-colors",
          !isLast && "border-b border-foreground/[0.06]",
          isActive && "bg-foreground/[0.025]",
        )}
      >
        <div className="flex-1 min-w-0">
          <h4
            className={cn(
              "font-[family-name:var(--font-sans)] text-[14px] font-semibold tracking-[0.05em] uppercase leading-tight",
              TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard,
            )}
          >
            {tt.name}
          </h4>
          {tt.description ? (
            <p
              className={cn(
                "font-[family-name:var(--font-display)] text-[11px] tracking-[0.01em] mt-1 truncate",
                TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT,
              )}
            >
              {tt.description}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span
            className={cn(
              "font-[family-name:var(--font-mono)] text-[15px] font-bold tracking-[0.5px] tabular-nums",
              TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard,
            )}
          >
            {priceDisplay}
          </span>
          {isSoldOut ? (
            <span className="font-[family-name:var(--font-mono)] text-[9px] font-bold tracking-[0.2em] uppercase text-foreground/40">
              Sold out
            </span>
          ) : qty === 0 ? (
            <button
              type="button"
              onClick={onAdd}
              className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.2em] uppercase text-foreground/50 hover:text-foreground transition-colors px-2 py-1 cursor-pointer"
            >
              + Add
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onRemove}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-foreground/[0.08] active:scale-90 transition text-foreground/70 cursor-pointer"
                aria-label="Remove"
              >
                <span className="text-base leading-none">−</span>
              </button>
              <span
                className={cn(
                  "font-[family-name:var(--font-mono)] text-sm font-bold min-w-4 text-center tabular-nums",
                  TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground",
                )}
              >
                {qty}
              </span>
              <button
                type="button"
                onClick={onAdd}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-foreground/[0.08] active:scale-90 transition text-foreground cursor-pointer"
                aria-label="Add"
              >
                <span className="text-base leading-none">+</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 2. REVEAL — collapsed lines that expand on tap
// ============================================================
function RevealList({ tickets, qtys, update }: ListProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      {tickets.map((tt) => (
        <RevealRow
          key={tt.id}
          ticket={tt}
          qty={qtys[tt.id] || 0}
          open={openId === tt.id}
          onToggle={() => setOpenId((prev) => (prev === tt.id ? null : tt.id))}
          onAdd={() => update(tt.id, 1)}
          onRemove={() => update(tt.id, -1)}
        />
      ))}
    </div>
  );
}

function RevealRow({
  ticket: tt,
  qty,
  open,
  onToggle,
  onAdd,
  onRemove,
}: {
  ticket: TicketTypeRow;
  qty: number;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div
      className={cn(
        "rounded-lg border transition-all duration-200 overflow-hidden",
        isSoldOut
          ? "opacity-40 border-foreground/[0.04] bg-foreground/[0.01]"
          : isActive
            ? "border-foreground/[0.18] bg-foreground/[0.04]"
            : open
              ? "border-foreground/[0.12] bg-foreground/[0.03]"
              : "border-foreground/[0.06] bg-foreground/[0.015] hover:border-foreground/[0.10]",
      )}
    >
      {/* Collapsed row — always visible */}
      <button
        type="button"
        onClick={isSoldOut ? undefined : onToggle}
        disabled={isSoldOut}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left cursor-pointer disabled:cursor-not-allowed"
      >
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <span
            className={cn(
              "font-[family-name:var(--font-sans)] text-[13px] font-semibold tracking-[0.04em] uppercase leading-tight truncate",
              TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard,
            )}
          >
            {tt.name}
          </span>
          {qty > 0 && !open && (
            <span className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 rounded bg-foreground/10 text-foreground tabular-nums">
              ×{qty}
            </span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2.5">
          <span
            className={cn(
              "font-[family-name:var(--font-mono)] text-[14px] font-bold tracking-[0.5px] tabular-nums",
              TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard,
            )}
          >
            {priceDisplay}
          </span>
          {isSoldOut ? (
            <span className="font-[family-name:var(--font-mono)] text-[9px] font-bold tracking-[0.2em] uppercase text-foreground/40">
              Sold out
            </span>
          ) : (
            <span
              className={cn(
                "w-6 h-6 flex items-center justify-center text-foreground/50 transition-transform duration-200",
                open && "rotate-45",
              )}
            >
              <span className="text-lg leading-none">+</span>
            </span>
          )}
        </div>
      </button>

      {/* Expanded panel */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          open && !isSoldOut ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3 pt-1 border-t border-foreground/[0.06]">
            {tt.description && (
              <p
                className={cn(
                  "font-[family-name:var(--font-display)] text-[12px] tracking-[0.01em] mb-3 leading-snug",
                  TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT,
                )}
              >
                {tt.description}
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.2em] uppercase text-foreground/40">
                Quantity
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={qty === 0}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.10] active:scale-90 transition text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Remove"
                >
                  <span className="text-base leading-none">−</span>
                </button>
                <span
                  className={cn(
                    "font-[family-name:var(--font-mono)] text-base font-bold min-w-6 text-center tabular-nums",
                    isActive
                      ? TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground"
                      : "text-foreground/50",
                  )}
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={onAdd}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-foreground/[0.06] hover:bg-foreground/[0.12] active:scale-90 transition text-foreground cursor-pointer"
                  aria-label="Add"
                >
                  <span className="text-base leading-none">+</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 3. TILE — 2-col grid of compact tiles
// ============================================================
function TileList({ tickets, qtys, update }: ListProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tickets.map((tt) => (
        <TileCard
          key={tt.id}
          ticket={tt}
          qty={qtys[tt.id] || 0}
          onAdd={() => update(tt.id, 1)}
          onRemove={() => update(tt.id, -1)}
        />
      ))}
    </div>
  );
}

const TIER_EFFECT: Record<string, string> = {
  platinum: "midnight-metallic-platinum",
  black: "midnight-metallic-obsidian",
  valentine: "midnight-metallic-valentine",
};

function TileCard({
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
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  const tierEffect = TIER_EFFECT[tier] || "";
  return (
    <div
      className={cn(
        "relative rounded-xl p-3 flex flex-col transition-all duration-200 min-h-[120px]",
        isSoldOut && "opacity-40",
        !tierEffect && "bg-foreground/[0.025] border border-foreground/[0.06]",
        !tierEffect && isActive && !isSoldOut && "border-foreground/[0.20] bg-foreground/[0.05]",
        tierEffect,
        tierEffect && isActive && !isSoldOut && "midnight-active",
      )}
    >
      {/* Top: name + price stacked */}
      <div className="flex-1 min-h-0 mb-2">
        <h4
          className={cn(
            "font-[family-name:var(--font-sans)] text-[12px] font-semibold tracking-[0.05em] uppercase leading-tight",
            TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard,
          )}
        >
          {tt.name}
        </h4>
        {tt.description && (
          <p
            className={cn(
              "font-[family-name:var(--font-display)] text-[10px] tracking-[0.01em] mt-1 line-clamp-2 leading-snug",
              TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT,
            )}
          >
            {tt.description}
          </p>
        )}
      </div>

      {/* Bottom: price + stepper */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "font-[family-name:var(--font-mono)] text-base font-bold tracking-[0.5px] tabular-nums",
            TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard,
          )}
        >
          {priceDisplay}
        </span>
        {isSoldOut ? (
          <span className="font-[family-name:var(--font-mono)] text-[8px] font-bold tracking-[0.2em] uppercase text-foreground/40">
            Sold out
          </span>
        ) : qty === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-foreground/[0.06] hover:bg-foreground/[0.12] active:scale-90 transition text-foreground cursor-pointer"
            aria-label="Add"
          >
            <span className="text-base leading-none">+</span>
          </button>
        ) : (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onRemove}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-foreground/[0.10] active:scale-90 transition text-foreground/70 cursor-pointer"
              aria-label="Remove"
            >
              <span className="text-sm leading-none">−</span>
            </button>
            <span
              className={cn(
                "font-[family-name:var(--font-mono)] text-[13px] font-bold min-w-4 text-center tabular-nums",
                TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground",
              )}
            >
              {qty}
            </span>
            <button
              type="button"
              onClick={onAdd}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-foreground/[0.10] active:scale-90 transition text-foreground cursor-pointer"
              aria-label="Add"
            >
              <span className="text-sm leading-none">+</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
