"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, Plus, Trash2, CheckCircle2, XCircle, Calendar, MapPin } from "lucide-react";
import type { AccessLevel } from "@/types/orders";

interface GuestRow {
  id: string;
  name: string;
  email: string;
  access_level: AccessLevel;
}

interface SubmissionData {
  artist_name: string;
  event: {
    name: string;
    venue_name?: string;
    date_start?: string;
    doors_time?: string;
  };
  branding: {
    org_name: string;
    logo_url: string | null;
    accent_color: string;
  };
  quotas: Record<string, number | null> | null;
  quota_remaining: Record<string, number | null> | null;
}

const ACCESS_LEVEL_LABELS: Record<string, string> = {
  guest_list: "Guest List",
  vip: "VIP",
  backstage: "Backstage",
  aaa: "AAA",
  artist: "Artist",
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

let nextId = 1;
function makeRow(defaultLevel: AccessLevel): GuestRow {
  return { id: `row-${nextId++}`, name: "", email: "", access_level: defaultLevel };
}

export default function SubmitGuestListPage() {
  const { token } = useParams<{ token: string }>();
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "submitting" | "success" | "error">("loading");
  const [data, setData] = useState<SubmissionData | null>(null);
  const [rows, setRows] = useState<GuestRow[]>([]);
  const [submitCount, setSubmitCount] = useState(0);
  const [submitError, setSubmitError] = useState("");

  // Determine default access level and available levels from quotas
  const hasQuotas = data?.quotas && Object.keys(data.quotas).length > 0;
  const availableLevels = hasQuotas
    ? Object.entries(data!.quotas!).filter(([, quota]) => quota === null || (quota !== undefined && quota > 0)).map(([level]) => level as AccessLevel)
    : [];
  const defaultLevel: AccessLevel = availableLevels.length > 0
    ? (availableLevels.find((l) => (data?.quota_remaining?.[l] ?? 1) > 0) || availableLevels[0])
    : "guest_list";

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/guest-list/submit/${token}`);
        if (!res.ok) {
          setPageStatus("error");
          return;
        }
        const json = await res.json();
        setData(json);
        // Initialize first row with default access level
        const hasQ = json.quotas && Object.keys(json.quotas).length > 0;
        const levels = hasQ
          ? Object.entries(json.quotas).filter(([, q]) => q === null || (q as number) > 0).map(([l]) => l as AccessLevel)
          : [];
        const defLevel: AccessLevel = levels.length > 0 ? levels[0] : "guest_list";
        setRows([makeRow(defLevel)]);
        setPageStatus("ready");
      } catch {
        setPageStatus("error");
      }
    }
    if (token) load();
  }, [token]);

  const updateRow = (id: string, field: keyof GuestRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, makeRow(defaultLevel)]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  const validRows = rows.filter((r) => r.name.trim() && r.email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validRows.length === 0) return;
    setSubmitError("");
    setPageStatus("submitting");
    try {
      const res = await fetch(`/api/guest-list/submit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guests: validRows.map((r) => ({
            name: r.name.trim(),
            email: r.email.trim() || undefined,
            access_level: hasQuotas ? r.access_level : undefined,
          })),
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setSubmitCount(json.count || validRows.length);
        setPageStatus("success");
      } else {
        const json = await res.json();
        setSubmitError(json.error || "Something went wrong");
        setPageStatus("ready");
      }
    } catch {
      setSubmitError("Network error — please try again");
      setPageStatus("ready");
    }
  };

  // Logo element
  const logo = data?.branding?.logo_url ? (
    <div className="mb-6 flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.branding.logo_url} alt={data.branding.org_name} className="h-8 w-auto max-w-[140px] object-contain opacity-80" />
    </div>
  ) : data?.branding?.org_name ? (
    <p className="mb-6 text-center font-mono text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground/60">{data.branding.org_name}</p>
  ) : null;

  // Loading
  if (pageStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </div>
    );
  }

  // Error
  if (pageStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="mt-5 text-lg font-bold text-foreground">Link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">This submission link is no longer valid.</p>
        </div>
      </div>
    );
  }

  // Success
  if (pageStatus === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          {logo}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <h1 className="mt-5 text-lg font-bold text-foreground">Submitted.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {submitCount} name{submitCount !== 1 ? "s" : ""} sent for review. The promoter will take it from here.
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

  // Ready — show form
  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {logo}

        {/* Header */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">Guest list</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add the names for your guest list{data?.event ? ` for ${data.event.name}` : ""}.
          </p>
        </div>

        {/* Event details */}
        {data?.event && (
          <div className="mt-5 rounded-xl border border-border/60 bg-card/50 p-4">
            <p className="text-sm font-semibold text-foreground">{data.event.name}</p>
            {data.event.venue_name && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span>{data.event.venue_name}</span>
              </div>
            )}
            {data.event.date_start && (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />
                <span>{formatDate(data.event.date_start)}</span>
              </div>
            )}
            <p className="mt-2 text-xs font-medium text-primary">
              Submitted by {data.artist_name}
            </p>
          </div>
        )}

        {/* Quota remaining bar */}
        {hasQuotas && data?.quota_remaining && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(data.quota_remaining).map(([level, remaining]) => {
              const label = ACCESS_LEVEL_LABELS[level] || level;
              const isFull = remaining !== null && remaining === 0;
              return (
                <span
                  key={level}
                  className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium ${
                    isFull
                      ? "bg-muted/50 text-muted-foreground/40 line-through"
                      : "bg-card border border-border/60 text-muted-foreground"
                  }`}
                >
                  {label}: {remaining === null ? "Unlimited" : `${remaining} left`}
                </span>
              );
            })}
          </div>
        )}

        {/* Error message */}
        {submitError && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
            <p className="text-xs text-destructive">{submitError}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          {rows.map((row, i) => (
            <div key={row.id} className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(row.id, "name", e.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-lg border border-border/60 bg-card/50 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                  />
                </div>
                <div className="ml-8 flex gap-2">
                  <input
                    type="email"
                    value={row.email}
                    onChange={(e) => updateRow(row.id, "email", e.target.value)}
                    placeholder="Email"
                    required
                    className="flex-1 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                  />
                  {hasQuotas && availableLevels.length > 1 && (
                    <select
                      value={row.access_level}
                      onChange={(e) => updateRow(row.id, "access_level", e.target.value)}
                      className="w-[100px] rounded-lg border border-border/60 bg-card/50 px-2 py-2 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                    >
                      {availableLevels.map((level) => {
                        const remaining = data?.quota_remaining?.[level];
                        const isFull = remaining !== null && remaining !== undefined && remaining <= 0;
                        return (
                          <option key={level} value={level} disabled={isFull}>
                            {ACCESS_LEVEL_LABELS[level] || level}{isFull ? " (Full)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              </div>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="mt-1.5 p-1.5 text-muted-foreground/40 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {/* Add another */}
          <button
            type="button"
            onClick={addRow}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Add another
          </button>

          {/* Submit */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={validRows.length === 0 || pageStatus === "submitting"}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {pageStatus === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit {validRows.length} name{validRows.length !== 1 ? "s" : ""}
            </button>
          </div>
        </form>

        {/* Fine print */}
        <p className="mt-6 text-center text-[11px] text-muted-foreground/50">
          The promoter will review and confirm each guest.
        </p>
      </div>
    </div>
  );
}
