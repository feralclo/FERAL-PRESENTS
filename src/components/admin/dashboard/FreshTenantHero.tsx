"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  CreditCard,
  Palette,
  ArrowRight,
  Check,
} from "lucide-react";
import { useBranding } from "@/hooks/useBranding";
import { AdminPanel } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/**
 * FreshTenantHero — the dashboard's hero moment for orgs with zero events.
 *
 * Replaces the data shelf (RevenueHero / KPIs / funnel / spotlight / feed) when
 * there's no data to show. Matches the visual quality of `FinishSection.tsx`:
 * Display-typed greeting, accent halo, three deliberate next-step tiles.
 *
 * Each tile shows a real-time check status (Stripe connected? Logo set?), so
 * the hero rewards progress without becoming a status board. The detailed
 * checklist sits below — this is the moment, that is the list.
 *
 * Disappears the instant `event_count > 0`. The dashboard re-evaluates on
 * mount; we don't try to be reactive across deep changes.
 */

interface FreshTenantHeroProps {
  /** Stripe connection state — null while we're still loading. */
  stripeReady: boolean | null;
  /** True when a tenant logo has been uploaded. */
  hasLogo: boolean | null;
}

export function FreshTenantHero({ stripeReady, hasLogo }: FreshTenantHeroProps) {
  const branding = useBranding();
  const [firstName, setFirstName] = useState<string | null>(null);

  // Pull first_name from the wizard's saved state for the greeting. Fail
  // silently — the unnamed greeting reads fine ("Let's go live.") and the
  // hero is too central a surface to gate on a non-critical fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/state");
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const identityData = json?.state?.sections?.identity?.data as
          | { first_name?: string }
          | undefined;
        if (identityData?.first_name) setFirstName(identityData.first_name.trim());
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accent = branding.accent_color || "#8B5CF6";
  const greeting = firstName
    ? `Let's go live, ${firstName}.`
    : "Let's go live.";

  return (
    <AdminPanel className="relative overflow-hidden">
      <AccentHalo color={accent} />

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Welcome
          </div>
          <h1 className="mt-3 font-mono text-[28px] font-bold leading-[1.04] tracking-[-0.02em] text-foreground sm:text-[36px]">
            {greeting}
          </h1>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
            Three steps and you're selling tickets. Pick one — or do all three;
            they take a minute each.
          </p>
        </div>
      </div>

      <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
        <HeroTile
          href="/admin/events/"
          icon={<CalendarPlus />}
          title="Create your first event"
          description="Cover, tickets, lineup, the works."
          tone="primary"
        />
        <HeroTile
          href="/admin/payments/"
          icon={<CreditCard />}
          title="Connect payments"
          description={stripeReady ? "Ready to accept cards." : "Add bank details to take card payments."}
          done={stripeReady === true}
        />
        <HeroTile
          href="/admin/settings/branding/"
          icon={<Palette />}
          title="Customise your storefront"
          description={hasLogo ? "Logo set — fine-tune colours, fonts, copy." : "Add your logo and accent colour."}
          done={hasLogo === true}
        />
      </div>
    </AdminPanel>
  );
}

interface HeroTileProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Marks the tile as the primary action — slightly stronger border + accent halo on hover. */
  tone?: "primary" | "default";
  /** Show a green check overlay when the underlying action is already done. */
  done?: boolean;
}

function HeroTile({
  href,
  icon,
  title,
  description,
  tone = "default",
  done = false,
}: HeroTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-xl border bg-card/60 p-4 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60",
        tone === "primary"
          ? "border-primary/30 shadow-[0_0_0_1px_rgba(139,92,246,0.06)_inset] hover:border-primary/50 hover:shadow-[0_18px_36px_-18px_rgba(139,92,246,0.45)]"
          : "border-border/60 hover:border-primary/30",
        done && "opacity-95"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg ring-1 transition-colors duration-200 [&_svg]:size-4",
            tone === "primary"
              ? "bg-primary/10 text-primary ring-primary/20 group-hover:bg-primary/15"
              : "bg-foreground/[0.04] text-foreground/70 ring-border/50 group-hover:text-foreground"
          )}
          aria-hidden
        >
          {icon}
        </span>
        {done && (
          <span
            className="flex h-6 items-center gap-1 rounded-full bg-success/10 px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-success ring-1 ring-success/20"
            aria-label="Already done"
          >
            <Check size={10} strokeWidth={3} />
            Done
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold text-foreground">{title}</span>
          <ArrowRight
            size={13}
            className="-mt-0.5 shrink-0 text-muted-foreground/50 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </Link>
  );
}

/**
 * Tasteful one-shot accent halo behind the heading — same family as
 * FinishSection's halo. Fades from a 35% peak to a 14% steady state, then
 * holds. CSS-only so it doesn't burn the GPU on every dashboard mount.
 */
function AccentHalo({ color }: { color: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -left-16 -top-20 h-72 w-72 motion-safe:animate-[hero-halo_1.6s_ease-out_forwards] motion-reduce:opacity-25"
      style={{
        background: `radial-gradient(circle at center, ${color}55 0%, ${color}15 32%, transparent 65%)`,
        filter: "blur(40px)",
      }}
    >
      <style>{`
        @keyframes hero-halo {
          0%   { opacity: 0; transform: scale(0.6); }
          35%  { opacity: 1; transform: scale(1.05); }
          100% { opacity: 0.22; transform: scale(1.18); }
        }
      `}</style>
    </div>
  );
}
