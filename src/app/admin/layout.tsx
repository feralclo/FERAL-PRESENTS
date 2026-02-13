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

/* ── Sidebar width (single source of truth) ── */
const SIDEBAR_W = 256;

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
    <div style={{ display: "flex", minHeight: "100vh", background: "#0e0e0e" }}>
      {/* ── Mobile overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          style={{ display: "block" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: SIDEBAR_W,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          background: "var(--color-sidebar, #0a0a0a)",
          borderRight: "1px solid var(--color-sidebar-border, #1a1a1a)",
          transform: open ? "translateX(0)" : undefined,
          transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        className={cn(!open && "max-lg:-translate-x-full")}
      >
        {/* Logo */}
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid var(--color-sidebar-border, #1a1a1a)",
          }}
        >
          <Link href="/admin/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/FERAL LOGO.svg" alt="FERAL" style={{ height: 20, opacity: 0.9 }} />
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.65rem",
                fontWeight: 700,
                letterSpacing: 3,
                color: "var(--color-primary, #ff0033)",
              }}
            >
              ADMIN
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            className="lg:hidden h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </Button>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = matchRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium no-underline transition-all",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    className={cn(
                      "shrink-0 transition-colors",
                      active ? "text-primary" : "text-sidebar-foreground group-hover:text-sidebar-accent-foreground"
                    )}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Logout */}
        <div style={{ padding: 8, borderTop: "1px solid var(--color-sidebar-border, #1a1a1a)" }}>
          <button
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent/50 hover:text-destructive"
          >
            <LogOut size={16} strokeWidth={1.75} className="shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main wrapper ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          marginLeft: SIDEBAR_W,
          transition: "margin-left 0.25s",
        }}
        className="max-lg:!ml-0"
      >
        {/* ── Top header ── */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            background: "rgba(10, 10, 10, 0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--color-border, #232323)",
          }}
        >
          {/* Left */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(!open)}
              className="lg:hidden h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <PanelLeft size={18} />
            </Button>
            {/* Mobile logo */}
            <Link
              href="/admin/"
              className="flex items-center gap-2 no-underline lg:hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/FERAL LOGO.svg" alt="FERAL" style={{ height: 18, opacity: 0.9 }} />
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  letterSpacing: 3,
                  color: "var(--color-primary, #ff0033)",
                }}
              >
                ADMIN
              </span>
            </Link>
            <Separator orientation="vertical" className="hidden lg:block h-5" />
            {/* Desktop breadcrumb / page title */}
            <h1
              className="hidden lg:block"
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.8rem",
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "var(--color-foreground, #fff)",
                margin: 0,
              }}
            >
              {getPageTitle(pathname)}
            </h1>
          </div>

          {/* Right — live indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--color-success, #22c55e)",
                boxShadow: "0 0 6px rgba(34,197,94,0.5)",
              }}
            />
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.65rem",
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "var(--color-success, #22c55e)",
              }}
            >
              Live
            </span>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="admin-content" style={{ flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
