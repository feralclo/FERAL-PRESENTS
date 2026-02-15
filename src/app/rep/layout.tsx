"use client";

import { type ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import "@/styles/tailwind.css";
import "@/styles/rep-portal.css";
import {
  LayoutDashboard,
  Trophy,
  Swords,
  Gift,
  User,
  TrendingUp,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/rep", label: "Home", icon: LayoutDashboard },
  { href: "/rep/sales", label: "Sales", icon: TrendingUp },
  { href: "/rep/leaderboard", label: "Board", icon: Trophy },
  { href: "/rep/quests", label: "Quests", icon: Swords },
  { href: "/rep/rewards", label: "Rewards", icon: Gift },
];

const MOBILE_NAV_ITEMS = [
  ...NAV_ITEMS,
  { href: "/rep/profile", label: "Me", icon: User },
];

const PUBLIC_PAGES = ["/rep/login", "/rep/join", "/rep/invite"];

function isPublic(pathname: string) {
  return PUBLIC_PAGES.some((p) => pathname.startsWith(p));
}

function matchRoute(pathname: string, href: string): boolean {
  if (href === "/rep") return pathname === "/rep" || pathname === "/rep/";
  return pathname.startsWith(href);
}

interface OrgBranding {
  org_name?: string;
  logo_url?: string;
  accent_color?: string;
}

export default function RepLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPage = isPublic(pathname);
  const showNav = !isPublicPage;
  const [branding, setBranding] = useState<OrgBranding | null>(null);

  // Auth state for protected pages
  const [authChecked, setAuthChecked] = useState(isPublicPage);
  const [authValid, setAuthValid] = useState(isPublicPage);

  /* Verify the user is an active rep before showing protected pages */
  useEffect(() => {
    if (isPublicPage) {
      setAuthChecked(true);
      setAuthValid(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/rep-portal/me");
        if (cancelled) return;
        if (res.ok) {
          setAuthValid(true);
        } else {
          // Not a rep or not active — redirect to login
          router.replace(`/rep/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }
      } catch {
        if (!cancelled) {
          router.replace("/rep/login");
          return;
        }
      }
      setAuthChecked(true);
    })();

    return () => { cancelled = true; };
  }, [isPublicPage, pathname, router]);

  /* Fetch org branding for tenant name/logo */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/branding");
        const json = await res.json();
        if (json.data) setBranding(json.data);
      } catch { /* ignore */ }
    })();
  }, []);

  const brandName = branding?.org_name
    ? `${branding.org_name} Reps`
    : "Entry Reps";

  // Show loading spinner while checking auth for protected pages
  if (!authChecked || (!authValid && !isPublicPage)) {
    return (
      <div data-admin data-rep className="min-h-screen bg-[var(--rep-bg)] text-[var(--rep-text)]">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-6 w-6 border-2 border-[var(--rep-accent)] border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div data-admin data-rep className="min-h-screen bg-[var(--rep-bg)] text-[var(--rep-text)]">
      {/* Desktop top nav */}
      {showNav && (
        <header className="sticky top-0 z-40 hidden md:flex items-center justify-between border-b border-[var(--rep-border)] bg-[rgba(6,6,10,0.9)] backdrop-blur-xl px-6 h-14">
          <div className="flex items-center gap-6">
            <Link href="/rep" className="flex items-center gap-2.5">
              {branding?.logo_url && (
                <img
                  src={branding.logo_url}
                  alt=""
                  className="h-6 w-auto"
                />
              )}
              <span className="font-mono text-[12px] font-bold uppercase tracking-[3px] select-none text-[var(--rep-accent)]">
                {brandName}
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = matchRoute(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                      active
                        ? "bg-[var(--rep-accent)]/10 text-white"
                        : "text-[var(--rep-text-muted)] hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon size={14} className={active ? "text-[var(--rep-accent)]" : ""} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <Link
            href="/rep/profile"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-[var(--rep-text-muted)] hover:text-white transition-colors"
          >
            <User size={14} />
            Profile
          </Link>
        </header>
      )}

      {/* Main content */}
      <main className={showNav ? "pb-20 md:pb-6" : ""}>
        {children}
      </main>

      {/* Mobile bottom nav */}
      {showNav && (
        <nav className="rep-bottom-nav flex md:hidden items-center justify-around">
          {MOBILE_NAV_ITEMS.map((item) => {
            const active = matchRoute(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors ${
                  active ? "text-[var(--rep-accent)]" : "text-[var(--rep-text-muted)]"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 1.75} />
                <span className="text-[10px] font-medium">{item.label}</span>
                {active && <div className="rep-nav-active-dot" />}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
