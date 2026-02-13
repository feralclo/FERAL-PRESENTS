"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Megaphone,
  ChevronRight,
  Wifi,
  WifiOff,
  AlertTriangle,
  FileText,
  Receipt,
  ShoppingCart,
  Smartphone,
} from "lucide-react";

/* ── Stat card ── */
function StatCard({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value?: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="group relative overflow-hidden">
      <CardContent className="p-5">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
          {label}
        </p>
        {value && (
          <p className="mt-2 font-mono text-2xl font-bold tracking-wide text-foreground">
            {value}
          </p>
        )}
        {children}
        {detail && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">{detail}</p>
        )}
      </CardContent>
      {/* Subtle accent line at top */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </Card>
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
  templates: {
    name: string;
    href: string;
    active: boolean;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[];
  status: "live" | "coming-soon";
}) {
  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 pb-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
            <Icon size={18} strokeWidth={1.75} className="text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {status === "live" ? (
          <Badge variant="success" className="text-[10px] font-semibold">Live</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] font-semibold">Soon</Badge>
        )}
      </div>

      {/* Template rows */}
      <div className="border-t border-border">
        {templates.map((t, i) => {
          const TIcon = t.icon;
          return (
            <Link
              key={t.name}
              href={t.href}
              className={`group flex items-center justify-between px-5 py-3.5 transition-colors duration-150 hover:bg-accent/40 ${
                i < templates.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`block h-1.5 w-1.5 rounded-full ${
                    t.active
                      ? "bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                      : "bg-muted-foreground/20"
                  }`}
                />
                <TIcon
                  size={14}
                  className="text-muted-foreground/60 transition-colors duration-150 group-hover:text-foreground"
                />
                <span className="text-[13px] font-medium text-foreground/80 transition-colors duration-150 group-hover:text-foreground">
                  {t.name}
                </span>
              </div>
              <ChevronRight
                size={14}
                className="text-muted-foreground/30 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
              />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════
   COMMUNICATIONS PAGE
   ════════════════════════════════════════════════════════ */
export default function CommunicationsPage() {
  const [resendStatus, setResendStatus] = useState<{
    configured: boolean;
    verified: boolean;
    loading: boolean;
  }>({ configured: false, verified: false, loading: true });

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [walletEnabled, setWalletEnabled] = useState(false);

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

    fetch("/api/settings?key=feral_wallet_passes")
      .then((r) => r.json())
      .then((json) => {
        if (json?.data?.apple_wallet_enabled || json?.data?.google_wallet_enabled) setWalletEnabled(true);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Email Provider"
          value={resendStatus.loading ? "..." : resendStatus.verified ? "Resend" : "Not Set"}
          detail={
            resendStatus.verified
              ? "Domain verified"
              : resendStatus.configured
                ? "Domain pending verification"
                : "Configure in environment"
          }
        />

        <StatCard
          label="Active Templates"
          value={emailEnabled ? "1" : "0"}
          detail="Order Confirmation"
        />

        <StatCard
          label="Channels"
          value="1"
          detail="Email"
        />

        <StatCard label="Connection">
          {resendStatus.loading ? (
            <p className="mt-2 text-sm text-muted-foreground">Checking...</p>
          ) : resendStatus.verified ? (
            <div className="mt-2 flex items-center gap-2">
              <Wifi size={15} className="text-success" />
              <span className="font-mono text-sm font-bold uppercase tracking-wider text-success">
                Connected
              </span>
            </div>
          ) : resendStatus.configured ? (
            <div className="mt-2 flex items-center gap-2">
              <AlertTriangle size={15} className="text-warning" />
              <span className="font-mono text-sm font-bold uppercase tracking-wider text-warning">
                Pending
              </span>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <WifiOff size={15} className="text-destructive" />
              <span className="font-mono text-sm font-bold uppercase tracking-wider text-destructive">
                Not Configured
              </span>
            </div>
          )}
        </StatCard>
      </div>

      {/* Channel sections */}
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChannelCard
          title="Transactional"
          description="Automated emails triggered by customer actions"
          icon={Mail}
          status="live"
          templates={[
            { name: "Order Confirmation", href: "/admin/communications/transactional/order-confirmation/", active: emailEnabled, icon: FileText },
            { name: "PDF Ticket", href: "/admin/communications/transactional/pdf-ticket/", active: true, icon: Receipt },
            { name: "Wallet Passes", href: "/admin/communications/transactional/wallet-passes/", active: walletEnabled, icon: Smartphone },
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
