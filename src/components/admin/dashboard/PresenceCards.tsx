"use client";

import { Card, CardContent } from "@/components/ui/card";
import { LiveIndicator } from "@/components/ui/live-indicator";
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
    label: "Visitors",
    detail: "online now",
    icon: Users,
    color: "#8B5CF6",
    historyKey: "visitors" as const,
  },
  {
    key: "carts" as const,
    label: "Carts",
    detail: "browsing",
    icon: ShoppingCart,
    color: "#FBBF24",
    historyKey: "carts" as const,
  },
  {
    key: "checkout" as const,
    label: "Checkout",
    detail: "paying now",
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

        return (
          <Card key={card.key} className="py-0 gap-0 group hover:border-primary/20 transition-all duration-300">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/30 ring-1 ring-border/40">
                    <Icon size={14} strokeWidth={1.5} style={{ color: card.color }} />
                  </div>
                  <p className="text-[13px] font-medium text-muted-foreground">{card.label}</p>
                </div>
                <LiveIndicator color="success" size="sm" />
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
                    {isLoading ? "\u00A0" : value.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/60">{card.detail}</p>
                </div>
                {sparkData.length > 1 && (
                  <MicroSparkline
                    data={sparkData}
                    color={card.color}
                    height={28}
                    width={80}
                    variant="area"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export { PresenceCards };
