"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Copy,
  ExternalLink,
  CreditCard,
  Calendar,
  Users,
  Globe,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { OnboardingApi } from "../../_state";

interface IdentityData {
  first_name?: string;
  brand_name?: string;
  slug?: string;
}

/**
 * Step 3: Finish.
 *
 * Celebrate, show the live address, hand off to the dashboard. The dashboard
 * itself owns the persistent setup checklist (see OnboardingChecklist.tsx) —
 * we just preview it here so the user knows where they're going.
 *
 * Side effects on mount: marks the wizard complete + fires the welcome email
 * (idempotent via onboarding_email_sent flag in state extras).
 */
export function FinishSection({ api }: { api: OnboardingApi }) {
  const router = useRouter();
  const identity = (api.getSection("identity")?.data ?? {}) as IdentityData;
  const slug = identity.slug || api.orgId || "your-brand";
  const subdomain = `${slug}.entry.events`;
  const greet = identity.first_name || "there";

  const finishedRef = useRef(false);
  const [finalising, setFinalising] = useState(true);
  const [copied, setCopied] = useState(false);
  const [confettiPhase, setConfettiPhase] = useState<0 | 1 | 2>(0);

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
    const t1 = setTimeout(() => setConfettiPhase(1), 120);
    const t2 = setTimeout(() => setConfettiPhase(2), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
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
      <Confetti phase={confettiPhase} />

      <div className="space-y-6">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/[0.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-success">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            You&apos;re live
          </div>
          <h1 className="font-mono text-[28px] font-bold leading-[1.1] tracking-tight text-foreground">
            Welcome to Entry, {greet}.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Your space is set up. Here&apos;s what&apos;s waiting.
          </p>
        </div>

        <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.04] via-card to-card">
          <CardContent className="p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Your address
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-mono text-[18px] font-semibold tracking-[-0.01em] text-foreground">
                {subdomain}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  <Copy size={12} />
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    window.open(`https://${subdomain}`, "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink size={12} />
                  Open
                </Button>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              This is your brand&apos;s home on Entry. Every event you publish lives here, and every
              email and ticket points buyers to it.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-1 text-sm font-semibold text-foreground">
              Pick up on the dashboard
            </div>
            <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground">
              These are waiting for you in any order. Tackle them when you&apos;re ready.
            </p>

            <ul className="space-y-1">
              <NextStep
                icon={CreditCard}
                title="Connect Stripe"
                hint="So you can take card payments"
                priority
              />
              <NextStep
                icon={Calendar}
                title="Create your first event"
                hint="Cover artwork, ticket types, lineup, the lot"
              />
              <NextStep
                icon={Users}
                title="Invite your team"
                hint="Owners, scanners, marketers"
              />
              <NextStep
                icon={Globe}
                title="Add a custom domain"
                hint="Optional — your subdomain works straight away"
              />
            </ul>
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full"
          onClick={() => router.push("/admin/?welcome=1")}
          disabled={finalising}
        >
          {finalising ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Wrapping up…
            </span>
          ) : (
            <>
              Open dashboard
              <ArrowRight size={14} />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function NextStep({
  icon: Icon,
  title,
  hint,
  priority,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  hint: string;
  priority?: boolean;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg px-1 py-2.5 text-sm">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          priority
            ? "bg-primary/10 text-primary ring-1 ring-primary/20"
            : "bg-muted/40 text-muted-foreground"
        }`}
      >
        <Icon size={13} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{title}</span>
          {priority && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-primary">
              First
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      </div>
    </li>
  );
}

/** CSS-only confetti — three bursts over ~1.5s. */
function Confetti({ phase }: { phase: 0 | 1 | 2 }) {
  const items = Array.from({ length: 32 });
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
                  : `translate3d(${offsetX}px, 220px, 0) rotate(${i * 22}deg)`,
              transition: `transform ${1.4 + delay}s cubic-bezier(0.32, 0.72, 0.4, 1), opacity 1s ease-out ${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}
