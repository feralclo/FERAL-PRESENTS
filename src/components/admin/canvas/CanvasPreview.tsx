"use client";

import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { CURRENCY_SYMBOLS } from "@/components/admin/event-editor/types";
import { SmartLogo } from "@/components/SmartLogo";
import type { Event, TicketTypeRow } from "@/types/events";
import type { EventArtist } from "@/types/artists";
import type { EventSettings, BrandingSettings } from "@/types/settings";
import type { CanvasAnchor, CanvasSyncApi } from "./useCanvasSync";

/**
 * Faithful event-page preview, rendered live from the form pane's working
 * state (not the saved DB state). Mirrors the visual surface of
 * MidnightEventPage closely enough that hosts feel "this is what buyers
 * will see" — but inlined so we don't have to mount the real page (it
 * runs cart logic, analytics, currency conversion, scroll reveals, etc.,
 * none of which belong inside admin).
 *
 * Pattern matched: src/app/admin/onboarding/_components/BrandPreview.tsx
 *
 * Each visual block registers a ref under the same anchor as the form
 * section that drives it; clicking a section header in the form pane
 * scrolls + pulses that block (Phase 3.4 click-to-scroll-sync).
 */

interface CanvasPreviewProps {
  event: Event;
  ticketTypes: TicketTypeRow[];
  eventArtists: EventArtist[];
  settings: EventSettings;
  branding: BrandingSettings;
  sync: CanvasSyncApi;
}

/** Soften a hex into rgba with a given alpha. */
function softHex(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatPrice(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
  if (Number.isInteger(amount)) return `${sym}${amount}`;
  return `${sym}${amount.toFixed(2)}`;
}

function formatDate(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "Date TBA", time: "" };
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: "Date TBA", time: "" };
    return {
      date: d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
      time: d.toLocaleTimeString("en-GB", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    };
  } catch {
    return { date: "Date TBA", time: "" };
  }
}

export function CanvasPreview({
  event,
  ticketTypes,
  eventArtists,
  settings,
  branding,
  sync,
}: CanvasPreviewProps) {
  // Defer heavy text fields so typing in the about textarea doesn't block
  // ticket card re-renders. The cheap fields (name, accent) update
  // immediately for satisfying real-time feedback.
  const aboutText = useDeferredValue(event.about_text);
  const detailsText = useDeferredValue(event.details_text);

  const accent =
    branding.accent_color && /^#[0-9a-fA-F]{6}$/.test(branding.accent_color)
      ? branding.accent_color.toUpperCase()
      : "#8B5CF6";

  const currency = event.currency || "GBP";
  const orgName = (branding.org_name || "Your brand").toUpperCase();
  const previewVars = useMemo(
    () =>
      ({
        ["--prev-accent" as string]: accent,
        ["--prev-accent-soft" as string]: softHex(accent, 0.32),
        ["--prev-accent-tint" as string]: softHex(accent, 0.08),
      }) as React.CSSProperties,
    [accent]
  );

  const heroDate = formatDate(event.date_start);
  const coverImage = event.cover_image_url || event.cover_image || null;
  const bannerImage = event.banner_image_url || event.hero_image || null;
  const heroBg = bannerImage || coverImage;

  // Visible tickets = active + non-system.
  const visibleTickets = useMemo(
    () =>
      ticketTypes
        .filter((tt) => {
          const isSystem =
            tt.status === "hidden" && Number(tt.price) === 0 && !tt.capacity;
          return tt.status !== "archived" && tt.status !== "hidden" && !isSystem;
        })
        .sort((a, b) => a.sort_order - b.sort_order),
    [ticketTypes]
  );
  const minPrice = visibleTickets.length
    ? Math.min(...visibleTickets.map((t) => Number(t.price) || 0))
    : 0;

  const isAnnouncement =
    !!event.tickets_live_at && new Date(event.tickets_live_at) > new Date();

  return (
    // Decorative — the preview's interactive elements are buttons with
    // tabIndex={-1}; semantically this whole tree is a visual reference
    // for the host, not navigation. Mark it aria-hidden so screen readers
    // skip the (otherwise misleading) duplicate event content.
    <div className="relative h-full overflow-hidden" aria-hidden="true">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-1/4 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"
          style={{ background: accent, opacity: 0.06 }}
        />
      </div>

      <div className="relative h-full overflow-y-auto px-4 py-6 lg:px-8 lg:py-10">
        <div className="mx-auto w-full max-w-[380px]">
          <PreviewLabel />
          <PhoneFrame>
            <div
              className="flex flex-col bg-[#0a0a0a] text-white"
              style={previewVars}
              data-theme="midnight"
            >
              <Header brandName={orgName} logo={branding.logo_url} />

              <PulseBlock anchor="identity" sync={sync}>
                <Hero
                  event={event}
                  accent={accent}
                  heroBg={heroBg}
                  heroDate={heroDate}
                  brandName={orgName}
                  minPrice={minPrice}
                  currency={currency}
                  isAnnouncement={isAnnouncement}
                />
              </PulseBlock>

              {(event.about_text || aboutText || event.details_text || detailsText) && (
                <PulseBlock anchor="story" sync={sync}>
                  <AboutBlock
                    aboutText={(aboutText ?? event.about_text) || ""}
                    detailsText={(detailsText ?? event.details_text) || ""}
                    brandName={orgName}
                  />
                </PulseBlock>
              )}

              {/* Lineup, when present + theme implies it */}
              {eventArtists.length > 0 && (
                <PulseBlock anchor="story" sync={sync}>
                  <LineupBlock artists={eventArtists} />
                </PulseBlock>
              )}

              <PulseBlock anchor="look" sync={sync}>
                <ArtworkStrip cover={coverImage} banner={bannerImage} />
              </PulseBlock>

              <PulseBlock anchor="tickets" sync={sync}>
                <TicketWidget
                  tickets={visibleTickets}
                  accent={accent}
                  currency={currency}
                  isAnnouncement={isAnnouncement}
                />
              </PulseBlock>

              <PulseBlock anchor="money" sync={sync}>
                <PaymentStrip
                  paymentMethod={event.payment_method}
                  currency={currency}
                  multiCurrency={!!settings.multi_currency_enabled}
                  vatEnabled={
                    event.vat_registered === true ||
                    (event.vat_registered == null && false)
                  }
                  vatRate={event.vat_rate ?? null}
                />
              </PulseBlock>

              <PulseBlock anchor="publish" sync={sync}>
                <Footer
                  brandName={orgName}
                  slug={event.slug || "your-event"}
                  status={event.status}
                  visibility={event.visibility}
                />
              </PulseBlock>
            </div>
          </PhoneFrame>
        </div>
      </div>
    </div>
  );
}

/* ─── Pulse wrapper ─────────────────────────────────────────────── */

function PulseBlock({
  anchor,
  sync,
  children,
}: {
  anchor: CanvasAnchor;
  sync: CanvasSyncApi;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sync.registerPreview(ref.current, anchor);
    return () => sync.registerPreview(null, anchor);
  }, [anchor, sync]);

  const isPulsing = sync.pulsing === anchor;
  return (
    <div
      ref={ref}
      data-canvas-block={anchor}
      className={
        isPulsing
          ? "ring-2 ring-[var(--prev-accent)] ring-offset-0 transition-shadow duration-300 motion-reduce:ring-0"
          : ""
      }
      style={
        isPulsing
          ? {
              boxShadow: "0 0 24px var(--prev-accent-soft)",
              transition: "box-shadow 600ms ease-out",
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

/* ─── Header / Hero ─────────────────────────────────────────────── */

function PreviewLabel() {
  return (
    <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 motion-reduce:hidden" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
      Live preview · mobile
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-3 rounded-[44px]"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 30%, rgba(255,255,255,0.04), transparent)",
        }}
      />
      <div className="relative overflow-hidden rounded-[40px] border border-white/[0.1] bg-black p-[3px] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.04)_inset]">
        <div className="overflow-hidden rounded-[36px] bg-black">
          {/* Status bar — same chrome as BrandPreview, time hardcoded so
              admin doesn't churn over a setInterval. */}
          <div className="relative flex h-9 items-center justify-between bg-black px-6 text-[11px] font-semibold text-white">
            <span className="tabular-nums">9:41</span>
            <span className="absolute left-1/2 top-1.5 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
            <div className="flex items-center gap-1 text-white/85">
              <span className="text-[10px]">●●●</span>
            </div>
          </div>
          <div className="max-h-[640px] overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Header({ brandName, logo }: { brandName: string; logo?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.05] bg-black/40 px-5 py-3.5">
      <div className="flex h-8 items-center">
        {logo ? (
          <SmartLogo
            src={logo}
            alt={brandName}
            surface="dark"
            className="block max-h-8 max-w-[140px] object-contain"
          />
        ) : (
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-white">
            {brandName}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-white/65">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 motion-reduce:hidden" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
        Live
      </div>
    </div>
  );
}

function Hero({
  event,
  accent,
  heroBg,
  heroDate,
  brandName,
  minPrice,
  currency,
  isAnnouncement,
}: {
  event: Event;
  accent: string;
  heroBg: string | null;
  heroDate: { date: string; time: string };
  brandName: string;
  minPrice: number;
  currency: string;
  isAnnouncement: boolean;
}) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: `
          radial-gradient(circle at 25% 20%, ${softHex(accent, 0.32)} 0%, transparent 55%),
          radial-gradient(circle at 75% 80%, ${softHex(accent, 0.08)} 0%, transparent 50%),
          linear-gradient(180deg, #0a0a0a 0%, #050505 100%)
        `,
      }}
    >
      {heroBg && (
        // Image background fades into the gradient via the overlay below.
        // We use next/image here because heroBg is a Supabase URL or a blob
        // — both work as `unoptimized` for the live preview.
        <div className="absolute inset-0 opacity-50">
          <Image
            src={heroBg}
            alt=""
            fill
            sizes="380px"
            unoptimized
            className="object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(10,10,10,0.55) 0%, rgba(5,5,5,0.95) 100%)",
            }}
          />
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
          backgroundSize: "3px 3px",
        }}
      />

      <div className="relative px-5 pb-9 pt-11">
        <div className="inline-flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/85">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
          />
          {heroDate.date}
        </div>

        <h1
          className="mt-4 font-bold leading-[0.9] tracking-[-0.045em] text-white [text-wrap:balance]"
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "clamp(28px, 8vw, 38px)",
          }}
        >
          {event.name || "Untitled event"}
        </h1>

        {event.tag_line && (
          <div className="mt-3 text-[12px] italic text-white/65">
            {event.tag_line}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2 text-[12px] font-medium text-white/85">
          <span>{heroDate.time || "TBA"}</span>
          {event.venue_name && (
            <>
              <span className="h-[3px] w-[3px] rounded-full bg-white/45" />
              <span>
                {event.venue_name}
                {event.city ? ` · ${event.city}` : ""}
              </span>
            </>
          )}
        </div>

        {(event.doors_time || event.age_restriction) && (
          <div className="mt-1.5 text-[11px] text-white/55">
            {[event.doors_time, event.age_restriction].filter(Boolean).join(" · ")}
          </div>
        )}

        {!isAnnouncement && minPrice > 0 && (
          <div className="mt-7 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">
            From {formatPrice(minPrice, currency)}
          </div>
        )}

        <button
          type="button"
          tabIndex={-1}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-white/[0.22] bg-white/[0.12] px-7 text-[11px] font-bold uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_22px_rgba(255,255,255,0.05)]"
        >
          {isAnnouncement ? "Notify Me" : "Get Tickets"}
          <span className="ml-1.5 opacity-65">↓</span>
        </button>

        {/* Presented by */}
        <div className="mt-7 text-[10px] italic text-white/55">
          Presented by{" "}
          <span className="font-semibold not-italic text-white/75">{brandName}</span>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-[#0a0a0a]" />
    </section>
  );
}

function AboutBlock({
  aboutText,
  detailsText,
  brandName,
}: {
  aboutText: string;
  detailsText: string;
  brandName: string;
}) {
  return (
    <section className="border-t border-white/[0.06] px-5 py-7">
      {aboutText && (
        <>
          <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
            About
          </div>
          <p className="text-[13px] leading-[1.65] text-white/85 [text-wrap:pretty] whitespace-pre-line">
            {aboutText}
          </p>
        </>
      )}
      {detailsText && (
        <div className="mt-5">
          <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
            Details
          </div>
          <p className="text-[12px] leading-[1.6] text-white/65 [text-wrap:pretty] whitespace-pre-line">
            {detailsText}
          </p>
        </div>
      )}
      {aboutText && (
        <p className="mt-3 text-[11px] italic leading-[1.6] text-white/55">
          Hosted by {brandName}.
        </p>
      )}
    </section>
  );
}

function LineupBlock({ artists }: { artists: EventArtist[] }) {
  const visible = artists
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((ea) => ea.artist?.name);
  if (visible.length === 0) return null;
  return (
    <section className="border-t border-white/[0.06] px-5 py-7">
      <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
        Lineup
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((ea) => (
          <span
            key={ea.id || ea.artist_id}
            className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/85"
          >
            {ea.artist?.name}
          </span>
        ))}
      </div>
    </section>
  );
}

function ArtworkStrip({
  cover,
  banner,
}: {
  cover: string | null;
  banner: string | null;
}) {
  if (!cover && !banner) {
    return (
      <section className="border-t border-white/[0.06] px-5 py-7">
        <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
          Artwork
        </div>
        <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] p-6 text-center text-[11px] text-white/45">
          Upload a cover image to bring this event to life.
        </div>
      </section>
    );
  }
  return (
    <section className="border-t border-white/[0.06] px-5 py-7">
      <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
        Artwork
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cover && (
          <div className="relative aspect-square overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
            <Image src={cover} alt="Cover" fill sizes="180px" unoptimized className="object-cover" />
          </div>
        )}
        {banner && (
          <div className="relative aspect-video overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
            <Image src={banner} alt="Banner" fill sizes="180px" unoptimized className="object-cover" />
          </div>
        )}
      </div>
    </section>
  );
}

function TicketWidget({
  tickets,
  accent,
  currency,
  isAnnouncement,
}: {
  tickets: TicketTypeRow[];
  accent: string;
  currency: string;
  isAnnouncement: boolean;
}) {
  if (isAnnouncement) {
    return (
      <section className="border-t border-white/[0.06] px-5 py-7">
        <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
          Tickets
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5 text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/85">
            Coming soon
          </div>
          <p className="mt-2 text-[12px] text-white/65">
            Sign up to be the first to know when tickets drop.
          </p>
          <button
            type="button"
            tabIndex={-1}
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl text-[11px] font-bold uppercase tracking-[0.08em] text-white shadow-[0_8px_24px_-8px_var(--prev-accent),inset_0_1px_0_rgba(255,255,255,0.18)]"
            style={{ background: accent }}
          >
            Notify Me
          </button>
        </div>
      </section>
    );
  }

  if (tickets.length === 0) {
    return (
      <section className="border-t border-white/[0.06] px-5 py-7">
        <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
          Tickets
        </div>
        <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] p-6 text-center text-[11px] text-white/45">
          Add a ticket type to start selling.
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-white/[0.06] px-5 py-7">
      <div className="mb-4 flex items-center justify-between">
        <h2
          className="font-bold uppercase tracking-[0.04em] text-white"
          style={{ fontFamily: "'Space Mono', monospace", fontSize: "13px" }}
        >
          Tickets
        </h2>
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-white/55">
          {tickets.length} {tickets.length === 1 ? "tier" : "tiers"}
        </span>
      </div>
      <div className="space-y-2">
        {tickets.slice(0, 4).map((tt, i) => (
          <TicketRow
            key={tt.id || `pv-${i}`}
            ticket={tt}
            currency={currency}
            highlighted={i === Math.min(1, tickets.length - 1)}
            accent={accent}
          />
        ))}
        {tickets.length > 4 && (
          <p className="pt-1 text-center text-[10px] uppercase tracking-[0.16em] text-white/45">
            + {tickets.length - 4} more
          </p>
        )}
      </div>

      <div className="mt-5 space-y-2">
        <button
          type="button"
          tabIndex={-1}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[12px] font-bold uppercase tracking-[0.08em] text-white shadow-[0_8px_24px_-8px_var(--prev-accent),inset_0_1px_0_rgba(255,255,255,0.18)]"
          style={{ background: accent }}
        >
          Checkout
        </button>
        <div className="pt-1 text-center text-[9px] font-medium uppercase tracking-[0.18em] text-white/55">
          Secure checkout · powered by Stripe
        </div>
      </div>
    </section>
  );
}

function TicketRow({
  ticket,
  currency,
  highlighted,
  accent,
}: {
  ticket: TicketTypeRow;
  currency: string;
  highlighted: boolean;
  accent: string;
}) {
  const soldOut =
    ticket.status === "sold_out" ||
    (ticket.capacity != null && ticket.capacity > 0 && ticket.sold >= ticket.capacity);
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        background: highlighted ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)",
        borderColor: highlighted
          ? "rgba(255,255,255,0.15)"
          : "rgba(255,255,255,0.06)",
        boxShadow: highlighted
          ? "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 16px rgba(255,255,255,0.02)"
          : "none",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white">
              {ticket.name || "Untitled tier"}
            </span>
            {soldOut && (
              <span
                className="rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em]"
                style={{
                  background: softHex(accent, 0.08),
                  color: accent,
                  borderColor: softHex(accent, 0.32),
                }}
              >
                Sold out
              </span>
            )}
          </div>
          {ticket.description && (
            <div
              className="mt-1 text-[11px] tracking-[0.01em] text-white/70"
              style={{ fontFamily: "'Space Mono', monospace" }}
            >
              {ticket.description}
            </div>
          )}
        </div>
        <div className="font-mono text-[14px] font-bold tracking-[0.02em] text-white">
          {Number(ticket.price) === 0
            ? "Free"
            : formatPrice(Number(ticket.price), currency)}
        </div>
      </div>
    </div>
  );
}

function PaymentStrip({
  paymentMethod,
  currency,
  multiCurrency,
  vatEnabled,
  vatRate,
}: {
  paymentMethod: string;
  currency: string;
  multiCurrency: boolean;
  vatEnabled: boolean;
  vatRate: number | null;
}) {
  const bits: string[] = [];
  if (paymentMethod === "stripe") bits.push("Apple Pay · Card");
  if (paymentMethod === "external") bits.push("External link");
  if (paymentMethod === "test") bits.push("Test mode");
  if (multiCurrency) bits.push("Multi-currency");
  bits.push(currency);
  if (vatEnabled && vatRate) bits.push(`${vatRate}% VAT`);

  return (
    <section className="border-t border-white/[0.06] px-5 py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {bits.map((b, i) => (
          <span key={i} className="flex items-center gap-3">
            <span>{b}</span>
            {i < bits.length - 1 && <span className="h-1 w-1 rounded-full bg-white/25" />}
          </span>
        ))}
      </div>
    </section>
  );
}

function Footer({
  brandName,
  slug,
  status,
  visibility,
}: {
  brandName: string;
  slug: string;
  status: string;
  visibility: string;
}) {
  return (
    <footer className="border-t border-white/[0.06] px-5 py-6 text-center">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-white/75">
        {brandName}
      </div>
      <div className="mt-1.5 font-mono text-[9px] tracking-[0.04em] text-white/55">
        /event/{slug}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-[8px] uppercase tracking-[0.18em] text-white/40">
        <span>{status}</span>
        <span className="h-[3px] w-[3px] rounded-full bg-white/25" />
        <span>{visibility}</span>
      </div>
    </footer>
  );
}
