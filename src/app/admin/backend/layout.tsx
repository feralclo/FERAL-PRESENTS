"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import "@/styles/tailwind.css";
import "@/styles/admin.css";
import {
  HeartPulse,
  Zap,
  Shield,
  ArrowLeft,
  PanelLeft,
  X,
} from "lucide-react";

interface BackendNavItem {
  href: string;
  label: string;
  icon: typeof HeartPulse;
}

const BACKEND_NAV: BackendNavItem[] = [
  { href: "/admin/backend/health/", label: "Health", icon: HeartPulse },
  { href: "/admin/backend/connect/", label: "Connect", icon: Zap },
  { href: "/admin/backend/platform-settings/", label: "Platform Settings", icon: Shield },
];

function matchRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname === href.slice(0, -1) || pathname.startsWith(href);
}

export default function BackendLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  // Verify platform owner on mount
  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          router.replace("/admin/");
          return;
        }
        const { data } = await supabase.auth.getUser();
        if (data.user?.app_metadata?.is_platform_owner === true) {
          setAuthorized(true);
        } else {
          router.replace("/admin/");
        }
      } catch {
        router.replace("/admin/");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return (
      <div data-admin className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-warning/30 border-t-warning" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div data-admin className="flex min-h-screen bg-background">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Compact sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-56 flex-col bg-sidebar border-r border-sidebar-border",
          "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          open ? "translate-x-0" : "max-lg:-translate-x-full"
        )}
      >
        {/* Header with Entry wordmark */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-warning/60" />
            <span
              className="font-mono text-[11px] font-bold uppercase tracking-[3px] select-none"
              style={{
                background: "linear-gradient(135deg, #FCD34D, #F59E0B, #D97706)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Backend
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setOpen(false)}
            className="lg:hidden text-sidebar-foreground hover:text-foreground"
          >
            <X size={14} />
          </Button>
        </div>

        {/* Back to admin */}
        <div className="px-3 pt-3 pb-1">
          <Link
            href="/admin/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            <ArrowLeft size={12} />
            <span>Back to Admin</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-2 px-3 font-mono text-[10px] font-semibold uppercase tracking-[2px] text-warning/40">
            Platform
          </div>
          <div className="flex flex-col gap-0.5">
            {BACKEND_NAV.map((item) => {
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
                      ? "bg-warning/10 text-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                  )}
                >
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    className={cn(
                      "shrink-0 transition-colors duration-200",
                      active
                        ? "text-warning"
                        : "text-sidebar-foreground/60 group-hover:text-foreground/80"
                    )}
                  />
                  <span>{item.label}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-warning shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 px-2 text-[11px] text-sidebar-foreground/30">
            <Shield size={11} />
            <span className="font-mono uppercase tracking-[1.5px]">Platform Owner</span>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-56">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/50 bg-background/80 px-6 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setOpen(!open)}
              className="lg:hidden text-muted-foreground hover:text-foreground"
            >
              <PanelLeft size={18} />
            </Button>
            <div className="flex items-center gap-2 lg:hidden">
              <Shield size={12} className="text-warning/60" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-warning/70">
                Backend
              </span>
            </div>
            <h1 className="hidden font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground lg:block">
              {BACKEND_NAV.find((item) => matchRoute(pathname, item.href))?.label || "Entry Backend"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-warning">
              Platform
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
