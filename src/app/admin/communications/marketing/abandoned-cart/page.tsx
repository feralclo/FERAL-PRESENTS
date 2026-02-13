"use client";

import Link from "next/link";

export default function AbandonedCartPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/admin/communications/marketing/"
          className="inline-flex items-center gap-1 text-xs font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors no-underline mb-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Marketing
        </Link>
        <h1 className="font-mono text-lg font-bold tracking-[3px] text-foreground uppercase">
          Abandoned Cart
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automatically email customers who added tickets to their cart but didn&apos;t complete checkout.
        </p>
      </div>

      {/* Coming soon state */}
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
        </div>
        <h2 className="font-mono text-sm font-bold tracking-[2px] text-foreground uppercase mb-2">
          Coming Soon
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
          Abandoned cart recovery will automatically detect when a customer adds tickets but doesn&apos;t complete checkout,
          and send a reminder email to bring them back.
        </p>
        <div className="flex flex-col gap-2 max-w-xs mx-auto text-left">
          {[
            "Configurable delay (30min, 1hr, 24hr)",
            "Customizable email template",
            "Discount code support",
            "Per-event enable/disable",
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
