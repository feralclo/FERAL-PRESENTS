"use client";

import { useEffect, useState } from "react";
import { Loader2, Calendar } from "lucide-react";
import { SectionFooter, SectionField, SectionHeading, HintCard } from "../Shell";
import { getDefaultCurrency } from "@/lib/country-currency-map";
import type { OnboardingApi } from "../../_state";

interface FirstEventData {
  name?: string;
  date_iso?: string;
  venue?: string;
  city?: string;
  ticket_name?: string;
  ticket_price?: number;
  currency?: string;
  external_link?: string;
  event_id?: string;
  slug?: string;
}
interface CountryData {
  country?: string;
}
interface PaymentsData {
  method?: "stripe" | "external";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function FirstEventSection({ api }: { api: OnboardingApi }) {
  const stored = (api.getSection("first_event")?.data ?? {}) as FirstEventData;
  const country = ((api.getSection("country")?.data ?? {}) as CountryData).country ?? "GB";
  const paymentsMethod = ((api.getSection("payments")?.data ?? {}) as PaymentsData).method ?? "stripe";
  const defaultCurrency = getDefaultCurrency(country);

  const [name, setName] = useState(stored.name ?? "");
  const [dateIso, setDateIso] = useState(stored.date_iso ?? "");
  const [venue, setVenue] = useState(stored.venue ?? "");
  const [city, setCity] = useState(stored.city ?? "");
  const [ticketName, setTicketName] = useState(stored.ticket_name ?? "General Admission");
  const [ticketPrice, setTicketPrice] = useState<number | "">(stored.ticket_price ?? "");
  const [currency, setCurrency] = useState(stored.currency ?? defaultCurrency);
  const [externalLink, setExternalLink] = useState(stored.external_link ?? "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState(stored.event_id ?? null);
  const [createdSlug, setCreatedSlug] = useState(stored.slug ?? null);

  useEffect(() => {
    api.updateSectionData("first_event", {
      name,
      date_iso: dateIso || undefined,
      venue,
      city,
      ticket_name: ticketName,
      ticket_price: typeof ticketPrice === "number" ? ticketPrice : undefined,
      currency,
      external_link: externalLink || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, dateIso, venue, city, ticketName, ticketPrice, currency, externalLink]);

  async function createEvent() {
    if (!name.trim() || !dateIso || (paymentsMethod === "external" ? !externalLink.trim() : ticketPrice === "")) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const slug = slugify(name);
      const payload: Record<string, unknown> = {
        name: name.trim(),
        slug,
        date_start: new Date(dateIso).toISOString(),
        venue_name: venue || undefined,
        city: city || undefined,
        currency,
        status: "draft",
        visibility: "private",
        payment_method: paymentsMethod,
      };

      if (paymentsMethod === "external") {
        payload.external_link = externalLink.trim();
      } else {
        payload.ticket_types = [
          {
            name: ticketName.trim() || "General Admission",
            price: typeof ticketPrice === "number" ? ticketPrice : 0,
            min_per_order: 1,
            max_per_order: 10,
            tier: "standard",
          },
        ];
      }

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `Could not create event (${res.status})`);
      }
      const event = json.data ?? json.event ?? json;
      setCreatedId(event.id);
      setCreatedSlug(event.slug);
      api.updateSectionData("first_event", {
        event_id: event.id,
        slug: event.slug,
      });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create event");
    } finally {
      setCreating(false);
    }
  }

  const filledRequired =
    !!name.trim() &&
    !!dateIso &&
    (paymentsMethod === "external" ? !!externalLink.trim() : ticketPrice !== "" && Number(ticketPrice) >= 0);

  return (
    <div>
      <SectionHeading
        eyebrow="Step 7 of 9"
        title="Your first event"
        subtitle="Drop in the basics. We'll save it as a draft so you can preview before going live."
      />

      <div className="space-y-5">
        <SectionField label="Event name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="e.g. Summer Solstice"
            className={inputClass}
          />
        </SectionField>

        <SectionField label="Date & time">
          <div className="relative">
            <Calendar
              size={14}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="datetime-local"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
              className={`${inputClass} pl-10`}
            />
          </div>
        </SectionField>

        <div className="grid gap-4 sm:grid-cols-2">
          <SectionField label="Venue (optional)">
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Invisible Wind Factory"
              className={inputClass}
            />
          </SectionField>
          <SectionField label="City (optional)">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Liverpool"
              className={inputClass}
            />
          </SectionField>
        </div>

        {paymentsMethod === "external" ? (
          <SectionField
            label="External ticket link"
            hint="We'll publish a listing page that points buyers here."
          >
            <input
              type="url"
              value={externalLink}
              onChange={(e) => setExternalLink(e.target.value)}
              placeholder="https://www.skiddle.com/e/..."
              className={inputClass}
            />
          </SectionField>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <SectionField label="Ticket name">
              <input
                type="text"
                value={ticketName}
                onChange={(e) => setTicketName(e.target.value)}
                maxLength={60}
                className={inputClass}
              />
            </SectionField>
            <SectionField label="Price">
              <input
                type="number"
                min={0}
                step={0.5}
                value={ticketPrice}
                onChange={(e) =>
                  setTicketPrice(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="15"
                className={inputClass}
              />
            </SectionField>
            <SectionField label="Currency">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputClass}
              >
                <option value="GBP">GBP (£)</option>
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
                <option value="JPY">JPY (¥)</option>
              </select>
            </SectionField>
          </div>
        )}

        {createError && (
          <div className="rounded-xl border border-destructive/15 bg-destructive/8 px-4 py-2.5 text-[12px] text-destructive">
            {createError}
          </div>
        )}

        {createdId && createdSlug && (
          <div className="rounded-xl border border-success/20 bg-success/[0.06] px-4 py-3 text-[13px] text-foreground">
            Saved as draft. You'll be able to publish from your dashboard in one click.
          </div>
        )}

        <HintCard>
          You can refine cover artwork, lineup, multiple ticket types, doors time, age policy and
          much more later in the event editor.
        </HintCard>
      </div>

      <SectionFooter
        primaryLabel={createdId ? "Continue" : "Save as draft & continue"}
        primaryDisabled={!filledRequired || creating}
        primaryLoading={creating || api.saving}
        onPrimary={async () => {
          if (!createdId) {
            await createEvent();
          }
          await api.completeAndAdvance("first_event", {
            name,
            date_iso: dateIso,
            venue,
            city,
            ticket_name: ticketName,
            ticket_price: typeof ticketPrice === "number" ? ticketPrice : undefined,
            currency,
            external_link: externalLink || undefined,
          });
        }}
        skipLabel="Skip — I'll create one later"
        onSkip={async () => {
          await api.skipAndAdvance("first_event");
        }}
      />
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-input bg-background/40 px-4 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15";
