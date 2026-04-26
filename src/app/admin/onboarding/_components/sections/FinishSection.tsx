"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { SectionHeading } from "../Shell";
import type { OnboardingApi } from "../../_state";

interface IdentityData {
  first_name?: string;
  brand_name?: string;
}
interface PaymentsData {
  method?: "stripe" | "external";
  charges_enabled?: boolean;
  deferred?: boolean;
}
interface DomainData {
  choice?: "subdomain" | "custom";
  status?: "pending" | "active" | "failed";
}
interface FirstEventData {
  event_id?: string;
  slug?: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  status: "ok" | "pending" | "skipped";
  hint?: string;
}

export function FinishSection({ api }: { api: OnboardingApi }) {
  const router = useRouter();
  const identity = (api.getSection("identity")?.data ?? {}) as IdentityData;
  const payments = (api.getSection("payments")?.data ?? {}) as PaymentsData;
  const domain = (api.getSection("domain")?.data ?? {}) as DomainData;
  const firstEvent = (api.getSection("first_event")?.data ?? {}) as FirstEventData;
  const branding = api.getSection("branding");
  const team = api.getSection("team");
  const vat = api.getSection("vat");

  const checklist: ChecklistItem[] = [
    {
      id: "identity",
      label: "Account",
      status: api.getSection("identity")?.completed_at ? "ok" : "pending",
    },
    {
      id: "branding",
      label: "Brand",
      status: branding?.completed_at ? "ok" : branding?.skipped ? "skipped" : "pending",
    },
    {
      id: "domain",
      label:
        domain.choice === "custom"
          ? domain.status === "active"
            ? "Custom domain live"
            : "Custom domain — DNS pending"
          : "Subdomain",
      status:
        domain.choice === "custom" && domain.status !== "active"
          ? "pending"
          : "ok",
    },
    {
      id: "vat",
      label: "Tax",
      status: vat?.completed_at ? "ok" : vat?.skipped ? "skipped" : "pending",
    },
    {
      id: "payments",
      label:
        payments.method === "external"
          ? "External ticketing"
          : payments.charges_enabled
          ? "Stripe ready"
          : "Stripe — finish later",
      status:
        payments.method === "external"
          ? "ok"
          : payments.charges_enabled
          ? "ok"
          : "pending",
    },
    {
      id: "first_event",
      label: firstEvent.event_id ? "First event saved as draft" : "First event",
      status: firstEvent.event_id ? "ok" : api.getSection("first_event")?.skipped ? "skipped" : "pending",
    },
    {
      id: "team",
      label: "Team",
      status: team?.completed_at ? "ok" : team?.skipped ? "skipped" : "pending",
    },
  ];

  const finishedRef = useRef(false);
  const [finalising, setFinalising] = useState(true);
  const [confettiPhase, setConfettiPhase] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    (async () => {
      try {
        // Mark the finish section complete in wizard state…
        await fetch("/api/onboarding/state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section: "finish",
            complete: true,
            extras: { completed_at: new Date().toISOString() },
          }),
        });
        // …then fire the welcome email (idempotent on the server — sets a flag).
        await fetch("/api/onboarding/complete", { method: "POST" });
      } catch {
        /* non-fatal */
      } finally {
        setFinalising(false);
      }
    })();
    // Confetti phase animation
    const t1 = setTimeout(() => setConfettiPhase(1), 100);
    const t2 = setTimeout(() => setConfettiPhase(2), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const greet = identity.first_name || "there";

  return (
    <div className="relative">
      <Confetti phase={confettiPhase} />

      <SectionHeading
        eyebrow="You're done"
        title={`Welcome to Entry, ${greet} 🎉`}
        subtitle={
          identity.brand_name
            ? `${identity.brand_name} is live on the platform.`
            : "Your platform is set up."
        }
      />

      <div className="space-y-3 rounded-2xl border border-white/[0.05] bg-white/[0.015] p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
          What you've set up
        </div>
        <ul className="space-y-2.5">
          {checklist.map((item) => (
            <li key={item.id} className="flex items-start gap-3 text-[13px]">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  item.status === "ok"
                    ? "bg-success/20 text-success"
                    : item.status === "pending"
                    ? "bg-warning/20 text-warning"
                    : "bg-muted/20 text-muted-foreground/60"
                }`}
              >
                {item.status === "ok" ? (
                  <Check size={11} strokeWidth={3} />
                ) : item.status === "pending" ? (
                  <AlertTriangle size={10} />
                ) : (
                  <span className="text-[8px]">—</span>
                )}
              </span>
              <span className={item.status === "skipped" ? "text-muted-foreground/60" : "text-foreground"}>
                {item.label}
                {item.status === "skipped" && (
                  <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                    skipped
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {firstEvent.event_id && firstEvent.slug && (
        <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            <Sparkles size={11} />
            Next step
          </div>
          <div className="mt-1.5 text-[14px] font-semibold text-foreground">
            Publish your first event
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            We saved it as a draft. Open it in the editor to add cover artwork and go live.
          </p>
        </div>
      )}

      <div className="mt-7 flex flex-col gap-3">
        {firstEvent.event_id && firstEvent.slug && (
          <button
            type="button"
            onClick={() =>
              router.push(`/admin/events/${firstEvent.slug}/`)
            }
            className="w-full rounded-xl bg-primary py-3 text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:opacity-50"
            disabled={finalising}
          >
            Open first event in editor
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push("/admin/?welcome=1")}
          className={`w-full rounded-xl py-3 text-[14px] font-semibold transition-all ${
            firstEvent.event_id
              ? "border border-white/[0.08] bg-transparent text-foreground hover:bg-white/[0.02]"
              : "bg-primary text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] hover:bg-primary/90"
          }`}
          disabled={finalising}
        >
          {finalising ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Wrapping up…
            </span>
          ) : (
            "Go to dashboard"
          )}
        </button>
      </div>
    </div>
  );
}

/** Lightweight CSS-only confetti — three bursts over ~1.5s. No deps. */
function Confetti({ phase }: { phase: 0 | 1 | 2 }) {
  const items = Array.from({ length: 28 });
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-12 z-0 h-40 overflow-hidden">
      {items.map((_, i) => {
        const left = (i / items.length) * 100;
        const delay = (i % 7) * 0.08;
        const colors = ["#A78BFA", "#FF66B2", "#19D6A0", "#F5A524", "#3B82F6", "#FFFFFF"];
        const bg = colors[i % colors.length];
        const offsetX = ((i * 53) % 100) - 50;
        return (
          <span
            key={i}
            className="absolute block rounded-sm"
            style={{
              top: 0,
              left: `${left}%`,
              width: 6,
              height: 10,
              backgroundColor: bg,
              opacity: phase === 0 ? 0 : phase === 1 ? 1 : 0,
              transform:
                phase === 0
                  ? "translate3d(0, -20px, 0) rotate(0deg)"
                  : `translate3d(${offsetX}px, 200px, 0) rotate(${i * 22}deg)`,
              transition: `transform ${1.4 + delay}s cubic-bezier(0.32, 0.72, 0.4, 1), opacity 1s ease-out ${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}
