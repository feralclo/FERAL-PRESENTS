"use client";

import { useState, type ReactNode } from "react";
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
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/events/", label: "Events", icon: CalendarDays },
  { href: "/admin/orders/", label: "Orders", icon: FileText },
  { href: "/admin/customers/", label: "Customers", icon: Users },
  { href: "/admin/guest-list/", label: "Guest List", icon: ClipboardCheck },
  { href: "/admin/popup/", label: "Popup Performance", icon: MessageSquare },
  { href: "/admin/traffic/", label: "Traffic Analytics", icon: Activity },
  { href: "/admin/payments/", label: "Payment Settings", icon: CreditCard },
  { href: "/admin/connect/", label: "Stripe Connect", icon: Zap },
  { href: "/admin/marketing/", label: "Marketing", icon: Megaphone },
  { href: "/admin/communications/", label: "Communications", icon: Mail },
  { href: "/admin/settings/", label: "Settings", icon: Settings },
  { href: "/admin/health/", label: "System Health", icon: HeartPulse },
];

function matchRoute(pathname: string, href: string): boolean {
  if (href === "/admin/") return pathname === "/admin" || pathname === "/admin/";
  return pathname === href || pathname === href.slice(0, -1) || pathname.startsWith(href);
}

function getPageTitle(pathname: string): string {
  return NAV_ITEMS.find((item) => matchRoute(pathname, item.href))?.label || "Admin";
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  if (pathname.startsWith("/admin/login")) return <>{children}</>;

  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/admin/login/");
  };

  return (
    <div data-admin className="flex min-h-screen bg-background">
      {/* ── Mobile overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-sidebar border-r border-sidebar-border",
          "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          open ? "translate-x-0" : "max-lg:-translate-x-full"
        )}
      >
        {/* Sidebar header — logo */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/admin/" className="flex items-center gap-2.5 no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/FERAL LOGO.svg" alt="FERAL" className="h-5 opacity-90" />
            <span className="font-mono text-[0.6rem] font-bold tracking-[3px] text-primary">
              ADMIN
            </span>
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

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <div className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = matchRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    className={cn(
                      "shrink-0 transition-colors duration-150",
                      active
                        ? "text-primary"
                        : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground"
                    )}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Logout */}
        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground transition-all duration-150 hover:bg-sidebar-accent/60 hover:text-destructive"
          >
            <LogOut size={16} strokeWidth={1.75} className="shrink-0 group-hover:text-destructive" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main wrapper ── */}
      <div className="flex flex-1 flex-col min-h-screen lg:ml-[260px] transition-[margin] duration-300">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-5 backdrop-blur-xl">
          {/* Left — hamburger + page title */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setOpen(!open)}
              className="lg:hidden text-muted-foreground hover:text-foreground"
            >
              <PanelLeft size={18} />
            </Button>
            {/* Mobile logo */}
            <Link
              href="/admin/"
              className="flex items-center gap-2 no-underline lg:hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/FERAL LOGO.svg" alt="FERAL" className="h-[18px] opacity-90" />
              <span className="font-mono text-[0.6rem] font-bold tracking-[3px] text-primary">
                ADMIN
              </span>
            </Link>
            <Separator orientation="vertical" className="hidden lg:block !h-5" />
            <h1 className="hidden lg:block font-mono text-[0.8rem] font-semibold tracking-[2px] uppercase text-foreground">
              {getPageTitle(pathname)}
            </h1>
          </div>

          {/* Right — live indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="font-mono text-[0.6rem] font-semibold tracking-[2px] uppercase text-success">
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
