"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

  const slug =
    ((api.getSection("identity")?.data ?? {}) as { slug?: string }).slug ||
    api.orgId ||
    "yourbrand";

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
        setError(json?.error || "Could not add that domain.");
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
      setError(err instanceof Error ? err.message : "Could not add that domain.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SectionHeading
        title="How will people find you?"
        subtitle="Use a free Entry subdomain or point your own domain at the platform."
      />

      <div className="space-y-3">
        <ChoiceRow
          active={choice === "subdomain"}
          title={`${slug}.entry.events`}
          subtitle="Free, instant, fully white-labelled. We host it for you."
          tag="Recommended"
          onClick={() => setChoice("subdomain")}
        />
        <ChoiceRow
          active={choice === "custom"}
          title="I have my own domain"
          subtitle="Use yourbrand.com or tickets.yourbrand.com — we'll guide you through DNS in a minute."
          onClick={() => setChoice("custom")}
        />
      </div>

      {choice === "custom" && !verification.status && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Add your domain</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SectionField
              label="Domain you want to use"
              htmlFor="onb-hostname"
              hint="A subdomain like tickets.yourbrand.com is the most common setup."
            >
              <Input
                id="onb-hostname"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="tickets.yourbrand.com"
              />
            </SectionField>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              variant="outline"
              size="default"
              onClick={handleAddCustom}
              disabled={!hostname.trim() || submitting}
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : "Add this domain"}
            </Button>
          </CardContent>
        </Card>
      )}

      {choice === "custom" && verification.status === "pending" && (
        <Card className="border-warning/30">
          <CardHeader>
            <CardTitle className="text-sm">Add this DNS record at your registrar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Once it propagates we&apos;ll flip your domain live automatically — usually within
              15 minutes — and email you to confirm.
            </p>
            <div className="grid gap-2">
              <CopyRow label="Type" value={(verification.type ?? "CNAME").toUpperCase()} />
              <CopyRow label="Host" value={verification.domain ?? hostname} />
              <CopyRow label="Value" value={verification.value ?? "cname.vercel-dns.com"} />
            </div>
          </CardContent>
        </Card>
      )}

      {choice === "custom" && verification.status === "active" && (
        <Alert variant="success">
          <Check className="size-4" />
          <AlertDescription>{hostname} is verified and live.</AlertDescription>
        </Alert>
      )}

      <HintCard>
        Already running events under your own brand? Point a subdomain like{" "}
        <span className="font-mono text-foreground">tickets.yourbrand.com</span> at Entry — your
        marketing site stays separate, we handle just the ticketing.
      </HintCard>

      <SectionFooter
        primaryLabel={
          choice === "custom" && verification.status === "pending"
            ? "Continue, we'll email you when DNS verifies"
            : "Continue"
        }
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
    </>
  );
}

function ChoiceRow({
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
      className={`flex w-full items-start gap-3 rounded-xl border bg-card px-4 py-3.5 text-left shadow-sm shadow-black/20 transition-all ${
        active
          ? "border-primary/50 bg-primary/[0.04]"
          : "border-border/60 hover:border-primary/30"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          active ? "border-primary" : "border-input"
        }`}
      >
        {active && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">{title}</span>
          {tag && (
            <span className="rounded-full bg-primary/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1.5px] text-primary ring-1 ring-primary/15">
              {tag}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 font-mono">
      <span className="w-12 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 truncate text-xs text-foreground">{value}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        type="button"
        onClick={() => {
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(value).catch(() => {});
          }
        }}
        aria-label={`Copy ${label}`}
      >
        <Copy size={12} />
      </Button>
    </div>
  );
}
