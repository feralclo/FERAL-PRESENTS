"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Download, Bell, Trash2, Users } from "lucide-react";
import type { Event } from "@/types/events";
import type { EventSettings } from "@/types/settings";
import type { WaitlistSignupWithPosition } from "@/types/waitlist";

interface WaitlistTabProps {
  event: Event;
  settings: EventSettings;
  updateSetting: (field: string, value: unknown) => void;
}

interface WaitlistCounts {
  pending: number;
  notified: number;
  purchased: number;
  expired: number;
  removed: number;
  total: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting",
  notified: "Notified",
  purchased: "Purchased",
  expired: "Expired",
  removed: "Removed",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  pending: "outline",
  notified: "default",
  purchased: "secondary",
  expired: "outline",
  removed: "outline",
};

export function WaitlistTab({ event, settings, updateSetting }: WaitlistTabProps) {
  const [signups, setSignups] = useState<WaitlistSignupWithPosition[]>([]);
  const [counts, setCounts] = useState<WaitlistCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [notifyCount, setNotifyCount] = useState(1);
  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState("");
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const waitlistEnabled = settings.waitlist_enabled === true;

  const loadSignups = useCallback(async () => {
    if (!event.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/waitlist/${event.id}`);
      if (res.ok) {
        const data = await res.json();
        setSignups(data.signups || []);
        setCounts(data.counts || null);
      }
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  useEffect(() => {
    loadSignups();
  }, [loadSignups]);

  async function handleNotify() {
    setNotifying(true);
    setNotifyResult("");
    try {
      const res = await fetch(`/api/admin/waitlist/${event.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: notifyCount }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotifyResult(`Notified ${data.notified} person${data.notified !== 1 ? "s" : ""}.`);
        await loadSignups();
      } else {
        setNotifyResult(data.error || "Something went wrong.");
      }
    } finally {
      setNotifying(false);
      setShowNotifyDialog(false);
    }
  }

  async function handleRemove(signupId: string) {
    setRemoving(true);
    try {
      await fetch(`/api/admin/waitlist/${event.id}/signups/${signupId}`, { method: "DELETE" });
      await loadSignups();
    } finally {
      setRemoving(false);
      setRemoveId(null);
    }
  }

  function handleExport() {
    window.open(`/api/admin/waitlist/${event.id}/export`, "_blank");
  }

  return (
    <div className="space-y-6">
      {/* Enable/Disable toggle */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Enable waitlist</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                When all tickets are sold out, show a waitlist signup form on the event page instead of the sold-out widget.
              </p>
            </div>
            <Switch
              checked={waitlistEnabled}
              onCheckedChange={(v) => updateSetting("waitlist_enabled", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats overview */}
      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Waiting", value: counts.pending, color: "text-foreground" },
            { label: "Notified", value: counts.notified, color: "text-blue-400" },
            { label: "Purchased", value: counts.purchased, color: "text-green-400" },
            { label: "Total", value: counts.total, color: "text-muted-foreground" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Actions row */}
      {(counts?.pending ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            variant="default"
            size="sm"
            onClick={() => { setNotifyResult(""); setShowNotifyDialog(true); }}
            className="gap-2"
          >
            <Bell className="w-4 h-4" />
            Notify next
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-mono">{counts?.pending ?? 0}</span>
          </Button>
          {(counts?.total ?? 0) > 0 && (
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          )}
          {notifyResult && (
            <p className="text-xs text-muted-foreground">{notifyResult}</p>
          )}
        </div>
      )}

      {/* Signups list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Waitlist ({counts?.total ?? 0})
          </Label>
          {(counts?.total ?? 0) > 0 && (counts?.pending ?? 0) === 0 && (
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : signups.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              {waitlistEnabled
                ? "No one has joined the waitlist yet."
                : "Enable the waitlist above to start collecting signups when this event sells out."}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-card">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-mono text-muted-foreground tracking-wider">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono text-muted-foreground tracking-wider">Email</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono text-muted-foreground tracking-wider hidden sm:table-cell">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono text-muted-foreground tracking-wider hidden md:table-cell">Joined</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {signups.map((s) => (
                  <tr key={s.id} className="bg-background hover:bg-card/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {s.position !== null ? `#${s.position}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-sm truncate max-w-[180px]">{s.email}</p>
                        {s.first_name && (
                          <p className="text-xs text-muted-foreground">{s.first_name}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge variant={STATUS_VARIANTS[s.status] || "outline"} className="text-xs">
                        {STATUS_LABELS[s.status] || s.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {s.status !== "removed" && s.status !== "purchased" && (
                        <button
                          onClick={() => setRemoveId(s.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                          title="Remove from waitlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notify dialog */}
      <Dialog open={showNotifyDialog} onOpenChange={setShowNotifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notify waitlist</DialogTitle>
            <DialogDescription>
              Send an email to the next people on the waitlist. They'll have 48 hours to purchase before the offer expires.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="space-y-2">
              <Label>How many people to notify?</Label>
              <div className="flex items-center gap-3">
                <button
                  className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-sm font-bold hover:bg-card transition-colors disabled:opacity-40"
                  onClick={() => setNotifyCount((c) => Math.max(1, c - 1))}
                  disabled={notifyCount <= 1}
                >
                  −
                </button>
                <span className="font-mono text-xl font-bold w-8 text-center">{notifyCount}</span>
                <button
                  className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-sm font-bold hover:bg-card transition-colors disabled:opacity-40"
                  onClick={() => setNotifyCount((c) => Math.min(counts?.pending ?? 50, c + 1))}
                  disabled={notifyCount >= (counts?.pending ?? 50)}
                >
                  +
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {counts?.pending ?? 0} people currently waiting. Each person gets 48 hours to purchase.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotifyDialog(false)}>Cancel</Button>
            <Button onClick={handleNotify} disabled={notifying} className="gap-2">
              {notifying && <Loader2 className="w-4 h-4 animate-spin" />}
              Send {notifyCount === 1 ? "notification" : `${notifyCount} notifications`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm dialog */}
      <Dialog open={!!removeId} onOpenChange={(o) => { if (!o) setRemoveId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from waitlist?</DialogTitle>
            <DialogDescription>
              This person will be marked as removed. They won't receive notifications for this event.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={removing}
              onClick={() => removeId && handleRemove(removeId)}
              className="gap-2"
            >
              {removing && <Loader2 className="w-4 h-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
