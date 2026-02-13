"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ShoppingCart, Sparkles } from "lucide-react";

export default function MarketingPage() {
  const automations = [
    {
      name: "Abandoned Cart",
      description: "Recover lost sales — automatically email customers who added tickets but didn't complete checkout",
      href: "/admin/communications/marketing/abandoned-cart/",
      active: false,
      note: "Coming soon",
      icon: ShoppingCart,
    },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/admin/communications/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors no-underline mb-3"
        >
          <ChevronLeft size={14} />
          Communications
        </Link>
        <h1 className="font-mono text-base font-semibold tracking-wider text-foreground uppercase">
          Marketing Automation
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automated campaigns and sequences to drive engagement and recover revenue.
        </p>
      </div>

      {/* Automation list */}
      <div className="space-y-3">
        {automations.map((a) => {
          const Icon = a.icon;
          return (
            <Card key={a.name} className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/80">
                    <Icon size={16} className="text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-medium text-foreground">{a.name}</span>
                      <Badge variant="secondary" className="text-[10px] py-0">{a.note}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Roadmap hint */}
      <Card className="mt-8 border-dashed">
        <div className="p-8 text-center">
          <Sparkles size={20} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground mb-1">More automations coming soon</p>
          <p className="text-xs text-muted-foreground/60 max-w-md mx-auto">
            Post-event follow-ups, review requests, early-bird announcements, and custom drip sequences are on the roadmap.
          </p>
        </div>
      </Card>
    </div>
  );
}
