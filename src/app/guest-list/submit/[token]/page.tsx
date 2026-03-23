"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, Plus, Trash2, CheckCircle2, XCircle, Calendar, MapPin, Clock, Mail, Send } from "lucide-react";
import type { AccessLevel } from "@/types/orders";

interface GuestRow {
  id: string;
  name: string;
  email: string;
  access_level: AccessLevel;
}

interface ExistingSubmission {
  name: string;
  email: string;
  access_level: string;
  status: string;
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
  submissions: ExistingSubmission[];
}

const ACCESS_LEVEL_LABELS: Record<string, string> = {
  guest_list: "Guest List",
  vip: "VIP",
  backstage: "Backstage",
  aaa: "AAA",
  artist: "Artist",
};

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pending review", color: "text-muted-foreground", icon: Clock },
  invited: { label: "Invited", color: "text-primary", icon: Send },
  accepted: { label: "Confirmed", color: "text-success", icon: CheckCircle2 },
  approved: { label: "Ticket issued", color: "text-success", icon: CheckCircle2 },
  declined: { label: "Declined", color: "text-destructive", icon: XCircle },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return dateStr; }
}

let nextId = 1;
function makeRow(defaultLevel: AccessLevel): GuestRow {
  return { id: `row-${nextId++}`, name: "", email: "", access_level: defaultLevel };
}

export default function SubmitGuestListPage() {
  const { token } = useParams<{ token: string }>();
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "submitting" | "submitted" | "error">("loading");
  const [data, setData] = useState<SubmissionData | null>(null);
  const [rows, setRows] = useState<GuestRow[]>([]);
  const [lastSubmitCount, setLastSubmitCount] = useState(0);
  const [submitError, setSubmitError] = useState("");

  const hasQuotas = data?.quotas && Object.keys(data.quotas).length > 0;
  const availableLevels = hasQuotas
    ? Object.entries(data!.quotas!).filter(([, q]) => q === null || (q !== undefined && q > 0)).map(([l]) => l as AccessLevel)
    : [];
  const defaultLevel: AccessLevel = availableLevels.length > 0
    ? (availableLevels.find((l) => (data?.quota_remaining?.[l] ?? 1) > 0) || availableLevels[0])
    : "guest_list";

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/guest-list/submit/${token}`);
      if (!res.ok) { setPageStatus("error"); return; }
      const json = await res.json();
      setData(json);

      const hasQ = json.quotas && Object.keys(json.quotas).length > 0;
      const levels = hasQ ? Object.entries(json.quotas).filter(([, q]) => q === null || (q as number) > 0).map(([l]) => l as AccessLevel) : [];
      const defLevel: AccessLevel = levels.length > 0 ? levels[0] : "guest_list";
      setRows([makeRow(defLevel)]);
      if (pageStatus === "loading") setPageStatus("ready");
    } catch { setPageStatus("error"); }
  }, [token, pageStatus]);

  useEffect(() => { if (token) loadData(); }, [token, loadData]);

  const updateRow = (id: string, field: keyof GuestRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, makeRow(defaultLevel)]);
  const removeRow = (id: string) => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));

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
            email: r.email.trim(),
            access_level: hasQuotas ? r.access_level : undefined,
          })),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setLastSubmitCount(json.count || validRows.length);
        setPageStatus("submitted");
        // Reload to get updated submissions list + quotas
        loadData();
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

  const handleAddMore = () => {
    setRows([makeRow(defaultLevel)]);
    setLastSubmitCount(0);
    setPageStatus("ready");
  };

  // Logo
  const logo = data?.branding?.logo_url ? (
    <div className="mb-6 flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.branding.logo_url} alt={data.branding.org_name} className="h-8 w-auto max-w-[140px] object-contain opacity-80" />
    </div>
  ) : data?.branding?.org_name ? (
    <p className="mb-6 text-center font-mono text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground/60">{data.branding.org_name}</p>
  ) : null;

  const existingCount = data?.submissions?.length || 0;

  // Loading
  if (pageStatus === "loading") {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/60" /></div>;
  }

  // Error
  if (pageStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10"><XCircle className="h-7 w-7 text-destructive" /></div>
          <h1 className="mt-5 text-lg font-bold text-foreground">Link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">This submission link is no longer valid.</p>
        </div>
      </div>
    );
  }

  // Submitted — show success + option to add more
  if (pageStatus === "submitted") {
    return (
      <div className="flex min-h-screen justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {logo}
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <h1 className="mt-5 text-lg font-bold text-foreground">Submitted.</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {lastSubmitCount} name{lastSubmitCount !== 1 ? "s" : ""} sent for review.
            </p>
            <button
              type="button"
              onClick={handleAddMore}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add more names
            </button>
          </div>

          {/* Show all submissions so far */}
          {existingCount > 0 && (
            <div className="mt-8">
              <p className="font-mono text-[11px] tracking-[2px] uppercase text-muted-foreground/50 mb-3">
                Your guest list ({existingCount})
              </p>
              <div className="space-y-2">
                {data!.submissions.map((s, i) => {
                  const statusInfo = STATUS_LABELS[s.status] || STATUS_LABELS.pending;
                  const Icon = statusInfo.icon;
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground/70 truncate">{s.email}</p>
                      </div>
                      {s.access_level !== "guest_list" && s.access_level !== "artist" && (
                        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">{ACCESS_LEVEL_LABELS[s.access_level] || s.access_level}</span>
                      )}
                      <div className={`flex items-center gap-1.5 text-[11px] ${statusInfo.color} shrink-0`}>
                        <Icon className="h-3 w-3" />
                        <span>{statusInfo.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ready — form
  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {logo}

        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">Guest list</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {existingCount > 0
              ? `Add more names to your guest list for ${data?.event?.name || "this event"}.`
              : `Add the names for your guest list${data?.event ? ` for ${data.event.name}` : ""}.`
            }
          </p>
        </div>

        {/* Event details */}
        {data?.event && (
          <div className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
            <p className="text-[15px] font-semibold text-foreground">{data.event.name}</p>
            {data.event.venue_name && (
              <div className="mt-2.5 flex items-center gap-2.5 text-[13px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 opacity-50" /><span>{data.event.venue_name}</span>
              </div>
            )}
            {data.event.date_start && (
              <div className="mt-1.5 flex items-center gap-2.5 text-[13px] text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 shrink-0 opacity-50" /><span>{formatDate(data.event.date_start)}</span>
              </div>
            )}
          </div>
        )}

        {/* Existing submissions */}
        {existingCount > 0 && (
          <div className="mt-6">
            <p className="font-mono text-[11px] tracking-[2px] uppercase text-muted-foreground/50 mb-3">
              Already submitted ({existingCount})
            </p>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {data!.submissions.map((s, i) => {
                const statusInfo = STATUS_LABELS[s.status] || STATUS_LABELS.pending;
                const Icon = statusInfo.icon;
                return (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                    <p className="text-[13px] font-medium text-foreground truncate flex-1">{s.name}</p>
                    <div className={`flex items-center gap-1.5 text-[11px] ${statusInfo.color} shrink-0`}>
                      <Icon className="h-3 w-3" />
                      <span>{statusInfo.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quota remaining */}
        {hasQuotas && data?.quota_remaining && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(data.quota_remaining).map(([level, remaining]) => {
              const label = ACCESS_LEVEL_LABELS[level] || level;
              const isFull = remaining !== null && remaining === 0;
              return (
                <span key={level} className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-medium ${isFull ? "bg-white/[0.02] text-muted-foreground/30 line-through" : "bg-white/[0.03] border border-white/[0.08] text-muted-foreground"}`}>
                  {label}: {remaining === null ? "Unlimited" : `${remaining} left`}
                </span>
              );
            })}
          </div>
        )}

        {/* Error */}
        {submitError && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
            <p className="text-xs text-destructive">{submitError}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6">
          <h3 className="font-mono text-sm tracking-[2.5px] uppercase text-foreground/60 font-bold pb-3 mb-5 border-b border-white/[0.06]">
            {existingCount > 0 ? "Add More" : "Names"}
          </h3>
          <div className="space-y-4">
            {rows.map((row, i) => (
              <div key={row.id} className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-bold text-muted-foreground">
                      {existingCount + i + 1}
                    </span>
                    <input type="text" value={row.name} onChange={(e) => updateRow(row.id, "name", e.target.value)} placeholder="Full name"
                      className="w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 py-3 text-[14px] text-foreground outline-none placeholder:text-foreground/35 focus:border-white/[0.30] transition-colors" />
                  </div>
                  <div className="ml-[34px] flex gap-2">
                    <input type="email" value={row.email} onChange={(e) => updateRow(row.id, "email", e.target.value)} placeholder="Email" required
                      className="flex-1 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-foreground outline-none placeholder:text-foreground/35 focus:border-white/[0.30] transition-colors" />
                    {hasQuotas && availableLevels.length > 1 && (
                      <select value={row.access_level} onChange={(e) => updateRow(row.id, "access_level", e.target.value)}
                        className="w-[100px] rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5 py-2.5 text-xs text-foreground outline-none focus:border-white/[0.30] transition-colors">
                        {availableLevels.map((level) => {
                          const remaining = data?.quota_remaining?.[level];
                          const isFull = remaining !== null && remaining !== undefined && remaining <= 0;
                          return <option key={level} value={level} disabled={isFull}>{ACCESS_LEVEL_LABELS[level] || level}{isFull ? " (Full)" : ""}</option>;
                        })}
                      </select>
                    )}
                  </div>
                </div>
                {rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(row.id)} className="mt-2 p-1.5 text-muted-foreground/30 hover:text-destructive transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button type="button" onClick={addRow}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.10] py-3 text-[13px] font-medium text-muted-foreground/60 transition-colors hover:border-white/[0.20] hover:text-foreground/60">
            <Plus className="h-3.5 w-3.5" /> Add another
          </button>

          <div className="mt-5">
            <button type="submit" disabled={validRows.length === 0 || pageStatus === "submitting"}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
              {pageStatus === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit {validRows.length} name{validRows.length !== 1 ? "s" : ""}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-[11px] text-foreground/20">
          The promoter will review and confirm each guest.
        </p>
      </div>
    </div>
  );
}
