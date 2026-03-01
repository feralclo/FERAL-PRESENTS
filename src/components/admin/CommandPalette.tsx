"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  FileText,
  Users,
  ClipboardCheck,
  Mail,
  Settings,
  Package,
  Store,
  Tags,
  UsersRound,
  Mic2,
  TrendingUp,
  Shield,
  CreditCard,
  Globe,
  Palette,
  Megaphone,
  type LucideIcon,
  Search,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  User as UserIcon,
  Hash,
} from "lucide-react";

/* ── Types ── */

interface CommandItem {
  label: string;
  href: string;
  section: string;
  keywords: string[];
  description: string;
  platformOwnerOnly?: boolean;
}

interface LiveResult {
  id: string;
  label: string;
  detail: string;
  secondary?: string;
  href: string;
  section: "Orders" | "Customers";
}

/* ── Section icons ── */

const SECTION_ICONS: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  Events: CalendarDays,
  Commerce: FileText,
  Growth: TrendingUp,
  Settings: Settings,
  Backend: Shield,
  Orders: Hash,
  Customers: UserIcon,
};

/* ── Search registry ── */

const REGISTRY: CommandItem[] = [
  // Dashboard
  { label: "Dashboard", href: "/admin/", section: "Dashboard", keywords: ["home", "overview", "stats", "live", "analytics", "revenue", "visitors"], description: "Live stats, funnel analytics, activity feed" },

  // Events
  { label: "All Events", href: "/admin/events/", section: "Events", keywords: ["events", "create", "manage", "live", "draft", "published", "archived", "cancelled"], description: "Manage all events" },
  { label: "Artists", href: "/admin/artists/", section: "Events", keywords: ["lineup", "performers", "djs", "acts", "bios", "artist", "music", "video"], description: "Artist profiles and media" },
  { label: "Guest List", href: "/admin/guest-list/", section: "Events", keywords: ["guest", "vip", "check-in", "checkin", "attendance", "door", "entry", "names"], description: "Manual guest list and check-in" },

  // Commerce
  { label: "Orders", href: "/admin/orders/", section: "Commerce", keywords: ["orders", "transactions", "sales", "purchases", "revenue", "refund", "export", "csv"], description: "View and manage all orders" },
  { label: "Abandoned Carts", href: "/admin/abandoned-carts/", section: "Commerce", keywords: ["abandoned", "cart", "recovery", "lost", "incomplete", "drop-off"], description: "Cart recovery dashboard" },
  { label: "Customers", href: "/admin/customers/", section: "Commerce", keywords: ["customers", "fans", "superfan", "audience", "profiles", "email", "contacts", "buyers"], description: "Customer profiles and tiers" },
  { label: "Discounts", href: "/admin/discounts/", section: "Commerce", keywords: ["discounts", "codes", "promo", "promotions", "coupons", "vouchers", "deals", "percentage", "offer"], description: "Discount codes and promotions" },
  { label: "Merch Products", href: "/admin/merch/", section: "Commerce", keywords: ["merch", "merchandise", "products", "inventory", "catalog", "tshirt", "apparel", "sizes"], description: "Merch product catalog" },
  { label: "Event Pre-orders", href: "/admin/merch-store/", section: "Commerce", keywords: ["pre-order", "preorder", "merch store", "event merch", "bundle"], description: "Event-linked merch pre-orders" },
  { label: "Online Store", href: "/admin/merch-store/online/", section: "Commerce", keywords: ["online", "store", "shop", "ecommerce", "standalone"], description: "Standalone online merch store" },
{ label: "Event Page", href: "/admin/event-page/", section: "Commerce", keywords: ["event page", "theme", "design", "hero image", "focal point", "preview"], description: "Event page appearance settings" },
  { label: "Themes", href: "/admin/ticketstore/", section: "Commerce", keywords: ["themes", "template", "midnight", "ticket store", "design", "look"], description: "Theme selection and customization" },

  // Growth
  { label: "Traffic Analytics", href: "/admin/traffic/", section: "Growth", keywords: ["traffic", "funnel", "analytics", "conversion", "visitors", "insights", "data", "reports"], description: "Funnel analytics and traffic data" },
  { label: "Popup", href: "/admin/popup/", section: "Growth", keywords: ["popup", "leads", "capture", "engagement", "modal", "signup", "email capture", "cities", "locations"], description: "Popup performance and leads" },
  { label: "Reps Programme", href: "/admin/reps/", section: "Growth", keywords: ["reps", "affiliates", "ambassadors", "rewards", "points", "quests", "leaderboard", "referral", "programme", "program"], description: "Rep affiliate programme" },
  { label: "Rep Event Boards", href: "/admin/reps/event-boards/", section: "Growth", keywords: ["leaderboard", "event boards", "rep ranking", "competition", "standings"], description: "Event-specific rep leaderboards" },
  { label: "Rep Quests", href: "/admin/reps/quests/", section: "Growth", keywords: ["quests", "challenges", "tasks", "missions", "daily", "rep quests"], description: "Rep quest management" },
  { label: "Rep Rewards", href: "/admin/reps/rewards/", section: "Growth", keywords: ["rewards", "prizes", "redeem", "rep rewards", "incentives"], description: "Rep reward catalog" },
  { label: "Communications", href: "/admin/communications/", section: "Growth", keywords: ["communications", "email", "messaging", "notifications", "channels"], description: "Communications hub overview" },
  { label: "Marketing Automation", href: "/admin/communications/marketing/", section: "Growth", keywords: ["marketing", "automation", "campaigns", "email marketing"], description: "Marketing automation overview" },
  { label: "Abandoned Cart Emails", href: "/admin/communications/marketing/abandoned-cart/", section: "Growth", keywords: ["abandoned cart email", "recovery email", "cart reminder", "automation", "drip"], description: "Cart recovery email sequence" },
  { label: "Announcement Emails", href: "/admin/communications/marketing/announcements/", section: "Growth", keywords: ["announcement", "presale", "coming soon", "waitlist", "signup", "launch"], description: "Coming-soon email sequences" },
  { label: "Popup Settings", href: "/admin/communications/marketing/popup/", section: "Growth", keywords: ["popup settings", "display rules", "popup config"], description: "Popup display configuration" },
  { label: "Order Confirmation Email", href: "/admin/communications/transactional/order-confirmation/", section: "Growth", keywords: ["order confirmation", "transactional", "receipt", "email template"], description: "Order confirmation email template" },
  { label: "PDF Ticket Template", href: "/admin/communications/transactional/pdf-ticket/", section: "Growth", keywords: ["pdf", "ticket", "template", "download", "print"], description: "PDF ticket design template" },
  { label: "Wallet Passes", href: "/admin/communications/transactional/wallet-passes/", section: "Growth", keywords: ["wallet", "apple wallet", "google wallet", "pass", "mobile ticket", "pkpass"], description: "Apple/Google Wallet pass template" },

  // Settings
  { label: "General Settings", href: "/admin/settings/general/", section: "Settings", keywords: ["general", "organization", "org", "timezone", "name", "support email", "settings"], description: "Organization name, timezone, email" },
  { label: "Branding", href: "/admin/settings/branding/", section: "Settings", keywords: ["branding", "logo", "colors", "fonts", "white-label", "brand", "identity", "copyright", "appearance"], description: "Logo, colors, fonts, copyright" },
  { label: "Domains", href: "/admin/settings/domains/", section: "Settings", keywords: ["domains", "custom domain", "dns", "cname", "hostname", "url", "verification"], description: "Custom domain management" },
  { label: "Plan & Billing", href: "/admin/settings/plan/", section: "Settings", keywords: ["plan", "billing", "subscription", "upgrade", "pricing", "starter", "pro", "free"], description: "Current plan and upgrade options" },
  { label: "Finance", href: "/admin/settings/finance/", section: "Settings", keywords: ["finance", "vat", "tax", "currency", "payout", "payment settings", "gbp", "eur", "usd"], description: "VAT, currency, payout settings" },
  { label: "Integrations", href: "/admin/settings/integrations/", section: "Settings", keywords: ["integrations", "meta pixel", "facebook", "google analytics", "gtm", "klaviyo", "tracking", "pixel", "api"], description: "Meta Pixel, GA, Klaviyo setup" },
  { label: "Team & Users", href: "/admin/settings/users/", section: "Settings", keywords: ["team", "users", "members", "invite", "permissions", "roles", "access", "staff"], description: "Team members and permissions" },
  { label: "Payments", href: "/admin/payments/", section: "Settings", keywords: ["payments", "stripe", "connect", "onboarding", "bank", "payout", "charges", "account"], description: "Stripe Connect setup" },
  { label: "Account", href: "/admin/account/", section: "Settings", keywords: ["account", "profile", "password", "email", "personal", "my account"], description: "Your account and password" },

  // Backend (platform owner only)
  { label: "Platform Dashboard", href: "/admin/backend/", section: "Backend", keywords: ["platform", "overview", "gmv", "tenants", "signups", "fees"], description: "Platform-wide stats and GMV", platformOwnerOnly: true },
  { label: "Platform Health", href: "/admin/backend/health/", section: "Backend", keywords: ["health", "sentry", "errors", "monitoring", "system", "status", "bugs", "crashes"], description: "Sentry issues and system health", platformOwnerOnly: true },
  { label: "Payment Health", href: "/admin/backend/payment-health/", section: "Backend", keywords: ["payment health", "payment issues", "failed payments", "orphans", "declined"], description: "Payment issue monitoring", platformOwnerOnly: true },
  { label: "Stripe Connect (Platform)", href: "/admin/backend/connect/", section: "Backend", keywords: ["connect", "stripe accounts", "platform stripe", "connected accounts"], description: "Manage connected Stripe accounts", platformOwnerOnly: true },
  { label: "Beta Programme", href: "/admin/backend/beta/", section: "Backend", keywords: ["beta", "applications", "invite codes", "applicants", "approve", "onboarding"], description: "Beta applications and invite codes", platformOwnerOnly: true },
  { label: "Plans Management", href: "/admin/backend/plans/", section: "Backend", keywords: ["plans", "pricing tiers", "subscription management", "starter", "pro"], description: "Platform plan configuration", platformOwnerOnly: true },
  { label: "Tenants", href: "/admin/backend/tenants/", section: "Backend", keywords: ["tenants", "organizations", "orgs", "promoters", "multi-tenant", "all orgs"], description: "All tenant organizations", platformOwnerOnly: true },
  { label: "Platform Settings", href: "/admin/backend/platform-settings/", section: "Backend", keywords: ["platform settings", "global config", "platform config"], description: "Global platform configuration", platformOwnerOnly: true },
];

/* ── Quick links (shown when query is empty) ── */

const QUICK_LINKS = [
  "/admin/",
  "/admin/events/",
  "/admin/orders/",
  "/admin/customers/",
  "/admin/settings/branding/",
];

/* ── Scoring ── */

function scoreItem(item: CommandItem, query: string): number {
  const q = query.toLowerCase();
  const label = item.label.toLowerCase();
  const desc = item.description.toLowerCase();

  if (label === q) return 100;
  if (label.startsWith(q)) return 90;
  const labelWords = label.split(/\s+/);
  if (labelWords.some((w) => w.startsWith(q))) return 80;
  if (label.includes(q)) return 70;
  if (item.keywords.some((k) => k === q)) return 65;
  if (item.keywords.some((k) => k.startsWith(q))) return 60;
  if (item.keywords.some((k) => k.includes(q))) return 50;
  if (desc.includes(q)) return 40;

  const queryWords = q.split(/\s+/).filter(Boolean);
  if (queryWords.length > 1) {
    const allText = `${label} ${desc} ${item.keywords.join(" ")}`;
    if (queryWords.every((w) => allText.includes(w))) return 35;
  }

  return 0;
}

/* ── Helpers ── */

function formatCurrency(amount: number, currency?: string): string {
  const sym = currency === "EUR" ? "\u20AC" : currency === "USD" ? "$" : "\u00A3";
  return `${sym}${(amount / 100).toFixed(2)}`;
}

function orderToResult(o: Record<string, unknown>): LiveResult {
  const customer = o.customer as Record<string, string> | null;
  const name = customer
    ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
    : "";
  const event = o.event as Record<string, string> | null;
  const detail = [name, event?.name].filter(Boolean).join(" \u00B7 ");
  return {
    id: o.id as string,
    label: o.order_number as string,
    detail: detail || customer?.email || "Unknown customer",
    secondary: o.total != null ? formatCurrency(o.total as number, o.currency as string) : undefined,
    href: `/admin/orders/${o.id}/`,
    section: "Orders",
  };
}

/* ── Live search fetcher ── */

async function fetchLiveResults(query: string): Promise<LiveResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const results: LiveResult[] = [];
  const seenOrderIds = new Set<string>();

  try {
    // Step 1: Direct order_number search + customer name/email search in parallel
    const [ordersRes, customersRes] = await Promise.all([
      fetch(`/api/orders?search=${encodeURIComponent(q)}&limit=5`).catch(() => null),
      fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=5`).catch(() => null),
    ]);

    // Direct order_number matches (e.g. "FERAL-123")
    if (ordersRes?.ok) {
      const json = await ordersRes.json();
      for (const o of (json.data || []).slice(0, 5)) {
        seenOrderIds.add(o.id);
        results.push(orderToResult(o));
      }
    }

    // Customer matches — fetch each customer's most recent order too
    const customers: Record<string, unknown>[] = [];
    if (customersRes?.ok) {
      const json = await customersRes.json();
      customers.push(...(json.data || []).slice(0, 5));
    }

    // Step 2: For matching customers, fetch their most recent orders
    if (customers.length > 0) {
      const orderFetches = customers.slice(0, 4).map((c) =>
        fetch(`/api/orders?customer_id=${c.id}&limit=1`).catch(() => null)
      );
      const orderResults = await Promise.all(orderFetches);

      for (let i = 0; i < orderResults.length; i++) {
        const res = orderResults[i];
        if (!res?.ok) continue;
        const json = await res.json();
        const orders = json.data || [];
        if (orders.length > 0 && !seenOrderIds.has(orders[0].id)) {
          seenOrderIds.add(orders[0].id);
          results.push(orderToResult(orders[0]));
        }
      }

      // Add customer results after their orders
      for (const c of customers) {
        const name = `${(c.first_name as string) || ""} ${(c.last_name as string) || ""}`.trim();
        results.push({
          id: c.id as string,
          label: name || (c.email as string),
          detail: name ? (c.email as string) : "",
          href: `/admin/customers/${c.id}/`,
          section: "Customers",
        });
      }
    }
  } catch {
    // Silently fail — live results are supplementary
  }

  return results;
}

/* ── Component ── */

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  isPlatformOwner: boolean;
}

export function CommandPalette({ open, onClose, isPlatformOwner }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [liveResults, setLiveResults] = useState<LiveResult[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();

  // Filter and score page results
  const pageResults = useMemo(() => {
    const items = isPlatformOwner
      ? REGISTRY
      : REGISTRY.filter((item) => !item.platformOwnerOnly);

    if (!query.trim()) {
      return items.filter((item) => QUICK_LINKS.includes(item.href));
    }

    return items
      .map((item) => ({ item, score: scoreItem(item, query.trim()) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }, [query, isPlatformOwner]);

  // Debounced live search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (q.length < 2) {
      setLiveResults([]);
      setLiveLoading(false);
      return;
    }

    setLiveLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await fetchLiveResults(q);
      setLiveResults(results);
      setLiveLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Build grouped display: live results first, then pages
  const allGroups = useMemo(() => {
    const groups: { section: string; items: { label: string; detail: string; secondary?: string; href: string }[] }[] = [];

    // Live results grouped by section
    if (query.trim().length >= 2) {
      const liveOrders = liveResults.filter((r) => r.section === "Orders");
      const liveCustomers = liveResults.filter((r) => r.section === "Customers");

      if (liveOrders.length > 0) {
        groups.push({
          section: "Orders",
          items: liveOrders.map((r) => ({ label: r.label, detail: r.detail, secondary: r.secondary, href: r.href })),
        });
      }
      if (liveCustomers.length > 0) {
        groups.push({
          section: "Customers",
          items: liveCustomers.map((r) => ({ label: r.label, detail: r.detail, href: r.href })),
        });
      }
    }

    // Page results grouped by section
    const seen = new Set<string>();
    for (const item of pageResults) {
      if (!seen.has(item.section)) {
        seen.add(item.section);
        groups.push({ section: item.section, items: [] });
      }
      groups.find((g) => g.section === item.section)!.items.push({
        label: item.label,
        detail: item.description,
        href: item.href,
      });
    }

    return groups;
  }, [pageResults, liveResults, query]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => allGroups.flatMap((g) => g.items), [allGroups]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setLiveResults([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const navigate = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % Math.max(flatItems.length, 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + flatItems.length) % Math.max(flatItems.length, 1));
          break;
        case "Enter":
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            navigate(flatItems[selectedIndex].href);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatItems, selectedIndex, navigate, onClose]
  );

  if (!open) return null;

  let flatIndex = -1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed inset-x-0 top-[15%] z-[101] mx-auto w-full max-w-lg px-4">
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/40">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search pages, orders, customers..."
              className="flex-1 border-0 bg-transparent py-3.5 text-sm text-foreground shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="rounded border border-border/60 bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/50">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[min(60vh,400px)] overflow-y-auto p-2">
            {flatItems.length === 0 && query.trim() && !liveLoading && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </div>
            )}

            {flatItems.length === 0 && liveLoading && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground/50">
                Searching...
              </div>
            )}

            {!query.trim() && (
              <div className="mb-1 px-3 pt-1 font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground/50">
                Quick Links
              </div>
            )}

            {allGroups.map((group) => (
              <div key={group.section}>
                {query.trim() && (
                  <div className="mb-1 mt-2 flex items-center gap-2 px-3 first:mt-0">
                    {SECTION_ICONS[group.section] &&
                      (() => {
                        const Icon = SECTION_ICONS[group.section];
                        return (
                          <Icon
                            size={11}
                            strokeWidth={1.5}
                            className="text-muted-foreground/40"
                          />
                        );
                      })()}
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground/50">
                      {group.section}
                    </span>
                  </div>
                )}

                {group.items.map((item) => {
                  flatIndex++;
                  const isSelected = flatIndex === selectedIndex;
                  const idx = flatIndex;

                  return (
                    <button
                      key={`${group.section}-${item.href}`}
                      data-index={idx}
                      onClick={() => navigate(item.href)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "bg-primary/10 text-foreground"
                          : "text-foreground/80 hover:bg-card"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">
                          {item.label}
                        </div>
                        {item.detail && (
                          <div className="truncate text-[11px] text-muted-foreground/60">
                            {item.detail}
                          </div>
                        )}
                      </div>
                      {item.secondary && (
                        <span className="shrink-0 font-mono text-[12px] text-muted-foreground/70">
                          {item.secondary}
                        </span>
                      )}
                      {isSelected && !item.secondary && (
                        <CornerDownLeft
                          size={12}
                          className="shrink-0 text-primary/60"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 border-t border-border px-4 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <span className="inline-flex gap-0.5">
                <kbd className="rounded border border-border/50 bg-card px-1 py-0.5 font-mono text-[9px] leading-none">
                  <ArrowUp size={8} />
                </kbd>
                <kbd className="rounded border border-border/50 bg-card px-1 py-0.5 font-mono text-[9px] leading-none">
                  <ArrowDown size={8} />
                </kbd>
              </span>
              Navigate
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <kbd className="rounded border border-border/50 bg-card px-1 py-0.5 font-mono text-[9px] leading-none">
                <CornerDownLeft size={8} />
              </kbd>
              Open
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <kbd className="rounded border border-border/50 bg-card px-1.5 py-0.5 font-mono text-[9px] leading-none">
                esc
              </kbd>
              Close
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
