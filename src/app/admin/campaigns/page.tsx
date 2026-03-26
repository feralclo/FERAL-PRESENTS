"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  ClipboardCheck,
  Megaphone,
  Smartphone,
  Sparkles,
} from "lucide-react";

const CAMPAIGN_TYPES = [
  {
    name: "Guest List Outreach",
    description:
      "Send a beautifully designed email to drive guest list applications for an event",
    href: "/admin/campaigns/guest-list-outreach/",
    icon: ClipboardCheck,
    status: "live" as const,
  },
  {
    name: "Event Promotion",
    description:
      "Create promotional emails to boost ticket sales for upcoming events",
    href: "#",
    icon: Megaphone,
    status: "coming-soon" as const,
  },
  {
    name: "SMS Campaigns",
    description:
      "Reach your audience directly with targeted SMS messages",
    href: "#",
    icon: Smartphone,
    status: "coming-soon" as const,
  },
];

export default function CampaignsPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-base font-semibold tracking-wider text-foreground uppercase">
          Campaigns
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and send outbound campaigns to your audience.
        </p>
      </div>

      {/* Campaign type cards */}
      <div className="space-y-3">
        {CAMPAIGN_TYPES.map((c) => {
          const Icon = c.icon;
          const isLive = c.status === "live";

          const card = (
            <Card className={`p-5 transition-all duration-200 ${isLive ? "hover:border-primary/20" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: isLive ? "rgba(139,92,246,0.1)" : "var(--color-accent)",
                    }}
                  >
                    <Icon
                      size={16}
                      className={isLive ? "text-primary" : "text-muted-foreground"}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-medium text-foreground">
                        {c.name}
                      </span>
                      {isLive ? (
                        <Badge variant="default" className="text-[10px] py-0">
                          New
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] py-0">
                          Coming soon
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.description}
                    </p>
                  </div>
                </div>
                {isLive && (
                  <ChevronRight
                    size={16}
                    className="text-muted-foreground/30 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                  />
                )}
              </div>
            </Card>
          );

          return isLive ? (
            <Link key={c.name} href={c.href} className="block group">
              {card}
            </Link>
          ) : (
            <div key={c.name} className="opacity-60 cursor-default">
              {card}
            </div>
          );
        })}
      </div>

      {/* Roadmap hint */}
      <Card className="mt-8 border-dashed">
        <div className="p-8 text-center">
          <Sparkles size={20} className="mx-auto mb-3 text-muted-foreground" />
          <p className="mb-1 text-sm font-medium text-muted-foreground">
            More campaign types on the way
          </p>
          <p className="mx-auto max-w-md text-xs text-muted-foreground/60">
            Event promotions, SMS outreach, re-engagement sequences, and
            win-back campaigns are on the roadmap.
          </p>
        </div>
      </Card>
    </div>
  );
}
