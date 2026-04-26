"use client";

import { useMemo } from "react";
import type { OnboardingWizardState } from "@/types/settings";
import { Calendar, MapPin } from "lucide-react";

interface PreviewPaneProps {
  state: OnboardingWizardState | null;
}

interface IdentityData {
  brand_name?: string;
  first_name?: string;
}
interface BrandingData {
  logo_data_uri?: string;
  accent_hex?: string;
}
interface FirstEventData {
  name?: string;
  date_iso?: string;
  venue?: string;
  city?: string;
  ticket_price?: number;
  currency?: string;
}

function readSection<T>(state: OnboardingWizardState | null, section: keyof OnboardingWizardState["sections"]): T {
  return ((state?.sections?.[section]?.data as T | undefined) ?? {}) as T;
}

function lighten(hex: string, amt = 0.15): string {
  // Crude lightening for glow accent. amt is 0..1.
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + 255 * amt));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) + 255 * amt));
  const b = Math.min(255, Math.round((n & 0xff) + 255 * amt));
  return `rgb(${r}, ${g}, ${b})`;
}

function formatEventDate(iso?: string): string {
  if (!iso) return "Sat 14 Jun · 9pm";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sat 14 Jun · 9pm";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d) + " · " + new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d).toLowerCase().replace(":00", "");
}

export function PreviewPane({ state }: PreviewPaneProps) {
  const identity = readSection<IdentityData>(state, "identity");
  const branding = readSection<BrandingData>(state, "branding");
  const event = readSection<FirstEventData>(state, "first_event");

  const accent = branding.accent_hex && /^#[0-9a-fA-F]{6}$/.test(branding.accent_hex)
    ? branding.accent_hex
    : "#8B5CF6";
  const accentSoft = useMemo(() => lighten(accent, 0.25), [accent]);

  const brandLabel = (identity.brand_name || "Your brand").toUpperCase();
  const eventName = event.name || "Your first event";
  const eventDate = formatEventDate(event.date_iso);
  const venue = event.venue || "Venue name";
  const city = event.city || "City";
  const priceLabel = event.ticket_price !== undefined && event.ticket_price !== null
    ? `${event.currency === "EUR" ? "€" : event.currency === "USD" ? "$" : event.currency === "JPY" ? "¥" : "£"}${event.ticket_price}`
    : "£15";

  return (
    <div className="h-full overflow-y-auto px-6 py-10 lg:px-10 lg:py-14">
      <div className="mb-6 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Live preview
      </div>

      {/* Event card preview */}
      <div className="mx-auto max-w-[420px]">
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0a0a] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
          style={{
            ["--preview-accent" as string]: accent,
          }}
        >
          {/* Hero with accent gradient */}
          <div
            className="relative h-[260px] w-full"
            style={{
              background: `linear-gradient(135deg, ${accent}26 0%, ${accentSoft}10 50%, transparent 100%), radial-gradient(circle at 30% 30%, ${accent}40, transparent 60%)`,
            }}
          >
            {branding.logo_data_uri ? (
              <img
                src={branding.logo_data_uri}
                alt={brandLabel}
                className="absolute left-6 top-6 max-h-[36px] max-w-[140px] object-contain"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
              />
            ) : (
              <div
                className="absolute left-6 top-6 font-mono text-[12px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "#fff" }}
              >
                {brandLabel}
              </div>
            )}

            {/* Big event title */}
            <div className="absolute inset-x-6 bottom-6">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">{eventDate}</div>
              <div
                className="mt-1.5 text-[26px] font-bold leading-[1.05] text-white"
                style={{ fontFamily: "Space Mono, monospace" }}
              >
                {eventName}
              </div>
            </div>
          </div>

          {/* Detail strip */}
          <div className="space-y-3 px-6 py-5">
            <div className="flex items-center gap-2 text-[12px] text-white/60">
              <MapPin size={12} />
              <span>{venue} · {city}</span>
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">From</div>
              <div className="text-[16px] font-semibold text-white">{priceLabel}</div>
            </div>
            <button
              type="button"
              className="w-full rounded-full px-4 py-2.5 text-[13px] font-semibold text-white transition-all"
              style={{ backgroundColor: accent }}
              tabIndex={-1}
            >
              Get tickets
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/60">
          This is roughly how your event page card will look.
        </p>
      </div>

      {/* Static date/calendar marker beneath — tiny extra visual bit */}
      <div className="mx-auto mt-8 flex max-w-[420px] items-center gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-[12px] text-white/60">
        <Calendar size={14} className="shrink-0" />
        <div>
          <div className="font-medium text-white/80">Live updates as you fill in</div>
          <div className="mt-0.5 text-[11px]">Logo, colours, name and event details all flow into your storefront.</div>
        </div>
      </div>
    </div>
  );
}
