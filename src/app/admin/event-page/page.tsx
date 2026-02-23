"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgId } from "@/components/OrgProvider";
import type { EventSettings } from "@/types/settings";

interface EventOption {
  id: string;
  slug: string;
  name: string;
  status: string;
  settings_key: string;
}

export default function EventPageSettings() {
  const orgId = useOrgId();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [settingsKey, setSettingsKey] = useState("");
  const [settings, setSettings] = useState<EventSettings>({});
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Fetch events list
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((json) => {
        const list: EventOption[] = (json.data || json || []).map(
          (e: Record<string, unknown>) => ({
            id: e.id as string,
            slug: e.slug as string,
            name: e.name as string,
            status: e.status as string,
            settings_key:
              (e.settings_key as string) ||
              `${orgId}_event_${e.slug as string}`,
          })
        );
        setEvents(list);
        // Auto-select first active event, or first overall
        const active = list.find((e) => e.status === "active");
        const first = active || list[0];
        if (first) {
          setSelectedEventId(first.id);
          setSettingsKey(first.settings_key);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  // Fetch settings when selected event changes
  useEffect(() => {
    if (!settingsKey) return;
    setSettingsLoading(true);
    setError("");
    fetch(`/api/settings?key=${settingsKey}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setSettings(json.data);
        } else {
          setSettings({});
        }
      })
      .catch(() => setSettings({}))
      .finally(() => setSettingsLoading(false));
  }, [settingsKey]);

  // Handle event selection change
  const handleEventChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setSelectedEventId(id);
      const ev = events.find((ev) => ev.id === id);
      if (ev) setSettingsKey(ev.settings_key);
      setSaved(false);
    },
    [events]
  );

  // Save settings
  const handleSave = useCallback(async () => {
    if (!settingsKey) return;
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingsKey, data: settings }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed: ${res.status}`);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [settingsKey, settings]);

  if (loading) {
    return (
      <div className="p-8 max-w-2xl">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-72 mb-8" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <h1 className="font-mono text-lg font-bold tracking-[3px] uppercase text-foreground mb-1">
        Event Page
      </h1>
      <p className="font-mono text-[11px] text-muted-foreground tracking-[1px] mb-8">
        Control event page behavior and features.
      </p>

      {/* Event selector */}
      {events.length > 0 && (
        <div className="mb-6">
          <Label className="font-mono text-[10px] tracking-[2px] uppercase text-muted-foreground mb-2 block">
            Event
          </Label>
          <div className="flex items-center gap-3">
            <NativeSelect
              value={selectedEventId}
              onChange={handleEventChange}
              className="max-w-xs"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </NativeSelect>
            {selectedEvent && (
              <Badge
                variant={selectedEvent.status === "active" ? "default" : "outline"}
                className="font-mono text-[9px] tracking-[1px] uppercase"
              >
                {selectedEvent.status}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Settings */}
      {settingsLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <h3 className="font-mono text-xs font-semibold tracking-[2px] uppercase text-foreground mb-1">
              Mobile Experience
            </h3>
            <p className="font-mono text-[10px] text-muted-foreground tracking-[0.5px] mb-5">
              Settings that affect how the event page behaves on mobile devices.
            </p>

            {/* Sticky Checkout Bar toggle */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Label className="text-sm font-medium text-foreground">
                  Sticky Checkout Bar
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Shows a fixed bar at the bottom of the screen on mobile with the cart total and a checkout button. Keeps the CTA always visible while scrolling.
                </p>
              </div>
              <Switch
                checked={settings.sticky_checkout_bar !== false}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    sticky_checkout_bar: checked,
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save */}
      <div className="flex items-center gap-4 mt-6">
        <Button
          onClick={handleSave}
          disabled={saving || settingsLoading}
          className="font-mono text-[11px] tracking-[2px] uppercase"
        >
          {saving ? "Saving..." : "Save"}
        </Button>

        {saved && (
          <span className="font-mono text-[10px] text-success tracking-[1px]">
            Saved successfully
          </span>
        )}

        {error && (
          <span className="font-mono text-[10px] text-destructive tracking-[0.5px]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
