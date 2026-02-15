"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ShoppingCart,
  Clock,
  Paintbrush,
  Tag,
  ToggleRight,
  MailWarning,
  RefreshCw,
  TrendingUp,
  DollarSign,
  ExternalLink,
} from "lucide-react";

interface AbandonedCartStats {
  total: number;
  abandoned: number;
  recovered: number;
  total_value: number;
  recovered_value: number;
}

function formatCurrency(amount: number) {
  return `£${Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AbandonedCartPage() {
  const [stats, setStats] = useState<AbandonedCartStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/abandoned-carts?limit=1");
      const json = await res.json();
      if (json.stats) setStats(json.stats);
    } catch {
      // Silent fail
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const features = [
    { label: "Configurable delay (30min, 1hr, 24hr)", icon: Clock },
    { label: "Customizable email template", icon: Paintbrush },
    { label: "Discount code support", icon: Tag },
    { label: "Per-event enable/disable", icon: ToggleRight },
  ];

  const recoveryRate = stats && stats.total > 0
    ? ((stats.recovered / stats.total) * 100).toFixed(1)
    : "0";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/admin/communications/marketing/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors no-underline mb-3"
        >
          <ChevronLeft size={14} />
          Marketing
        </Link>
        <h1 className="font-mono text-base font-semibold tracking-wider text-foreground uppercase">
          Abandoned Cart Recovery
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automatically email customers who added tickets to their cart but didn&apos;t complete checkout.
        </p>
      </div>

      {/* Live Stats from real data */}
      {!loading && stats && stats.total > 0 && (
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              label="Awaiting Email"
              value={stats.abandoned.toString()}
              icon={MailWarning}
              detail="Carts not yet contacted"
            />
            <StatCard
              label="Recovered"
              value={stats.recovered.toString()}
              icon={RefreshCw}
              detail={`${formatCurrency(stats.recovered_value)} recovered`}
            />
            <StatCard
              label="Recovery Rate"
              value={`${recoveryRate}%`}
              icon={TrendingUp}
              detail={`${stats.recovered} of ${stats.total} carts`}
            />
            <StatCard
              label="Potential Revenue"
              value={formatCurrency(stats.total_value)}
              icon={DollarSign}
              detail="From abandoned carts"
            />
          </div>

          {/* Link to abandoned carts list */}
          <Link
            href="/admin/abandoned-carts/"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            View all abandoned carts
            <ExternalLink size={11} />
          </Link>
        </div>
      )}

      {/* Awaiting email recovery indicator */}
      {!loading && stats && stats.abandoned > 0 && (
        <Card className="mb-6 border-amber-500/20">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
              <MailWarning size={18} className="text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {stats.abandoned} cart{stats.abandoned !== 1 ? "s" : ""} awaiting recovery email
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatCurrency(stats.total_value)} in potential revenue. Set up automated recovery emails below to recover lost sales.
              </p>
            </div>
            <Badge variant="warning" className="shrink-0 text-[10px] font-semibold uppercase">
              Action needed
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Email automation config — coming soon */}
      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShoppingCart size={15} className="text-muted-foreground" />
            Email Automation
            <Badge variant="secondary" className="text-[9px] uppercase">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-8">
              Automated recovery emails will detect abandoned carts and send timed reminder emails to bring customers back to complete their purchase.
            </p>
            <div className="flex flex-col gap-3 max-w-xs mx-auto text-left">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.label} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Icon size={14} className="text-primary/50 shrink-0" />
                    <span>{feature.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
