"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check } from "lucide-react";
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
  const paymentsMethod =
    ((api.getSection("payments")?.data ?? {}) as PaymentsData).method ?? "stripe";
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
    if (
      !name.trim() ||
      !dateIso ||
      (paymentsMethod === "external" ? !externalLink.trim() : ticketPrice === "")
    ) {
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
      api.updateSectionData("first_event", { event_id: event.id, slug: event.slug });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create event.");
    } finally {
      setCreating(false);
    }
  }

  const filledRequired =
    !!name.trim() &&
    !!dateIso &&
    (paymentsMethod === "external"
      ? !!externalLink.trim()
      : ticketPrice !== "" && Number(ticketPrice) >= 0);

  return (
    <>
      <SectionHeading
        eyebrow="Step 7 of 9"
        title="Your first event"
        subtitle="The basics. We'll save it as a draft so you can preview before going live."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Event details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SectionField label="Event name" htmlFor="onb-event-name">
            <Input
              id="onb-event-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Summer Solstice"
            />
          </SectionField>

          <SectionField label="Date & time" htmlFor="onb-event-date">
            <div className="relative">
              <Calendar
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="onb-event-date"
                type="datetime-local"
                value={dateIso}
                onChange={(e) => setDateIso(e.target.value)}
                className="pl-9"
              />
            </div>
          </SectionField>

          <div className="grid gap-4 sm:grid-cols-2">
            <SectionField label="Venue (optional)" htmlFor="onb-event-venue">
              <Input
                id="onb-event-venue"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Invisible Wind Factory"
              />
            </SectionField>
            <SectionField label="City (optional)" htmlFor="onb-event-city">
              <Input
                id="onb-event-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Liverpool"
              />
            </SectionField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {paymentsMethod === "external" ? "Ticket link" : "Ticket"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentsMethod === "external" ? (
            <SectionField
              label="Where do buyers go?"
              htmlFor="onb-event-link"
              hint="We'll publish a listing page that points buyers to this URL."
            >
              <Input
                id="onb-event-link"
                type="url"
                value={externalLink}
                onChange={(e) => setExternalLink(e.target.value)}
                placeholder="https://www.skiddle.com/e/..."
              />
            </SectionField>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <SectionField label="Ticket name" htmlFor="onb-ticket-name">
                <Input
                  id="onb-ticket-name"
                  value={ticketName}
                  onChange={(e) => setTicketName(e.target.value)}
                  maxLength={60}
                />
              </SectionField>
              <SectionField label="Price" htmlFor="onb-ticket-price">
                <Input
                  id="onb-ticket-price"
                  type="number"
                  min={0}
                  step={0.5}
                  value={ticketPrice}
                  onChange={(e) =>
                    setTicketPrice(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="15"
                />
              </SectionField>
              <SectionField label="Currency" htmlFor="onb-ticket-currency">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="onb-ticket-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="JPY">JPY (¥)</SelectItem>
                  </SelectContent>
                </Select>
              </SectionField>
            </div>
          )}
        </CardContent>
      </Card>

      {createError && (
        <Alert variant="destructive">
          <AlertDescription>{createError}</AlertDescription>
        </Alert>
      )}

      {createdId && createdSlug && (
        <Alert variant="success">
          <Check className="size-4" />
          <AlertDescription>
            Saved as a draft. You&apos;ll publish from your dashboard in one click.
          </AlertDescription>
        </Alert>
      )}

      <HintCard>
        Cover artwork, lineup, multiple ticket types, doors time, age policy and more all live in
        the event editor after onboarding.
      </HintCard>

      <SectionFooter
        primaryLabel={createdId ? "Continue" : "Save as draft & continue"}
        primaryDisabled={!filledRequired || creating}
        primaryLoading={creating || api.saving}
        onPrimary={async () => {
          if (!createdId) await createEvent();
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
    </>
  );
}
