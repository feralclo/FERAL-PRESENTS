"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, brandingKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/ui";
import { EventEditorHeader } from "@/components/admin/event-editor/EventEditorHeader";
import { CanvasShell } from "@/components/admin/canvas/CanvasShell";
import { CanvasShellSkeleton } from "@/components/admin/canvas/CanvasShellSkeleton";
import { CanvasSection } from "@/components/admin/canvas/CanvasSection";
import { CanvasPreview } from "@/components/admin/canvas/CanvasPreview";
import { ReadinessCard } from "@/components/admin/canvas/ReadinessCard";
import { PublishCard } from "@/components/admin/canvas/PublishCard";
import { useCanvasSync } from "@/components/admin/canvas/useCanvasSync";
import { IdentitySection } from "@/components/admin/canvas/sections/IdentitySection";
import { StorySection } from "@/components/admin/canvas/sections/StorySection";
import { LookSection } from "@/components/admin/canvas/sections/LookSection";
import { TicketsSection } from "@/components/admin/canvas/sections/TicketsSection";
import { MoneySection } from "@/components/admin/canvas/sections/MoneySection";
import { PublishSection } from "@/components/admin/canvas/sections/PublishSection";
import { assessEvent } from "@/lib/event-readiness";
import {
  buildTmpToRealMap,
  isTmpTicketId,
  translateTmpIdsInMap,
} from "@/lib/ticket-tmp-id";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Event, TicketTypeRow } from "@/types/events";
import type { EventSettings, BrandingSettings } from "@/types/settings";
import type { EventArtist } from "@/types/artists";

/**
 * Event editor — the canvas. Replaces the legacy 6-tab editor (shipped
 * Phase 3, EVENT-BUILDER-PLAN). Two panes on desktop: form (left) and
 * live phone-frame preview (right). Mobile: form fills the page, preview
 * lives behind a floating pill that opens a full-screen sheet.
 *
 * The form pane is six narrative sections — Identity / Story / Look /
 * Tickets / Money / Publish. Readiness rail + Publish card sit above the
 * preview. Save model unchanged: explicit central Save in the header.
 */
export default function EventEditorPage() {
  const orgId = useOrgId();
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const sync = useCanvasSync();

  const [event, setEvent] = useState<Event | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeRow[]>([]);
  const [deletedTypeIds, setDeletedTypeIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<EventSettings>({});
  const [branding, setBranding] = useState<BrandingSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [eventArtists, setEventArtists] = useState<EventArtist[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);

  // Load event by slug
  useEffect(() => {
    async function load() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data } = await supabase
        .from(TABLES.EVENTS)
        .select("*, ticket_types(*, product:products(*))")
        .eq("org_id", orgId)
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

      const key = data.settings_key || `${orgId}_event_${slug}`;
      const { data: sd } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", key)
        .single();
      if (sd?.data) setSettings(sd.data as EventSettings);

      try {
        const artistRes = await fetch(`/api/events/${data.id}/artists`);
        const artistJson = await artistRes.json();
        if (artistJson.data) setEventArtists(artistJson.data);
      } catch {
        /* event_artists may not exist yet — non-fatal */
      }

      setLoading(false);
    }
    load();
  }, [slug, orgId]);

  // Load org branding for the preview pane (accent / logo / org_name)
  useEffect(() => {
    fetch(`/api/settings?key=${brandingKey(orgId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setBranding(json.data as BrandingSettings);
      })
      .catch(() => {});
  }, [orgId]);

  // Stripe connection + platform-owner detection drives the readiness gate
  useEffect(() => {
    (async () => {
      try {
        const [, stripeRes] = await Promise.all([
          (async () => {
            const supabase = getSupabaseClient();
            if (!supabase) return;
            const { data } = await supabase.auth.getUser();
            if (data.user?.app_metadata?.is_platform_owner === true) {
              setIsPlatformOwner(true);
            }
          })(),
          fetch("/api/stripe/connect/my-account").catch(() => null),
        ]);
        if (stripeRes?.ok) {
          const json = await stripeRes.json();
          setStripeConnected(!!json.connected && !!json.charges_enabled);
        } else {
          setStripeConnected(false);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const updateEvent = useCallback((field: string, value: unknown) => {
    setEvent((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const updateSetting = useCallback((field: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }, []);

  /**
   * Save flow. Returns true on success. PublishCard awaits this so it
   * can transition to the "You're live" sheet only after the server
   * confirms.
   */
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!event) return false;
    setSaving(true);
    setSaveMsg("");

    let ok = false;
    try {
      // STEP 1: Save site_settings first (matches legacy ordering — see
      // the original page.tsx for the rationale; ticket_groups and
      // sticky_checkout_bar live there).
      //
      // ticket_group_map may contain `tmp-*` keys for tickets that
      // haven't been persisted yet (Phase 4 — the per-card Group dropdown
      // and tier templates write tmp-id keys synchronously). We strip
      // those for the initial settings save, then re-save with translated
      // real ids after the API response below.
      {
        const supabase = getSupabaseClient();
        if (supabase) {
          const key = event.settings_key || `${orgId}_event_${event.slug}`;
          const rawGroupMap = settings.ticket_group_map || {};
          const groupMapWithoutTmp: Record<string, string | null> = {};
          for (const [k, v] of Object.entries(rawGroupMap)) {
            if (!isTmpTicketId(k)) groupMapWithoutTmp[k] = v;
          }
          const dataToSave = {
            ...settings,
            theme: event.theme || "default",
            minimalBlurStrength: settings.minimalBlurStrength ?? 4,
            minimalStaticStrength: settings.minimalStaticStrength ?? 5,
            minimalBgEnabled: !!(event.hero_image || event.cover_image),
            ticket_groups: settings.ticket_groups || [],
            ticket_group_map: groupMapWithoutTmp,
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
      // Strip tmp-* ids from the ticket payload — the API treats absent
      // ids as inserts. Save the pre-save list so we can translate
      // tmp→real ids after the response lands.
      const preSaveTickets = ticketTypes;
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
          cover_image_url: event.cover_image_url || null,
          hero_image: event.hero_image || null,
          banner_image_url: event.banner_image_url || null,
          poster_image_url: event.poster_image_url || null,
          theme: event.theme || "default",
          currency: event.currency,
          about_text: event.about_text || null,
          lineup: event.lineup && event.lineup.length > 0 ? event.lineup : null,
          details_text: event.details_text || null,
          tag_line: event.tag_line || null,
          doors_time: event.doors_time || null,
          lineup_sort_alphabetical: !!event.lineup_sort_alphabetical,
          tickets_live_at: event.tickets_live_at || null,
          announcement_title: event.announcement_title || null,
          announcement_subtitle: event.announcement_subtitle || null,
          queue_enabled: !!event.queue_enabled,
          queue_duration_seconds: event.queue_duration_seconds ?? 45,
          queue_window_minutes: event.queue_window_minutes ?? 60,
          queue_title: event.queue_title || null,
          queue_subtitle: event.queue_subtitle || null,
          seo_title: event.seo_title || null,
          seo_description: event.seo_description || null,
          stripe_account_id: event.stripe_account_id || null,
          external_link: event.external_link || null,
          vat_registered: event.vat_registered ?? null,
          vat_rate: event.vat_rate ?? null,
          vat_prices_include: event.vat_prices_include ?? null,
          vat_number: event.vat_number || null,
          ticket_types: ticketTypes.map((tt) => ({
            ...(tt.id && !isTmpTicketId(tt.id) ? { id: tt.id } : {}),
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
            price_overrides: tt.price_overrides || null,
          })),
          deleted_ticket_type_ids: deletedTypeIds,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setEvent(json.data);
        const types = (json.data.ticket_types || []) as TicketTypeRow[];
        const sortedTypes = types.sort((a, b) => a.sort_order - b.sort_order);
        setTicketTypes(sortedTypes);
        setDeletedTypeIds([]);

        // Translate tmp-* keys in ticket_group_map to the freshly-minted
        // real ids and re-save settings if anything moved. Pre-save list
        // had the tmp ids; post-save list has real ids in matching
        // (sort_order, name) slots.
        const tmpToReal = buildTmpToRealMap(
          preSaveTickets,
          sortedTypes
        );
        if (tmpToReal.size > 0) {
          const rawMap = settings.ticket_group_map || {};
          const translated = translateTmpIdsInMap(rawMap, tmpToReal);
          // Filter out any leftover tmp keys (shouldn't happen, but cheap insurance).
          const cleaned: Record<string, string | null> = {};
          for (const [k, v] of Object.entries(translated)) {
            if (!isTmpTicketId(k)) cleaned[k] = v;
          }
          updateSetting("ticket_group_map", cleaned);

          const supabase = getSupabaseClient();
          if (supabase) {
            const key =
              event.settings_key || `${orgId}_event_${event.slug}`;
            const dataToSave = {
              ...settings,
              theme: event.theme || "default",
              minimalBlurStrength: settings.minimalBlurStrength ?? 4,
              minimalStaticStrength: settings.minimalStaticStrength ?? 5,
              minimalBgEnabled: !!(event.hero_image || event.cover_image),
              ticket_groups: settings.ticket_groups || [],
              ticket_group_map: cleaned,
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

        // Save event artists
        if (eventArtists.length > 0) {
          try {
            const artistRes = await fetch(`/api/events/${event.id}/artists`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                artists: eventArtists.map((ea, i) => ({
                  artist_id: ea.artist_id,
                  sort_order: i,
                })),
              }),
            });
            const artistJson = await artistRes.json();
            if (artistJson.data) setEventArtists(artistJson.data);
          } catch {
            /* event_artists save failed — non-critical */
          }
        } else {
          try {
            await fetch(`/api/events/${event.id}/artists`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ artists: [] }),
            });
          } catch {
            /* ignore */
          }
        }

        if (event.cover_image && !json.data.cover_image) {
          setSaveMsg(
            "Saved, but image may not have persisted. Try a smaller image."
          );
        } else {
          setSaveMsg("Saved successfully");
        }
        ok = true;
      } else {
        setSaveMsg(`Error: ${json.error}`);
      }
    } catch {
      setSaveMsg("Network error");
    }

    setSaving(false);
    setTimeout(() => setSaveMsg(""), 4000);
    return ok;
  }, [event, ticketTypes, deletedTypeIds, settings, eventArtists, orgId]);

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

  const setStatus = useCallback(
    (status: Event["status"]) => updateEvent("status", status),
    [updateEvent]
  );

  // Readiness — recomputed on every render; the cost is trivial (pure
  // function over small arrays) and it's the heartbeat of the right rail.
  const readiness = useMemo(
    () =>
      event
        ? assessEvent(event, ticketTypes, eventArtists, {
            stripeConnected,
            isPlatformOwner,
          })
        : null,
    [event, ticketTypes, eventArtists, stripeConnected, isPlatformOwner]
  );

  // Per-section completeness chips. Map each readiness rule's status to
  // the section it sits on, then aggregate.
  const sectionCompleteness = useMemo(() => {
    if (!readiness) return null;
    const counts: Record<
      "identity" | "story" | "look" | "tickets" | "money" | "publish",
      { ok: number; total: number }
    > = {
      identity: { ok: 0, total: 0 },
      story: { ok: 0, total: 0 },
      look: { ok: 0, total: 0 },
      tickets: { ok: 0, total: 0 },
      money: { ok: 0, total: 0 },
      publish: { ok: 0, total: 0 },
    };
    for (const rule of readiness.rules) {
      counts[rule.anchor].total += 1;
      if (rule.status === "ok") counts[rule.anchor].ok += 1;
    }
    return counts;
  }, [readiness]);

  /* ── Loading / Not-found ── */

  if (loading) {
    return <CanvasShellSkeleton />;
  }

  if (notFound || !event || !readiness || !sectionCompleteness) {
    return (
      <div className="p-6 lg:p-8">
        <Link
          href="/admin/events/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to events
        </Link>
        <AdminCard className="px-5 py-16 text-center">
          <p className="text-sm font-medium text-foreground">Event not found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No event matches slug: {slug}
          </p>
        </AdminCard>
      </div>
    );
  }

  const eventId = event.id || "draft";

  const formPane = (
    <>
      <CanvasSection
        anchor="identity"
        eventId={eventId}
        title="Identity"
        eyebrow="01 — The basics"
        subtitle="What it is, when, and where."
        completeness={sectionCompleteness.identity}
        onActivate={sync.focus}
      >
        <IdentitySection event={event} updateEvent={updateEvent} />
      </CanvasSection>

      <CanvasSection
        anchor="story"
        eventId={eventId}
        title="Story"
        eyebrow="02 — The pitch"
        subtitle="Tag line, about, lineup, fine-print details."
        completeness={sectionCompleteness.story}
        onActivate={sync.focus}
      >
        <StorySection
          event={event}
          updateEvent={updateEvent}
          eventArtists={eventArtists}
          onEventArtistsChange={setEventArtists}
        />
      </CanvasSection>

      <CanvasSection
        anchor="look"
        eventId={eventId}
        title="Look"
        eyebrow="03 — The visuals"
        subtitle="Cover, banner, poster, theme."
        completeness={sectionCompleteness.look}
        onActivate={sync.focus}
      >
        <LookSection
          event={event}
          updateEvent={updateEvent}
          settings={settings}
          updateSetting={updateSetting}
        />
      </CanvasSection>

      <CanvasSection
        anchor="tickets"
        eventId={eventId}
        title="Tickets"
        eyebrow="04 — The product"
        subtitle="Tiers, capacity, release strategy, waitlist."
        completeness={sectionCompleteness.tickets}
        onActivate={sync.focus}
      >
        <TicketsSection
          event={event}
          updateEvent={updateEvent}
          settings={settings}
          updateSetting={updateSetting}
          ticketTypes={ticketTypes}
          setTicketTypes={setTicketTypes}
          deletedTypeIds={deletedTypeIds}
          setDeletedTypeIds={setDeletedTypeIds}
        />
      </CanvasSection>

      <CanvasSection
        anchor="money"
        eventId={eventId}
        title="Money"
        eyebrow="05 — The flow"
        subtitle="Currency, multi-currency, VAT, payment account."
        completeness={sectionCompleteness.money}
        onActivate={sync.focus}
      >
        <MoneySection
          event={event}
          updateEvent={updateEvent}
          settings={settings}
          updateSetting={updateSetting}
        />
      </CanvasSection>

      <CanvasSection
        anchor="publish"
        eventId={eventId}
        title="Publish"
        eyebrow="06 — Going live"
        subtitle="Status, visibility, announcement, queue, SEO."
        completeness={sectionCompleteness.publish}
        onActivate={sync.focus}
      >
        <PublishSection
          event={event}
          updateEvent={updateEvent}
          settings={settings}
          updateSetting={updateSetting}
          artistNames={
            eventArtists.map((ea) => ea.artist?.name).filter(Boolean) as string[]
          }
          orgName={branding.org_name || "Entry"}
        />
      </CanvasSection>
    </>
  );

  const previewPane = (
    <div className="flex flex-col">
      <div className="space-y-3 border-b border-border/40 px-4 py-4">
        <ReadinessCard report={readiness} onJumpToSection={sync.focus} />
        <PublishCard
          event={event}
          report={readiness}
          onSetStatus={setStatus}
          onSave={handleSave}
        />
      </div>
      <div className="relative min-h-[700px]">
        <CanvasPreview
          event={event}
          ticketTypes={ticketTypes}
          eventArtists={eventArtists}
          settings={settings}
          branding={branding}
          sync={sync}
        />
      </div>
    </div>
  );

  return (
    <>
      <CanvasShell
        header={
          <EventEditorHeader
            event={event}
            saving={saving}
            onSave={() => {
              void handleSave();
            }}
            onDelete={() => setShowDeleteConfirm(true)}
          />
        }
        banner={
          saveMsg ? (
            <div
              className={`rounded-md border px-4 py-2.5 text-sm ${
                saveMsg.includes("Error") || saveMsg.includes("error") || saveMsg.includes("failed")
                  ? "border-destructive/20 bg-destructive/5 text-destructive"
                  : "border-success/20 bg-success/5 text-success"
              }`}
            >
              {saveMsg}
            </div>
          ) : null
        }
        form={formPane}
        preview={previewPane}
      />

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete event</DialogTitle>
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
              {deleting ? "Deleting…" : "Delete event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
