"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/* ── Stat card ── */
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <span className="block font-mono text-[0.65rem] uppercase tracking-[2px] text-muted-foreground mb-2">
        {label}
      </span>
      <span className="block font-mono text-2xl font-bold text-foreground">{value}</span>
      {sub && <span className="block text-xs text-muted-foreground mt-1">{sub}</span>}
    </div>
  );
}

/* ── Channel card ── */
function ChannelCard({
  title,
  description,
  href,
  icon,
  templates,
  status,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  templates: { name: string; href: string; active: boolean }[];
  status: "live" | "coming-soon";
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-[#0e0e0e] border border-border">
            {icon}
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
        {templates.map((t) => (
          <Link
            key={t.name}
            href={t.href}
            className="flex items-center justify-between p-4 transition-colors hover:bg-[rgba(255,255,255,0.02)] group no-underline"
          >
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${t.active ? "bg-success" : "bg-muted-foreground/30"}`} />
              <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                {t.name}
              </span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground group-hover:text-foreground transition-colors">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Mail icon ── */
const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

/* ── Megaphone icon ── */
const MegaphoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default function CommunicationsPage() {
  const [resendStatus, setResendStatus] = useState<{
    configured: boolean;
    verified: boolean;
    loading: boolean;
  }>({ configured: false, verified: false, loading: true });

  const [emailEnabled, setEmailEnabled] = useState(false);

  useEffect(() => {
    // Check Resend connection
    fetch("/api/email/status")
      .then((r) => r.json())
      .then((json) => setResendStatus({ ...json, loading: false }))
      .catch(() => setResendStatus({ configured: false, verified: false, loading: false }));

    // Check if order emails are enabled
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
        <div className="rounded-lg border border-border bg-card p-5">
          <span className="block font-mono text-[0.65rem] uppercase tracking-[2px] text-muted-foreground mb-2">
            Connection
          </span>
          {resendStatus.loading ? (
            <span className="block text-sm text-muted-foreground">Checking...</span>
          ) : resendStatus.verified ? (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-success shadow-[0_0_6px_rgba(78,203,113,0.5)]" />
              <span className="font-mono text-sm font-bold text-success uppercase tracking-wider">
                Connected
              </span>
            </div>
          ) : resendStatus.configured ? (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-warning" />
              <span className="font-mono text-sm font-bold text-warning uppercase tracking-wider">
                Pending
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive" />
              <span className="font-mono text-sm font-bold text-destructive uppercase tracking-wider">
                Not Configured
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Channel sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChannelCard
          title="Transactional"
          description="Automated emails triggered by customer actions"
          href="/admin/communications/transactional/"
          icon={<MailIcon />}
          status="live"
          templates={[
            { name: "Order Confirmation", href: "/admin/communications/transactional/order-confirmation/", active: emailEnabled },
            { name: "Ticket Delivery", href: "/admin/communications/transactional/order-confirmation/", active: emailEnabled },
            { name: "Invoices", href: "/admin/communications/transactional/order-confirmation/", active: false },
          ]}
        />
        <ChannelCard
          title="Marketing"
          description="Campaigns and automated sequences"
          href="/admin/communications/marketing/"
          icon={<MegaphoneIcon />}
          status="coming-soon"
          templates={[
            { name: "Abandoned Cart", href: "/admin/communications/marketing/abandoned-cart/", active: false },
          ]}
        />
      </div>
    </div>
  );
}
