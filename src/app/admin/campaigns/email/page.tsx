"use client";

import { useState, useEffect } from "react";
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
  BarChart3,
  Send,
  Eye,
  MousePointerClick,
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
            <h1 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.005em] text-foreground">
              Email Campaigns
            </h1>
            <p className="text-xs text-muted-foreground">
              Choose a proven playbook to create your campaign.
            </p>
          </div>
        </div>
      </div>

      {/* Live playbook — hero card */}
      {PLAYBOOKS.filter((p) => p.status === "live").map((p) => {
        const Icon = p.icon;
        return (
          <Link key={p.id} href={p.href} className="block group">
            <Card className="overflow-hidden transition-all duration-200 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
              <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.6), rgba(139,92,246,0.15))" }} />
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10" style={{ boxShadow: "0 0 20px rgba(139,92,246,0.12)" }}>
                    <Icon size={22} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 mb-1">
                      <h3 className="text-[15px] font-semibold text-foreground">{p.title}</h3>
                      <span className={`text-[9px] font-bold uppercase tracking-[1px] ${p.tagColor}`}>{p.tag}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                    <div className="flex items-center gap-1.5 mt-3 text-[12px] font-medium text-primary">
                      Create campaign
                      <ChevronRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}

      {/* Coming soon — compact list, not heavy cards */}
      <div className="mt-6">
        <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground/40 mb-3">Coming soon</p>
        <div className="space-y-2">
          {PLAYBOOKS.filter((p) => p.status === "coming-soon").map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border/50 px-4 py-3">
                <Icon size={15} className="shrink-0 text-muted-foreground/30" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground/50">{p.title}</span>
                    <span className={`text-[8px] font-bold uppercase tracking-[1px] opacity-50 ${p.tagColor}`}>{p.tag}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/30 mt-0.5">{p.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Recent campaigns */}
      <RecentCampaigns />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   RECENT CAMPAIGNS — sent history with stats
   ═══════════════════════════════════════════════════════════ */
function RecentCampaigns() {
  interface SendRecord { id: string; type: string; event_name: string; sent_at: string; sent_count: number; opens: number; clicks: number }
  const [sends, setSends] = useState<SendRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/campaigns/sends")
      .then((r) => r.json())
      .then((j) => setSends(j.sends || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || sends.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={13} className="text-primary" />
        <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground/60">Recent campaigns</p>
      </div>
      <div className="space-y-2">
        {sends.slice(0, 10).map((send) => {
          const openRate = send.sent_count > 0 ? Math.round((send.opens / send.sent_count) * 100) : 0;
          const clickRate = send.sent_count > 0 ? Math.round((send.clicks / send.sent_count) * 100) : 0;
          const sentDate = new Date(send.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
          return (
            <Card key={send.id} className="overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ClipboardCheck size={12} className="shrink-0 text-primary/60" />
                    <span className="text-[13px] font-medium text-foreground truncate">{send.event_name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/40 shrink-0 ml-2">{sentDate}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Send size={10} className="text-muted-foreground/40" />
                    <span className="text-[11px] tabular-nums text-muted-foreground">{send.sent_count}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Eye size={10} className="text-blue-400/60" />
                    <span className="text-[11px] tabular-nums text-muted-foreground">{openRate}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MousePointerClick size={10} className="text-emerald-400/60" />
                    <span className="text-[11px] tabular-nums text-muted-foreground">{clickRate}%</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
