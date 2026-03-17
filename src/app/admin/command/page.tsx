"use client";

import { useDashboardRealtime } from "@/hooks/useDashboardRealtime";
import { useLiveSessions } from "@/hooks/useLiveSessions";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import { CommandView } from "@/components/admin/command/CommandView";

export default function CommandPage() {
  const {
    funnel, activityFeed, topEvents, today, yesterday,
    lastSale, activeVisitors, activeCarts, inCheckout,
    isLoading, eventCapacity, saleStreak,
  } = useDashboardRealtime();

  const liveSessions = useLiveSessions();
  const { currency, currencySymbol } = useOrgCurrency();

  return (
    <CommandView
      sessions={liveSessions}
      funnel={funnel}
      activityFeed={activityFeed}
      topEvents={topEvents}
      today={today}
      yesterday={yesterday}
      lastSale={lastSale}
      activeVisitors={activeVisitors}
      activeCarts={activeCarts}
      inCheckout={inCheckout}
      isLoading={isLoading}
      eventCapacity={eventCapacity}
      saleStreak={saleStreak}
      currencySymbol={currencySymbol}
      currency={currency}
    />
  );
}
