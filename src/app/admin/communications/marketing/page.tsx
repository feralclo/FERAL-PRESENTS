"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Sparkles,
  Power,
  Tag,
} from "lucide-react";

export default function MarketingPage() {
  const [automationActive, setAutomationActive] = useState(false);
  const [popupActive, setPopupActive] = useState(false);

  useEffect(() => {
    fetch("/api/settings?key=feral_abandoned_cart_automation")
      .then((r) => r.json())
      .then((json) => {
        if (json?.data?.enabled) setAutomationActive(true);
      })
      .catch(() => {});

    fetch("/api/settings?key=feral_popup")
      .then((r) => r.json())
      .then((json) => {
        if (json?.data?.enabled) setPopupActive(true);
      })
      .catch(() => {});
  }, []);

  const automations = [
    {
      name: "Abandoned Cart",
      description: "Recover lost sales \u2014 automatically email customers who added tickets but didn\u2019t complete checkout",
      href: "/admin/communications/marketing/abandoned-cart/",
      active: automationActive,
      icon: ShoppingCart,
    },
    {
      name: "Popup",
      description: "Capture emails with a timed discount offer on event pages",
      href: "/admin/communications/marketing/popup/",
      active: popupActive,
      icon: Tag,
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
            <Link key={a.name} href={a.href} className="block group">
              <Card
                className="p-5 transition-all duration-200 hover:border-primary/20"
                style={a.active ? {
                  borderColor: "rgba(16,185,129,0.2)",
                  background: "linear-gradient(135deg, rgba(16,185,129,0.03), transparent)",
                } : {}}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex items-center justify-center w-9 h-9 rounded-lg transition-all"
                      style={{
                        backgroundColor: a.active ? "rgba(16,185,129,0.1)" : "var(--color-accent)",
                      }}
                    >
                      <Icon size={16} style={{ color: a.active ? "#10b981" : undefined }} className={a.active ? "" : "text-muted-foreground"} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-medium text-foreground">{a.name}</span>
                        {a.active ? (
                          <Badge variant="success" className="gap-1 text-[9px] font-bold uppercase">
                            <Power size={7} /> Live
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] py-0">Configure</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-muted-foreground/30 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                  />
                </div>
              </Card>
            </Link>
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
