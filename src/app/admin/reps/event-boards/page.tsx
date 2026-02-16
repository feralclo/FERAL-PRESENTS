"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Loader2,
  Trophy,
  Gift,
  Lock,
  Plus,
  Trash2,
  Save,
  Crown,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EventWithReps {
  event_id: string;
  event_name: string;
  event_slug: string;
  event_date: string | null;
  event_status: string;
  reps_count: number;
  total_sales: number;
  total_revenue: number;
  position_rewards: PositionReward[];
  locked: boolean;
}

interface PositionReward {
  id?: string;
  position: number;
  reward_name: string;
  reward_id?: string | null;
  awarded_rep_id?: string | null;
  awarded_at?: string | null;
  awarded_rep?: { id: string; display_name?: string; first_name: string; photo_url?: string } | null;
}

interface Reward {
  id: string;
  name: string;
  image_url?: string | null;
  reward_type: string;
  status: string;
}

interface LeaderboardEntry {
  id: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
  total_sales: number;
  total_revenue: number;
  level: number;
  points_balance: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function EventBoardsPage() {
  const [events, setEvents] = useState<EventWithReps[]>([]);
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<Reward[]>([]);

  // Position rewards dialog
  const [selectedEvent, setSelectedEvent] = useState<EventWithReps | null>(null);
  const [editRewards, setEditRewards] = useState<{ position: number; reward_name: string; reward_id: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Lock dialog
  const [lockTarget, setLockTarget] = useState<EventWithReps | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState("");
  const [awardPoints, setAwardPoints] = useState(true);

  // Leaderboard preview
  const [previewEvent, setPreviewEvent] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<LeaderboardEntry[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      // Get all events with rep assignments
      const [eventsRes, rewardsRes] = await Promise.all([
        fetch("/api/events"),
        fetch("/api/reps/rewards"),
      ]);

      const eventsJson = await eventsRes.json();
      const rewardsJson = await rewardsRes.json();

      if (rewardsJson.data) {
        setRewards(rewardsJson.data.filter((r: Reward) => r.status === "active"));
      }

      const allEvents = eventsJson.data || [];

      // For each event, get rep assignments and position rewards
      const eventsWithReps: EventWithReps[] = [];

      for (const event of allEvents) {
        // Get rep assignments for this event
        const assignRes = await fetch(`/api/reps/events?event_id=${event.id}`);
        const assignJson = await assignRes.json();
        const assignments = assignJson.data || [];

        if (assignments.length === 0) continue; // Skip events with no reps

        // Get position rewards
        const prRes = await fetch(`/api/reps/events/leaderboard/${event.id}/rewards`);
        const prJson = await prRes.json();
        const posRewards: PositionReward[] = prJson.data || [];

        const locked = posRewards.some((pr: PositionReward) => pr.awarded_rep_id !== null);

        eventsWithReps.push({
          event_id: event.id,
          event_name: event.name,
          event_slug: event.slug,
          event_date: event.date_start || null,
          event_status: event.status,
          reps_count: assignments.length,
          total_sales: assignments.reduce((sum: number, a: { sales_count: number }) => sum + (a.sales_count || 0), 0),
          total_revenue: assignments.reduce((sum: number, a: { revenue: number }) => sum + Number(a.revenue || 0), 0),
          position_rewards: posRewards,
          locked,
        });
      }

      // Sort: upcoming first, then by date
      eventsWithReps.sort((a, b) => {
        if (!a.event_date) return 1;
        if (!b.event_date) return -1;
        return new Date(b.event_date).getTime() - new Date(a.event_date).getTime();
      });

      setEvents(eventsWithReps);
    } catch {
      /* network error */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const openRewardsDialog = (event: EventWithReps) => {
    setSelectedEvent(event);
    setSaveError("");
    if (event.position_rewards.length > 0) {
      setEditRewards(
        event.position_rewards.map((pr) => ({
          position: pr.position,
          reward_name: pr.reward_name,
          reward_id: pr.reward_id || null,
        }))
      );
    } else {
      setEditRewards([
        { position: 1, reward_name: "", reward_id: null },
        { position: 2, reward_name: "", reward_id: null },
        { position: 3, reward_name: "", reward_id: null },
      ]);
    }
  };

  const handleSaveRewards = async () => {
    if (!selectedEvent) return;
    setSaving(true);
    setSaveError("");
    try {
      const validRewards = editRewards.filter((r) => r.reward_name.trim());
      const res = await fetch(
        `/api/reps/events/leaderboard/${selectedEvent.event_id}/rewards`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rewards: validRewards }),
        }
      );
      if (res.ok) {
        setSelectedEvent(null);
        loadEvents();
      } else {
        const json = await res.json().catch(() => ({ error: "Unknown error" }));
        setSaveError(json.error || `Failed (${res.status})`);
      }
    } catch {
      setSaveError("Network error");
    }
    setSaving(false);
  };

  const handleLock = async () => {
    if (!lockTarget) return;
    setLocking(true);
    setLockError("");
    try {
      const res = await fetch(
        `/api/reps/events/leaderboard/${lockTarget.event_id}/lock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ award_points: awardPoints }),
        }
      );
      if (res.ok) {
        setLockTarget(null);
        loadEvents();
      } else {
        const json = await res.json().catch(() => ({ error: "Unknown error" }));
        setLockError(json.error || `Failed (${res.status})`);
      }
    } catch {
      setLockError("Network error");
    }
    setLocking(false);
  };

  const loadPreview = async (eventId: string) => {
    setPreviewEvent(eventId);
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/reps/leaderboard?event_id=${eventId}`);
      const json = await res.json();
      setPreviewData(json.data || []);
    } catch {
      setPreviewData([]);
    }
    setLoadingPreview(false);
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <Link
          href="/admin/reps/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={12} /> Back to Reps
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
              Event Leaderboards
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Assign position rewards and lock final results for event leaderboards
            </p>
          </div>
        </div>
      </div>

      {/* Events list */}
      {loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">Loading events...</span>
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <Trophy size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No events with reps</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Assign reps to events first, then configure leaderboard rewards here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <Card key={event.event_id} className="py-0 gap-0">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Event info */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground">{event.event_name}</h3>
                      <Badge
                        variant={event.event_status === "published" ? "success" : "secondary"}
                        className="text-[10px]"
                      >
                        {event.event_status}
                      </Badge>
                      {event.locked && (
                        <Badge variant="warning" className="text-[10px]">
                          <Lock size={8} className="mr-0.5" /> Locked
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {event.event_date
                        ? new Date(event.event_date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "No date set"}
                      {" · "}
                      {event.reps_count} reps · {event.total_sales} sales · £{event.total_revenue.toFixed(0)} revenue
                    </p>

                    {/* Position rewards preview */}
                    {event.position_rewards.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {event.position_rewards.map((pr) => (
                          <span
                            key={pr.position}
                            className="inline-flex items-center gap-1 rounded-md bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary"
                          >
                            <Gift size={10} />
                            {ordinal(pr.position)}: {pr.reward_name}
                            {pr.awarded_rep_id && (
                              <span className="text-success ml-1">✓</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadPreview(event.event_id)}
                    >
                      <Trophy size={14} /> Preview
                    </Button>
                    {!event.locked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRewardsDialog(event)}
                      >
                        <Gift size={14} /> Rewards
                      </Button>
                    )}
                    {!event.locked && event.position_rewards.length > 0 && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setLockTarget(event);
                          setLockError("");
                          setAwardPoints(true);
                        }}
                      >
                        <Lock size={14} /> Lock Results
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Position Rewards Dialog ─────────────────────────────────────── */}
      <Dialog
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Position Rewards — {selectedEvent?.event_name}</DialogTitle>
            <DialogDescription>
              Assign rewards for 1st, 2nd, and 3rd place. These are shown on the rep leaderboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editRewards.map((reward, idx) => (
              <div key={reward.position} className="flex items-end gap-2">
                <div className="w-14 shrink-0">
                  <Label className="text-[11px]">{ordinal(reward.position)}</Label>
                  <div className="flex h-9 items-center justify-center rounded-md bg-muted/30 text-xs font-bold">
                    <Crown size={14} className={idx === 0 ? "text-yellow-500" : idx === 1 ? "text-slate-400" : "text-orange-500"} />
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-[11px]">Reward Name</Label>
                  <Input
                    value={reward.reward_name}
                    onChange={(e) => {
                      const updated = [...editRewards];
                      updated[idx] = { ...updated[idx], reward_name: e.target.value };
                      setEditRewards(updated);
                    }}
                    placeholder="e.g. VIP Weekend Pass"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="w-40 space-y-1">
                  <Label className="text-[11px]">Link Reward</Label>
                  <Select
                    value={reward.reward_id || "none"}
                    onValueChange={(v) => {
                      const updated = [...editRewards];
                      const rid = v === "none" ? null : v;
                      updated[idx] = { ...updated[idx], reward_id: rid };
                      if (rid) {
                        const r = rewards.find((rw) => rw.id === rid);
                        if (r && !updated[idx].reward_name) {
                          updated[idx].reward_name = r.name;
                        }
                      }
                      setEditRewards(updated);
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {rewards.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editRewards.length > 3 && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setEditRewards(editRewards.filter((_, i) => i !== idx))}
                    className="shrink-0"
                  >
                    <Trash2 size={12} />
                  </Button>
                )}
              </div>
            ))}
            {editRewards.length < 10 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setEditRewards([
                    ...editRewards,
                    {
                      position: editRewards.length + 1,
                      reward_name: "",
                      reward_id: null,
                    },
                  ])
                }
                className="text-xs"
              >
                <Plus size={12} /> Add Position
              </Button>
            )}
          </div>
          {saveError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
              {saveError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedEvent(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRewards} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              <Save size={14} /> Save Rewards
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lock Results Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={!!lockTarget}
        onOpenChange={(open) => !open && setLockTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lock Leaderboard — {lockTarget?.event_name}</DialogTitle>
            <DialogDescription>
              This will finalise the leaderboard standings and award position rewards to the top
              reps. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {lockTarget?.position_rewards.map((pr) => (
              <div key={pr.position} className="flex items-center gap-3 text-sm">
                <span className="w-12 font-bold text-primary">{ordinal(pr.position)}</span>
                <span className="text-foreground">{pr.reward_name}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <input
                type="checkbox"
                id="award-points"
                checked={awardPoints}
                onChange={(e) => setAwardPoints(e.target.checked)}
                className="accent-primary"
              />
              <Label htmlFor="award-points" className="text-sm cursor-pointer">
                Award bonus points (1st: 100, 2nd: 50, 3rd: 25)
              </Label>
            </div>
          </div>
          {lockError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
              {lockError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleLock} disabled={locking}>
              {locking && <Loader2 size={14} className="animate-spin" />}
              <Lock size={14} /> Lock & Award
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Leaderboard Preview Dialog ──────────────────────────────────── */}
      <Dialog
        open={!!previewEvent}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewEvent(null);
            setPreviewData([]);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Leaderboard Preview — {events.find((e) => e.event_id === previewEvent)?.event_name}
            </DialogTitle>
          </DialogHeader>
          {loadingPreview ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-primary/60" />
            </div>
          ) : previewData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No sales yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Rep</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.map((entry, i) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs font-bold">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-[10px] font-bold text-primary">
                          {entry.photo_url ? (
                            <img src={entry.photo_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            (entry.display_name || entry.first_name || "?").charAt(0)
                          )}
                        </div>
                        <span className="text-sm">
                          {entry.display_name || entry.first_name || "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {entry.total_sales}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      £{Number(entry.total_revenue).toFixed(0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewEvent(null); setPreviewData([]); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}
