"use client";

import Link from "next/link";
import { ExternalLink, BarChart3, Pencil, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Three-tab strip used at the top of both /admin/events/[slug]/ (the
 * editor) and /admin/events/[slug]/overview/ (the analytics page).
 *
 * Overview / Edit are routes; Public preview is an external link to
 * the live event page so the host can see what buyers see. Public
 * preview opens in a new tab — we never want a click here to lose
 * the host's editor state.
 */

type ActiveTab = "overview" | "edit";

interface EventViewTabsProps {
  slug: string;
  active: ActiveTab;
  /** Whether the public-preview link should open the announcement /
   *  queue / tickets variant. Mirrors the EventEditorHeader logic. */
  showAnnouncementHint?: boolean;
}

export function EventViewTabs({
  slug,
  active,
}: EventViewTabsProps) {
  const overviewHref = `/admin/events/${slug}/overview/`;
  const editHref = `/admin/events/${slug}/`;
  const previewHref = `/event/${slug}/?t=${Date.now()}`;

  return (
    <nav
      aria-label="Event sections"
      className="inline-flex items-center gap-1 rounded-lg border border-border/40 bg-card/40 p-0.5"
    >
      <Tab href={overviewHref} active={active === "overview"} icon={<BarChart3 size={13} />}>
        Overview
      </Tab>
      <Tab href={editHref} active={active === "edit"} icon={<Pencil size={13} />}>
        Edit
      </Tab>
      <a
        href={previewHref}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground/85 transition-colors",
          "hover:bg-foreground/[0.04] hover:text-foreground",
          "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1"
        )}
      >
        <Eye size={13} />
        Public
        <ExternalLink size={10} className="opacity-60" />
      </a>
    </nav>
  );
}

function Tab({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1",
        active
          ? "bg-foreground/[0.06] text-foreground"
          : "text-muted-foreground/85 hover:bg-foreground/[0.04] hover:text-foreground"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
