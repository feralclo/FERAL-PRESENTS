"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Megaphone,
  ChevronRight,
  Wifi,
  WifiOff,
  AlertTriangle,
  FileText,
  Send,
  Receipt,
  ShoppingCart,
} from "lucide-react";

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
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10">
              <Icon size={18} strokeWidth={1.75} className="text-primary" />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
          </div>
          {status === "live" ? (
            <Badge variant="success" className="text-[10px]">Live</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">Soon</Badge>
          )}
        </div>
      </CardHeader>
      <div className="border-t border-border">
        {templates.map((t, i) => {
          const TIcon = t.icon;
          return (
            <Link
              key={t.name}
              href={t.href}
              className={`flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-accent/50 group no-underline ${
                i < templates.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    t.active ? "bg-success shadow-[0_0_4px_rgba(34,197,94,0.6)]" : "bg-muted-foreground/20"
                  }`}
                />
                <TIcon size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="text-[13px] text-foreground group-hover:text-primary transition-colors">
                  {t.name}
                </span>
              </div>
              <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            </Link>
          );
        })}
      </div>
    </Card>
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
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Email Provider</p>
            <p className="font-mono text-xl font-bold text-foreground tracking-wide">
              {resendStatus.loading ? "..." : resendStatus.verified ? "Resend" : "Not Set"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {resendStatus.verified ? "Domain verified" : resendStatus.configured ? "Domain pending" : "Configure in environment"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Active Templates</p>
            <p className="font-mono text-xl font-bold text-foreground tracking-wide">{emailEnabled ? "1" : "0"}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Order Confirmation</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Channels</p>
            <p className="font-mono text-xl font-bold text-foreground tracking-wide">1</p>
            <p className="text-[11px] text-muted-foreground mt-1">Email</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Connection</p>
            {resendStatus.loading ? (
              <p className="text-sm text-muted-foreground">Checking...</p>
            ) : resendStatus.verified ? (
              <div className="flex items-center gap-2 mt-1">
                <Wifi size={15} className="text-success" />
                <span className="font-mono text-sm font-bold text-success uppercase tracking-wider">Connected</span>
              </div>
            ) : resendStatus.configured ? (
              <div className="flex items-center gap-2 mt-1">
                <AlertTriangle size={15} className="text-warning" />
                <span className="font-mono text-sm font-bold text-warning uppercase tracking-wider">Pending</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <WifiOff size={15} className="text-destructive" />
                <span className="font-mono text-sm font-bold text-destructive uppercase tracking-wider">Not Configured</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Channel sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
