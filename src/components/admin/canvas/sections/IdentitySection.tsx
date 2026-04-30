"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Lock, Unlock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PlaceAutocomplete } from "@/components/admin/PlaceAutocomplete";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { slugify } from "@/lib/signup";
import { cn } from "@/lib/utils";
import type { TabProps } from "@/components/admin/event-editor/types";

/**
 * Identity — the answers to "what / when / where", in the order a host
 * actually thinks. First section the canvas opens. Replaces DetailsTab.
 *
 * Slug behaviour: when locked, auto-tracks the event name. We infer the
 * starting state on first render — if the existing slug already matches
 * slugify(name), the host hasn't hand-tuned it, so locking is safe and
 * future renames will follow. If the slugs diverge (e.g. an existing
 * event whose URL was hand-edited), we start *unlocked* so we don't
 * silently overwrite a custom URL the host cares about.
 */
export function IdentitySection({ event, updateEvent }: TabProps) {
  const { timezone } = useOrgTimezone();

  // Infer initial lock state once. If the slug looks like a fresh
  // slugify(name), assume auto-tracking is fine. If the host hand-tuned
  // the URL (slug !== slugify(name)), default to unlocked so renaming
  // doesn't surprise them.
  const [slugLocked, setSlugLocked] = useState(() => {
    const expected = slugify(event.name || "");
    if (!event.slug) return true;
    return event.slug === expected;
  });
  const [copied, setCopied] = useState(false);
  const lastNameRef = useRef(event.name);

  // Re-derive slug when name changes AND the field is locked. We only fire
  // the update when the derived slug actually differs to avoid an infinite
  // setState loop.
  useEffect(() => {
    if (!slugLocked) return;
    if (event.name === lastNameRef.current && event.slug) return;
    lastNameRef.current = event.name;
    const next = slugify(event.name || "");
    if (next && next !== event.slug) {
      updateEvent("slug", next);
    }
  }, [event.name, event.slug, slugLocked, updateEvent]);

  const handleCopyUrl = async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/event/${event.slug || ""}/`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — silent */
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Event name *</Label>
          <Input
            value={event.name}
            onChange={(e) => updateEvent("name", e.target.value)}
            placeholder="e.g. Summer Solstice"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>URL slug</Label>
            <button
              type="button"
              onClick={() => setSlugLocked((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1",
                slugLocked
                  ? "text-muted-foreground/70 hover:text-foreground"
                  : "text-primary hover:text-primary/80"
              )}
              aria-label={
                slugLocked
                  ? "Unlock slug to edit by hand"
                  : "Lock slug back to event name"
              }
              title={
                slugLocked
                  ? "Auto-tracking the event name. Click to edit by hand."
                  : "Editing by hand. Click to re-link to the event name."
              }
            >
              {slugLocked ? <Lock size={10} /> : <Unlock size={10} />}
              {slugLocked ? "auto" : "custom"}
            </button>
          </div>
          <Input
            value={event.slug}
            onChange={(e) => updateEvent("slug", e.target.value)}
            placeholder="summer-solstice-june-2026"
            readOnly={slugLocked}
            className={cn(slugLocked && "cursor-not-allowed text-muted-foreground")}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[10px] text-muted-foreground/70">
              /event/{event.slug || "your-event"}/
            </p>
            <button
              type="button"
              onClick={handleCopyUrl}
              disabled={!event.slug}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1",
                copied
                  ? "text-success"
                  : "text-muted-foreground/70 hover:text-foreground disabled:opacity-40"
              )}
              aria-label="Copy event URL"
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? "copied" : "copy"}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Search blurb</Label>
        <Textarea
          value={event.description || ""}
          onChange={(e) => updateEvent("description", e.target.value)}
          placeholder="One sentence that shows in Google results and link previews when someone shares the event."
          rows={3}
        />
        <p className="text-[10px] text-muted-foreground/70">
          Surfaces in search results and Instagram/WhatsApp link previews.
          Different from the &quot;About&quot; copy in the Story section.
        </p>
      </div>

      <SubHeading label="When" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Start *</Label>
          <DateTimePicker
            value={event.date_start || ""}
            onChange={(v) => updateEvent("date_start", v || event.date_start)}
            timezone={timezone}
            showTimezone
          />
        </div>
        <div className="space-y-2">
          <Label>End</Label>
          <DateTimePicker
            value={event.date_end || ""}
            onChange={(v) => updateEvent("date_end", v || null)}
            timezone={timezone}
            showTimezone
          />
          <p className="text-[10px] text-muted-foreground/70">
            Leave blank for a single-day event.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Doors open</Label>
          <DateTimePicker
            value={event.doors_open || ""}
            onChange={(v) => updateEvent("doors_open", v || null)}
            timezone={timezone}
            showTimezone
          />
        </div>
        <div className="space-y-2">
          <Label>Capacity</Label>
          <Input
            type="number"
            value={event.capacity ?? ""}
            onChange={(e) =>
              updateEvent(
                "capacity",
                e.target.value ? Number(e.target.value) : null
              )
            }
            placeholder="e.g. 500"
          />
        </div>
      </div>

      <SubHeading label="Where" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Venue</Label>
          <PlaceAutocomplete
            value={event.venue_name || ""}
            onChange={(v) => updateEvent("venue_name", v)}
            onPlaceSelected={(p) => {
              updateEvent("venue_name", p.name || event.venue_name || "");
              if (p.address && !event.venue_address)
                updateEvent("venue_address", p.address);
              if (p.city && !event.city) updateEvent("city", p.city);
              if (p.country && !event.country) updateEvent("country", p.country);
            }}
            mode="venue"
            placeholder="e.g. Invisible Wind Factory"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Pick from suggestions to auto-fill address, city, and country.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Venue address</Label>
          <Input
            value={event.venue_address || ""}
            onChange={(e) => updateEvent("venue_address", e.target.value)}
            placeholder="e.g. 3 Regent Rd, Liverpool"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
        <div className="space-y-2">
          <Label>City</Label>
          <PlaceAutocomplete
            value={event.city || ""}
            onChange={(v) => updateEvent("city", v)}
            onPlaceSelected={(p) => {
              if (p.country && !event.country) updateEvent("country", p.country);
            }}
            mode="city"
            placeholder="e.g. Liverpool"
          />
        </div>
        <div className="space-y-2">
          <Label>Country</Label>
          <Input
            value={event.country || ""}
            onChange={(e) => updateEvent("country", e.target.value)}
            placeholder="e.g. UK"
          />
        </div>
        <div className="space-y-2">
          <Label>Age restriction</Label>
          <Input
            value={event.age_restriction || ""}
            onChange={(e) => updateEvent("age_restriction", e.target.value)}
            placeholder="e.g. 18+"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Quiet inline divider with a Space-Mono eyebrow. Splits the dense
 * Identity grid into "When" + "Where" without escalating to a second
 * collapsible accordion.
 */
function SubHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </span>
      <span className="h-px flex-1 bg-border/40" />
    </div>
  );
}
