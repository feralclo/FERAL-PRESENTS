"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  UsersRound,
  Gift,
  Swords,
  ExternalLink,
  Trophy,
  Cpu,
  LayoutDashboard,
  Inbox,
} from "lucide-react";
import { DashboardTab } from "@/components/admin/reps/DashboardTab";
import { TeamTab } from "@/components/admin/reps/TeamTab";
import { RewardsTab } from "@/components/admin/reps/RewardsTab";
import { QuestsTab } from "@/components/admin/reps/QuestsTab";
import { SettingsTab } from "@/components/admin/reps/SettingsTab";
import { PlatformXPTab } from "@/components/admin/reps/PlatformXPTab";
import { ReportsTab } from "@/components/admin/reps/ReportsTab";

const VALID_TABS = new Set([
  "dashboard",
  "team",
  "rewards",
  "quests",
  "reports",
  "settings",
  "platform",
]);

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
  const [activeTab, setActiveTab] = useState(
    tabParam && VALID_TABS.has(tabParam) ? tabParam : "dashboard"
  );

  // Honour ?tab= changes from client-side nav (Dashboard attention cards, etc.).
  // useSearchParams is reactive — this effect re-runs on every URL change.
  useEffect(() => {
    if (tabParam && VALID_TABS.has(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTab intentionally omitted
  }, [tabParam]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Page Header */}
      <div>
        <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
          Rep Programme
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recruit, manage, and reward your brand ambassadors
        </p>
      </div>

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
            <TabsTrigger value="settings">
              Settings
            </TabsTrigger>
            <TabsTrigger value="platform">
              <Cpu size={14} className="mr-1.5" />
              Platform
            </TabsTrigger>
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
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="platform">
          <PlatformXPTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
