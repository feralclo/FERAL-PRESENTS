"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, FileText, Send, Receipt } from "lucide-react";

export default function TransactionalPage() {
  const [emailEnabled, setEmailEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/settings?key=feral_email")
      .then((r) => r.json())
      .then((json) => {
        if (json?.data?.order_confirmation_enabled) setEmailEnabled(true);
      })
      .catch(() => {});
  }, []);

  const templates = [
    {
      name: "Order Confirmation",
      description: "Sent after successful purchase — includes ticket codes and PDF attachment",
      href: "/admin/communications/transactional/order-confirmation/",
      active: emailEnabled,
      icon: FileText,
    },
    {
      name: "Ticket Delivery",
      description: "Ticket-only email for resends or transfers",
      href: "/admin/communications/transactional/order-confirmation/",
      active: emailEnabled,
      note: "Shares settings with Order Confirmation",
      icon: Send,
    },
    {
      name: "Invoices",
      description: "Invoice / receipt email for accounting purposes",
      href: "#",
      active: false,
      note: "Coming soon",
      icon: Receipt,
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
          Transactional Emails
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automated emails triggered by customer actions. These are essential for the purchase experience.
        </p>
      </div>

      {/* Template list */}
      <div className="space-y-3">
        {templates.map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.name} className="transition-colors hover:bg-accent/30">
              <Link
                href={t.href}
                className="flex items-center justify-between p-5 group no-underline"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/80">
                    <Icon size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {t.name}
                      </span>
                      {t.active && <Badge variant="success" className="text-[10px] py-0">Active</Badge>}
                      {t.note && !t.active && (
                        <Badge variant="secondary" className="text-[10px] py-0">{t.note}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
              </Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
