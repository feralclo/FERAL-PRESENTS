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
    historyKey: "visitors" as const,
  },
  {
    key: "carts" as const,
    label: "Active Carts",
    icon: ShoppingCart,
    color: "#FBBF24",
    historyKey: "carts" as const,
  },
  {
    key: "checkout" as const,
    label: "In Checkout",
    icon: CreditCard,
    color: "#34D399",
    historyKey: "checkout" as const,
  },
] as const;

function PresenceCards({ visitors, carts, checkout, history, isLoading }: PresenceCardsProps) {
  const values = { visitors, carts, checkout };

  return (
    <div className="grid grid-cols-3 gap-4">
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
            {/* Background sparkline */}
            {sparkData.length > 1 && (
              <div className="absolute bottom-0 left-0 right-0 pointer-events-none opacity-30">
                <MicroSparkline
                  data={sparkData}
                  color={card.color}
                  height={50}
                  width={400}
                  variant="area"
                  className="w-full"
                />
              </div>
            )}

            <CardContent className="relative z-[1] p-4 lg:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon size={15} strokeWidth={1.5} style={{ color: card.color }} />
                  <p className="text-[12px] font-medium text-muted-foreground">{card.label}</p>
                </div>
                {isActive && (
                  <span className="relative flex h-2 w-2">
                    <span
                      className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                      style={{ backgroundColor: card.color }}
                    />
                    <span
                      className="relative inline-flex h-2 w-2 rounded-full"
                      style={{ backgroundColor: card.color }}
                    />
                  </span>
                )}
              </div>
              <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground">
                {isLoading ? (
                  <span className="inline-block h-9 w-12 animate-pulse rounded bg-muted/30" />
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
