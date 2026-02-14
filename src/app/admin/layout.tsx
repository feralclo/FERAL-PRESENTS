"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
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
  CreditCard,
  Zap,
  Megaphone,
  Mail,
  Settings,
  HeartPulse,
  LogOut,
  PanelLeft,
  X,
  ChevronsUpDown,
  User as UserIcon,
  Receipt,
  Search,
  Package,
  Store,
  Tags,
} from "lucide-react";

/* ── Navigation grouped into sections ── */

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { href: "/admin/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/events/", label: "Events", icon: CalendarDays },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/admin/orders/", label: "Orders", icon: FileText },
      { href: "/admin/discounts/", label: "Discounts", icon: Tags },
      { href: "/admin/merch/", label: "Merch", icon: Package },
      { href: "/admin/customers/", label: "Customers", icon: Users },
      { href: "/admin/guest-list/", label: "Guest List", icon: ClipboardCheck },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/admin/traffic/", label: "Traffic", icon: Activity },
      { href: "/admin/popup/", label: "Popup", icon: MessageSquare },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/admin/ticketstore/", label: "Ticket Store", icon: Store },
      { href: "/admin/finance/", label: "Finance", icon: CreditCard },
      { href: "/admin/connect/", label: "Stripe Connect", icon: Zap },
      { href: "/admin/marketing/", label: "Marketing", icon: Megaphone },
      { href: "/admin/communications/", label: "Communications", icon: Mail },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/settings/", label: "Settings", icon: Settings },
      { href: "/admin/health/", label: "Health", icon: HeartPulse },
    ],
  },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

function matchRoute(pathname: string, href: string): boolean {
  if (href === "/admin/") return pathname === "/admin" || pathname === "/admin/";
  return pathname === href || pathname === href.slice(0, -1) || pathname.startsWith(href);
}

function getPageTitle(pathname: string): string {
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
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const isLoginPage = pathname.startsWith("/admin/login");
  const isEditorPage = pathname.startsWith("/admin/ticketstore/editor");
  const isBypassRoute = isLoginPage || isEditorPage;

  // Fetch user email on mount
  useEffect(() => {
    if (isBypassRoute) return;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const { data } = await supabase.auth.getUser();
        if (data.user?.email) setUserEmail(data.user.email);
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

  // Editor is full-screen — no sidebar, just the data-admin scope for Tailwind
  if (isEditorPage) return <>{children}</>;

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
                  const active = matchRoute(pathname, item.href);
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

        {/* ── User footer ── */}
        <div ref={menuRef} className="relative shrink-0 border-t border-sidebar-border">
          {/* Dropdown menu — positioned above */}
          {userMenuOpen && (
            <div className="absolute inset-x-3 bottom-full mb-2 rounded-xl border border-sidebar-border bg-sidebar p-1.5 shadow-xl shadow-black/40">
              <Link
                href="/admin/settings/"
                onClick={() => { setUserMenuOpen(false); setOpen(false); }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
              >
                <Settings size={14} className="text-sidebar-foreground/60" />
                Settings
              </Link>
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
                onClick={() => setUserMenuOpen(false)}
              >
                <UserIcon size={14} className="text-sidebar-foreground/60" />
                Account
              </button>
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
                onClick={() => setUserMenuOpen(false)}
              >
                <Receipt size={14} className="text-sidebar-foreground/60" />
                Billing
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
              <p className="truncate text-[13px] font-medium text-foreground/90">FERAL</p>
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
