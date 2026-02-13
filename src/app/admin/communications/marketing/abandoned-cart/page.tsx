"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ShoppingCart, Clock, Paintbrush, Tag, ToggleRight } from "lucide-react";

export default function AbandonedCartPage() {
  const features = [
    { label: "Configurable delay (30min, 1hr, 24hr)", icon: Clock },
    { label: "Customizable email template", icon: Paintbrush },
    { label: "Discount code support", icon: Tag },
    { label: "Per-event enable/disable", icon: ToggleRight },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/admin/communications/marketing/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors no-underline mb-3"
        >
          <ChevronLeft size={14} />
          Marketing
        </Link>
        <h1 className="font-mono text-base font-semibold tracking-wider text-foreground uppercase">
          Abandoned Cart
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automatically email customers who added tickets to their cart but didn&apos;t complete checkout.
        </p>
      </div>

      {/* Coming soon state */}
      <Card>
        <div className="p-12 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-muted mx-auto mb-5">
            <ShoppingCart size={24} strokeWidth={1.5} className="text-muted-foreground" />
          </div>
          <h2 className="font-mono text-sm font-semibold tracking-wider text-foreground uppercase mb-2">
            Coming Soon
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-8">
            Abandoned cart recovery will automatically detect when a customer adds tickets but doesn&apos;t complete checkout,
            and send a reminder email to bring them back.
          </p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto text-left">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.label} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Icon size={14} className="text-primary/50 shrink-0" />
                  <span>{feature.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
