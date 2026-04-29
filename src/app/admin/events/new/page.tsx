"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Disc3,
  Lock,
  Loader2,
  Mic,
  Music,
  Tent,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/date-picker";
import { AdminButton } from "@/components/admin/ui";
import { PlaceAutocomplete } from "@/components/admin/PlaceAutocomplete";
import { useDataLayer } from "@/hooks/useDataLayer";
import {
  EVENT_TEMPLATE_LIST,
  type EventTemplate,
  type EventTemplateKey,
} from "@/lib/event-templates";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

/**
 * Start moment — the new front door for "Create event."
 *
 * Phase 2.1–2.6 of EVENT-BUILDER-PLAN converge here. Four questions, in the
 * order a human thinks: what kind, what's it called, when, where. The CTA
 * stays disabled until name + date are valid; everything else is decoration
 * that pre-populates a believable starter event so the editor isn't empty.
 *
 * Visual register matches `FinishSection.tsx` (eyebrow + Display heading +
 * accent halo). Chrome-bypass is wired in `src/app/admin/layout.tsx` so the
 * page renders full-screen.
 */
const TEMPLATE_ICONS: Record<EventTemplate["icon"], LucideIcon> = {
  Music,
  Disc3,
  Tent,
  Mic,
  Lock,
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Default the date prefill to the *next* Saturday at 21:00 in the user's
 * local timezone — the most common slot for nightlife and concerts. Hosts
 * who run Sunday brunches or Tuesday socials still adjust in one click; we
 * just want to skip the "what year is it" cold-start.
 */
function nextSaturdayAt9pm(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun … 6 Sat
  const offsetToSaturday = day === 6 ? 7 : (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + offsetToSaturday);
  d.setHours(21, 0, 0, 0);
  // The DateTimePicker reads a "YYYY-MM-DDTHH:mm" local string.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type SlugStatus = "idle" | "checking" | "available" | "taken" | "too-short";

export default function NewEventPage() {
  const router = useRouter();
  const dataLayer = useDataLayer();

  const [template, setTemplate] = useState<EventTemplateKey | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState<string>(() => nextSaturdayAt9pm());
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>("");
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");

  const startedAtRef = useRef<number>(Date.now());
  const startedFiredRef = useRef(false);
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slug = useMemo(() => slugify(name), [name]);

  // Phase 2.6 — fire `first_event_started` once on mount. Wrapped in a ref
  // so React strict-mode's double-invoke doesn't double-count.
  useEffect(() => {
    if (startedFiredRef.current) return;
    startedFiredRef.current = true;
    startedAtRef.current = Date.now();
    dataLayer.push({ event: "first_event_started" });
  }, [dataLayer]);

  // Phase 2.2 — live slug availability check. 300ms debounce, scoped to this
  // org via the API. Doesn't block submit (the 409 fallback in POST /api/events
  // gives suggestion chips); it's a confidence signal as the user types.
  useEffect(() => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    if (slug.length < 2) {
      setSlugStatus(slug.length === 0 ? "idle" : "too-short");
      return;
    }
    setSlugStatus("checking");
    slugTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/events/check-slug?slug=${encodeURIComponent(slug)}`,
        );
        const json = await res.json();
        if (!res.ok) {
          setSlugStatus("idle");
          return;
        }
        setSlugStatus(json.available ? "available" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 300);
    return () => {
      if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    };
  }, [slug]);

  const canContinue =
    name.trim().length > 0 && date.length > 0 && slugStatus !== "checking";

  function pickTemplate(key: EventTemplateKey) {
    setTemplate((prev) => (prev === key ? null : key));
    if (template !== key) {
      dataLayer.push({ event: "first_event_template_picked", template: key });
    }
  }

  async function handleCreate(e: React.FormEvent, slugOverride?: string) {
    e.preventDefault();
    if (!canContinue || creating) return;
    setError("");
    setSlugSuggestions([]);
    setCreating(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slugOverride || slug,
          venue_name: venue.trim() || undefined,
          city: city.trim() || undefined,
          date_start: new Date(date).toISOString(),
          payment_method: "stripe",
          status: "draft",
          template: template ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Couldn't create the event.");
        if (json.code === "slug_taken" && Array.isArray(json.suggestions)) {
          setSlugSuggestions(json.suggestions);
        }
        setCreating(false);
        return;
      }
      const elapsedMs = Date.now() - startedAtRef.current;
      dataLayer.push({
        event: "first_event_created",
        template: template ?? null,
        time_to_create_seconds: Math.round(elapsedMs / 1000),
      });
      router.push(`/admin/events/${json.data.slug}/`);
    } catch {
      setError("Network error — try again.");
      setCreating(false);
    }
  }

  return (
    <div data-admin className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col px-5 pt-8 pb-12 lg:px-10 lg:pt-10">
        {/* Top bar — wordmark + cancel */}
        <div className="flex items-center justify-between">
          <span className="text-gradient font-mono text-[20px] font-bold uppercase tracking-[6px] select-none">
            Entry
          </span>
          <Link
            href="/admin/events/"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60"
          >
            <ArrowLeft size={12} /> Cancel
          </Link>
        </div>

        {/* Hero */}
        <div className="relative mt-14">
          <AccentHalo />
          <div className="relative space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              New event
            </div>
            <h1 className="font-mono text-[34px] font-bold leading-[1.04] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-[40px]">
              Start with the basics.
            </h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground [text-wrap:pretty]">
              Pick a shape, name it, drop a date and venue. You&apos;ll land in
              the editor with a believable starter — and you can replace
              anything later.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={(e) => handleCreate(e)} className="relative mt-12 space-y-9">
          {/* Question 1 — What kind? */}
          <section className="space-y-3">
            <SectionLabel index="01" title="What kind?" hint="Optional, but it pre-fills tickets." />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {EVENT_TEMPLATE_LIST.map((t) => {
                const Icon = TEMPLATE_ICONS[t.icon];
                const active = template === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => pickTemplate(t.key)}
                    aria-pressed={active}
                    className={[
                      "group relative flex flex-col items-start gap-2 rounded-xl border px-3.5 py-3 text-left transition-all duration-200",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60",
                      active
                        ? "border-primary/50 bg-primary/[0.06] shadow-[0_8px_24px_-12px_rgba(139,92,246,0.45)]"
                        : "border-border/60 bg-card hover:border-primary/30 hover:bg-foreground/[0.02]",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                        active ? "bg-primary/15 text-primary" : "bg-foreground/[0.04] text-muted-foreground",
                      ].join(" ")}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-foreground">{t.label}</div>
                      <div className="text-[11px] leading-snug text-muted-foreground">{t.blurb}</div>
                    </div>
                    {active && (
                      <span className="absolute right-2.5 top-2.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Question 2 — What's it called? */}
          <section className="space-y-3">
            <SectionLabel index="02" title="What's it called?" />
            <div className="space-y-2">
              <Label htmlFor="new-event-name" className="sr-only">
                Event name
              </Label>
              <Input
                id="new-event-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="e.g. Midnight Mass"
              />
              <SlugIndicator slug={slug} status={slugStatus} />
            </div>
          </section>

          {/* Question 3 — When? */}
          <section className="space-y-3">
            <SectionLabel index="03" title="When?" />
            <div className="space-y-2">
              <Label htmlFor="new-event-date" className="sr-only">
                Date &amp; time
              </Label>
              <DateTimePicker value={date} onChange={setDate} />
              <p className="text-[11px] text-muted-foreground/80">
                Defaulted to next Saturday at 21:00 — adjust if it&apos;s anything else.
              </p>
            </div>
          </section>

          {/* Question 4 — Where? */}
          <section className="space-y-3">
            <SectionLabel index="04" title="Where?" hint="Either field unlocks autocomplete." />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-event-venue" className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Venue
                </Label>
                <PlaceAutocomplete
                  id="new-event-venue"
                  value={venue}
                  onChange={setVenue}
                  onPlaceSelected={(p) => {
                    if (p.city && !city) setCity(p.city);
                  }}
                  mode="venue"
                  placeholder="e.g. Invisible Wind Factory"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-event-city" className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  City
                </Label>
                <PlaceAutocomplete
                  id="new-event-city"
                  value={city}
                  onChange={setCity}
                  mode="city"
                  placeholder="e.g. Liverpool"
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="space-y-2">
              <p className="text-xs text-destructive">{error}</p>
              {slugSuggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    Or grab one of these:
                  </span>
                  {slugSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={(e) => handleCreate(e, s)}
                      className="rounded-md border border-primary/30 bg-primary/[0.06] px-2 py-1 font-mono text-[11px] text-primary transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <AdminButton
              type="submit"
              size="lg"
              className="w-full"
              loading={creating}
              disabled={!canContinue || creating}
              rightIcon={!creating ? <ArrowRight /> : undefined}
            >
              {creating ? "Creating…" : "Create event"}
            </AdminButton>
            <p className="mt-3 text-center text-[11px] text-muted-foreground/80">
              You&apos;ll land in the editor next — flesh out tickets, story, and
              look there.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── pieces ─────────────────────────────────── */

function SectionLabel({
  index,
  title,
  hint,
}: {
  index: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-[11px] font-semibold tracking-[0.2em] text-primary/80">
        {index}
      </span>
      <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SlugIndicator({ slug, status }: { slug: string; status: SlugStatus }) {
  if (slug.length === 0) return null;

  if (status === "too-short") {
    return (
      <p className="text-[11px] text-muted-foreground/70">
        Keep typing — slugs need at least 2 characters.
      </p>
    );
  }

  if (status === "checking") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-xs">
        <Loader2 size={12} className="animate-spin text-muted-foreground" />
        <span className="font-mono text-muted-foreground">/{slug}</span>
      </div>
    );
  }

  if (status === "available") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-xs">
        <Check size={12} className="text-success" strokeWidth={2.5} />
        <span className="font-mono text-foreground">/{slug}</span>
        <span className="ml-auto text-success/80">available</span>
      </div>
    );
  }

  if (status === "taken") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.04] px-3 py-2 text-xs">
        <span className="font-mono text-destructive">/{slug}</span>
        <span className="ml-auto text-destructive/90">already used in this org</span>
      </div>
    );
  }

  return null;
}

/**
 * Accent halo — fade-in glow behind the heading on mount, peaks at ~600ms,
 * fades to a soft residue. Same family as `FinishSection.tsx`'s halo, scoped
 * to platform Electric Violet (no per-event branding exists yet here). CSS
 * only, gracefully degrades on prefers-reduced-motion.
 */
function AccentHalo() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -left-12 -top-16 h-72 w-72 motion-safe:animate-[accent-halo_1.6s_ease-out_forwards] motion-reduce:opacity-30"
      style={{
        background:
          "radial-gradient(circle at center, rgba(139,92,246,0.33) 0%, rgba(139,92,246,0.09) 32%, transparent 65%)",
        filter: "blur(28px)",
      }}
    >
      <style>{`
        @keyframes accent-halo {
          0%   { opacity: 0; transform: scale(0.55); }
          35%  { opacity: 1; transform: scale(1.05); }
          100% { opacity: 0.18; transform: scale(1.18); }
        }
      `}</style>
    </div>
  );
}
