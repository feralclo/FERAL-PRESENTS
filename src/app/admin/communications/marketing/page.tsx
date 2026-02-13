"use client";

import Link from "next/link";

export default function MarketingPage() {
  const automations = [
    {
      name: "Abandoned Cart",
      description: "Recover lost sales — automatically email customers who added tickets but didn't complete checkout",
      href: "/admin/communications/marketing/abandoned-cart/",
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
          Marketing Automation
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automated campaigns and sequences to drive engagement and recover revenue.
        </p>
      </div>

      {/* Automation list */}
      <div className="space-y-3">
        {automations.map((a) => (
          <div
            key={a.name}
            className="flex items-center justify-between p-5 rounded-lg border border-border bg-card"
          >
            <div className="flex items-center gap-4">
              <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {a.name}
                  </span>
                  <span className="text-[0.6rem] font-mono tracking-wider text-muted-foreground/60 uppercase">
                    {a.note}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
              </div>
            </div>
            <span className="font-mono text-[0.6rem] tracking-wider text-muted-foreground/40 uppercase flex-shrink-0">
              Not Available
            </span>
          </div>
        ))}
      </div>

      {/* Future roadmap hint */}
      <div className="mt-8 rounded-lg border border-border/50 bg-card/50 p-6 text-center">
        <div className="font-mono text-sm text-muted-foreground mb-1">
          More automations coming soon
        </div>
        <p className="text-xs text-muted-foreground/60 max-w-md mx-auto">
          Post-event follow-ups, review requests, early-bird announcements, and custom drip sequences are on the roadmap.
        </p>
      </div>
    </div>
  );
}
