"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

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
    },
    {
      name: "Ticket Delivery",
      description: "Ticket-only email for resends or transfers",
      href: "/admin/communications/transactional/order-confirmation/",
      active: emailEnabled,
      note: "Shares settings with Order Confirmation",
    },
    {
      name: "Invoices",
      description: "Invoice / receipt email for accounting purposes",
      href: "#",
      active: false,
      note: "Coming soon",
    },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/admin/communications/"
          className="inline-flex items-center gap-1 text-xs font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors no-underline mb-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Communications
        </Link>
        <h1 className="font-mono text-lg font-bold tracking-[3px] text-foreground uppercase">
          Transactional Emails
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automated emails triggered by customer actions. These are essential for the purchase experience.
        </p>
      </div>

      {/* Template list */}
      <div className="space-y-3">
        {templates.map((t) => (
          <Link
            key={t.name}
            href={t.href}
            className="flex items-center justify-between p-5 rounded-lg border border-border bg-card transition-colors hover:bg-card/80 group no-underline"
          >
            <div className="flex items-center gap-4">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.active ? "bg-success shadow-[0_0_6px_rgba(78,203,113,0.4)]" : "bg-muted-foreground/30"}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {t.name}
                  </span>
                  {t.note && (
                    <span className="text-[0.6rem] font-mono tracking-wider text-muted-foreground/60 uppercase">
                      {t.note}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}
