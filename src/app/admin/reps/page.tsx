"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  UsersRound,
  Gift,
  Swords,
  ExternalLink,
  Trophy,
} from "lucide-react";
import { TeamTab } from "@/components/admin/reps/TeamTab";
import { RewardsTab } from "@/components/admin/reps/RewardsTab";
import { QuestsTab } from "@/components/admin/reps/QuestsTab";
import { SettingsTab } from "@/components/admin/reps/SettingsTab";

export default function RepsHubPage() {
  const [activeTab, setActiveTab] = useState("team");

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
          <p className="text-sm font-medium text-foreground">Event Leaderboards</p>
          <p className="text-xs text-muted-foreground">
            Assign position rewards, preview standings, and lock results
          </p>
        </div>
        <ExternalLink size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
      </Link>

      {/* Internal Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="team">
            <UsersRound size={14} className="mr-1.5" />
            Team
          </TabsTrigger>
          <TabsTrigger value="rewards">
            <Gift size={14} className="mr-1.5" />
            Rewards
          </TabsTrigger>
          <TabsTrigger value="quests">
            <Swords size={14} className="mr-1.5" />
            Quests
          </TabsTrigger>
          <TabsTrigger value="settings">
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team">
          <TeamTab />
        </TabsContent>
        <TabsContent value="rewards">
          <RewardsTab />
        </TabsContent>
        <TabsContent value="quests">
          <QuestsTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
