"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import "@/styles/tailwind.css";
import "@/styles/rep-effects.css";
import {
  LayoutDashboard,
  Trophy,
  Compass,
  Gift,
  User,
  TrendingUp,
  Mail,
  Clock,
  Loader2,
  Bell,
  Zap,
  Star,
  ArrowUp,
  CheckCircle2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTierFromLevel } from "@/lib/rep-tiers";

const NAV_ITEMS = [
  { href: "/rep", label: "Home", icon: LayoutDashboard },
  { href: "/rep/leaderboard", label: "Board", icon: Trophy },
  { href: "/rep/quests", label: "Quests", icon: Compass },
  { href: "/rep/rewards", label: "Rewards", icon: Gift },
];

// HUD bar: 2 left items, center hub (Quests), 2 right items
const HUD_LEFT = [
  { href: "/rep", label: "Home", icon: LayoutDashboard },
  { href: "/rep/leaderboard", label: "Board", icon: Trophy },
];
const HUD_CENTER = { href: "/rep/quests", label: "Quests", icon: Compass };
const HUD_RIGHT = [
  { href: "/rep/rewards", label: "Rewards", icon: Gift },
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

interface RepStats {
  xp: number;
  level: number;
  rank: number | null;
  active_quests: number;
}

export default function RepLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPage = isPublic(pathname);
  const [branding, setBranding] = useState<OrgBranding | null>(null);
  const [authState, setAuthState] = useState<RepAuthState>({
    status: isPublicPage ? "active" : "loading",
  });
  const [repStats, setRepStats] = useState<RepStats | null>(null);

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

        // Active and verified — store stats if available
        if (json.stats) {
          setRepStats(json.stats);
        }

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

  const tier = repStats ? getTierFromLevel(repStats.level) : null;

  return (
    <div data-admin data-rep className="min-h-screen bg-background text-foreground">
      {/* Desktop top nav */}
      {showNav && (
        <header className="sticky top-0 z-40 hidden md:flex items-center justify-between border-b border-white/[0.06] bg-background/80 backdrop-blur-2xl px-6 h-14">
          <div className="flex items-center gap-8">
            <Link href="/rep" className="flex items-center gap-2.5">
              {branding?.logo_url && (
                <img
                  src={branding.logo_url}
                  alt=""
                  className="h-6 w-auto"
                />
              )}
              <span className="text-sm font-semibold select-none text-foreground">
                {branding?.org_name || "Entry"}
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
                    className={cn(
                      "relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all duration-200",
                      active
                        ? "bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(139,92,246,0.15)] rep-nav-active-glow"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                    )}
                  >
                    <Icon size={15} strokeWidth={active ? 2.5 : 1.75} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {/* Desktop stats strip */}
            {repStats && tier && (
              <div className="flex items-center gap-2 mr-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-[11px] font-bold tabular-nums text-primary">
                  <Zap size={11} />
                  {repStats.xp.toLocaleString()}
                </span>
                {repStats.rank && (
                  <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color: tier.color }}>
                    #{repStats.rank}
                  </span>
                )}
              </div>
            )}
            <NotificationCenter />
            <Link
              href="/rep/profile"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-200",
                matchRoute(pathname, "/rep/profile")
                  ? "bg-primary/15 border-primary/40 text-primary shadow-[0_0_12px_rgba(139,92,246,0.2)]"
                  : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:text-foreground hover:border-white/[0.15]"
              )}
            >
              <User size={15} />
            </Link>
          </div>
        </header>
      )}

      {/* Mobile top bar — Status HUD */}
      {showNav && (
        <div className="relative md:hidden">
          <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-3">
            <Link href="/rep" className="flex items-center gap-2.5">
              {branding?.logo_url ? (
                <img src={branding.logo_url} alt="" className="h-7 w-auto" />
              ) : (
                <span className="text-[15px] font-bold text-foreground">
                  {branding?.org_name || "Entry"}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-2">
              {/* XP + Level pills */}
              {repStats && tier && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-[11px] font-bold tabular-nums text-primary">
                    <Zap size={10} />
                    {repStats.xp.toLocaleString()}
                  </span>
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums"
                    style={{
                      backgroundColor: tier.color + "15",
                      color: tier.color,
                      border: `1px solid ${tier.color}30`,
                    }}
                  >
                    Lv.{repStats.level}
                  </span>
                </>
              )}
              <NotificationCenter />
            </div>
          </div>
          {/* Purple gradient edge line */}
          <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        </div>
      )}

      {/* Main content */}
      <main className={cn(
        showNav && "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6",
        "rep-page-enter"
      )} key={pathname}>
        {children}
      </main>

      {/* Mobile bottom nav — HUD Command Bar */}
      {showNav && (
        <div className="fixed bottom-0 inset-x-0 z-50 md:hidden pb-[max(env(safe-area-inset-bottom),8px)] px-4 pointer-events-none">
          <nav className="flex items-end justify-around rounded-[20px] border border-white/[0.06] bg-[rgba(12,12,18,0.94)] backdrop-blur-[24px] saturate-[1.4] shadow-[0_-4px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04),0_-1px_0_rgba(139,92,246,0.08)] px-2 pb-1.5 pt-2.5 relative pointer-events-auto">
            {/* Left items */}
            {HUD_LEFT.map((item) => {
              const active = matchRoute(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center w-14 gap-0.5 transition-all duration-200 no-underline relative pb-0.5"
                >
                  {active ? (
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/12 shadow-[0_0_12px_rgba(139,92,246,0.15)]">
                      <Icon
                        size={19}
                        strokeWidth={2.5}
                        className="text-primary drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]"
                      />
                    </div>
                  ) : (
                    <Icon size={20} strokeWidth={1.5} className="text-[#444455]" />
                  )}
                  <span className={cn(
                    "text-[9px] font-semibold tracking-wide",
                    active ? "text-primary" : "text-[#444455]"
                  )}>
                    {item.label}
                  </span>
                  {active && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                  )}
                </Link>
              );
            })}

            {/* Center hub — Quests */}
            {(() => {
              const active = matchRoute(pathname, HUD_CENTER.href);
              const Icon = HUD_CENTER.icon;
              return (
                <Link
                  href={HUD_CENTER.href}
                  className={cn(
                    "relative flex flex-col items-center -mt-5 z-[2] no-underline",
                    active && "rep-hud-hub-active"
                  )}
                >
                  <div className="flex items-center justify-center w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#7C3AED] to-[#8B5CF6] shadow-[0_4px_20px_rgba(139,92,246,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] transition-transform duration-200 active:scale-95 relative rep-hud-hub-circle">
                    <Icon size={24} strokeWidth={2} className="text-white" />
                    {/* Quest count badge */}
                    {repStats && repStats.active_quests > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-white text-[9px] font-bold px-1 shadow-[0_2px_8px_rgba(244,63,94,0.4)] animate-[badgeSpring_0.4s_cubic-bezier(0.34,1.56,0.64,1)]">
                        {repStats.active_quests > 9 ? "9+" : repStats.active_quests}
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "text-[9px] font-semibold tracking-wide mt-1",
                    active ? "text-primary" : "text-[#444455]"
                  )}>
                    {HUD_CENTER.label}
                  </span>
                </Link>
              );
            })()}

            {/* Right items */}
            {HUD_RIGHT.map((item) => {
              const active = matchRoute(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center w-14 gap-0.5 transition-all duration-200 no-underline relative pb-0.5"
                >
                  {active ? (
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/12 shadow-[0_0_12px_rgba(139,92,246,0.15)]">
                      <Icon
                        size={19}
                        strokeWidth={2.5}
                        className="text-primary drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]"
                      />
                    </div>
                  ) : (
                    <Icon size={20} strokeWidth={1.5} className="text-[#444455]" />
                  )}
                  <span className={cn(
                    "text-[9px] font-semibold tracking-wide",
                    active ? "text-primary" : "text-[#444455]"
                  )}>
                    {item.label}
                  </span>
                  {active && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}

// ─── Notification Center ─────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  created_at: string;
}

const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  sale_attributed: TrendingUp,
  reward_unlocked: Gift,
  reward_fulfilled: CheckCircle2,
  quest_approved: Compass,
  level_up: ArrowUp,
  manual_grant: Star,
};

function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Poll for unread count every 30s
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/rep-portal/notifications?limit=1");
      if (res.ok) {
        const json = await res.json();
        setUnreadCount(json.unread_count || 0);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch full list when opened
  const handleOpen = async () => {
    const wasOpen = open;
    setOpen(!wasOpen);
    if (!wasOpen) {
      setLoading(true);
      try {
        const res = await fetch("/api/rep-portal/notifications?limit=20");
        if (res.ok) {
          const json = await res.json();
          setNotifications(json.data || []);
          setUnreadCount(json.unread_count || 0);
        }
      } catch { /* silent */ }
      setLoading(false);
    }
  };

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    try {
      await fetch("/api/rep-portal/notifications/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  const handleNotificationClick = (n: Notification) => {
    // Mark as read
    if (!n.read) {
      fetch("/api/rep-portal/notifications/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-200",
          open
            ? "bg-primary/15 border-primary/30 text-primary"
            : "bg-white/[0.04] border-white/[0.06] text-muted-foreground hover:text-foreground hover:border-white/[0.12]"
        )}
        aria-label="Notifications"
      >
        <Bell size={18} strokeWidth={open ? 2.5 : 2} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary ring-2 ring-background px-1 text-[9px] font-bold text-white rep-notification-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/20 z-50 overflow-hidden rep-notification-panel">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-primary hover:underline font-medium"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground md:hidden"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[calc(70vh-48px)]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 px-4">
                <Bell size={20} className="text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n, i) => {
                const Icon = NOTIFICATION_ICONS[n.type] || Bell;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 rep-notification-item",
                      !n.read && "bg-primary/5"
                    )}
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <div className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      !n.read ? "bg-primary/15" : "bg-muted/50"
                    )}>
                      <Icon size={14} className={!n.read ? "text-primary" : "text-muted-foreground"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "text-xs leading-tight",
                          !n.read ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                        )}>
                          {n.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                          {formatTime(n.created_at)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {!n.read && (
                      <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
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
