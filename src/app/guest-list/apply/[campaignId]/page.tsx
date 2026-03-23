"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Calendar, MapPin, Instagram } from "lucide-react";

interface CampaignData {
  campaign: {
    id: string;
    title: string;
    description?: string;
    fields: { instagram: boolean; date_of_birth: boolean };
    capacity?: number;
  };
  event: { name: string; venue_name?: string; date_start?: string; doors_time?: string };
  branding: { org_name: string; logo_url: string | null; accent_color: string };
  applied_count: number;
}

type PageStatus = "loading" | "ready" | "submitting" | "submitted" | "already_applied" | "closed" | "error";

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return dateStr; }
}

export default function ApplyPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [status, setStatus] = useState<PageStatus>("loading");
  const [data, setData] = useState<CampaignData | null>(null);

  // Form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [dob, setDob] = useState("");
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/guest-list/apply/${campaignId}`);
        if (!res.ok) { setStatus("error"); return; }
        const json = await res.json();
        setData(json);

        // Check capacity
        if (json.campaign.capacity && json.applied_count >= json.campaign.capacity) {
          setStatus("closed");
        } else {
          setStatus("ready");
        }
      } catch { setStatus("error"); }
    }
    if (campaignId) load();
  }, [campaignId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmitError("");
    setStatus("submitting");

    try {
      const res = await fetch(`/api/guest-list/apply/${campaignId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          instagram: instagram.trim() || undefined,
          date_of_birth: dob || undefined,
        }),
      });

      if (res.ok) {
        setStatus("submitted");
      } else {
        const json = await res.json();
        if (json.error === "already_applied") {
          setStatus("already_applied");
        } else if (json.error === "capacity_full") {
          setStatus("closed");
        } else {
          setSubmitError(json.message || json.error || "Something went wrong");
          setStatus("ready");
        }
      }
    } catch {
      setSubmitError("Network error — please try again");
      setStatus("ready");
    }
  };

  const logo = data?.branding?.logo_url ? (
    <div className="mb-8 flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.branding.logo_url} alt={data.branding.org_name} className="h-8 w-auto max-w-[140px] object-contain opacity-80" />
    </div>
  ) : data?.branding?.org_name ? (
    <p className="mb-8 text-center font-mono text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground/60">{data.branding.org_name}</p>
  ) : null;

  const spotsLeft = data?.campaign?.capacity ? Math.max(0, data.campaign.capacity - data.applied_count) : null;

  // Loading
  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/60" /></div>;
  }

  // Error
  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10"><XCircle className="h-7 w-7 text-destructive" /></div>
          <h1 className="mt-5 text-lg font-bold text-foreground">Not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">This application is no longer accepting entries.</p>
        </div>
      </div>
    );
  }

  // Closed (capacity full)
  if (status === "closed") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          {logo}
          <h1 className="text-lg font-bold text-foreground">Applications closed</h1>
          <p className="mt-2 text-sm text-muted-foreground">Guest list is now full for this event.</p>
          {data?.event && (
            <div className="mt-6 rounded-xl border border-border/60 bg-card/50 p-4 text-left">
              <p className="text-sm font-semibold text-foreground">{data.event.name}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Submitted / Already applied
  if (status === "submitted" || status === "already_applied") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          {logo}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <h1 className="mt-5 text-lg font-bold text-foreground">
            {status === "already_applied" ? "Already applied." : "Application received."}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {status === "already_applied"
              ? "You've already applied for this event. We'll be in touch."
              : "We'll review your application and let you know."}
          </p>
          {data?.event && (
            <div className="mt-6 rounded-xl border border-border/60 bg-card/50 p-4 text-left">
              <p className="text-sm font-semibold text-foreground">{data.event.name}</p>
              {data.event.venue_name && <p className="mt-1 text-xs text-muted-foreground">{data.event.venue_name}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ready — application form
  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {logo}

        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">{data?.campaign?.title || "Apply for guest list"}</h1>
          {data?.campaign?.description && (
            <p className="mt-2 text-sm text-muted-foreground">{data.campaign.description}</p>
          )}
        </div>

        {/* Event details */}
        {data?.event && (
          <div className="mt-5 rounded-xl border border-border/60 bg-card/50 p-4">
            <p className="text-sm font-semibold text-foreground">{data.event.name}</p>
            {data.event.venue_name && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" /><span>{data.event.venue_name}</span>
              </div>
            )}
            {data.event.date_start && (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" /><span>{formatDate(data.event.date_start)}</span>
              </div>
            )}
          </div>
        )}

        {/* Capacity indicator */}
        {spotsLeft !== null && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} remaining` : "Almost full"}
          </p>
        )}

        {/* Error */}
        {submitError && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
            <p className="text-xs text-destructive">{submitError}</p>
          </div>
        )}

        {/* Form section */}
        <div className="mt-6">
          <div className="mb-2">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-white/60">Your Details</h3>
            <p className="mt-1 text-[11px] text-white/25">Enter your details below to apply for guest list.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] overflow-hidden">
              <div className="p-4 space-y-3">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Full name"
                  className="w-full rounded-lg border border-white/[0.15] bg-white/[0.06] px-4 py-3.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/30 transition-colors" />

                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Email address"
                  className="w-full rounded-lg border border-white/[0.15] bg-white/[0.06] px-4 py-3.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/30 transition-colors" />

                {data?.campaign?.fields?.instagram && (
                  <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Instagram @handle"
                    className="w-full rounded-lg border border-white/[0.15] bg-white/[0.06] px-4 py-3.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/30 transition-colors" />
                )}

                {data?.campaign?.fields?.date_of_birth && (
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 text-[15px] text-white/90 outline-none focus:border-white/25 transition-colors" />
                )}

                <button type="submit" disabled={!name.trim() || !email.trim() || status === "submitting"}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                  {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Apply for guest list
                </button>
              </div>
            </div>
          </form>

          <p className="mt-3 text-center text-[10px] text-white/15">
            We'll review your application and get back to you.
          </p>
        </div>
      </div>
    </div>
  );
}
