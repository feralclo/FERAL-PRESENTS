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
  TIER_BUTTON_CLASSES,
} from "@/components/midnight/tier-styles";
import type { TicketTypeRow } from "@/types/events";

/**
 * The full archive: every ticket card variant tried so far + 5 new polished
 * UX/UI rethinks. Internal preview at /preview/ticket-cards/.
 */

const SAMPLE_TICKETS: TicketTypeRow[] = [
  { id: "t1", org_id: "feral", event_id: "demo", name: "Final Release", description: "", price: 24, sold: 0, sort_order: 1, includes_merch: false, status: "active", min_per_order: 1, max_per_order: 10, tier: "standard", created_at: "", updated_at: "" },
  { id: "t2", org_id: "feral", event_id: "demo", name: "Group Ticket — Admits 4", description: "Must arrive together", price: 59, sold: 0, sort_order: 2, includes_merch: false, status: "active", min_per_order: 1, max_per_order: 10, tier: "standard", created_at: "", updated_at: "" },
  { id: "t3", org_id: "feral", event_id: "demo", name: "VIP Experience", description: "Queue jump + welcome drink", price: 80, sold: 0, sort_order: 3, includes_merch: false, status: "active", min_per_order: 1, max_per_order: 10, tier: "platinum", created_at: "", updated_at: "" },
  { id: "t4", org_id: "feral", event_id: "demo", name: "Early Birds", description: "Standard entry", price: 15, sold: 100, capacity: 100, sort_order: 4, includes_merch: false, status: "sold_out", min_per_order: 1, max_per_order: 10, tier: "standard", created_at: "", updated_at: "" },
];

interface VProps {
  ticket: TicketTypeRow;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}
type ListComponent = (props: { tickets: TicketTypeRow[]; qtys: Record<string, number>; update: (id: string, delta: number) => void }) => React.ReactNode;

function useTicketState(tt: TicketTypeRow, qty: number) {
  const { convertPrice, formatPrice: fmtPrice } = useCurrencyContext();
  const tier = tt.tier || "standard";
  const isSoldOut = tt.status === "sold_out";
  const isActive = qty > 0;
  const priceDisplay = fmtPrice(convertPrice(Number(tt.price), tt.price_overrides));
  const priceNumber = Number(tt.price);
  return { tier, isSoldOut, isActive, priceDisplay, priceNumber };
}

const TIER_EFFECT: Record<string, string> = {
  platinum: "midnight-metallic-platinum",
  black: "midnight-metallic-obsidian",
  valentine: "midnight-metallic-valentine",
};

// ============================================================
// WAVE / VARIANT REGISTRY
// ============================================================

const VARIANTS = [
  // ── Wave 1: First compact attempts ──
  { key: "original", wave: "Compact wave 1", name: "Original (v0)", blurb: "How it shipped on main: 2-row, p-5 padding, big chunky stepper. Baseline (~140px tall).", List: OriginalList },
  { key: "v1-bordered", wave: "Compact wave 1", name: "v1 — Bordered Horizontal", blurb: "First compact: collapsed to single row. Bordered stepper container felt like a chunky widget bolted on.", List: V1BorderedList },
  { key: "v2-ghost", wave: "Compact wave 1", name: "v2 — Ghost (live)", blurb: "Currently live on the branch. Ghost +/- buttons, no container. You said 'got worse'.", List: V2GhostList },

  // ── Wave 2: A–D variants ──
  { key: "a-hierarchy", wave: "A–D variants", name: "A — Hierarchy (tightened)", blurb: "Original 2-row pattern, just tighter. Stepper bottom-right.", List: AHierarchyList },
  { key: "b-pill", wave: "A–D variants", name: "B — Pill", blurb: "Single row. Bordered pill stepper feels like an intentional segmented control.", List: BPillList },
  { key: "d-stacked", wave: "A–D variants", name: "D — Stacked Right", blurb: "Single row. Right column has price stacked above tiny stepper.", List: DStackedList },

  // ── Wave 3: Bold rethinks ──
  { key: "editorial", wave: "Bold rethinks", name: "Editorial", blurb: "No card boxes. Tickets as typographic menu separated by hairline dividers.", List: EditorialList },
  { key: "reveal", wave: "Bold rethinks", name: "Reveal", blurb: "Each ticket a 44px line. Tap to expand description + stepper. ×N badge when collapsed with qty.", List: RevealList },
  { key: "tile", wave: "Bold rethinks", name: "Tile Grid", blurb: "2-col grid on mobile. Scan rather than read.", List: TileList },

  // ── Wave 4: Refined ──
  { key: "refined", wave: "Refined", name: "Refined Original", blurb: "Same 2-row layout. Every element rethought: padding, type weight, stepper pill, accent stripe on active.", List: RefinedList },

  // ── Wave 5: NEW polished UX/UI ──
  { key: "print", wave: "NEW", name: "Print — magazine spread", blurb: "Editorial typographic hierarchy. Big numerals for price, italic kicker, monumental name. Active state inverts like a press-stamp.", List: PrintList },
  { key: "stub", wave: "NEW", name: "Stub — physical ticket", blurb: "Card is a stylised ticket stub with a dotted perforation. Right zone is the 'tear-off' with tier badge + qty. Tactile, skeuomorphic, restrained.", List: StubList },
  { key: "typed", wave: "NEW", name: "Typed — terminal / zine", blurb: "Mono everything. ASCII separators. '> Add' prefix. Underground zine energy. Limited palette — black, foreground, accent only.", List: TypedList },
  { key: "bento", wave: "NEW", name: "Bento — asymmetric grid", blurb: "Premium tiers occupy a full-width tile, standard tiers share a row. Visual hierarchy through size, not styling. Lets VIP breathe.", List: BentoList },
  { key: "glow", wave: "NEW", name: "Glow — tier as ambient light", blurb: "Compact rows with no border, no chrome. Each tier emits a soft glow in its tier colour when hovered or active. Identity through atmosphere.", List: GlowList },
] as const;

const WAVES = ["All", "Compact wave 1", "A–D variants", "Bold rethinks", "Refined", "NEW"] as const;

// ============================================================
// PAGE
// ============================================================

export default function TicketCardArchivePage() {
  const [qtys, setQtys] = useState<Record<string, Record<string, number>>>(
    () => Object.fromEntries(VARIANTS.map((v) => [v.key, {}])),
  );
  const [activeWave, setActiveWave] = useState<(typeof WAVES)[number]>("NEW");

  const update = (variantKey: string) => (id: string, delta: number) => {
    setQtys((prev) => {
      const cur = prev[variantKey][id] || 0;
      return { ...prev, [variantKey]: { ...prev[variantKey], [id]: Math.max(0, Math.min(10, cur + delta)) } };
    });
  };

  const visible = VARIANTS.filter((v) => activeWave === "All" || v.wave === activeWave);

  return (
    <div data-theme="midnight" className="min-h-screen bg-[#0a0a0c] text-foreground overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <header className="mb-8">
          <h1 className="font-[family-name:var(--font-sans)] text-2xl md:text-3xl font-bold tracking-[-0.01em] mb-2">
            Ticket card — full archive
          </h1>
          <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] uppercase text-foreground/40 mb-6">
            Everything tried + five new · default = NEW
          </p>
          <div className="flex flex-wrap gap-2">
            {WAVES.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setActiveWave(w)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] tracking-[0.06em] uppercase font-bold transition-colors cursor-pointer",
                  activeWave === w
                    ? "bg-foreground text-background"
                    : "bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/[0.10]",
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </header>

        <div className={cn("grid gap-10", visible.length > 1 ? "lg:grid-cols-2 xl:grid-cols-3" : "max-w-md mx-auto")}>
          {visible.map((v) => (
            <section key={v.key} className="flex flex-col">
              <div className="mb-3">
                <h2 className="font-[family-name:var(--font-sans)] text-base font-bold mb-1">{v.name}</h2>
                <p className="text-[12px] text-foreground/50 leading-relaxed">{v.blurb}</p>
              </div>
              <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-3 max-w-[400px] w-full mx-auto">
                <v.List
                  tickets={SAMPLE_TICKETS}
                  qtys={qtys[v.key] || {}}
                  update={update(v.key)}
                />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHARED bits
// ============================================================

function MapList({
  tickets,
  qtys,
  update,
  Card,
}: {
  tickets: TicketTypeRow[];
  qtys: Record<string, number>;
  update: (id: string, delta: number) => void;
  Card: (p: VProps) => React.ReactNode;
}) {
  return (
    <>
      {tickets.map((tt) => (
        <Card
          key={tt.id}
          ticket={tt}
          qty={qtys[tt.id] || 0}
          onAdd={() => update(tt.id, 1)}
          onRemove={() => update(tt.id, -1)}
        />
      ))}
    </>
  );
}

// ============================================================
// 1. ORIGINAL (v0) — recreated from main
// ============================================================
function OriginalList(props: Parameters<ListComponent>[0]) {
  return <MapList {...props} Card={OriginalCard} />;
}
function OriginalCard({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  const tierEffect = TIER_EFFECT[tier] || "";
  return (
    <div className={cn("relative p-5 mb-2.5 rounded-xl transition-all duration-200",
      isSoldOut && "opacity-40 pointer-events-none",
      !tierEffect && "bg-foreground/[0.025] border border-foreground/[0.06]",
      !tierEffect && isActive && !isSoldOut && "border-foreground/[0.15] bg-foreground/[0.05]",
      tierEffect, tierEffect && isActive && "midnight-active",
      "max-[480px]:p-4")}>
      <div className="relative z-[2] flex justify-between items-start mb-3.5">
        <div className="flex-1 min-w-0 mr-4">
          <span className={cn("font-[family-name:var(--font-sans)] text-sm font-semibold tracking-[0.04em] uppercase block mb-1.5", TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard)}>{tt.name}</span>
          <span className={cn("font-[family-name:var(--font-display)] text-[12px] tracking-[0.01em] block leading-relaxed", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description || "Standard entry"}</span>
        </div>
        <span className={cn("font-[family-name:var(--font-mono)] text-base font-bold tracking-[0.5px] shrink-0 mt-0.5", TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard)}>{priceDisplay}</span>
      </div>
      <div className="relative z-[2] flex justify-end items-center">
        {isSoldOut ? (
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">Sold out</span>
        ) : (
          <div className="flex items-center gap-1 bg-foreground/[0.03] rounded-xl border border-foreground/[0.06] p-0.5">
            <button onClick={onRemove} className={cn("w-11 h-11 text-lg rounded-lg hover:bg-foreground/[0.06] active:scale-[0.92] transition cursor-pointer", TIER_BUTTON_CLASSES[tier])}>−</button>
            <span className={cn("font-[family-name:var(--font-mono)] text-base font-bold min-w-8 text-center tabular-nums", isActive ? TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground" : "text-foreground/60")}>{qty}</span>
            <button onClick={onAdd} className={cn("w-11 h-11 text-lg rounded-lg hover:bg-foreground/[0.06] active:scale-[0.92] transition cursor-pointer", TIER_BUTTON_CLASSES[tier])}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 2. V1 BORDERED — single row + bordered stepper
// ============================================================
function V1BorderedList(props: Parameters<ListComponent>[0]) { return <MapList {...props} Card={V1Card} />; }
function V1Card({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn("relative px-4 py-3 mb-2 rounded-xl transition-all duration-200",
      isSoldOut && "opacity-40", "bg-foreground/[0.025] border",
      isActive ? "border-foreground/[0.18]" : "border-foreground/[0.06]")}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn("text-sm font-semibold tracking-[0.04em] uppercase block leading-tight", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</span>
          {tt.description && <span className={cn("text-[12px] block leading-snug mt-1 truncate", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</span>}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className={cn("font-mono text-base font-bold tracking-[0.5px]", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
          {isSoldOut ? (
            <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">Sold out</span>
          ) : (
            <div className="flex items-center gap-0.5 bg-foreground/[0.03] rounded-xl border border-foreground/[0.06] p-0.5">
              <button onClick={onRemove} className="w-9 h-9 hover:bg-foreground/[0.08] rounded-lg active:scale-90 transition cursor-pointer">−</button>
              <span className={cn("font-mono text-sm font-bold min-w-6 text-center tabular-nums", isActive ? "text-foreground" : "text-foreground/60")}>{qty}</span>
              <button onClick={onAdd} className="w-9 h-9 hover:bg-foreground/[0.08] rounded-lg active:scale-90 transition cursor-pointer">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 3. V2 GHOST — single row, ghost stepper (current)
// ============================================================
function V2GhostList(props: Parameters<ListComponent>[0]) { return <MapList {...props} Card={V2Card} />; }
function V2Card({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn("relative px-4 py-3.5 mb-2 rounded-xl transition-all duration-200",
      isSoldOut && "opacity-40", "bg-foreground/[0.025] border",
      isActive ? "border-foreground/[0.18]" : "border-foreground/[0.06]")}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn("text-sm font-semibold tracking-[0.04em] uppercase block leading-tight", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</span>
          {tt.description && <span className={cn("text-[12px] block leading-snug mt-1 truncate", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</span>}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className={cn("font-mono text-lg font-bold tracking-[0.5px]", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
          {isSoldOut ? (
            <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">Sold out</span>
          ) : (
            <div className="flex items-center">
              <button onClick={onRemove} className="w-9 h-9 hover:bg-foreground/[0.08] rounded-full active:scale-90 transition text-foreground/70 cursor-pointer">−</button>
              <span className={cn("font-mono text-sm font-semibold min-w-5 text-center tabular-nums", isActive ? "text-foreground" : "text-foreground/40")}>{qty}</span>
              <button onClick={onAdd} className="w-9 h-9 hover:bg-foreground/[0.08] rounded-full active:scale-90 transition cursor-pointer">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 4. A — HIERARCHY  ·  5. B — PILL  ·  6. D — STACKED RIGHT
// ============================================================
function AHierarchyList(props: Parameters<ListComponent>[0]) { return <MapList {...props} Card={ACard} />; }
function ACard({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn("relative px-4 py-3.5 mb-2 rounded-xl transition", isSoldOut && "opacity-40", "bg-foreground/[0.025] border", isActive ? "border-foreground/[0.18]" : "border-foreground/[0.06]")}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0 mr-3">
          <span className={cn("text-sm font-semibold tracking-[0.04em] uppercase block leading-tight", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</span>
          {tt.description && <span className={cn("text-[12px] block leading-snug mt-0.5", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</span>}
        </div>
        <span className={cn("font-mono text-base font-bold tracking-[0.5px] shrink-0", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
      </div>
      <div className="flex justify-end">
        {isSoldOut ? (<span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">Sold out</span>) : (
          <div className="flex items-center gap-0.5 bg-foreground/[0.03] rounded-lg border border-foreground/[0.06] p-0.5">
            <button onClick={onRemove} className="w-9 h-9 hover:bg-foreground/[0.08] rounded-md transition cursor-pointer">−</button>
            <span className={cn("font-mono text-sm font-semibold min-w-6 text-center tabular-nums", isActive ? "text-foreground" : "text-foreground/50")}>{qty}</span>
            <button onClick={onAdd} className="w-9 h-9 hover:bg-foreground/[0.08] rounded-md transition cursor-pointer">+</button>
          </div>
        )}
      </div>
    </div>
  );
}
function BPillList(props: Parameters<ListComponent>[0]) { return <MapList {...props} Card={BCard} />; }
function BCard({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn("relative px-4 py-3.5 mb-2 rounded-xl transition", isSoldOut && "opacity-40", "bg-foreground/[0.025] border", isActive ? "border-foreground/[0.18]" : "border-foreground/[0.06]")}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn("text-sm font-semibold tracking-[0.04em] uppercase block leading-tight", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</span>
          {tt.description && <span className={cn("text-[12px] block leading-snug mt-1 truncate", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</span>}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className={cn("font-mono text-base font-bold tracking-[0.5px]", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
          {isSoldOut ? (<span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">Sold out</span>) : (
            <div className="flex items-center bg-foreground/[0.04] rounded-full border border-foreground/[0.08]">
              <button onClick={onRemove} className="w-8 h-8 hover:bg-foreground/[0.10] rounded-full transition cursor-pointer">−</button>
              <span className={cn("font-mono text-sm font-semibold min-w-5 text-center tabular-nums", isActive ? "text-foreground" : "text-foreground/50")}>{qty}</span>
              <button onClick={onAdd} className="w-8 h-8 hover:bg-foreground/[0.10] rounded-full transition cursor-pointer">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function DStackedList(props: Parameters<ListComponent>[0]) { return <MapList {...props} Card={DCard} />; }
function DCard({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn("relative px-4 py-3 mb-2 rounded-xl transition", isSoldOut && "opacity-40", "bg-foreground/[0.025] border", isActive ? "border-foreground/[0.18]" : "border-foreground/[0.06]")}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn("text-sm font-semibold tracking-[0.04em] uppercase block leading-tight", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</span>
          {tt.description && <span className={cn("text-[12px] block leading-snug mt-1 truncate", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</span>}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span className={cn("font-mono text-lg font-bold tracking-[0.5px] leading-none", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
          {isSoldOut ? (<span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">Sold out</span>) : (
            <div className="flex items-center -mr-1.5">
              <button onClick={onRemove} className="w-7 h-7 hover:bg-foreground/[0.08] rounded-full transition text-sm cursor-pointer">−</button>
              <span className={cn("font-mono text-[12px] font-semibold min-w-4 text-center tabular-nums", isActive ? "text-foreground" : "text-foreground/40")}>{qty}</span>
              <button onClick={onAdd} className="w-7 h-7 hover:bg-foreground/[0.08] rounded-full transition text-sm cursor-pointer">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 7. EDITORIAL  ·  8. REVEAL  ·  9. TILE
// ============================================================
function EditorialList({ tickets, qtys, update }: Parameters<ListComponent>[0]) {
  return (
    <div>
      {tickets.map((tt, i) => (
        <EditorialRow key={tt.id} ticket={tt} qty={qtys[tt.id] || 0} isLast={i === tickets.length - 1} onAdd={() => update(tt.id, 1)} onRemove={() => update(tt.id, -1)} />
      ))}
    </div>
  );
}
function EditorialRow({ ticket: tt, qty, isLast, onAdd, onRemove }: VProps & { isLast: boolean }) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn("relative", isSoldOut && "opacity-40")}>
      <div className={cn("absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition", isActive ? "bg-foreground/80" : "bg-transparent")} aria-hidden />
      <div className={cn("flex items-center gap-3 py-4 px-3 transition-colors", !isLast && "border-b border-foreground/[0.06]", isActive && "bg-foreground/[0.025]")}>
        <div className="flex-1 min-w-0">
          <h4 className={cn("text-[14px] font-semibold tracking-[0.05em] uppercase leading-tight", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</h4>
          {tt.description && <p className={cn("text-[11px] mt-1 truncate", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className={cn("font-mono text-[15px] font-bold tracking-[0.5px] tabular-nums", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
          {isSoldOut ? (<span className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase text-foreground/40">Sold out</span>) : qty === 0 ? (
            <button onClick={onAdd} className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-foreground/50 hover:text-foreground transition px-2 py-1 cursor-pointer">+ Add</button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button onClick={onRemove} className="w-7 h-7 hover:bg-foreground/[0.08] rounded-full transition text-foreground/70 cursor-pointer">−</button>
              <span className={cn("font-mono text-sm font-bold min-w-4 text-center tabular-nums", TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground")}>{qty}</span>
              <button onClick={onAdd} className="w-7 h-7 hover:bg-foreground/[0.08] rounded-full transition cursor-pointer">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RevealList({ tickets, qtys, update }: Parameters<ListComponent>[0]) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      {tickets.map((tt) => (
        <RevealRow key={tt.id} ticket={tt} qty={qtys[tt.id] || 0} open={openId === tt.id} onToggle={() => setOpenId((p) => p === tt.id ? null : tt.id)} onAdd={() => update(tt.id, 1)} onRemove={() => update(tt.id, -1)} />
      ))}
    </div>
  );
}
function RevealRow({ ticket: tt, qty, open, onToggle, onAdd, onRemove }: VProps & { open: boolean; onToggle: () => void }) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn("rounded-lg border transition-all overflow-hidden",
      isSoldOut ? "opacity-40 border-foreground/[0.04] bg-foreground/[0.01]" :
      isActive ? "border-foreground/[0.18] bg-foreground/[0.04]" :
      open ? "border-foreground/[0.12] bg-foreground/[0.03]" : "border-foreground/[0.06] bg-foreground/[0.015]")}>
      <button type="button" onClick={isSoldOut ? undefined : onToggle} disabled={isSoldOut} className="w-full flex items-center gap-3 px-3.5 py-3 text-left cursor-pointer disabled:cursor-not-allowed">
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <span className={cn("text-[13px] font-semibold tracking-[0.04em] uppercase truncate", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</span>
          {qty > 0 && !open && (<span className="shrink-0 font-mono text-[10px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 rounded bg-foreground/10 tabular-nums">×{qty}</span>)}
        </div>
        <div className="shrink-0 flex items-center gap-2.5">
          <span className={cn("font-mono text-[14px] font-bold tracking-[0.5px] tabular-nums", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
          {isSoldOut ? (<span className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase text-foreground/40">Sold out</span>) : (
            <span className={cn("w-6 h-6 flex items-center justify-center text-foreground/50 transition", open && "rotate-45")}>+</span>
          )}
        </div>
      </button>
      <div className={cn("grid transition-all", open && !isSoldOut ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3 pt-1 border-t border-foreground/[0.06]">
            {tt.description && <p className={cn("text-[12px] mb-3", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</p>}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-foreground/40">Quantity</span>
              <div className="flex items-center gap-2">
                <button onClick={onRemove} disabled={qty === 0} className="w-9 h-9 rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.10] active:scale-90 transition disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed">−</button>
                <span className={cn("font-mono text-base font-bold min-w-6 text-center tabular-nums", isActive ? "text-foreground" : "text-foreground/50")}>{qty}</span>
                <button onClick={onAdd} className="w-9 h-9 rounded-full bg-foreground/[0.06] hover:bg-foreground/[0.12] active:scale-90 transition cursor-pointer">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TileList({ tickets, qtys, update }: Parameters<ListComponent>[0]) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tickets.map((tt) => (
        <TileCard key={tt.id} ticket={tt} qty={qtys[tt.id] || 0} onAdd={() => update(tt.id, 1)} onRemove={() => update(tt.id, -1)} />
      ))}
    </div>
  );
}
function TileCard({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  const tierEffect = TIER_EFFECT[tier] || "";
  return (
    <div className={cn("relative rounded-xl p-3 flex flex-col transition min-h-[120px]", isSoldOut && "opacity-40",
      !tierEffect && "bg-foreground/[0.025] border border-foreground/[0.06]",
      !tierEffect && isActive && !isSoldOut && "border-foreground/[0.20] bg-foreground/[0.05]",
      tierEffect, tierEffect && isActive && !isSoldOut && "midnight-active")}>
      <div className="flex-1 min-h-0 mb-2">
        <h4 className={cn("text-[12px] font-semibold tracking-[0.05em] uppercase leading-tight", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</h4>
        {tt.description && <p className={cn("text-[10px] mt-1 line-clamp-2 leading-snug", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</p>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("font-mono text-base font-bold tracking-[0.5px] tabular-nums", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
        {isSoldOut ? (<span className="font-mono text-[8px] font-bold tracking-[0.2em] uppercase text-foreground/40">Sold out</span>) : qty === 0 ? (
          <button onClick={onAdd} className="w-8 h-8 rounded-full bg-foreground/[0.06] hover:bg-foreground/[0.12] active:scale-90 transition cursor-pointer">+</button>
        ) : (
          <div className="flex items-center gap-0.5">
            <button onClick={onRemove} className="w-7 h-7 rounded-full hover:bg-foreground/[0.10] transition text-sm cursor-pointer">−</button>
            <span className={cn("font-mono text-[13px] font-bold min-w-4 text-center tabular-nums", TIER_QTY_ACTIVE_CLASSES[tier] || "")}>{qty}</span>
            <button onClick={onAdd} className="w-7 h-7 rounded-full hover:bg-foreground/[0.10] transition text-sm cursor-pointer">+</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 10. REFINED ORIGINAL
// ============================================================
function RefinedList(props: Parameters<ListComponent>[0]) { return <MapList {...props} Card={RefinedCard} />; }
function RefinedCard({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  const tierEffect = TIER_EFFECT[tier] || "";
  return (
    <article className={cn("relative px-4 py-3 mb-1.5 rounded-xl transition-all duration-200",
      isSoldOut && "opacity-40 pointer-events-none",
      !tierEffect && "bg-foreground/[0.025] border border-foreground/[0.06]",
      !tierEffect && isActive && !isSoldOut && "border-foreground/[0.18] bg-foreground/[0.045]",
      tierEffect, tierEffect && isActive && !isSoldOut && "midnight-active")}>
      <span className={cn("absolute left-0 top-3 bottom-3 w-[2px] rounded-full transition", isActive && !tierEffect ? "bg-foreground/50" : "bg-transparent")} aria-hidden />
      <div className="flex justify-between items-start gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <h4 className={cn("text-[13px] font-bold tracking-[0.06em] uppercase leading-tight", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</h4>
          {tt.description && <p className={cn("text-[11px] tracking-[0.01em] leading-snug mt-1", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</p>}
        </div>
        <span className={cn("shrink-0 font-mono text-base font-bold tracking-[0.5px] tabular-nums leading-none mt-0.5", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
      </div>
      <div className="flex justify-end items-center">
        {isSoldOut ? (<span className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-foreground/40">Sold out</span>) : (
          <div className={cn("inline-flex items-center bg-foreground/[0.03] rounded-full border p-px transition", isActive ? "border-foreground/[0.20]" : "border-foreground/[0.08]")}>
            <button onClick={onRemove} disabled={qty === 0} className="w-8 h-8 rounded-full text-foreground/70 hover:bg-foreground/[0.08] active:scale-90 transition disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed">−</button>
            <span className={cn("font-mono text-sm font-semibold min-w-5 text-center tabular-nums px-1", isActive ? TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground" : "text-foreground/40")}>{qty}</span>
            <button onClick={onAdd} className="w-8 h-8 rounded-full hover:bg-foreground/[0.08] active:scale-90 transition cursor-pointer">+</button>
          </div>
        )}
      </div>
    </article>
  );
}

// ============================================================
// === NEW VARIANTS BELOW — 11–15 ===
// ============================================================

// 11. PRINT — magazine spread typographic hierarchy
function PrintList(props: Parameters<ListComponent>[0]) { return <MapList {...props} Card={PrintCard} />; }
function PrintCard({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay, priceNumber } = useTicketState(tt, qty);
  return (
    <div className={cn("relative grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 py-4 mb-0 border-b border-foreground/[0.08]",
      isSoldOut && "opacity-40")}>
      {/* Left: name + meta */}
      <div className="min-w-0">
        <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-foreground/40 block">
          {tier === "platinum" ? "Premium" : tier === "valentine" ? "Valentine" : "Standard"} · No.{tt.sort_order.toString().padStart(2, "0")}
        </span>
        <h4 className={cn("font-[family-name:var(--font-sans)] text-[16px] leading-[1.1] font-bold tracking-[-0.01em] mt-1 break-words", TIER_TEXT_CLASSES[tier] || "")}>
          {tt.name}
        </h4>
        {tt.description && <p className={cn("font-[family-name:var(--font-display)] text-[11px] italic leading-snug mt-1.5", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</p>}
      </div>
      {/* Right: huge price numeral + tiny qty control */}
      <div className="flex flex-col items-end shrink-0">
        <div className="flex items-baseline gap-0.5">
          <span className="font-mono text-[10px] text-foreground/40 mb-1">£</span>
          <span className={cn("font-[family-name:var(--font-sans)] text-[32px] leading-none font-bold tabular-nums tracking-[-0.04em]", TIER_PRICE_CLASSES[tier] || "")}>
            {priceNumber}
          </span>
        </div>
        {isSoldOut ? (
          <span className="mt-1.5 font-mono text-[9px] font-bold tracking-[0.2em] uppercase text-foreground/50">Sold out</span>
        ) : qty === 0 ? (
          <button onClick={onAdd} className="mt-1.5 font-mono text-[9px] font-bold tracking-[0.2em] uppercase text-foreground/60 hover:text-foreground border-b border-foreground/40 hover:border-foreground transition pb-px cursor-pointer">
            + Add
          </button>
        ) : (
          <div className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] uppercase">
            <button onClick={onRemove} className="w-5 h-5 hover:text-foreground text-foreground/60 transition cursor-pointer">−</button>
            <span className="text-foreground tabular-nums font-bold min-w-3 text-center">×{qty}</span>
            <button onClick={onAdd} className="w-5 h-5 hover:text-foreground text-foreground/60 transition cursor-pointer">+</button>
          </div>
        )}
      </div>
    </div>
  );
}

// 12. STUB — physical ticket with perforation
function StubList(props: Parameters<ListComponent>[0]) { return <MapList {...props} Card={StubCard} />; }
function StubCard({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn("relative rounded-lg overflow-hidden mb-2 transition", isSoldOut && "opacity-40", isActive ? "ring-1 ring-foreground/[0.30]" : "")}>
      {/* Perforated divider */}
      <div className="grid grid-cols-[1fr_auto] items-stretch">
        {/* Main body */}
        <div className={cn("relative px-4 py-3.5 border border-r-0 rounded-l-lg transition",
          isActive ? "bg-foreground/[0.06] border-foreground/[0.18]" : "bg-foreground/[0.025] border-foreground/[0.08]")}>
          <span className="font-mono text-[8px] tracking-[0.3em] uppercase text-foreground/30 block">
            ADMIT ONE
          </span>
          <h4 className={cn("text-[13px] font-bold tracking-[0.06em] uppercase mt-1 leading-tight", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</h4>
          {tt.description && <p className={cn("text-[11px] mt-1 leading-snug", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</p>}
          <div className="mt-2 flex items-center gap-1">
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-foreground/40">Price</span>
            <span className={cn("font-mono text-[15px] font-bold tracking-[0.5px] tabular-nums", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
          </div>
        </div>
        {/* Perforation seam */}
        <div className="relative w-3 flex flex-col">
          <div className={cn("flex-1 transition", isActive ? "bg-foreground/[0.06]" : "bg-foreground/[0.025]")}>
            <div className="h-full w-px mx-auto border-l border-dashed border-foreground/[0.20]" />
          </div>
        </div>
        {/* Stub */}
        <div className={cn("absolute right-0 inset-y-0 flex flex-col items-center justify-center px-3 border border-l-0 rounded-r-lg transition w-[88px]",
          isActive ? "bg-foreground/[0.06] border-foreground/[0.18]" : "bg-foreground/[0.025] border-foreground/[0.08]")}>
          <span className="font-mono text-[8px] tracking-[0.25em] uppercase text-foreground/40">{tier === "platinum" ? "VIP" : "GA"}</span>
          {isSoldOut ? (
            <span className="mt-2 font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/50 text-center leading-tight">Sold<br/>out</span>
          ) : qty === 0 ? (
            <button onClick={onAdd} className="mt-2 w-9 h-9 rounded-full border border-foreground/[0.20] hover:bg-foreground/[0.10] hover:border-foreground/40 active:scale-90 transition flex items-center justify-center cursor-pointer">
              <span className="text-base text-foreground">+</span>
            </button>
          ) : (
            <div className="mt-1 flex flex-col items-center">
              <span className="font-mono text-[16px] font-bold tabular-nums text-foreground">{qty}</span>
              <div className="flex gap-0.5 mt-0.5">
                <button onClick={onRemove} className="w-6 h-6 rounded-full hover:bg-foreground/[0.10] transition text-xs cursor-pointer">−</button>
                <button onClick={onAdd} className="w-6 h-6 rounded-full hover:bg-foreground/[0.10] transition text-xs cursor-pointer">+</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 13. TYPED — terminal/zine mono aesthetic
function TypedList(props: Parameters<ListComponent>[0]) { return <MapList {...props} Card={TypedCard} />; }
function TypedCard({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  return (
    <div className={cn("relative font-mono px-3 py-2.5 mb-0 border-b border-dashed border-foreground/[0.10] transition", isSoldOut && "opacity-40", isActive && "bg-foreground/[0.03]")}>
      <div className="flex items-baseline gap-2 text-[12px] leading-tight">
        <span className={cn("transition", isActive ? "text-foreground" : "text-foreground/30")}>{isActive ? ">" : " "}</span>
        <span className={cn("font-bold tracking-[0.04em] uppercase truncate flex-1 min-w-0", TIER_TEXT_CLASSES[tier] || "text-foreground")}>{tt.name}</span>
        <span className={cn("text-[11px] font-bold tabular-nums shrink-0", TIER_PRICE_CLASSES[tier] || "text-foreground/80")}>{priceDisplay}</span>
        {isSoldOut ? (<span className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/40 shrink-0">[sold]</span>) : qty === 0 ? (
          <button onClick={onAdd} className="text-[11px] font-bold uppercase text-foreground/60 hover:text-foreground tracking-[0.1em] shrink-0 cursor-pointer">[+]</button>
        ) : (
          <span className="text-[11px] font-bold tracking-[0.05em] shrink-0 inline-flex items-center gap-1 text-foreground">
            <button onClick={onRemove} className="hover:text-foreground/60 cursor-pointer">[-]</button>
            <span className="tabular-nums min-w-3 text-center">{qty}</span>
            <button onClick={onAdd} className="hover:text-foreground/60 cursor-pointer">[+]</button>
          </span>
        )}
      </div>
      {tt.description && <div className="text-[10px] text-foreground/40 mt-0.5 ml-4 truncate">{`// ${tt.description}`}</div>}
    </div>
  );
}

// 14. BENTO — asymmetric grid; premium tiers full-width
function BentoList({ tickets, qtys, update }: Parameters<ListComponent>[0]) {
  // Standards pair 2-up (odd one gets half-width); premiums full-width
  const premium = tickets.filter((t) => t.tier && t.tier !== "standard");
  const standard = tickets.filter((t) => !t.tier || t.tier === "standard");
  const standardRows: TicketTypeRow[][] = [];
  for (let i = 0; i < standard.length; i += 2) standardRows.push(standard.slice(i, i + 2));

  return (
    <div className="flex flex-col gap-2">
      {standardRows.map((row, idx) => (
        <div key={`s-${idx}`} className="grid grid-cols-2 gap-2">
          {row.map((tt) => (
            <BentoCard key={tt.id} ticket={tt} qty={qtys[tt.id] || 0} onAdd={() => update(tt.id, 1)} onRemove={() => update(tt.id, -1)} large={false} />
          ))}
        </div>
      ))}
      {premium.map((tt) => (
        <BentoCard key={tt.id} ticket={tt} qty={qtys[tt.id] || 0} onAdd={() => update(tt.id, 1)} onRemove={() => update(tt.id, -1)} large={true} />
      ))}
    </div>
  );
}
function BentoCard({ ticket: tt, qty, onAdd, onRemove, large }: VProps & { large: boolean }) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  const tierEffect = TIER_EFFECT[tier] || "";
  return (
    <div className={cn("relative rounded-xl transition", isSoldOut && "opacity-40",
      !tierEffect && "bg-foreground/[0.025] border border-foreground/[0.06]",
      !tierEffect && isActive && !isSoldOut && "border-foreground/[0.20] bg-foreground/[0.05]",
      tierEffect, tierEffect && isActive && !isSoldOut && "midnight-active",
      large ? "p-4" : "p-3 min-h-[88px] flex flex-col justify-between")}>
      <div>
        <h4 className={cn("font-bold tracking-[0.05em] uppercase leading-tight", large ? "text-sm" : "text-[12px]", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</h4>
        {tt.description && <p className={cn("mt-1 leading-snug line-clamp-2", large ? "text-[12px]" : "text-[10px]", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</p>}
      </div>
      <div className={cn("flex items-center justify-between gap-2", large ? "mt-3" : "mt-2")}>
        <span className={cn("font-mono font-bold tracking-[0.5px] tabular-nums", large ? "text-lg" : "text-base", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
        {isSoldOut ? (<span className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase text-foreground/40">Sold out</span>) : qty === 0 ? (
          <button onClick={onAdd} className={cn("rounded-full bg-foreground/[0.06] hover:bg-foreground/[0.12] active:scale-90 transition cursor-pointer flex items-center justify-center", large ? "w-9 h-9" : "w-8 h-8")}>+</button>
        ) : (
          <div className="flex items-center gap-0.5">
            <button onClick={onRemove} className={cn("rounded-full hover:bg-foreground/[0.10] active:scale-90 transition cursor-pointer", large ? "w-8 h-8" : "w-7 h-7 text-sm")}>−</button>
            <span className={cn("font-mono font-bold min-w-4 text-center tabular-nums", large ? "text-base" : "text-[13px]", TIER_QTY_ACTIVE_CLASSES[tier] || "")}>{qty}</span>
            <button onClick={onAdd} className={cn("rounded-full hover:bg-foreground/[0.10] active:scale-90 transition cursor-pointer", large ? "w-8 h-8" : "w-7 h-7 text-sm")}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}

// 15. GLOW — tier as ambient light
function GlowList(props: Parameters<ListComponent>[0]) { return <MapList {...props} Card={GlowCard} />; }
function GlowCard({ ticket: tt, qty, onAdd, onRemove }: VProps) {
  const { tier, isSoldOut, isActive, priceDisplay } = useTicketState(tt, qty);
  // Tier-specific glow colour (kept restrained)
  const glow: Record<string, string> = {
    platinum: "rgba(220,220,235,0.18)",
    valentine: "rgba(255,126,179,0.20)",
    black: "rgba(255,255,255,0.16)",
    standard: "rgba(255,255,255,0.10)",
  };
  const glowColor = glow[tier] || glow.standard;
  return (
    <div
      className={cn("relative px-4 py-3 mb-1.5 rounded-xl transition-all duration-300 group", isSoldOut && "opacity-40")}
      style={{
        boxShadow: isActive
          ? `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px ${glowColor.replace("0.10", "0.18")}, 0 0 32px ${glowColor}`
          : "inset 0 1px 0 rgba(255,255,255,0.02), 0 0 0 1px rgba(255,255,255,0.04)",
        background: isActive
          ? `radial-gradient(120% 100% at 100% 50%, ${glowColor.replace("0.10", "0.06")}, transparent 60%)`
          : "transparent",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h4 className={cn("text-[13px] font-bold tracking-[0.05em] uppercase leading-tight", TIER_TEXT_CLASSES[tier] || "")}>{tt.name}</h4>
          {tt.description && <p className={cn("text-[11px] mt-1 truncate", TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT)}>{tt.description}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className={cn("font-mono text-base font-bold tracking-[0.5px] tabular-nums", TIER_PRICE_CLASSES[tier] || "")}>{priceDisplay}</span>
          {isSoldOut ? (<span className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-foreground/40">Sold out</span>) : qty === 0 ? (
            <button onClick={onAdd} className="w-9 h-9 rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.10] active:scale-90 transition cursor-pointer flex items-center justify-center">
              <span className="text-base">+</span>
            </button>
          ) : (
            <div className="flex items-center">
              <button onClick={onRemove} className="w-8 h-8 hover:bg-foreground/[0.08] rounded-full active:scale-90 transition cursor-pointer">−</button>
              <span className={cn("font-mono text-sm font-bold min-w-5 text-center tabular-nums", TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground")}>{qty}</span>
              <button onClick={onAdd} className="w-8 h-8 hover:bg-foreground/[0.08] rounded-full active:scale-90 transition cursor-pointer">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
