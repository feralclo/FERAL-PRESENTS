"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  Mail,
  Smartphone,
  Sparkles,
} from "lucide-react";

const CHANNELS = [
  {
    name: "Email Campaigns",
    description:
      "Choose from proven playbooks to create beautiful, high-converting emails for your audience",
    href: "/admin/campaigns/email/",
    icon: Mail,
    status: "live" as const,
    detail: "1 playbook ready, more coming",
  },
  {
    name: "SMS Campaigns",
    description:
      "Reach your audience directly with targeted SMS messages",
    href: "#",
    icon: Smartphone,
    status: "coming-soon" as const,
    detail: "On the roadmap",
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
          Create and send targeted campaigns to your audience.
        </p>
      </div>

      {/* Channel cards */}
      <div className="space-y-3">
        {CHANNELS.map((c) => {
          const Icon = c.icon;
          const isLive = c.status === "live";

          const card = (
            <Card className={`overflow-hidden transition-all duration-200 ${isLive ? "hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5" : ""}`}>
              {/* Accent bar */}
              <div
                className="h-1 w-full"
                style={{
                  background: isLive
                    ? "linear-gradient(90deg, rgba(139,92,246,0.6), rgba(139,92,246,0.15))"
                    : "var(--color-border)",
                }}
              />
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: isLive ? "rgba(139,92,246,0.1)" : "var(--color-accent)",
                        boxShadow: isLive ? "0 0 16px rgba(139,92,246,0.08)" : "none",
                      }}
                    >
                      <Icon size={18} className={isLive ? "text-primary" : "text-muted-foreground/50"} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-semibold text-foreground">{c.name}</span>
                        {isLive ? (
                          <Badge variant="default" className="text-[10px] py-0">New</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] py-0">Coming soon</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/50">{c.detail}</p>
                    </div>
                  </div>
                  {isLive && (
                    <ChevronRight
                      size={16}
                      className="text-muted-foreground/30 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                    />
                  )}
                </div>
              </div>
            </Card>
          );

          return isLive ? (
            <Link key={c.name} href={c.href} className="block group">
              {card}
            </Link>
          ) : (
            <div key={c.name} className="opacity-50 cursor-default">
              {card}
            </div>
          );
        })}
      </div>

      {/* Roadmap */}
      <div className="mt-8 text-center">
        <Sparkles size={16} className="mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">
          Push notifications, in-app messages, and multi-step sequences are on the roadmap.
        </p>
      </div>
    </div>
  );
}
