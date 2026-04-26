"use client";

import { useMemo } from "react";
import type { OnboardingWizardState } from "@/types/settings";
import { getCountryInfo } from "@/lib/country-currency-map";

/**
 * Live brand preview pane.
 *
 * Renders a faithful, mobile-shaped representation of the tenant's actual
 * event page (the same layout buyers will see on a phone — hero, ticket
 * widget, footer) using their brand name, accent colour, and logo. The
 * canvas updates live as the user types in the wizard.
 *
 * This is presentational only — it doesn't fetch data, run cart logic, or
 * load the real MidnightEventPage's hooks. The structure mirrors what
 * MidnightEventPage produces so the preview is honest about what they'll
 * actually get; the visual primitives are inlined here so the wizard
 * stays decoupled from the public event-page machinery.
 */

interface IdentityData {
  brand_name?: string;
  country?: string;
}
interface BrandingData {
  logo_data_uri?: string;
  accent_hex?: string;
}

function read<T>(
  state: OnboardingWizardState | null,
  section: "identity" | "branding"
): T {
  return ((state?.sections?.[section]?.data as T | undefined) ?? {}) as T;
}

/** Subtle accent → soft variant for gradients. */
function softAccent(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, 0.32)`;
}

function tinyAccent(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, 0.08)`;
}

const SAMPLE_TICKETS = [
  {
    name: "Early Bird",
    description: "Limited release",
    price: 18,
    badge: "Going fast",
  },
  {
    name: "General Admission",
    description: "Standard entry",
    price: 25,
    badge: null,
  },
  {
    name: "VIP",
    description: "Front of stage + cocktail",
    price: 65,
    badge: null,
  },
] as const;

export function BrandPreview({ state }: { state: OnboardingWizardState | null }) {
  const identity = read<IdentityData>(state, "identity");
  const branding = read<BrandingData>(state, "branding");

  const accent =
    branding.accent_hex && /^#[0-9a-fA-F]{6}$/.test(branding.accent_hex)
      ? branding.accent_hex.toUpperCase()
      : "#8B5CF6";

  const brandName = (identity.brand_name || "Your brand").toUpperCase();
  const countryInfo = getCountryInfo(identity.country || "GB");
  const currencySymbol = countryInfo?.currencySymbol || "£";

  const previewVars = useMemo(
    () =>
      ({
        ["--prev-accent" as string]: accent,
        ["--prev-accent-soft" as string]: softAccent(accent),
        ["--prev-accent-tint" as string]: tinyAccent(accent),
      }) as React.CSSProperties,
    [accent]
  );

  return (
    <div className="relative h-full overflow-hidden">
      {/* Backdrop atmospherics */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-1/4 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 blur-[100px]"
          style={{ background: accent, opacity: 0.06 }}
        />
      </div>

      <div className="relative h-full overflow-y-auto px-6 py-10 lg:px-12 lg:py-16">
        <div className="mx-auto w-full max-w-[380px]">
          <PreviewLabel />
          <PhoneFrame>
            <div
              className="flex flex-col bg-[#0a0a0a] text-white"
              style={previewVars}
              data-theme="midnight"
            >
              <Header brandName={brandName} logo={branding.logo_data_uri} />
              <Hero
                accent={accent}
                logo={branding.logo_data_uri}
                brandName={brandName}
                currencySymbol={currencySymbol}
                minPrice={SAMPLE_TICKETS[0].price}
              />
              <TicketWidget
                accent={accent}
                currencySymbol={currencySymbol}
              />
              <Footer brandName={brandName} />
            </div>
          </PhoneFrame>
          <PreviewCaption identity={identity} branding={branding} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── pieces */

function PreviewLabel() {
  return (
    <div className="mb-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
      Live preview · mobile
    </div>
  );
}

function PreviewCaption({
  identity,
  branding,
}: {
  identity: IdentityData;
  branding: BrandingData;
}) {
  const hasBrand = !!identity.brand_name;
  const hasLogo = !!branding.logo_data_uri;
  const hasAccent =
    branding.accent_hex && branding.accent_hex.toUpperCase() !== "#8B5CF6";

  const hints: string[] = [];
  if (!hasBrand) hints.push("brand name");
  if (!hasLogo) hints.push("logo");
  if (!hasAccent) hints.push("accent colour");

  return (
    <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground/70">
      {hints.length > 0 ? (
        <>This is exactly how your event page will look on mobile. Add your{" "}
          <span className="text-foreground/70">{hints.join(", ")}</span> to make it yours.
        </>
      ) : (
        <>This is exactly how your event page will look on mobile. Buyers see your branding everywhere — checkout, emails, wallet passes.</>
      )}
    </p>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {/* Soft outer glow */}
      <div
        className="pointer-events-none absolute -inset-3 rounded-[44px]"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 30%, rgba(255,255,255,0.04), transparent)",
        }}
      />
      {/* Device frame */}
      <div className="relative overflow-hidden rounded-[36px] border border-white/[0.08] bg-black shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)_inset]">
        {/* Tiny notch bar */}
        <div className="relative h-6 bg-black">
          <div className="absolute left-1/2 top-1.5 h-3.5 w-20 -translate-x-1/2 rounded-full bg-black" />
        </div>
        <div className="max-h-[640px] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Header({ brandName, logo }: { brandName: string; logo?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] px-5 py-3.5">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={brandName}
          className="max-h-6 max-w-[120px] object-contain"
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
        />
      ) : (
        <span
          className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-white/85"
        >
          {brandName}
        </span>
      )}
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-white/40">
        <span className="h-1 w-1 rounded-full bg-white/40" />
        Live
      </div>
    </div>
  );
}

function Hero({
  accent,
  logo,
  brandName,
  currencySymbol,
  minPrice,
}: {
  accent: string;
  logo?: string;
  brandName: string;
  currencySymbol: string;
  minPrice: number;
}) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: `
          radial-gradient(circle at 25% 20%, ${softAccent(accent)} 0%, transparent 55%),
          radial-gradient(circle at 75% 80%, ${tinyAccent(accent)} 0%, transparent 50%),
          linear-gradient(180deg, #0a0a0a 0%, #050505 100%)
        `,
      }}
    >
      {/* Grain texture for depth */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
          backgroundSize: "3px 3px",
        }}
      />

      <div className="relative px-5 pb-8 pt-10">
        {/* Eyebrow tag */}
        <div className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/55">
          <span
            className="h-1 w-1 rounded-full"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
          />
          Saturday · June 14
        </div>

        {/* Title — mirrors MidnightHero's display font + tight tracking */}
        <h1
          className="mt-5 font-bold leading-[0.92] tracking-[-0.04em] text-white"
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "clamp(28px, 7vw, 38px)",
          }}
        >
          Summer Solstice
        </h1>

        {/* Date · venue row */}
        <div className="mt-5 flex items-center gap-2 text-[12px] font-medium text-white/75">
          <span>Sat 14 Jun</span>
          <span className="h-[3px] w-[3px] rounded-full bg-white/30" />
          <span>Invisible Wind Factory · Liverpool</span>
        </div>

        {/* Doors / age */}
        <div className="mt-1 text-[11px] text-white/35">Doors 9pm · 18+</div>

        {/* Price strip */}
        <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          From {currencySymbol}
          {minPrice}
        </div>

        {/* Outlined CTA — matches MidnightHero's glass treatment */}
        <button
          type="button"
          tabIndex={-1}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-white/[0.18] bg-white/[0.10] px-7 text-[11px] font-bold uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_18px_rgba(255,255,255,0.04)]"
        >
          Get Tickets
          <span className="ml-1.5 opacity-50">↓</span>
        </button>

        {/* Tiny secondary trust line — mimics MidnightTrustBar */}
        <div className="mt-6 flex items-center gap-3 text-[9px] uppercase tracking-[0.15em] text-white/30">
          <span>Apple Pay</span>
          <span className="h-1 w-1 rounded-full bg-white/15" />
          <span>Instant tickets</span>
          <span className="h-1 w-1 rounded-full bg-white/15" />
          <span>Wallet ready</span>
        </div>
      </div>

      {/* Frame fade to page bg, like the real hero */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-[#0a0a0a]" />
    </section>
  );
}

function TicketWidget({
  accent,
  currencySymbol,
}: {
  accent: string;
  currencySymbol: string;
}) {
  return (
    <section className="px-5 py-7">
      <div className="mb-4 flex items-center justify-between">
        <h2
          className="font-bold uppercase tracking-[0.04em] text-white"
          style={{ fontFamily: "'Space Mono', monospace", fontSize: "13px" }}
        >
          Tickets
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">
          3 tiers
        </span>
      </div>

      <div className="space-y-2">
        {SAMPLE_TICKETS.map((t, i) => (
          <TicketRow
            key={t.name}
            name={t.name}
            description={t.description}
            price={t.price}
            badge={t.badge}
            currencySymbol={currencySymbol}
            highlighted={i === 1}
            accent={accent}
          />
        ))}
      </div>
    </section>
  );
}

function TicketRow({
  name,
  description,
  price,
  badge,
  currencySymbol,
  highlighted,
  accent,
}: {
  name: string;
  description: string;
  price: number;
  badge: string | null;
  currencySymbol: string;
  highlighted: boolean;
  accent: string;
}) {
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
              {name}
            </span>
            {badge && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em]"
                style={{
                  background: tinyAccent(accent),
                  color: accent,
                  border: `1px solid ${softAccent(accent)}`,
                }}
              >
                {badge}
              </span>
            )}
          </div>
          <div
            className="mt-1 text-[11px] tracking-[0.01em] text-white/55"
            style={{ fontFamily: "'Space Mono', monospace" }}
          >
            {description}
          </div>
        </div>
        <div
          className="font-mono text-[14px] font-bold tracking-[0.02em] text-white"
        >
          {currencySymbol}
          {price}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end">
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5">
          <button
            type="button"
            tabIndex={-1}
            className="h-7 w-7 rounded-md text-[14px] text-white/60"
          >
            −
          </button>
          <span className="min-w-5 text-center font-mono text-[11px] font-bold text-white/50">
            0
          </span>
          <button
            type="button"
            tabIndex={-1}
            className="h-7 w-7 rounded-md text-[14px] text-white/60"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function Footer({ brandName }: { brandName: string }) {
  return (
    <footer className="border-t border-white/[0.04] px-5 py-5 text-center">
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/35">
        {brandName}
      </div>
      <div className="mt-1.5 text-[9px] text-white/25">
        Powered by Entry
      </div>
    </footer>
  );
}
