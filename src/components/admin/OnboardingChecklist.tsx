"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, X, ChevronRight, Sparkles, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { OnboardingWizardState } from "@/types/settings";

/**
 * Persistent onboarding checklist on the admin dashboard.
 *
 * Shows the items a tenant still has to address after the wizard. Each item
 * is dismissable. The whole widget hides when:
 *  - everything is complete, OR
 *  - all visible items have been dismissed by the user.
 *
 * State derived from:
 *  - /api/onboarding/state — wizard sections (completed / skipped)
 *  - /api/stripe/connect/my-account — Stripe health
 *  - /api/domains — pending domain status
 *  - /api/branding — branding completeness (logo present)
 *  - /api/events — has the tenant created an event?
 *
 * Dismissals persist in localStorage per-org.
 */

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href?: string;
  ctaLabel?: string;
  status: "ok" | "pending" | "warning";
}

interface DomainRow {
  id: string;
  hostname: string;
  status: string;
  type: string;
}

const DISMISSED_KEY_PREFIX = "entry_onboarding_dismissed:";

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

interface ChecklistState {
  loaded: boolean;
  orgId: string | null;
  wizard: OnboardingWizardState | null;
  stripeHealthy: boolean;
  customDomainPending: boolean;
  hasLogo: boolean;
  hasEvent: boolean;
  experience: "first-event" | "experienced" | "switching" | null;
}

export function OnboardingChecklist() {
  const [s, setState] = useState<ChecklistState>({
    loaded: false,
    orgId: null,
    wizard: null,
    stripeHealthy: false,
    customDomainPending: false,
    hasLogo: false,
    hasEvent: false,
    experience: null,
  });
  const [dismissed, setDismissedSet] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          stateRes,
          stripeRes,
          domainsRes,
          brandingRes,
          eventsRes,
        ] = await Promise.all([
          fetch("/api/onboarding/state").catch(() => null),
          fetch("/api/stripe/connect/my-account").catch(() => null),
          fetch("/api/domains").catch(() => null),
          fetch("/api/branding").catch(() => null),
          fetch("/api/events?limit=1").catch(() => null),
        ]);

        if (cancelled) return;

        const stateJson = stateRes?.ok ? await stateRes.json() : null;
        const stripeJson = stripeRes?.ok ? await stripeRes.json() : null;
        const domainsJson = domainsRes?.ok ? await domainsRes.json() : null;
        const brandingJson = brandingRes?.ok ? await brandingRes.json() : null;
        const eventsJson = eventsRes?.ok ? await eventsRes.json() : null;

        const orgId = stateJson?.org_id ?? null;
        const wizard: OnboardingWizardState | null = stateJson?.state ?? null;
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

        setState({
          loaded: true,
          orgId,
          wizard,
          stripeHealthy,
          customDomainPending,
          hasLogo,
          hasEvent,
          experience: (wizard?.experience_level as ChecklistState["experience"]) ?? null,
        });

        if (orgId) setDismissedSet(getDismissed(orgId));
      } catch {
        if (!cancelled) setState((prev) => ({ ...prev, loaded: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items: ChecklistItem[] = useMemo(() => {
    const items: ChecklistItem[] = [];

    if (!s.stripeHealthy) {
      const paymentsSkipped = s.wizard?.sections?.payments?.skipped === true;
      const isExternal =
        (s.wizard?.sections?.payments?.data as { method?: string } | undefined)?.method ===
        "external";
      if (!isExternal) {
        items.push({
          id: "stripe",
          label: paymentsSkipped ? "Set up payments" : "Finish your Stripe setup",
          description:
            "You'll need this before publishing events that take card payments.",
          href: "/admin/payments/",
          ctaLabel: "Set up Stripe",
          status: paymentsSkipped ? "pending" : "warning",
        });
      }
    }

    if (s.customDomainPending) {
      items.push({
        id: "domain",
        label: "Verify your custom domain",
        description: "Add the DNS record at your registrar — we check every 15 minutes.",
        href: "/admin/settings/domains/",
        ctaLabel: "View instructions",
        status: "pending",
      });
    }

    if (!s.hasLogo) {
      items.push({
        id: "logo",
        label: "Add your logo",
        description: "Upload a logo so your event pages, emails and wallet passes look like yours.",
        href: "/admin/settings/branding/",
        ctaLabel: "Upload logo",
        status: "pending",
      });
    }

    if (!s.hasEvent) {
      items.push({
        id: "event",
        label: "Create your first event",
        description: "You're three fields away from a draft event you can preview and share.",
        href: "/admin/events/",
        ctaLabel: "Create event",
        status: "pending",
      });
    }

    return items;
  }, [s]);

  if (!s.loaded || !s.orgId) return null;

  const visibleItems = items.filter((item) => !dismissed.has(item.id));
  if (visibleItems.length === 0) return null;

  const totalCount = items.length;
  const remainingCount = visibleItems.length;
  const compactTone = s.experience === "experienced";

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
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/[0.02]"
        aria-expanded={!collapsed}
      >
        <Sparkles size={18} className="shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {compactTone ? "A few things to finish" : "Finish setting up"}
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {totalCount - remainingCount}/{totalCount}
            </span>
          </div>
          {!compactTone && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {remainingCount} item{remainingCount === 1 ? "" : "s"} left to wrap up your setup.
            </p>
          )}
        </div>
        {collapsed ? (
          <ChevronDown size={16} className="text-muted-foreground" />
        ) : (
          <ChevronUp size={16} className="text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <ul className="divide-y divide-border/50 border-t border-border/50">
          {visibleItems.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  item.status === "ok"
                    ? "bg-success/15 text-success"
                    : item.status === "warning"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-warning/15 text-warning"
                }`}
              >
                {item.status === "ok" ? (
                  <Check size={11} strokeWidth={3} />
                ) : item.status === "warning" ? (
                  <AlertTriangle size={10} />
                ) : (
                  <span className="block h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{item.label}</div>
                {!compactTone && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
              {item.href && (
                <Link
                  href={item.href}
                  className="shrink-0 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  {item.ctaLabel ?? "Open"}
                  <ChevronRight size={12} className="-mr-1 ml-0.5 inline" />
                </Link>
              )}
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
                aria-label={`Dismiss ${item.label}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
