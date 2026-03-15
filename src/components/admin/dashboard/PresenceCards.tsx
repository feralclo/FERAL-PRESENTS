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
    icon: Users,
    color: "#8B5CF6",
    glowColor: "rgba(139, 92, 246, 0.15)",
    historyKey: "visitors" as const,
  },
  {
    key: "carts" as const,
    label: "Active Carts",
    icon: ShoppingCart,
    color: "#FBBF24",
    glowColor: "rgba(251, 191, 36, 0.15)",
    historyKey: "carts" as const,
  },
  {
    key: "checkout" as const,
    label: "In Checkout",
    icon: CreditCard,
    color: "#34D399",
    glowColor: "rgba(52, 211, 153, 0.15)",
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
              borderColor: isActive ? `${card.color}25` : undefined,
              boxShadow: isActive ? `0 0 30px ${card.glowColor}` : undefined,
            }}
          >
            {/* Background sparkline — fills the whole card */}
            {sparkData.length > 1 && (
              <div className="absolute bottom-0 left-0 right-0 pointer-events-none opacity-40">
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl ring-1 transition-all duration-300"
                    style={{
                      backgroundColor: `${card.color}15`,
                      boxShadow: isActive ? `0 0 12px ${card.color}20, inset 0 0 0 1px ${card.color}25` : `inset 0 0 0 1px ${card.color}15`,
                    }}
                  >
                    <Icon size={16} strokeWidth={1.5} style={{ color: card.color }} />
                  </div>
                  <p className="text-[13px] font-medium text-muted-foreground">{card.label}</p>
                </div>
                {/* Animated pulse dot */}
                {isActive && (
                  <span className="relative flex h-2.5 w-2.5">
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
              <p className="mt-4 font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground">
                {isLoading ? (
                  <span className="inline-block h-9 w-16 animate-pulse rounded bg-muted/30" />
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
