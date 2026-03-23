"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardCheck } from "lucide-react";
import { EventSelector, type EventForSelector } from "@/components/admin/guest-list/EventSelector";
import { GuestsTab } from "@/components/admin/guest-list/GuestsTab";
import { ArtistLinksTab } from "@/components/admin/guest-list/ArtistLinksTab";
import { SettingsTab } from "@/components/admin/guest-list/SettingsTab";

export default function GuestListPage() {
  const orgId = useOrgId();
  const [events, setEvents] = useState<EventForSelector[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [activeTab, setActiveTab] = useState("guests");
  const [guestSummaries, setGuestSummaries] = useState<Record<string, { total_guests: number; pending_count: number }>>({});
  const autoSelected = useRef(false);

  // Load events (filter out drafts)
  const loadEvents = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, date_start, venue_name, status")
      .eq("org_id", orgId)
      .order("date_start", { ascending: false });

    const evts = ((data || []) as EventForSelector[]).filter((e) => e.status !== "draft");
    setEvents(evts);
  }, [orgId]);

  // Load per-event guest summaries
  const loadSummaries = useCallback(async () => {
    try {
      const res = await fetch("/api/guest-list/event-summary");
      if (res.ok) {
        const json = await res.json();
        setGuestSummaries(json.summaries || {});
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadEvents();
    loadSummaries();
  }, [loadEvents, loadSummaries]);

  // Auto-select: pick the first event that has guests, or the first upcoming event
  useEffect(() => {
    if (autoSelected.current || selectedEvent || events.length === 0) return;

    const now = new Date();

    // Prefer event with guests + pending approvals
    const withPending = events.find((e) => (guestSummaries[e.id]?.pending_count || 0) > 0);
    if (withPending) {
      setSelectedEvent(withPending.id);
      autoSelected.current = true;
      return;
    }

    // Then any event with guests
    const withGuests = events.find((e) => (guestSummaries[e.id]?.total_guests || 0) > 0);
    if (withGuests) {
      setSelectedEvent(withGuests.id);
      autoSelected.current = true;
      return;
    }

    // Then first upcoming event
    const upcoming = events.find((e) => {
      if (!e.date_start) return true;
      return new Date(e.date_start) >= now;
    });
    if (upcoming) {
      setSelectedEvent(upcoming.id);
      autoSelected.current = true;
    }
  }, [events, guestSummaries, selectedEvent]);

  return (
    <div className="space-y-6 p-6 lg:p-8 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div>
        <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">Guest List</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage invitations, artist submissions, and access levels</p>
      </div>

      {/* Event selector */}
      <EventSelector
        events={events}
        selectedEventId={selectedEvent}
        onSelectEvent={setSelectedEvent}
        guestSummaries={guestSummaries}
      />

      {/* Content */}
      {!selectedEvent ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <ClipboardCheck size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">Select an event</p>
            <p className="mt-1 text-xs text-muted-foreground">Choose an event above to manage its guest list</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="guests">Guests</TabsTrigger>
            <TabsTrigger value="artist-links">Artist Links</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="guests" className="mt-5">
            <GuestsTab selectedEventId={selectedEvent} orgId={orgId} />
          </TabsContent>
          <TabsContent value="artist-links" className="mt-5">
            <ArtistLinksTab selectedEventId={selectedEvent} orgId={orgId} />
          </TabsContent>
          <TabsContent value="settings" className="mt-5">
            <SettingsTab orgId={orgId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
