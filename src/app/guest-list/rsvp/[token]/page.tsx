"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Calendar, MapPin, Loader2, XCircle, Shield } from "lucide-react";

type RsvpStatus = "loading" | "ready" | "submitting" | "approved" | "accepted" | "declined" | "error";

interface RsvpData {
  guest: {
    name: string;
    access_level: string;
    access_label: string;
    qty?: number;
  };
  event: {
    name: string;
    venue_name?: string;
    date_start?: string;
    doors_time?: string;
  } | null;
  status: string;
  message?: string;
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

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function RsvpPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<RsvpStatus>("loading");
  const [data, setData] = useState<RsvpData | null>(null);
  const [resultMessage, setResultMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/guest-list/rsvp/${token}`);
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const json = await res.json();
        setData(json);

        if (json.status === "approved") {
          setStatus("approved");
          setResultMessage(json.message || "You're confirmed.");
        } else if (json.status === "declined") {
          setStatus("declined");
          setResultMessage(json.message || "You've declined this invitation.");
        } else {
          setStatus("ready");
        }
      } catch {
        setStatus("error");
      }
    }
    if (token) load();
  }, [token]);

  const handleAction = async (action: "accept" | "decline") => {
    setStatus("submitting");
    try {
      const res = await fetch(`/api/guest-list/rsvp/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();

      if (json.status === "approved") {
        setStatus("approved");
        setResultMessage(json.message || "You're confirmed — your ticket has been sent to your email.");
      } else if (json.status === "accepted") {
        setStatus("accepted");
        setResultMessage(json.message || "You're confirmed.");
      } else if (json.status === "declined") {
        setStatus("declined");
        setResultMessage(json.message || "Invitation declined.");
      }
    } catch {
      setStatus("error");
    }
  };

  // Loading state
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="mt-5 text-lg font-bold text-foreground">Link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">This invitation is no longer valid.</p>
        </div>
      </div>
    );
  }

  const event = data?.event;
  const guest = data?.guest;
  const showAccessLevel = guest?.access_level && guest.access_level !== "guest_list";

  // Success states (approved, accepted, declined)
  if (status === "approved" || status === "accepted" || status === "declined") {
    const isPositive = status !== "declined";
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${isPositive ? "bg-success/10" : "bg-muted"}`}>
            {isPositive ? (
              <CheckCircle2 className="h-7 w-7 text-success" />
            ) : (
              <XCircle className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <h1 className="mt-5 text-lg font-bold text-foreground">
            {isPositive ? "You're confirmed." : "No worries."}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{resultMessage}</p>
          {event && (
            <div className="mt-6 rounded-xl border border-border/60 bg-card/50 p-4 text-left">
              <p className="text-sm font-semibold text-foreground">{event.name}</p>
              {event.venue_name && (
                <p className="mt-1 text-xs text-muted-foreground">{event.venue_name}</p>
              )}
              {event.date_start && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(event.date_start)}
                  {event.doors_time ? ` · ${formatTime(event.doors_time)}` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ready state — show RSVP form
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Heading */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">You're on the list.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {guest?.name?.split(/\s+/)[0]}, you've been added to the guest list
            {event ? ` for ${event.name}` : ""}.
          </p>
        </div>

        {/* Event details card */}
        {event && (
          <div className="mt-6 rounded-xl border border-border/60 bg-card/50 p-5">
            <p className="text-base font-semibold text-foreground">{event.name}</p>
            {event.venue_name && (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{event.venue_name}</span>
              </div>
            )}
            {event.date_start && (
              <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {formatDate(event.date_start)}
                  {event.doors_time ? ` · ${formatTime(event.doors_time)}` : ""}
                </span>
              </div>
            )}
            {showAccessLevel && (
              <div className="mt-3 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  {guest?.access_label}
                </span>
              </div>
            )}
            {guest?.qty && guest.qty > 1 && (
              <p className="mt-2 text-xs text-muted-foreground">
                +{guest.qty - 1} guest{guest.qty > 2 ? "s" : ""}
              </p>
            )}
          </div>
        )}

        {/* Instruction */}
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Confirm and we'll send your ticket with a QR code.
        </p>

        {/* Actions */}
        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => handleAction("accept")}
            disabled={status === "submitting"}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {status === "submitting" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Confirm attendance
          </button>
          <button
            type="button"
            onClick={() => handleAction("decline")}
            disabled={status === "submitting"}
            className="flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            Can't make it
          </button>
        </div>

        {/* Fine print */}
        <p className="mt-8 text-center text-[11px] text-muted-foreground/50">
          If you didn't expect this, you can safely ignore it.
        </p>
      </div>
    </div>
  );
}
