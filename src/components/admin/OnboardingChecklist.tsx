"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  X,
  ChevronRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Calendar,
  Globe,
  Image as ImageIcon,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Persistent setup checklist on the admin dashboard.
 *
 * Surfaces the items a tenant still has to address after the 3-step
 * wizard. Each item links to the real admin surface (no parallel
 * wizard-style flow) and is dismissible. The whole widget hides when
 * everything is complete or every visible item has been dismissed.
 *
 * State is derived purely from live system signals — we don't trust the
 * wizard's local state for completion. Detection sources:
 *  - /api/stripe/connect/my-account → connected + charges_enabled
 *  - /api/domains → custom domain status
 *  - /api/branding → logo presence
 *  - /api/events?limit=1 → at least one event exists
 *  - /api/team → team has more than just the owner
 *
 * Dismissals persist in localStorage per-org so a fresh login doesn't
 * resurrect items the user already chose to ignore.
 */

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  ctaLabel: string;
  icon: LucideIcon;
  priority?: boolean;
}

interface DomainRow {
  id: string;
  hostname: string;
  status: string;
  type: string;
}

const DISMISSED_KEY_PREFIX = "entry_onboarding_dismissed:";
const COLLAPSED_KEY_PREFIX = "entry_onboarding_collapsed:";

function getDismissed(orgId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY_PREFIX + orgId);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(orgId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_KEY_PREFIX + orgId, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function getCollapsed(orgId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY_PREFIX + orgId) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(orgId: string, collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (collapsed) {
      window.localStorage.setItem(COLLAPSED_KEY_PREFIX + orgId, "1");
    } else {
      window.localStorage.removeItem(COLLAPSED_KEY_PREFIX + orgId);
    }
  } catch {
    /* ignore */
  }
}

interface ChecklistState {
  loaded: boolean;
  orgId: string | null;
  stripeHealthy: boolean;
  customDomainPending: boolean;
  hasLogo: boolean;
  hasEvent: boolean;
  hasTeammates: boolean;
}

export function OnboardingChecklist() {
  const [s, setState] = useState<ChecklistState>({
    loaded: false,
    orgId: null,
    stripeHealthy: false,
    customDomainPending: false,
    hasLogo: false,
    hasEvent: false,
    hasTeammates: false,
  });
  const [dismissed, setDismissedSet] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [stateRes, stripeRes, domainsRes, brandingRes, eventsRes, teamRes] =
          await Promise.all([
            fetch("/api/onboarding/state").catch(() => null),
            fetch("/api/stripe/connect/my-account").catch(() => null),
            fetch("/api/domains").catch(() => null),
            fetch("/api/branding").catch(() => null),
            fetch("/api/events?limit=1").catch(() => null),
            fetch("/api/team").catch(() => null),
          ]);

        if (cancelled) return;

        const stateJson = stateRes?.ok ? await stateRes.json() : null;
        const stripeJson = stripeRes?.ok ? await stripeRes.json() : null;
        const domainsJson = domainsRes?.ok ? await domainsRes.json() : null;
        const brandingJson = brandingRes?.ok ? await brandingRes.json() : null;
        const eventsJson = eventsRes?.ok ? await eventsRes.json() : null;
        const teamJson = teamRes?.ok ? await teamRes.json() : null;

        const orgId = stateJson?.org_id ?? null;
        const stripeHealthy = !!stripeJson?.connected && !!stripeJson?.charges_enabled;
        const domainsArr = (domainsJson?.data ?? domainsJson?.domains ?? domainsJson) as
          | DomainRow[]
          | null;
        const customDomainPending = Array.isArray(domainsArr)
          ? domainsArr.some((d) => d.type === "custom" && d.status === "pending")
          : false;
        const branding = brandingJson?.data ?? brandingJson;
        const hasLogo = !!branding?.logo_url;
        const eventsArr = eventsJson?.data ?? eventsJson?.events ?? eventsJson;
        const hasEvent = Array.isArray(eventsArr) && eventsArr.length > 0;
        const teamArr = (teamJson?.data ?? teamJson?.members ?? teamJson) as
          | Array<{ status?: string }>
          | null;
        const hasTeammates = Array.isArray(teamArr)
          ? teamArr.filter((m) => m?.status === "active" || m?.status === "invited").length > 1
          : false;

        setState({
          loaded: true,
          orgId,
          stripeHealthy,
          customDomainPending,
          hasLogo,
          hasEvent,
          hasTeammates,
        });

        if (orgId) {
          setDismissedSet(getDismissed(orgId));
          setCollapsed(getCollapsed(orgId));
        }
      } catch {
        if (!cancelled) setState((prev) => ({ ...prev, loaded: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items: ChecklistItem[] = useMemo(() => {
    const out: ChecklistItem[] = [];

    if (!s.stripeHealthy) {
      out.push({
        id: "stripe",
        icon: CreditCard,
        label: "Connect Stripe",
        description:
          "Add your bank details and verify your business so you can take card payments.",
        href: "/admin/payments/",
        ctaLabel: "Set up payments",
        priority: true,
      });
    }

    if (!s.hasEvent) {
      out.push({
        id: "event",
        icon: Calendar,
        label: "Create your first event",
        description:
          "Cover artwork, ticket types, lineup — the editor has everything you need.",
        href: "/admin/events/",
        ctaLabel: "Open editor",
      });
    }

    if (s.customDomainPending) {
      out.push({
        id: "domain",
        icon: Globe,
        label: "Verify your custom domain",
        description:
          "Add the DNS record at your registrar. We re-check every 15 minutes and email you when it's live.",
        href: "/admin/settings/domains/",
        ctaLabel: "View instructions",
      });
    }

    if (!s.hasLogo) {
      out.push({
        id: "logo",
        icon: ImageIcon,
        label: "Add your logo",
        description:
          "Shows up on event pages, emails, wallet passes — anywhere buyers see your brand.",
        href: "/admin/settings/branding/",
        ctaLabel: "Upload logo",
      });
    }

    if (!s.hasTeammates) {
      out.push({
        id: "team",
        icon: Users,
        label: "Invite your team",
        description:
          "Add scanners, marketers, anyone who'll help you run events. Optional.",
        href: "/admin/settings/users/",
        ctaLabel: "Invite",
      });
    }

    return out;
  }, [s]);

  if (!s.loaded || !s.orgId) return null;

  const visibleItems = items.filter((item) => !dismissed.has(item.id));
  if (visibleItems.length === 0) return null;

  const totalCount = items.length;
  const remainingCount = visibleItems.length;
  const completedCount = totalCount - remainingCount;

  function dismiss(id: string) {
    if (!s.orgId) return;
    const next = new Set(dismissed);
    next.add(id);
    setDismissedSet(next);
    saveDismissed(s.orgId, next);
  }

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
      <button
        type="button"
        onClick={() => {
          setCollapsed((c) => {
            const next = !c;
            if (s.orgId) saveCollapsed(s.orgId, next);
            return next;
          });
        }}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-primary/[0.025]"
        aria-expanded={!collapsed}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
          <Sparkles size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Finish setting up</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
              {completedCount}/{totalCount}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {remainingCount} {remainingCount === 1 ? "thing" : "things"} left to wrap up your setup.
          </p>
        </div>
        {collapsed ? (
          <ChevronDown size={16} className="text-muted-foreground" />
        ) : (
          <ChevronUp size={16} className="text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <ul className="divide-y divide-border/40 border-t border-border/40">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id} className="flex items-start gap-3 px-5 py-4">
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    item.priority
                      ? "bg-primary/10 text-primary ring-1 ring-primary/15"
                      : "bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <Icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-foreground">{item.label}</div>
                    {item.priority && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-primary">
                        First
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <Link
                  href={item.href}
                  className="shrink-0 self-center rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary transition-all hover:border-primary/50 hover:bg-primary/10"
                >
                  {item.ctaLabel}
                  <ChevronRight size={12} className="-mr-1 ml-0.5 inline" />
                </Link>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="shrink-0 self-center rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted/20 hover:text-foreground"
                  aria-label={`Dismiss ${item.label}`}
                >
                  <X size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
