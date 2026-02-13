"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
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
  Menu,
  X,
  ChevronRight,
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

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin/") {
    return pathname === "/admin" || pathname === "/admin/";
  }
  return pathname === href || pathname === href.slice(0, -1) || pathname.startsWith(href);
}

/* ── Page title from pathname ── */
function getPageTitle(pathname: string): string {
  const match = NAV_ITEMS.find((item) => isActive(pathname, item.href));
  return match?.label || "Admin";
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Login page renders without the admin chrome
  const isLoginPage = pathname.startsWith("/admin/login");
  if (isLoginPage) return <>{children}</>;

  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/admin/login/");
  };

  const pageTitle = getPageTitle(pathname);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-border bg-[#111] transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar header */}
        <div className="flex h-[60px] items-center justify-between border-b border-border px-5">
          <Link href="/admin/" className="flex items-center gap-2.5 no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/FERAL LOGO.svg" alt="FERAL" className="h-[22px] opacity-90" />
            <span className="font-mono text-[0.7rem] font-bold tracking-[3px] text-primary">
              ADMIN
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3">
          <div className="px-3 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`group flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.82rem] transition-all no-underline ${
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.8}
                    className={`flex-shrink-0 transition-colors ${
                      active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                  {active && (
                    <ChevronRight size={14} className="ml-auto text-primary/60" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Logout */}
        <div className="border-t border-border p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-[0.82rem] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-primary"
          >
            <LogOut size={18} strokeWidth={1.8} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex flex-1 flex-col lg:ml-[260px]">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-border bg-[#111]/95 backdrop-blur-md px-5">
          {/* Left: hamburger (mobile) + page title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary lg:hidden"
            >
              <Menu size={20} />
            </button>
            {/* Mobile logo */}
            <Link
              href="/admin/"
              className="flex items-center gap-2 no-underline lg:hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/FERAL LOGO.svg" alt="FERAL" className="h-[20px] opacity-90" />
              <span className="font-mono text-[0.65rem] font-bold tracking-[3px] text-primary">
                ADMIN
              </span>
            </Link>
            {/* Desktop page title */}
            <h1 className="hidden font-mono text-sm font-bold tracking-[2px] text-foreground uppercase lg:block">
              {pageTitle}
            </h1>
          </div>

          {/* Right: status indicator */}
          <div className="flex items-center gap-2 text-[0.75rem] text-success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="font-mono tracking-wider uppercase">Live</span>
          </div>
        </header>

        {/* Page content */}
        <main className="admin-content flex-1">{children}</main>
      </div>
    </div>
  );
}
