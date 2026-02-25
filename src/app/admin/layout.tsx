"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useBranding } from "@/hooks/useBranding";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import "@/styles/tailwind.css";
import "@/styles/admin.css";
import {
  LayoutDashboard,
  CalendarDays,
  FileText,
  Users,
  ClipboardCheck,
  MessageSquare,
  Activity,
  Mail,
  Settings,
  LogOut,
  PanelLeft,
  X,
  ChevronsUpDown,
  ChevronRight,
  User as UserIcon,
  Receipt,
  Search,
  Package,
  Store,
  Tags,
  UsersRound,
  Mic2,
  Shield,
  TrendingUp,
} from "lucide-react";

/* ── Navigation grouped into sections ── */

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  children?: { href: string; label: string }[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Dashboard",
    items: [
      { href: "/admin/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Events",
    items: [
      { href: "/admin/events/", label: "All Events", icon: CalendarDays },
      { href: "/admin/artists/", label: "Artists", icon: Mic2 },
      { href: "/admin/guest-list/", label: "Guest List", icon: ClipboardCheck },
    ],
  },
  {
    label: "Commerce",
    items: [
      {
        href: "/admin/orders/",
        label: "Orders",
        icon: FileText,
        children: [
          { href: "/admin/orders/", label: "All Orders" },
          { href: "/admin/abandoned-carts/", label: "Abandoned Carts" },
        ],
      },
      { href: "/admin/customers/", label: "Customers", icon: Users },
      { href: "/admin/discounts/", label: "Discounts", icon: Tags },
      { href: "/admin/merch/", label: "Merch", icon: Package },
      {
        href: "/admin/homepage/",
        label: "Storefront",
        icon: Store,
        children: [
          { href: "/admin/homepage/", label: "Homepage" },
          { href: "/admin/event-page/", label: "Event Page" },
          { href: "/admin/ticketstore/", label: "Themes" },
        ],
      },
    ],
  },
  {
    label: "Growth",
    items: [
      {
        href: "/admin/traffic/",
        label: "Analytics",
        icon: TrendingUp,
        children: [
          { href: "/admin/traffic/", label: "Traffic" },
          { href: "/admin/popup/", label: "Popup" },
        ],
      },
      { href: "/admin/reps/", label: "Reps", icon: UsersRound },
      { href: "/admin/communications/", label: "Communications", icon: Mail },
    ],
  },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

function matchRoute(pathname: string, href: string): boolean {
  if (href === "/admin/") return pathname === "/admin" || pathname === "/admin/";
  return pathname === href || pathname === href.slice(0, -1) || pathname.startsWith(href);
}

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/admin/account")) return "Account";
  // Check child items first (more specific routes)
  for (const item of ALL_ITEMS) {
    if (item.children) {
      const child = item.children.find((c) => matchRoute(pathname, c.href));
      if (child) return child.label;
    }
  }
  return ALL_ITEMS.find((item) => matchRoute(pathname, item.href))?.label || "Admin";
}

/* ── ENTRY wordmark ── */
function EntryWordmark({ size = "default" }: { size?: "default" | "sm" }) {
  return (
    <span
      className={cn(
        "font-mono font-bold uppercase tracking-[4px] text-gradient select-none",
        size === "default" ? "text-[13px]" : "text-[10px] tracking-[3px]"
      )}
      style={{
        background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      Entry
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   ADMIN LAYOUT
   ═══════════════════════════════════════════════════════ */

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const branding = useBranding();

  // Auto-expand nav items whose children match the current path
  useEffect(() => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (item.children) {
          const childActive = item.children.some((c) => matchRoute(pathname, c.href));
          if (childActive) {
            setExpandedItems((prev) => {
              if (prev.has(item.label)) return prev;
              const next = new Set(prev);
              next.add(item.label);
              return next;
            });
          }
        }
      }
    }
  }, [pathname]);

  const isLoginPage = pathname.startsWith("/admin/login");
  const isInvitePage = pathname.startsWith("/admin/invite");
  const isSignupPage = pathname.startsWith("/admin/signup");
  const isBetaPage = pathname.startsWith("/admin/beta");
  const isOnboardingPage = pathname.startsWith("/admin/onboarding");
  const isEditorPage = pathname.startsWith("/admin/ticketstore/editor");
  const isBackendRoute = pathname.startsWith("/admin/backend");
  const isSettingsRoute = pathname.startsWith("/admin/settings");
  const isBypassRoute = isLoginPage || isInvitePage || isSignupPage || isBetaPage || isOnboardingPage || isEditorPage || isBackendRoute || isSettingsRoute;

  // Fetch user email + platform owner flag on mount
  useEffect(() => {
    if (isBypassRoute) return;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const { data } = await supabase.auth.getUser();
        if (data.user?.email) setUserEmail(data.user.email);
        if (data.user?.app_metadata?.is_platform_owner === true) {
          setIsPlatformOwner(true);
        }
      } catch {
        // Auth call can fail during navigation — ignore gracefully
      }
    })();
  }, [isBypassRoute]);

  // Close menu on outside click
  useEffect(() => {
    if (isBypassRoute) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userMenuOpen, isBypassRoute]);

  if (isLoginPage) return <>{children}</>;

  // Invite acceptance is a standalone page (unauthenticated)
  if (isInvitePage) return <>{children}</>;

  // Signup is a standalone page (unauthenticated)
  if (isSignupPage) return <>{children}</>;

  // Beta application is a standalone page (unauthenticated)
  if (isBetaPage) return <>{children}</>;

  // Onboarding wizard is full-screen (authenticated but no org yet)
  if (isOnboardingPage) return <>{children}</>;

  // Editor is full-screen — no sidebar, just the data-admin scope for Tailwind
  if (isEditorPage) return <>{children}</>;

  // Backend has its own standalone layout
  if (isBackendRoute) return <>{children}</>;

  // Settings has its own standalone layout
  if (isSettingsRoute) return <>{children}</>;

  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/admin/login/");
  };

  // Initials for avatar
  const initials = userEmail ? userEmail.charAt(0).toUpperCase() : "A";

  return (
    <div data-admin className="flex min-h-screen bg-background">
      {/* ── Mobile overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar border-r border-sidebar-border",
          "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          open ? "translate-x-0" : "max-lg:-translate-x-full"
        )}
      >
        {/* Platform brand */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/admin/" className="flex items-center gap-2">
            <EntryWordmark />
          </Link>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setOpen(false)}
            className="lg:hidden text-sidebar-foreground hover:text-foreground"
          >
            <X size={14} />
          </Button>
        </div>

        {/* Search hint */}
        <div className="px-3 pt-3 pb-1">
          <button className="flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 px-3 py-2 text-[12px] text-sidebar-foreground/40 transition-colors hover:border-sidebar-border hover:text-sidebar-foreground/60">
            <Search size={13} strokeWidth={1.5} />
            <span>Search...</span>
            <kbd className="ml-auto rounded border border-sidebar-border/60 bg-sidebar px-1.5 py-0.5 font-mono text-[10px] leading-none text-sidebar-foreground/30">
              /
            </kbd>
          </button>
        </div>

        {/* Scrollable navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-5">
              <div className="mb-2 px-3 font-mono text-[10px] font-semibold uppercase tracking-[2px] text-sidebar-foreground/40">
                {section.label}
              </div>

              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const hasChildren = item.children && item.children.length > 0;
                  const isExpanded = expandedItems.has(item.label);
                  const childActive = hasChildren && item.children!.some((c) => matchRoute(pathname, c.href));
                  const active = hasChildren ? childActive : matchRoute(pathname, item.href);

                  if (hasChildren) {
                    return (
                      <div key={item.label}>
                        {/* Parent item — toggles children */}
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedItems((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.label)) next.delete(item.label);
                              else next.add(item.label);
                              return next;
                            });
                          }}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
                            active
                              ? "bg-primary/10 text-foreground"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                          )}
                        >
                          <Icon
                            size={16}
                            strokeWidth={1.75}
                            className={cn(
                              "shrink-0 transition-colors duration-200",
                              active
                                ? "text-primary"
                                : "text-sidebar-foreground/60 group-hover:text-foreground/80"
                            )}
                          />
                          <span>{item.label}</span>
                          <ChevronRight
                            size={14}
                            className={cn(
                              "ml-auto shrink-0 text-sidebar-foreground/40 transition-transform duration-200",
                              isExpanded && "rotate-90"
                            )}
                          />
                        </button>

                        {/* Children — animated collapse */}
                        <div
                          className={cn(
                            "overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
                            isExpanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                          )}
                        >
                          <div className="ml-[22px] flex flex-col gap-0.5 border-l border-sidebar-border/50 py-1">
                            {item.children!.map((child) => {
                              const childIsActive = matchRoute(pathname, child.href);
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  onClick={() => setOpen(false)}
                                  className={cn(
                                    "flex items-center gap-2 rounded-r-lg py-1.5 pl-4 pr-3 text-[12px] font-medium transition-all duration-200",
                                    childIsActive
                                      ? "border-l-2 border-primary bg-primary/8 text-foreground -ml-px"
                                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
                                  )}
                                >
                                  <span>{child.label}</span>
                                  {childIsActive && (
                                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
                        active
                          ? "bg-primary/10 text-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                      )}
                    >
                      <Icon
                        size={16}
                        strokeWidth={1.75}
                        className={cn(
                          "shrink-0 transition-colors duration-200",
                          active
                            ? "text-primary"
                            : "text-sidebar-foreground/60 group-hover:text-foreground/80"
                        )}
                      />
                      <span>{item.label}</span>
                      {active && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

        </nav>

        {/* ── Pinned bottom: Settings + Entry Backend ── */}
        <div className="shrink-0 border-t border-sidebar-border/50 px-3 py-2 space-y-0.5">
          <Link
            href="/admin/settings/"
            onClick={() => setOpen(false)}
            className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent/70 hover:text-foreground"
          >
            <Settings size={14} strokeWidth={1.75} className="shrink-0 text-sidebar-foreground/60 group-hover:text-foreground/80" />
            <span>Settings</span>
            <ChevronRight size={12} className="ml-auto shrink-0 text-sidebar-foreground/30 group-hover:text-sidebar-foreground/50" />
          </Link>
          {isPlatformOwner && (
            <a
              href="/admin/backend/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium text-warning/70 transition-all duration-200 hover:bg-warning/8 hover:text-warning"
            >
              <Shield size={14} strokeWidth={1.75} className="shrink-0 text-warning/50 group-hover:text-warning/80" />
              <span>Entry Backend</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 opacity-40 group-hover:opacity-70">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>

        {/* ── User footer ── */}
        <div ref={menuRef} className="relative shrink-0 border-t border-sidebar-border">
          {/* Dropdown menu — positioned above */}
          {userMenuOpen && (
            <div className="absolute inset-x-3 bottom-full mb-2 rounded-xl border border-sidebar-border bg-sidebar p-1.5 shadow-xl shadow-black/40">
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
                onClick={() => {
                  setUserMenuOpen(false);
                  router.push("/admin/account/");
                }}
              >
                <UserIcon size={14} className="text-sidebar-foreground/60" />
                Account
              </button>
              <button
                className="group/bill relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground/40 cursor-not-allowed"
                disabled
              >
                <Receipt size={14} className="text-sidebar-foreground/30" />
                Billing
                <span className="ml-auto rounded bg-sidebar-accent/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/30">
                  Soon
                </span>
              </button>
              <div className="my-1.5 h-px bg-sidebar-border" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut size={14} className="text-sidebar-foreground/60" />
                Log out
              </button>
            </div>
          )}

          {/* Tenant info button — shows the org (FERAL), not the platform */}
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex w-full items-center gap-3 p-3 transition-colors hover:bg-sidebar-accent/30"
          >
            {/* Avatar */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/60 to-primary/25 text-[11px] font-bold text-white ring-1 ring-primary/20">
              {initials}
            </div>
            {/* Org name + email */}
            <div className="flex-1 text-left overflow-hidden">
              <p className="truncate text-[13px] font-medium text-foreground/90">{branding.org_name || "Admin"}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/50">{userEmail || "admin"}</p>
            </div>
            <ChevronsUpDown size={14} className="shrink-0 text-sidebar-foreground/40" />
          </button>
        </div>
      </aside>

      {/* ── Main area (offset by sidebar width on desktop) ── */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        {/* Sticky top header */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/50 bg-background/80 px-6 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setOpen(!open)}
              className="lg:hidden text-muted-foreground hover:text-foreground"
            >
              <PanelLeft size={18} />
            </Button>
            {/* Mobile brand */}
            <Link href="/admin/" className="lg:hidden">
              <EntryWordmark size="sm" />
            </Link>
            {/* Desktop breadcrumb */}
            <Separator orientation="vertical" className="hidden h-5 lg:block" />
            <h1 className="hidden font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground lg:block">
              {getPageTitle(pathname)}
            </h1>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-success">
              Live
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="admin-content flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
