"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import "@/styles/tailwind.css";
import "@/styles/admin.css";
import {
  Settings,
  CreditCard,
  Plug,
  ArrowLeft,
  PanelLeft,
  X,
} from "lucide-react";

interface SettingsNavItem {
  href: string;
  label: string;
  icon: typeof Settings;
}

const SETTINGS_NAV: SettingsNavItem[] = [
  { href: "/admin/settings/general/", label: "General", icon: Settings },
  { href: "/admin/settings/finance/", label: "Finance", icon: CreditCard },
  { href: "/admin/settings/integrations/", label: "Integrations", icon: Plug },
];

function matchRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname === href.slice(0, -1) || pathname.startsWith(href);
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
          "fixed inset-y-0 left-0 z-50 flex w-52 flex-col bg-sidebar border-r border-sidebar-border",
          "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          open ? "translate-x-0" : "max-lg:-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-foreground/50" />
            <span className="font-mono text-[11px] font-bold uppercase tracking-[3px] text-foreground/70 select-none">
              Settings
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/admin/"
              className="rounded-md p-1.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
              title="Close settings"
            >
              <X size={14} />
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
          <div className="flex flex-col gap-0.5">
            {SETTINGS_NAV.map((item) => {
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
                      ? "bg-foreground/8 text-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                  )}
                >
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    className={cn(
                      "shrink-0 transition-colors duration-200",
                      active
                        ? "text-foreground/60"
                        : "text-sidebar-foreground/60 group-hover:text-foreground/80"
                    )}
                  />
                  <span>{item.label}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-foreground/40" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 px-2 text-[11px] text-sidebar-foreground/30">
            <Settings size={11} />
            <span className="font-mono uppercase tracking-[1.5px]">Org Configuration</span>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-52">
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
              <Settings size={12} className="text-foreground/50" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-foreground/60">
                Settings
              </span>
            </div>
            <h1 className="hidden font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground lg:block">
              {SETTINGS_NAV.find((item) => matchRoute(pathname, item.href))?.label || "Settings"}
            </h1>
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
