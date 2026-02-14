"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID, SETTINGS_KEYS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EventEditorHeader } from "@/components/admin/event-editor/EventEditorHeader";
import { DetailsTab } from "@/components/admin/event-editor/DetailsTab";
import { ContentTab } from "@/components/admin/event-editor/ContentTab";
import { DesignTab } from "@/components/admin/event-editor/DesignTab";
import { TicketsTab } from "@/components/admin/event-editor/TicketsTab";
import { SettingsTab } from "@/components/admin/event-editor/SettingsTab";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import type { Event, TicketTypeRow } from "@/types/events";
import type { EventSettings } from "@/types/settings";

const SLUG_TO_KEY: Record<string, string> = {
  "liverpool-27-march": SETTINGS_KEYS.LIVERPOOL,
  "kompass-klub-7-march": SETTINGS_KEYS.KOMPASS,
};

export default function EventEditorPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeRow[]>([]);
  const [deletedTypeIds, setDeletedTypeIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<EventSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load event by slug
  useEffect(() => {
    async function load() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data } = await supabase
        .from(TABLES.EVENTS)
        .select("*, ticket_types(*, product:products(*))")
        .eq("org_id", ORG_ID)
        .eq("slug", slug)
        .single();

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setEvent(data as Event);
      const types = (data.ticket_types || []) as TicketTypeRow[];
      setTicketTypes(types.sort((a, b) => a.sort_order - b.sort_order));

      // Load site_settings
      const key =
        SLUG_TO_KEY[slug] || data.settings_key || `feral_event_${slug}`;
      const { data: sd } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", key)
        .single();
      if (sd?.data) {
        const s = sd.data as EventSettings;
        setSettings(s);
        if (data.payment_method === "weeztix" && s.theme) {
          setEvent((prev) =>
            prev ? { ...prev, theme: s.theme as string } : prev
          );
        }
      }

      setLoading(false);
    }
    load();
  }, [slug]);

  const updateEvent = useCallback((field: string, value: unknown) => {
    setEvent((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const updateSetting = useCallback((field: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!event) return;
    setSaving(true);
    setSaveMsg("");

    try {
      // STEP 1: Save site_settings FIRST
      {
        const supabase = getSupabaseClient();
        if (supabase) {
          const key =
            SLUG_TO_KEY[slug] ||
            event.settings_key ||
            `feral_event_${event.slug}`;

          const groupData = {
            ticket_groups: settings.ticket_groups || [],
            ticket_group_map: settings.ticket_group_map || {},
          };

          const dataToSave =
            event.payment_method === "weeztix"
              ? { ...settings, ...groupData }
              : {
                  theme: event.theme || "default",
                  minimalBlurStrength: settings.minimalBlurStrength ?? 4,
                  minimalStaticStrength: settings.minimalStaticStrength ?? 5,
                  minimalBgEnabled: !!(event.hero_image || event.cover_image),
                  ...groupData,
                };

          await supabase.from(TABLES.SITE_SETTINGS).upsert(
            {
              key,
              data: dataToSave,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" }
          );
        }
      }

      // STEP 2: Save event + ticket types via API
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: event.name,
          slug: event.slug,
          description: event.description || null,
          venue_name: event.venue_name || null,
          venue_address: event.venue_address || null,
          city: event.city || null,
          country: event.country || null,
          date_start: event.date_start,
          date_end: event.date_end || null,
          doors_open: event.doors_open || null,
          age_restriction: event.age_restriction || null,
          status: event.status,
          visibility: event.visibility,
          payment_method: event.payment_method,
          capacity: event.capacity || null,
          cover_image: event.cover_image || null,
          hero_image: event.hero_image || null,
          theme: event.theme || "default",
          currency: event.currency,
          about_text: event.about_text || null,
          lineup:
            event.lineup && event.lineup.length > 0 ? event.lineup : null,
          details_text: event.details_text || null,
          tag_line: event.tag_line || null,
          doors_time: event.doors_time || null,
          platform_fee_percent: event.platform_fee_percent ?? null,
          ticket_types: ticketTypes.map((tt) => ({
            ...(tt.id ? { id: tt.id } : {}),
            name: tt.name,
            description: tt.description || null,
            price: Number(tt.price),
            capacity: tt.capacity ? Number(tt.capacity) : null,
            status: tt.status,
            sort_order: tt.sort_order,
            includes_merch: tt.includes_merch,
            merch_name: tt.merch_name || null,
            merch_type: tt.merch_type || null,
            merch_sizes: tt.merch_sizes || null,
            merch_description: tt.merch_description || null,
            merch_images: tt.merch_images || null,
            min_per_order: tt.min_per_order,
            max_per_order: tt.max_per_order,
            sale_start: tt.sale_start || null,
            sale_end: tt.sale_end || null,
            tier: tt.tier || "standard",
            product_id: tt.product_id || null,
          })),
          deleted_ticket_type_ids: deletedTypeIds,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setEvent(json.data);
        const types = (json.data.ticket_types || []) as TicketTypeRow[];
        setTicketTypes(types.sort((a, b) => a.sort_order - b.sort_order));
        setDeletedTypeIds([]);

        if (event.cover_image && !json.data.cover_image) {
          setSaveMsg(
            "Saved, but image may not have persisted. Try a smaller image."
          );
        } else {
          setSaveMsg("Saved successfully");
        }
      } else {
        setSaveMsg(`Error: ${json.error}`);
      }
    } catch {
      setSaveMsg("Network error");
    }

    setSaving(false);
    setTimeout(() => setSaveMsg(""), 4000);
  }, [event, ticketTypes, deletedTypeIds, settings, slug]);

  const handleDelete = useCallback(async () => {
    if (!event) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/events/");
      } else {
        const json = await res.json();
        setSaveMsg(`Delete failed: ${json.error}`);
        setShowDeleteConfirm(false);
      }
    } catch {
      setSaveMsg("Network error during delete");
      setShowDeleteConfirm(false);
    }
    setDeleting(false);
  }, [event, router]);

  /* ── Loading / Not found states ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-primary/60" />
        <span className="ml-3 text-sm text-muted-foreground">
          Loading event...
        </span>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="p-6 lg:p-8">
        <Link
          href="/admin/events/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to Events
        </Link>
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-foreground">
              Event not found
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              No event matches slug: {slug}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isWeeZTix = event.payment_method === "weeztix";

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <EventEditorHeader
        event={event}
        saving={saving}
        onSave={handleSave}
        onDelete={() => setShowDeleteConfirm(true)}
      />

      {/* Save Message */}
      {saveMsg && (
        <div
          className={`rounded-md border px-4 py-2.5 text-sm ${
            saveMsg.includes("Error") || saveMsg.includes("error")
              ? "border-destructive/20 bg-destructive/5 text-destructive"
              : "border-success/20 bg-success/5 text-success"
          }`}
        >
          {saveMsg}
        </div>
      )}

      {/* WeeZTix read-only banner */}
      {isWeeZTix && (
        <Card className="py-0 gap-0 border-warning/20">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Legacy WeeZTix Event
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This event uses WeeZTix for payments. Design and content can be
                edited, but ticket management is handled externally.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab Navigation */}
      <Tabs defaultValue="details">
        <TabsList variant="line">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <DetailsTab event={event} updateEvent={updateEvent} />
        </TabsContent>

        <TabsContent value="content" className="mt-6">
          <ContentTab event={event} updateEvent={updateEvent} />
        </TabsContent>

        <TabsContent value="design" className="mt-6">
          <DesignTab
            event={event}
            updateEvent={updateEvent}
            settings={settings}
            updateSetting={updateSetting}
          />
        </TabsContent>

        <TabsContent value="tickets" className="mt-6">
          <TicketsTab
            event={event}
            updateEvent={updateEvent}
            settings={settings}
            updateSetting={updateSetting}
            ticketTypes={ticketTypes}
            setTicketTypes={setTicketTypes}
            deletedTypeIds={deletedTypeIds}
            setDeletedTypeIds={setDeletedTypeIds}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <SettingsTab event={event} updateEvent={updateEvent} />
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
            <DialogDescription>
              Permanently delete &ldquo;{event.name}&rdquo;? This cannot be
              undone. All associated ticket types will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 size={14} className="animate-spin" />}
              {deleting ? "Deleting..." : "Delete Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
