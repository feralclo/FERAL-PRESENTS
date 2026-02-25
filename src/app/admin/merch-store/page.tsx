"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ShoppingBag,
  Plus,
  Loader2,
  Calendar,
  MapPin,
  Package,
  ArrowRight,
  Settings,
  Crown,
  Eye,
} from "lucide-react";
import { useOrgId } from "@/components/OrgProvider";
import type { MerchCollection, MerchStoreSettings } from "@/types/merch-store";
import { DEFAULT_MERCH_STORE_SETTINGS } from "@/types/merch-store";
import type { Event } from "@/types/events";

type FilterTab = "all" | "active" | "draft" | "archived";

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  active: "success",
  draft: "warning",
  archived: "secondary",
};

export default function MerchStorePage() {
  const router = useRouter();
  const orgId = useOrgId();
  const [collections, setCollections] = useState<MerchCollection[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [storeSettings, setStoreSettings] = useState<MerchStoreSettings>(DEFAULT_MERCH_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Create form state
  const [newEventId, setNewEventId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newIsLimited, setNewIsLimited] = useState(false);

  // Settings form state
  const [editSettings, setEditSettings] = useState<MerchStoreSettings>(DEFAULT_MERCH_STORE_SETTINGS);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [collectionsRes, eventsRes, settingsRes] = await Promise.all([
        fetch("/api/merch-store/collections?all=true"),
        fetch("/api/events"),
        fetch("/api/merch-store/settings"),
      ]);
      const [collectionsJson, eventsJson, settingsJson] = await Promise.all([
        collectionsRes.json(),
        eventsRes.json(),
        settingsRes.json(),
      ]);

      if (collectionsJson.data) setCollections(collectionsJson.data);
      if (eventsJson.data) setEvents(eventsJson.data);
      if (settingsJson.data) {
        setStoreSettings(settingsJson.data);
        setEditSettings(settingsJson.data);
      }
    } catch {
      // Network error
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-generate slug from event name when event changes
  const handleEventChange = (eventId: string) => {
    setNewEventId(eventId);
    const event = events.find((e) => e.id === eventId);
    if (event) {
      const baseTitle = `${event.name} Merch`;
      setNewTitle(baseTitle);
      const slug = event.slug + "-merch";
      setNewSlug(slug);
    }
  };

  const handleCreate = async () => {
    if (!newEventId || !newTitle.trim() || !newSlug.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/merch-store/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: newEventId,
          title: newTitle.trim(),
          slug: newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          is_limited_edition: newIsLimited,
        }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setShowCreate(false);
        setNewEventId("");
        setNewTitle("");
        setNewSlug("");
        setNewIsLimited(false);
        router.push(`/admin/merch-store/${json.data.slug}/`);
      }
    } catch {
      // Network error
    }
    setCreating(false);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      const res = await fetch("/api/merch-store/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editSettings),
      });
      if (res.ok) {
        const json = await res.json();
        setStoreSettings(json.data);
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } catch {
      // Network error
    }
    setSavingSettings(false);
  };

  const filtered =
    filter === "all"
      ? collections
      : collections.filter((c) => c.status === filter);

  const counts = {
    all: collections.length,
    active: collections.filter((c) => c.status === "active").length,
    draft: collections.filter((c) => c.status === "draft").length,
    archived: collections.filter((c) => c.status === "archived").length,
  };

  // Events that don't already have a collection
  const collectionEventIds = new Set(collections.map((c) => c.event_id));
  const availableEvents = events.filter((e) => !collectionEventIds.has(e.id));

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
              Merch Store
            </h1>
            <Badge
              variant={storeSettings.enabled ? "success" : "secondary"}
              className="text-[10px]"
            >
              {storeSettings.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Create merch collections for your events. Fans can pre-order and collect at the event.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(true)}
          >
            <Settings size={14} />
            Store Settings
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            New Collection
          </Button>
        </div>
      </div>

      {/* Store Status Card */}
      {!storeSettings.enabled && collections.length > 0 && (
        <Card className="border-warning/20 bg-warning/5 py-0 gap-0">
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15">
              <Eye size={14} className="text-warning" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-foreground">
                Your merch store is not visible to customers yet
              </p>
              <p className="text-[11px] text-muted-foreground">
                Enable it in Store Settings to add &quot;{storeSettings.nav_label}&quot; to your site navigation.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setShowSettings(true)}
            >
              Enable
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      {collections.length > 0 && (
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
          {(["all", "active", "draft", "archived"] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground/60">
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Collections Grid */}
      {loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">Loading collections...</span>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <ShoppingBag size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {filter === "all" ? "No collections yet" : `No ${filter} collections`}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {filter === "all"
                ? "Create a merch collection linked to an event. Fans can pre-order merch and collect it at the event."
                : "Collections with this status will appear here."}
            </p>
            {filter === "all" && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setShowCreate(true)}
              >
                <Plus size={14} />
                New Collection
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((collection) => {
            const event = collection.event as Event | undefined;
            const itemCount = collection.items?.length || 0;
            const heroImage = collection.hero_image || event?.cover_image || event?.hero_image;

            return (
              <Card
                key={collection.id}
                className="group cursor-pointer py-0 gap-0 overflow-hidden transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                onClick={() => router.push(`/admin/merch-store/${collection.slug}/`)}
              >
                {/* Hero image or gradient */}
                <div className="relative h-32 overflow-hidden">
                  {heroImage ? (
                    <img
                      src={heroImage}
                      alt={collection.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-primary/20 via-primary/10 to-background" />
                  )}
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                  {/* Status badge */}
                  <div className="absolute top-3 left-3">
                    <Badge variant={STATUS_VARIANT[collection.status] || "secondary"}>
                      {collection.status}
                    </Badge>
                  </div>
                  {/* Limited edition badge */}
                  {collection.is_limited_edition && (
                    <div className="absolute top-3 right-3">
                      <Badge className="gap-1 border-amber-500/30 bg-amber-500/15 text-amber-400 text-[10px]">
                        <Crown size={9} />
                        {collection.limited_edition_label || "Limited Edition"}
                      </Badge>
                    </div>
                  )}
                </div>

                <CardContent className="px-4 py-3">
                  {/* Collection title */}
                  <h3 className="font-medium text-sm text-foreground truncate">
                    {collection.title}
                  </h3>

                  {/* Event info */}
                  {event && (
                    <div className="mt-2 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Calendar size={11} className="shrink-0" />
                        <span className="truncate">
                          {new Date(event.date_start).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      {event.venue_name && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <MapPin size={11} className="shrink-0" />
                          <span className="truncate">{event.venue_name}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Package size={11} />
                      <span>
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      <span>Edit</span>
                      <ArrowRight size={11} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Collection Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Collection</DialogTitle>
            <DialogDescription>
              Create a merch collection linked to one of your events. Fans can pre-order merch and collect it at the event.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Event *</Label>
              {availableEvents.length > 0 ? (
                <Select value={newEventId} onValueChange={handleEventChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an event..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEvents.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        <span className="flex items-center gap-2">
                          <span>{event.name}</span>
                          <span className="text-muted-foreground text-[11px]">
                            {new Date(event.date_start).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="rounded-lg border border-border/50 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                  {events.length === 0
                    ? "No events found. Create an event first."
                    : "All events already have collections."}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Collection Title *</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Summer Festival Merch"
              />
            </div>
            <div className="space-y-2">
              <Label>URL Slug *</Label>
              <div className="flex items-center gap-0">
                <span className="shrink-0 rounded-l-md border border-r-0 border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  /shop/
                </span>
                <Input
                  value={newSlug}
                  onChange={(e) =>
                    setNewSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")
                    )
                  }
                  className="rounded-l-none"
                  placeholder="summer-festival-merch"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <Crown size={16} className="text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Limited Edition</p>
                  <p className="text-[11px] text-muted-foreground">
                    Mark as an exclusive, limited-edition collector&apos;s drop
                  </p>
                </div>
              </div>
              <Switch
                checked={newIsLimited}
                onCheckedChange={setNewIsLimited}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newEventId || !newTitle.trim() || !newSlug.trim()}
            >
              {creating && <Loader2 size={14} className="animate-spin" />}
              {creating ? "Creating..." : "Create Collection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Store Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Store Settings</DialogTitle>
            <DialogDescription>
              Configure your merch store visibility and navigation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Enable Merch Store</p>
                <p className="text-[11px] text-muted-foreground">
                  Show the store in your site navigation
                </p>
              </div>
              <Switch
                checked={editSettings.enabled}
                onCheckedChange={(enabled) =>
                  setEditSettings((s) => ({ ...s, enabled }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Navigation Label</Label>
              <Input
                value={editSettings.nav_label}
                onChange={(e) =>
                  setEditSettings((s) => ({ ...s, nav_label: e.target.value }))
                }
                placeholder="Shop"
              />
              <p className="text-[11px] text-muted-foreground">
                This appears in the site header navigation (e.g. &quot;Shop&quot;, &quot;Merch&quot;, &quot;Store&quot;)
              </p>
            </div>
            <div className="space-y-2">
              <Label>Store Heading</Label>
              <Input
                value={editSettings.store_heading}
                onChange={(e) =>
                  setEditSettings((s) => ({ ...s, store_heading: e.target.value }))
                }
                placeholder="Shop"
              />
            </div>
            <div className="space-y-2">
              <Label>Store Description</Label>
              <Input
                value={editSettings.store_description}
                onChange={(e) =>
                  setEditSettings((s) => ({ ...s, store_description: e.target.value }))
                }
                placeholder="Pre-order exclusive merch for upcoming events."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings && <Loader2 size={14} className="animate-spin" />}
              {settingsSaved ? "Saved!" : savingSettings ? "Saving..." : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
