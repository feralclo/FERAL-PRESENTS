"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Copy } from "lucide-react";
import { SectionFooter, SectionField, SectionHeading, HintCard } from "../Shell";
import type { OnboardingApi } from "../../_state";

interface DomainData {
  choice?: "subdomain" | "custom";
  custom_hostname?: string;
  domain_id?: string;
  verification_type?: string;
  verification_domain?: string;
  verification_value?: string;
  status?: "pending" | "active" | "failed";
}

export function DomainSection({ api }: { api: OnboardingApi }) {
  const data = (api.getSection("domain")?.data ?? {}) as DomainData;
  const [choice, setChoice] = useState<"subdomain" | "custom">(data.choice ?? "subdomain");
  const [hostname, setHostname] = useState(data.custom_hostname ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState({
    type: data.verification_type,
    domain: data.verification_domain,
    value: data.verification_value,
    status: data.status as "pending" | "active" | "failed" | undefined,
  });

  useEffect(() => {
    api.updateSectionData("domain", { choice });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice]);

  async function handleAddCustom() {
    if (!hostname.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: hostname.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Could not add domain");
        return;
      }
      const domain = json.data ?? json.domain ?? json;
      setVerification({
        type: domain.verification_type,
        domain: domain.verification_domain,
        value: domain.verification_value,
        status: domain.status,
      });
      api.updateSectionData("domain", {
        custom_hostname: hostname.trim().toLowerCase(),
        domain_id: domain.id,
        verification_type: domain.verification_type,
        verification_domain: domain.verification_domain,
        verification_value: domain.verification_value,
        status: domain.status,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add domain");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <SectionHeading
        eyebrow="Step 4 of 9"
        title="How will people find you?"
        subtitle="Pick a free Entry subdomain or point your own domain at us — both work end-to-end."
      />

      <div className="space-y-3">
        <ChoiceCard
          active={choice === "subdomain"}
          title={`${(((api.getSection("identity")?.data ?? {}) as { slug?: string }).slug || api.orgId || "yourbrand")}.entry.events`}
          subtitle="Free, instant, fully white-label. We host it for you."
          tag="Recommended"
          onClick={() => setChoice("subdomain")}
        />
        <ChoiceCard
          active={choice === "custom"}
          title="I have my own domain"
          subtitle="Use yourbrand.com or tickets.yourbrand.com. We'll guide you through DNS in seconds."
          onClick={() => setChoice("custom")}
        />
      </div>

      {choice === "custom" && !verification.status && (
        <div className="mt-5 space-y-3">
          <SectionField label="Domain you want to use">
            <input
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="tickets.yourbrand.com"
              className="h-11 w-full rounded-xl border border-input bg-background/40 px-4 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15"
            />
          </SectionField>
          {error && (
            <div className="rounded-xl border border-destructive/15 bg-destructive/8 px-4 py-2.5 text-[12px] text-destructive">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={handleAddCustom}
            disabled={!hostname.trim() || submitting}
            className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-[12px] font-semibold text-primary transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                Adding…
              </span>
            ) : (
              "Add this domain"
            )}
          </button>
        </div>
      )}

      {choice === "custom" && verification.status === "pending" && (
        <div className="mt-5 rounded-2xl border border-warning/15 bg-warning/[0.04] p-4">
          <div className="text-[13px] font-medium text-foreground">
            Add this DNS record at your registrar
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Once it propagates we'll flip your domain live automatically — usually within 15 minutes — and email you to confirm.
          </p>
          <div className="mt-3 grid gap-2 text-[12px]">
            <CopyRow label="Type" value={(verification.type ?? "CNAME").toUpperCase()} />
            <CopyRow label="Host" value={verification.domain ?? hostname} />
            <CopyRow label="Value" value={verification.value ?? "cname.vercel-dns.com"} />
          </div>
        </div>
      )}

      {choice === "custom" && verification.status === "active" && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-success/20 bg-success/[0.06] p-4 text-[13px] text-foreground">
          <Check size={14} className="text-success" />
          <span>{hostname} is verified and live.</span>
        </div>
      )}

      <HintCard>
        Already running events under your own brand? Pattern B — a subdomain like{" "}
        <span className="text-foreground">tickets.yourbrand.com</span> — keeps your marketing site
        separate while we handle just the ticketing.
      </HintCard>

      <SectionFooter
        primaryLabel={choice === "custom" && verification.status === "pending" ? "Continue, we'll email you" : "Continue"}
        primaryLoading={api.saving}
        onPrimary={async () => {
          await api.completeAndAdvance("domain", { choice });
        }}
        skipLabel="Skip — use the free subdomain"
        onSkip={async () => {
          setChoice("subdomain");
          await api.skipAndAdvance("domain");
        }}
      />
    </div>
  );
}

function ChoiceCard({
  active,
  title,
  subtitle,
  tag,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  tag?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all ${
        active
          ? "border-primary/50 bg-primary/[0.06]"
          : "border-white/[0.05] hover:border-white/[0.1]"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          active ? "border-primary bg-primary text-white" : "border-white/[0.15]"
        }`}
      >
        {active && <Check size={9} strokeWidth={3} />}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-foreground">{title}</span>
          {tag && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
              {tag}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-black/[0.3] px-3 py-2 font-mono">
      <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 truncate text-[12px] text-foreground">{value}</span>
      <button
        type="button"
        onClick={() => {
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(value).catch(() => {});
          }
        }}
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Copy ${label}`}
      >
        <Copy size={12} />
      </button>
    </div>
  );
}
