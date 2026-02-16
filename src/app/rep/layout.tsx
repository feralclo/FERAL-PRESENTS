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
  Mail,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

const PUBLIC_PAGES = ["/rep/login", "/rep/join", "/rep/invite", "/rep/verify-email"];

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

interface RepAuthState {
  status: "loading" | "unauthenticated" | "no_rep" | "email_unverified" | "pending_review" | "blocked" | "active";
  email?: string;
  firstName?: string;
}

export default function RepLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPage = isPublic(pathname);
  const [branding, setBranding] = useState<OrgBranding | null>(null);
  const [authState, setAuthState] = useState<RepAuthState>({
    status: isPublicPage ? "active" : "loading",
  });

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

  /* Check rep auth status for protected pages */
  useEffect(() => {
    if (isPublicPage) {
      setAuthState({ status: "active" });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/rep-portal/auth-check");
        if (cancelled) return;

        if (res.status === 401) {
          router.replace(`/rep/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        const json = await res.json();

        if (!json.authenticated || !json.rep) {
          router.replace("/rep/login");
          return;
        }

        const rep = json.rep;

        // Gate: email not verified
        if (rep.email_verified === false) {
          setAuthState({
            status: "email_unverified",
            email: rep.email,
            firstName: rep.first_name,
          });
          return;
        }

        // Gate: pending review
        if (rep.status === "pending") {
          setAuthState({
            status: "pending_review",
            email: rep.email,
            firstName: rep.first_name,
          });
          return;
        }

        // Gate: suspended or deactivated
        if (rep.status === "suspended" || rep.status === "deactivated") {
          setAuthState({ status: "blocked" });
          router.replace("/rep/login");
          return;
        }

        // Active and verified
        setAuthState({ status: "active" });
      } catch {
        if (!cancelled) {
          router.replace("/rep/login");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [isPublicPage, pathname, router]);

  const showNav = !isPublicPage && authState.status === "active";

  const brandName = branding?.org_name
    ? `${branding.org_name} Reps`
    : "Entry Reps";

  // ── Loading ──
  if (authState.status === "loading") {
    return (
      <div data-admin data-rep className="min-h-screen bg-background text-foreground">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  // ── Email Unverified Gate ──
  if (authState.status === "email_unverified") {
    return (
      <div data-admin data-rep className="min-h-screen bg-background text-foreground">
        <EmailVerificationGate
          email={authState.email}
          firstName={authState.firstName}
          brandName={brandName}
        />
      </div>
    );
  }

  // ── Pending Review Gate ──
  if (authState.status === "pending_review") {
    return (
      <div data-admin data-rep className="min-h-screen bg-background text-foreground">
        <PendingReviewGate
          firstName={authState.firstName}
          brandName={brandName}
        />
      </div>
    );
  }

  return (
    <div data-admin data-rep className="min-h-screen bg-background text-foreground">
      {/* Desktop top nav */}
      {showNav && (
        <header className="sticky top-0 z-40 hidden md:flex items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-xl px-6 h-14">
          <div className="flex items-center gap-6">
            <Link href="/rep" className="flex items-center gap-2.5">
              {branding?.logo_url && (
                <img
                  src={branding.logo_url}
                  alt=""
                  className="h-6 w-auto"
                />
              )}
              <span className="font-mono text-[12px] font-bold uppercase tracking-[3px] select-none text-primary">
                {brandName}
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = matchRoute(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Button
                    key={item.href}
                    variant="ghost"
                    size="sm"
                    asChild
                    className={cn(
                      active && "bg-primary/10 text-foreground"
                    )}
                  >
                    <Link href={item.href}>
                      <Icon size={14} className={cn(active && "text-primary")} />
                      {item.label}
                    </Link>
                  </Button>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-muted-foreground/50 font-medium tracking-wider uppercase select-none">
              Powered by Entry
            </span>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/rep/profile">
                <User size={14} />
                Profile
              </Link>
            </Button>
          </div>
        </header>
      )}

      {/* Main content */}
      <main className={showNav ? "pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6" : ""}>
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      {showNav && (
        <nav className="fixed bottom-0 inset-x-0 z-50 flex md:hidden items-center justify-around border-t border-border/50 bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] pt-1.5">
          {MOBILE_NAV_ITEMS.map((item) => {
            const active = matchRoute(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-all duration-200",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
                <span className="text-[10px] font-medium">{item.label}</span>
                {active && (
                  <div className="h-1 w-1 rounded-full bg-primary shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

// ─── Email Verification Gate ──────────────────────────────────────────────────

function EmailVerificationGate({
  email,
  firstName,
  brandName,
}: {
  email?: string;
  firstName?: string;
  brandName: string;
}) {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const router = useRouter();

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    setResent(false);
    try {
      await fetch("/api/rep-portal/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } catch { /* silent */ }
    setResending(false);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/rep-portal/logout", { method: "POST" });
    } catch { /* silent */ }
    router.replace("/rep/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center max-w-sm rep-fade-in">
        {/* Brand mark */}
        <div className="mb-6">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-primary/60">
            {brandName}
          </span>
        </div>

        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20 mb-6">
          <Mail size={28} className="text-primary" />
        </div>

        <h2 className="text-xl font-bold text-foreground mb-2">Verify Your Email</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-2">
          {firstName ? `Hey ${firstName}, we` : "We"} sent a verification link to
        </p>
        {email && (
          <p className="font-mono text-sm text-foreground mb-6">{email}</p>
        )}

        <p className="text-xs text-muted-foreground mb-8">
          Click the link in the email to access your dashboard. Check your spam folder if you don&apos;t see it.
        </p>

        <button
          onClick={handleResend}
          disabled={resending}
          className="rounded-xl border border-border px-6 py-3 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-50"
        >
          {resending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Sending...
            </span>
          ) : resent ? (
            "Email Sent!"
          ) : (
            "Resend Verification Email"
          )}
        </button>

        <div className="mt-6">
          <button
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pending Review Gate ──────────────────────────────────────────────────────

function PendingReviewGate({
  firstName,
  brandName,
}: {
  firstName?: string;
  brandName: string;
}) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/rep-portal/logout", { method: "POST" });
    } catch { /* silent */ }
    router.replace("/rep/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center max-w-sm rep-fade-in">
        {/* Brand mark */}
        <div className="mb-6">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-primary/60">
            {brandName}
          </span>
        </div>

        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 border border-warning/20 mb-6">
          <Clock size={28} className="text-warning" />
        </div>

        <h2 className="text-xl font-bold text-foreground mb-2">Application Under Review</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-[280px] mx-auto">
          {firstName ? `Hey ${firstName}, your` : "Your"} application is being reviewed by the team. We&apos;ll notify you by email once you&apos;re approved.
        </p>

        <div className="rounded-xl border border-border bg-card px-5 py-4 mb-8">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This usually takes less than 24 hours. If you have questions, reach out to the team directly.
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
