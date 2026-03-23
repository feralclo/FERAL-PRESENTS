"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, Plus, Trash2, CheckCircle2, XCircle, Calendar, MapPin } from "lucide-react";

interface GuestRow {
  id: string;
  name: string;
  email: string;
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
    accent_color: string;
  };
}

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
function makeRow(): GuestRow {
  return { id: `row-${nextId++}`, name: "", email: "" };
}

export default function SubmitGuestListPage() {
  const { token } = useParams<{ token: string }>();
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "submitting" | "success" | "error">("loading");
  const [data, setData] = useState<SubmissionData | null>(null);
  const [rows, setRows] = useState<GuestRow[]>([makeRow()]);
  const [submitCount, setSubmitCount] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/guest-list/submit/${token}`);
        if (!res.ok) {
          setPageStatus("error");
          return;
        }
        setData(await res.json());
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
    setRows((prev) => [...prev, makeRow()]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  const validRows = rows.filter((r) => r.name.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validRows.length === 0) return;

    setPageStatus("submitting");
    try {
      const res = await fetch(`/api/guest-list/submit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guests: validRows.map((r) => ({
            name: r.name.trim(),
            email: r.email.trim() || undefined,
          })),
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setSubmitCount(json.count || validRows.length);
        setPageStatus("success");
      } else {
        setPageStatus("ready");
      }
    } catch {
      setPageStatus("ready");
    }
  };

  // Loading
  if (pageStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </div>
    );
  }

  // Error — invalid link
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
              {data.event.venue_name && (
                <p className="mt-1 text-xs text-muted-foreground">{data.event.venue_name}</p>
              )}
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
                <input
                  type="email"
                  value={row.email}
                  onChange={(e) => updateRow(row.id, "email", e.target.value)}
                  placeholder="Email (optional)"
                  className="ml-8 w-[calc(100%-32px)] rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                />
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
              {pageStatus === "submitting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
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
