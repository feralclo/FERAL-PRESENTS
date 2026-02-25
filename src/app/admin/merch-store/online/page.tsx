"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Truck, Globe, Sparkles } from "lucide-react";

const UPCOMING_FEATURES = [
  {
    icon: ShoppingCart,
    title: "Direct Online Sales",
    description: "Sell merch directly to fans, no event ticket required. Full e-commerce checkout with shipping.",
  },
  {
    icon: Truck,
    title: "Fulfillment Options",
    description: "Choose between in-house fulfillment or integrated shipping partners. Track orders from purchase to delivery.",
  },
  {
    icon: Globe,
    title: "Standalone Storefront",
    description: "A dedicated merch page on your site — always available, not tied to any specific event.",
  },
];

export default function OnlineStorePage() {
  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
            Online Store
          </h1>
          <Badge variant="default" className="gap-1 text-[10px]">
            <Sparkles size={9} />
            Coming Soon
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Sell merchandise directly online with shipping — independent of events.
        </p>
      </div>

      {/* Features preview */}
      <div className="grid gap-4 sm:grid-cols-3">
        {UPCOMING_FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <Card key={feature.title} className="py-0 gap-0 border-border/50 bg-muted/20">
              <CardContent className="px-5 py-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
                  <Icon size={16} className="text-primary/60" />
                </div>
                <h3 className="mt-3 text-sm font-medium text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info */}
      <Card className="py-0 gap-0 border-primary/10">
        <CardContent className="px-5 py-4">
          <p className="text-xs text-muted-foreground">
            The Online Store is currently in development. For now, use{" "}
            <span className="font-medium text-foreground">Collections</span>{" "}
            to sell event-specific merch as pre-orders that fans collect at the event.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
