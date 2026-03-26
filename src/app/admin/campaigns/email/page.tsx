"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Ticket,
  Clock,
  Gift,
  Sparkles,
  Mail,
} from "lucide-react";

const PLAYBOOKS = [
  {
    id: "guest-list-outreach",
    title: "Guest List Outreach",
    description: "Drive applications to your guest list with an exclusive, high-converting email. Perfect for filling events with a curated audience.",
    href: "/admin/campaigns/email/guest-list-outreach/",
    icon: ClipboardCheck,
    status: "live" as const,
    tag: "High conversion",
    tagColor: "text-emerald-400",
  },
  {
    id: "last-chance",
    title: "Last Chance Tickets",
    description: "Create urgency with a final-call email for events with limited remaining capacity. Drives FOMO and last-minute sales.",
    href: "#",
    icon: Clock,
    status: "coming-soon" as const,
    tag: "Urgency",
    tagColor: "text-amber-400",
  },
  {
    id: "early-bird",
    title: "Early Bird Announcement",
    description: "Reward your most loyal fans with early access to tickets before the general sale opens.",
    href: "#",
    icon: Ticket,
    status: "coming-soon" as const,
    tag: "Loyalty",
    tagColor: "text-blue-400",
  },
  {
    id: "post-event",
    title: "Post-Event Thank You",
    description: "Follow up after an event with a thank-you email, photos, and a teaser for the next one.",
    href: "#",
    icon: Gift,
    status: "coming-soon" as const,
    tag: "Retention",
    tagColor: "text-purple-400",
  },
];

export default function EmailCampaignsPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/campaigns/"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors no-underline hover:text-foreground"
        >
          <ChevronLeft size={14} /> Campaigns
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Mail size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="font-mono text-base font-semibold tracking-wider text-foreground uppercase">
              Email Campaigns
            </h1>
            <p className="text-xs text-muted-foreground">
              Choose a proven playbook to create your campaign.
            </p>
          </div>
        </div>
      </div>

      {/* Playbook cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PLAYBOOKS.map((p) => {
          const Icon = p.icon;
          const isLive = p.status === "live";

          const card = (
            <Card
              className={`group overflow-hidden transition-all duration-200 ${
                isLive ? "hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5" : ""
              }`}
            >
              {/* Top accent */}
              <div
                className="h-1 w-full transition-all duration-300"
                style={{
                  background: isLive
                    ? "linear-gradient(90deg, rgba(139,92,246,0.6), rgba(139,92,246,0.2))"
                    : "var(--color-border)",
                }}
              />

              <div className="p-5">
                {/* Icon + badges row */}
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl transition-all"
                    style={{
                      backgroundColor: isLive ? "rgba(139,92,246,0.1)" : "var(--color-accent)",
                      boxShadow: isLive ? "0 0 16px rgba(139,92,246,0.1)" : "none",
                    }}
                  >
                    <Icon size={18} className={isLive ? "text-primary" : "text-muted-foreground/50"} />
                  </div>
                  <div className="flex items-center gap-2">
                    {isLive ? (
                      <Badge variant="default" className="text-[10px] py-0">Ready</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] py-0">Coming soon</Badge>
                    )}
                  </div>
                </div>

                {/* Title + tag */}
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-foreground">{p.title}</h3>
                  <span className={`text-[9px] font-bold uppercase tracking-[1px] ${p.tagColor}`}>
                    {p.tag}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  {p.description}
                </p>

                {/* CTA row */}
                {isLive && (
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <span className="text-[11px] font-medium text-primary">Create campaign</span>
                    <ChevronRight
                      size={14}
                      className="text-primary/50 transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </div>
                )}
              </div>
            </Card>
          );

          return isLive ? (
            <Link key={p.id} href={p.href} className="block">
              {card}
            </Link>
          ) : (
            <div key={p.id} className="opacity-50 cursor-default">
              {card}
            </div>
          );
        })}
      </div>

      {/* Bottom hint */}
      <div className="mt-8 text-center">
        <Sparkles size={16} className="mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">
          More playbooks are being designed. Each one comes with proven copy, beautiful templates, and smart audience targeting.
        </p>
      </div>
    </div>
  );
}
