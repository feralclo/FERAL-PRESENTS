"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Mail,
  Megaphone,
  ChevronRight,
  Wifi,
  WifiOff,
  AlertCircle,
  FileText,
  Send,
  Receipt,
  ShoppingCart,
} from "lucide-react";

/* ── Stat card ── */
function StatCard({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value?: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <span className="block font-mono text-[0.65rem] uppercase tracking-[2px] text-muted-foreground mb-2">
        {label}
      </span>
      {value && (
        <span className="block font-mono text-2xl font-bold text-foreground">{value}</span>
      )}
      {sub && <span className="block text-xs text-muted-foreground mt-1">{sub}</span>}
      {children}
    </div>
  );
}

/* ── Channel card ── */
function ChannelCard({
  title,
  description,
  icon: Icon,
  templates,
  status,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  templates: { name: string; href: string; active: boolean; icon: React.ComponentType<{ size?: number; className?: string }> }[];
  status: "live" | "coming-soon";
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-[#0e0e0e] border border-border">
            <Icon size={18} strokeWidth={1.8} className="text-primary" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold tracking-wider text-foreground uppercase">
              {title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        {status === "live" ? (
          <span className="flex items-center gap-1.5 font-mono text-[0.65rem] tracking-wider text-success uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Live
          </span>
        ) : (
          <span className="font-mono text-[0.65rem] tracking-wider text-muted-foreground uppercase">
            Coming Soon
          </span>
        )}
      </div>

      {/* Template list */}
      <div className="divide-y divide-border">
        {templates.map((t) => {
          const TIcon = t.icon;
          return (
            <Link
              key={t.name}
              href={t.href}
              className="flex items-center justify-between p-4 transition-colors hover:bg-[rgba(255,255,255,0.02)] group no-underline"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${t.active ? "bg-success" : "bg-muted-foreground/30"}`} />
                <TIcon size={15} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                  {t.name}
                </span>
              </div>
              <ChevronRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function CommunicationsPage() {
  const [resendStatus, setResendStatus] = useState<{
    configured: boolean;
    verified: boolean;
    loading: boolean;
  }>({ configured: false, verified: false, loading: true });

  const [emailEnabled, setEmailEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/email/status")
      .then((r) => r.json())
      .then((json) => setResendStatus({ ...json, loading: false }))
      .catch(() => setResendStatus({ configured: false, verified: false, loading: false }));

    fetch("/api/settings?key=feral_email")
      .then((r) => r.json())
      .then((json) => {
        if (json?.data?.order_confirmation_enabled) setEmailEnabled(true);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-mono text-lg font-bold tracking-[3px] text-foreground uppercase mb-1">
          Communications
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage all customer communications — transactional emails, marketing automation, and templates.
        </p>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Email Provider"
          value={resendStatus.loading ? "..." : resendStatus.verified ? "Resend" : "Not Set"}
          sub={resendStatus.verified ? "Domain verified" : resendStatus.configured ? "Domain pending" : "Configure in environment"}
        />
        <StatCard
          label="Active Templates"
          value={emailEnabled ? "1" : "0"}
          sub="Order Confirmation"
        />
        <StatCard
          label="Channels"
          value="1"
          sub="Email"
        />
        <StatCard label="Connection">
          {resendStatus.loading ? (
            <span className="block text-sm text-muted-foreground">Checking...</span>
          ) : resendStatus.verified ? (
            <div className="flex items-center gap-2">
              <Wifi size={16} className="text-success" />
              <span className="font-mono text-sm font-bold text-success uppercase tracking-wider">
                Connected
              </span>
            </div>
          ) : resendStatus.configured ? (
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-warning" />
              <span className="font-mono text-sm font-bold text-warning uppercase tracking-wider">
                Pending
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <WifiOff size={16} className="text-destructive" />
              <span className="font-mono text-sm font-bold text-destructive uppercase tracking-wider">
                Not Configured
              </span>
            </div>
          )}
        </StatCard>
      </div>

      {/* Channel sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChannelCard
          title="Transactional"
          description="Automated emails triggered by customer actions"
          icon={Mail}
          status="live"
          templates={[
            { name: "Order Confirmation", href: "/admin/communications/transactional/order-confirmation/", active: emailEnabled, icon: FileText },
            { name: "Ticket Delivery", href: "/admin/communications/transactional/order-confirmation/", active: emailEnabled, icon: Send },
            { name: "Invoices", href: "/admin/communications/transactional/order-confirmation/", active: false, icon: Receipt },
          ]}
        />
        <ChannelCard
          title="Marketing"
          description="Campaigns and automated sequences"
          icon={Megaphone}
          status="coming-soon"
          templates={[
            { name: "Abandoned Cart", href: "/admin/communications/marketing/abandoned-cart/", active: false, icon: ShoppingCart },
          ]}
        />
      </div>
    </div>
  );
}
