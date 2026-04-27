"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy, ExternalLink, ArrowRight, Check } from "lucide-react";
import type { OnboardingApi } from "../../_state";

interface IdentityData {
  first_name?: string;
  brand_name?: string;
  slug?: string;
}
interface BrandingData {
  accent_hex?: string;
}

/**
 * Step 3: Finish.
 *
 * Celebrates the new tenant, shows the live address, and hands off to the
 * dashboard. The dashboard's persistent OnboardingChecklist owns the rest
 * of the setup journey (Stripe, first event, team, custom domain) — we
 * don't reproduce it here. Visual weight is balanced because the
 * BrandPreview pane stays visible on the right (re-enabled on Finish).
 *
 * Side effects on mount: marks the wizard complete + fires the welcome
 * email (idempotent via onboarding_email_sent flag in state extras).
 */
export function FinishSection({ api }: { api: OnboardingApi }) {
  const router = useRouter();
  const identity = (api.getSection("identity")?.data ?? {}) as IdentityData;
  const branding = (api.getSection("branding")?.data ?? {}) as BrandingData;
  const slug = identity.slug || api.orgId || "your-brand";
  const subdomain = `${slug}.entry.events`;
  const greet = identity.first_name?.trim() || "there";
  const brandName = identity.brand_name?.trim() || "Your space";

  const accent = useMemo(() => {
    const v = branding.accent_hex;
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : "#8B5CF6";
  }, [branding.accent_hex]);

  const finishedRef = useRef(false);
  const [finalising, setFinalising] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    (async () => {
      try {
        await fetch("/api/onboarding/state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section: "finish",
            complete: true,
            extras: { completed_at: new Date().toISOString() },
          }),
        });
        await fetch("/api/onboarding/complete", { method: "POST" });
      } catch {
        /* non-fatal — the dashboard surfaces any issues via the checklist */
      } finally {
        setFinalising(false);
      }
    })();
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`https://${subdomain}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — fail silently */
    }
  }

  return (
    <div className="relative">
      {/* Subtle accent halo on mount — replaces the previous confetti
          shower with something more deliberate. The ring expands once,
          fades, and leaves the brand accent glow behind the heading. */}
      <AccentHalo color={accent} />

      <div className="relative space-y-7">
        {/* Status pill — emerald pulse, not the old generic primary dot */}
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          You&apos;re live
        </div>

        <div>
          <h1 className="font-mono text-[34px] font-bold leading-[1.04] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-[40px]">
            <RevealText delay={120}>{`You're live, ${greet}.`}</RevealText>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground [text-wrap:pretty]">
            <span className="font-medium text-foreground">{brandName}</span> is open
            for business on Entry. Your storefront is ready to receive visitors —
            connect Stripe and create your first event when you&apos;re set.
          </p>
        </div>

        <AddressChip
          subdomain={subdomain}
          accent={accent}
          copied={copied}
          onCopy={handleCopy}
          onOpen={() =>
            window.open(`https://${subdomain}`, "_blank", "noopener,noreferrer")
          }
        />

        <div className="flex flex-col gap-3 pt-1">
          <button
            type="button"
            onClick={() => router.push("/admin/?welcome=1")}
            disabled={finalising}
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground shadow-[0_8px_28px_-8px_rgba(139,92,246,0.55),inset_0_1px_0_rgba(255,255,255,0.18)] transition-all duration-200 hover:translate-y-[-1px] hover:shadow-[0_14px_32px_-10px_rgba(139,92,246,0.7),inset_0_1px_0_rgba(255,255,255,0.22)] disabled:translate-y-0 disabled:opacity-70"
          >
            {finalising ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Wrapping up…
              </>
            ) : (
              <>
                Open dashboard
                <ArrowRight
                  size={14}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </>
            )}
          </button>

          <p className="text-center text-[11px] text-muted-foreground/80">
            Your dashboard has a setup checklist for everything that&apos;s next.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── pieces */

/**
 * Tasteful one-shot reveal — accent-coloured ring expands behind the
 * heading on mount, peaks at ~600ms, fades by 1.2s. CSS only, no JS
 * animation timeline, gracefully degrades on prefers-reduced-motion.
 */
function AccentHalo({ color }: { color: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -left-12 -top-16 h-72 w-72 motion-safe:animate-[accent-halo_1.6s_ease-out_forwards] motion-reduce:opacity-30"
      style={{
        background: `radial-gradient(circle at center, ${color}55 0%, ${color}18 32%, transparent 65%)`,
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

/** Word-by-word reveal — premium, restrained, ~80ms stagger. */
function RevealText({ children, delay = 0 }: { children: string; delay?: number }) {
  const words = children.split(/(\s+)/);
  return (
    <span className="inline">
      {words.map((word, i) => {
        const ws = /^\s+$/.test(word);
        return ws ? (
          <span key={i}>{word}</span>
        ) : (
          <span
            key={i}
            className="inline-block motion-safe:animate-[fadeup_500ms_cubic-bezier(0.32,0.72,0.4,1)_both] motion-reduce:opacity-100"
            style={{ animationDelay: `${delay + i * 70}ms` }}
          >
            {word}
            <style>{`
              @keyframes fadeup {
                0%   { opacity: 0; transform: translateY(0.4em); }
                100% { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          </span>
        );
      })}
    </span>
  );
}

function AddressChip({
  subdomain,
  accent,
  copied,
  onCopy,
  onOpen,
}: {
  subdomain: string;
  accent: string;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border bg-card transition-colors"
      style={{
        borderColor: `${accent}33`,
        boxShadow: `0 0 0 1px ${accent}10 inset`,
      }}
    >
      <div
        className="px-5 pt-4 pb-3"
        style={{
          background: `linear-gradient(180deg, ${accent}10 0%, transparent 100%)`,
        }}
      >
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Your address
        </div>
        <div className="mt-1.5 font-mono text-[18px] font-semibold tracking-[-0.005em] text-foreground">
          {subdomain}
        </div>
      </div>
      <div className="flex items-stretch border-t border-border/40">
        <button
          type="button"
          onClick={onCopy}
          className="flex flex-1 items-center justify-center gap-1.5 px-4 py-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          aria-label="Copy address"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" /> Copied
            </>
          ) : (
            <>
              <Copy size={12} /> Copy
            </>
          )}
        </button>
        <span aria-hidden className="w-px bg-border/40" />
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-1 items-center justify-center gap-1.5 px-4 py-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          aria-label="Open in new tab"
        >
          <ExternalLink size={12} /> Visit
        </button>
      </div>
    </div>
  );
}
