"use client";

import { Card, CardContent } from "@/components/ui/card";
import { MicroSparkline } from "./MicroSparkline";
import { Users, ShoppingCart, CreditCard } from "lucide-react";
import type { PresenceSnapshot } from "@/hooks/useDashboardRealtime";

interface PresenceCardsProps {
  visitors: number;
  carts: number;
  checkout: number;
  history: PresenceSnapshot[];
  isLoading: boolean;
}

const CARDS = [
  {
    key: "visitors" as const,
    label: "Online Now",
    sublabel: "Active sessions",
    icon: Users,
    color: "#8B5CF6",
    historyKey: "visitors" as const,
  },
  {
    key: "carts" as const,
    label: "Active Carts",
    sublabel: "Items selected",
    icon: ShoppingCart,
    color: "#FBBF24",
    historyKey: "carts" as const,
  },
  {
    key: "checkout" as const,
    label: "In Checkout",
    sublabel: "Completing payment",
    icon: CreditCard,
    color: "#34D399",
    historyKey: "checkout" as const,
  },
] as const;

function PresenceCards({ visitors, carts, checkout, history, isLoading }: PresenceCardsProps) {
  const values = { visitors, carts, checkout };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {CARDS.map((card) => {
        const value = values[card.key];
        const sparkData = history.map((h) => h[card.historyKey]);
        const Icon = card.icon;
        const isActive = value > 0;

        return (
          <Card
            key={card.key}
            className="relative py-0 gap-0 overflow-hidden transition-all duration-500"
            style={{
              borderColor: isActive ? `${card.color}20` : undefined,
            }}
          >
            {/* Colored top accent */}
            <div
              className="h-[2px] w-full transition-opacity duration-500"
              style={{
                background: isActive
                  ? `linear-gradient(90deg, transparent 0%, ${card.color}40 30%, ${card.color}60 50%, ${card.color}40 70%, transparent 100%)`
                  : "transparent",
                opacity: isActive ? 1 : 0,
              }}
            />

            {/* Background sparkline */}
            {sparkData.length > 1 && (
              <div className="absolute bottom-0 left-0 right-0 pointer-events-none opacity-20">
                <MicroSparkline
                  data={sparkData}
                  color={card.color}
                  height={60}
                  width={400}
                  variant="area"
                  className="w-full"
                />
              </div>
            )}

            <CardContent className="relative z-[1] p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300"
                    style={{
                      backgroundColor: `${card.color}12`,
                      outline: `1px solid ${card.color}20`,
                    }}
                  >
                    <Icon size={15} strokeWidth={1.5} style={{ color: card.color }} />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-foreground/80">{card.label}</p>
                    <p className="text-[10px] text-muted-foreground/40">{card.sublabel}</p>
                  </div>
                </div>
                {isActive && (
                  <span className="relative flex h-2.5 w-2.5 mt-1">
                    <span
                      className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                      style={{ backgroundColor: card.color }}
                    />
                    <span
                      className="relative inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: card.color }}
                    />
                  </span>
                )}
              </div>
              <p
                className="font-mono text-[36px] font-bold tabular-nums tracking-tight leading-none"
                style={{ color: isActive ? undefined : "var(--muted-foreground)" }}
              >
                {isLoading ? (
                  <span className="inline-block h-10 w-14 animate-pulse rounded bg-muted/30" />
                ) : (
                  value.toLocaleString()
                )}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export { PresenceCards };
