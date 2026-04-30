/**
 * Shared response shape for /api/events/[id]/overview. Kept in its own
 * file so the page, the per-tier card, and the funnel widget can all
 * import from one source without circular deps.
 */

import type { SalesBucket } from "@/lib/sales-velocity";

export interface OverviewTicketType {
  id: string;
  name: string;
  sort_order: number;
  status: string;
  price: number;
  capacity: number | null;
  sold: number;
  revenue_completed: number;
  last_sold_at: string | null;
  per_day_7d: number;
  sellthrough_pct: number | null;
}

export interface OverviewRecentOrder {
  id: string;
  order_number: string;
  total: number;
  currency: string;
  customer_name: string;
  payment_method: string;
  created_at: string;
  tier_summary: string;
}

export interface OverviewPaymentMethod {
  method: string;
  count: number;
  revenue: number;
}

export interface OverviewFunnel {
  page_views: number;
  cart_started: number;
  paid: number;
  conversion_pct: number | null;
}

export interface OverviewSources {
  referrers: { referrer: string; count: number }[];
  utm_sources: { utm_source: string; count: number }[];
}

export interface OverviewWindow {
  sold: number;
  revenue: number;
}

export interface OverviewResponse {
  event: {
    id: string;
    name: string;
    slug: string;
    status: string;
    date_start: string;
    date_end: string | null;
    currency: string;
    capacity: number | null;
    payment_method: string | null;
  };
  generatedAt: string;
  totals: {
    sold: number;
    revenue: number;
    refunded_revenue: number;
    capacity: number | null;
    paid_orders: number;
  };
  windows: {
    today: OverviewWindow;
    last_7d: OverviewWindow;
    prev_7d: OverviewWindow;
  };
  buckets: SalesBucket[];
  ticketTypes: OverviewTicketType[];
  recent_orders: OverviewRecentOrder[];
  payment_methods: OverviewPaymentMethod[];
  funnel: OverviewFunnel;
  sources: OverviewSources;
}
