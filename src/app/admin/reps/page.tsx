"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdminPageHeader } from "@/components/admin/ui";
import {
  UsersRound,
  Gift,
  Swords,
  ExternalLink,
  Trophy,
  Cpu,
  LayoutDashboard,
  Inbox,
  Library,
} from "lucide-react";
import { DashboardTab } from "@/components/admin/reps/DashboardTab";
import { TeamTab } from "@/components/admin/reps/TeamTab";
import { RewardsTab } from "@/components/admin/reps/RewardsTab";
import { QuestsTab } from "@/components/admin/reps/QuestsTab";
import { LibraryTab } from "@/components/admin/reps/LibraryTab";
import { SettingsTab } from "@/components/admin/reps/SettingsTab";
import { PlatformXPTab } from "@/components/admin/reps/PlatformXPTab";
import { ReportsTab } from "@/components/admin/reps/ReportsTab";
import { getSupabaseClient } from "@/lib/supabase/client";

// Platform tab is platform-internal (XP rates, tier system, level table) —
// actionable only for platform owners. Tenants don't configure platform-wide
// XP, so we hide the tab from their view entirely.
const TENANT_TABS = new Set([
  "dashboard",
  "team",
  "rewards",
  "quests",
  "reports",
  "library",
  "settings",
]);
const PLATFORM_OWNER_EXTRA = new Set(["platform"]);

export default function RepsHubPage() {
  return (
    <Suspense fallback={<div className="p-6" />}>
      <RepsHubPageInner />
    </Suspense>
  );
}

function RepsHubPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);

  // Check platform-owner status from Supabase session (same pattern as TeamTab).
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.app_metadata?.is_platform_owner === true) {
        setIsPlatformOwner(true);
      }
    });
  }, []);

  const validTabs = isPlatformOwner
    ? new Set([...TENANT_TABS, ...PLATFORM_OWNER_EXTRA])
    : TENANT_TABS;

  const [activeTab, setActiveTab] = useState(
    tabParam && validTabs.has(tabParam) ? tabParam : "dashboard"
  );

  // Honour ?tab= changes from client-side nav (Dashboard attention cards, etc.).
  // useSearchParams is reactive — this effect re-runs on every URL change.
  useEffect(() => {
    if (tabParam && validTabs.has(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTab intentionally omitted
  }, [tabParam, validTabs]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <AdminPageHeader
        title="Rep Programme"
        subtitle="Recruit, manage, and reward your brand ambassadors"
      />

      {/* Quick link to event leaderboards */}
      <Link
        href="/admin/reps/event-boards"
        className="flex items-center gap-3 rounded-xl border border-border bg-card/50 p-4 hover:border-primary/30 hover:bg-primary/5 transition-all group"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10 group-hover:bg-primary/15 transition-colors">
          <Trophy size={18} className="text-primary/70" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Event Boards</p>
          <p className="text-xs text-muted-foreground">
            Assign reps to events, manage leaderboards, and award position prizes
          </p>
        </div>
        <ExternalLink size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
      </Link>

      {/* Internal Navigation — tabs scroll horizontally on narrow screens so
          all 7 stay accessible without wrapping. */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="-mx-6 overflow-x-auto px-6 pb-px lg:mx-0 lg:px-0">
          <TabsList>
            <TabsTrigger value="dashboard">
              <LayoutDashboard size={14} className="mr-1.5" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="team">
              <UsersRound size={14} className="mr-1.5" />
              Reps
            </TabsTrigger>
            <TabsTrigger value="rewards">
              <Gift size={14} className="mr-1.5" />
              Rewards
            </TabsTrigger>
            <TabsTrigger value="quests">
              <Swords size={14} className="mr-1.5" />
              Quests
            </TabsTrigger>
            <TabsTrigger value="reports">
              <Inbox size={14} className="mr-1.5" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="library">
              <Library size={14} className="mr-1.5" />
              Library
            </TabsTrigger>
            <TabsTrigger value="settings">
              Settings
            </TabsTrigger>
            {isPlatformOwner && (
              <TabsTrigger value="platform">
                <Cpu size={14} className="mr-1.5" />
                Platform
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="dashboard">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="team">
          <TeamTab />
        </TabsContent>
        <TabsContent value="rewards">
          <RewardsTab />
        </TabsContent>
        <TabsContent value="quests">
          <QuestsTab />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
        <TabsContent value="library">
          <LibraryTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
        {isPlatformOwner && (
          <TabsContent value="platform">
            <PlatformXPTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
