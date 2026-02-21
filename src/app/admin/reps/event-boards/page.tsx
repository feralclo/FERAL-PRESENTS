"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
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
  UserPlus,
  Check,
} from "lucide-react";
import { DEFAULT_PLATFORM_XP_CONFIG } from "@/types/reps";

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
  xp_reward?: number;
  currency_reward?: number;
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

interface ActiveRep {
  id: string;
  first_name: string;
  last_name: string;
  display_name?: string | null;
  email: string;
  photo_url?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function EventBoardsPage() {
  const [events, setEvents] = useState<EventWithReps[]>([]);
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [currencyName, setCurrencyName] = useState("FRL");

  // Position rewards dialog
  const [selectedEvent, setSelectedEvent] = useState<EventWithReps | null>(null);
  const [editRewards, setEditRewards] = useState<{ position: number; reward_name: string; reward_id: string | null; xp_reward: number; currency_reward: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Lock dialog
  const [lockTarget, setLockTarget] = useState<EventWithReps | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState("");

  // Leaderboard preview
  const [previewEvent, setPreviewEvent] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<LeaderboardEntry[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Assign reps dialog
  const [assignEvent, setAssignEvent] = useState<EventWithReps | null>(null);
  const [activeReps, setActiveReps] = useState<ActiveRep[]>([]);
  const [assignedRepIds, setAssignedRepIds] = useState<Set<string>>(new Set());
  const [selectedRepIds, setSelectedRepIds] = useState<Set<string>>(new Set());
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      // Get all events, rewards, and settings in parallel
      const [eventsRes, rewardsRes, settingsRes] = await Promise.all([
        fetch("/api/events"),
        fetch("/api/reps/rewards"),
        fetch("/api/reps/settings"),
      ]);

      const eventsJson = await eventsRes.json();
      const rewardsJson = await rewardsRes.json();
      const settingsJson = await settingsRes.json();

      if (rewardsJson.data) {
        setRewards(rewardsJson.data.filter((r: Reward) => r.status === "active"));
      }
      if (settingsJson.data?.currency_name) {
        setCurrencyName(settingsJson.data.currency_name);
      }

      const allEvents = eventsJson.data || [];

      // For each event, get rep assignments and position rewards
      const eventsWithReps: EventWithReps[] = [];

      for (const event of allEvents) {
        // Get rep assignments for this event
        const assignRes = await fetch(`/api/reps/events?event_id=${event.id}`);
        const assignJson = await assignRes.json();
        const assignments = assignJson.data || [];

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
          xp_reward: pr.xp_reward ?? DEFAULT_PLATFORM_XP_CONFIG.position_xp[pr.position] ?? 0,
          currency_reward: pr.currency_reward ?? 0,
        }))
      );
    } else {
      setEditRewards([
        { position: 1, reward_name: "", reward_id: null, xp_reward: DEFAULT_PLATFORM_XP_CONFIG.position_xp[1] ?? 500, currency_reward: 0 },
        { position: 2, reward_name: "", reward_id: null, xp_reward: DEFAULT_PLATFORM_XP_CONFIG.position_xp[2] ?? 250, currency_reward: 0 },
        { position: 3, reward_name: "", reward_id: null, xp_reward: DEFAULT_PLATFORM_XP_CONFIG.position_xp[3] ?? 100, currency_reward: 0 },
      ]);
    }
  };

  const handleSaveRewards = async () => {
    if (!selectedEvent) return;
    setSaving(true);
    setSaveError("");
    try {
      const validRewards = editRewards.filter((r) => r.reward_name.trim() || r.xp_reward > 0 || r.currency_reward > 0);
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
          body: JSON.stringify({}),
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

  // ── Assign Reps ──
  const openAssignDialog = async (event: EventWithReps) => {
    setAssignEvent(event);
    setLoadingAssign(true);
    setSelectedRepIds(new Set());
    try {
      const [repsRes, assignRes] = await Promise.all([
        fetch("/api/reps?status=active"),
        fetch(`/api/reps/events?event_id=${event.event_id}`),
      ]);
      const repsJson = await repsRes.json();
      const assignJson = await assignRes.json();
      setActiveReps(repsJson.data || []);
      const assigned = new Set<string>((assignJson.data || []).map((a: { rep_id: string }) => a.rep_id));
      setAssignedRepIds(assigned);
    } catch {
      setActiveReps([]);
      setAssignedRepIds(new Set());
    }
    setLoadingAssign(false);
  };

  const handleAssignReps = async () => {
    if (!assignEvent || selectedRepIds.size === 0) return;
    setAssignSaving(true);
    try {
      for (const repId of selectedRepIds) {
        await fetch("/api/reps/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rep_id: repId, event_id: assignEvent.event_id }),
        });
      }
      setAssignEvent(null);
      loadEvents();
    } catch {
      /* network */
    }
    setAssignSaving(false);
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
              Assign reps, configure position rewards, and lock final results
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
            <p className="mt-4 text-sm font-medium text-foreground">No events found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create events first, then assign reps and configure leaderboard rewards here
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
                        {event.position_rewards.map((pr) => {
                          const parts: string[] = [];
                          if (pr.xp_reward) parts.push(`+${pr.xp_reward} XP`);
                          if (pr.currency_reward) parts.push(`+${pr.currency_reward} ${currencyName}`);
                          if (pr.reward_name) parts.push(pr.reward_name);
                          return (
                            <span
                              key={pr.position}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary"
                            >
                              <Gift size={10} />
                              {ordinal(pr.position)}: {parts.join(" ") || "—"}
                              {pr.awarded_rep_id && (
                                <span className="text-success ml-1">✓</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* No reps state */}
                    {event.reps_count === 0 && (
                      <p className="text-xs text-muted-foreground/60 italic mt-1">No reps assigned</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAssignDialog(event)}
                    >
                      <UserPlus size={14} /> Assign Reps
                    </Button>
                    {event.reps_count > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadPreview(event.event_id)}
                      >
                        <Trophy size={14} /> Preview
                      </Button>
                    )}
                    {!event.locked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRewardsDialog(event)}
                      >
                        <Gift size={14} /> Rewards
                      </Button>
                    )}
                    {!event.locked && event.position_rewards.length > 0 && event.reps_count > 0 && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setLockTarget(event);
                          setLockError("");
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
              Assign XP, {currencyName}, and rewards for podium positions. These are shown on the rep leaderboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {editRewards.map((reward, idx) => (
              <div key={reward.position} className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Crown size={14} className={idx === 0 ? "text-yellow-500" : idx === 1 ? "text-slate-400" : "text-orange-500"} />
                  <span className="text-sm font-bold text-foreground">{ordinal(reward.position)} Place</span>
                  {editRewards.length > 3 && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setEditRewards(editRewards.filter((_, i) => i !== idx))}
                      className="ml-auto shrink-0"
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-primary">XP Reward</Label>
                    <Input
                      type="number"
                      value={String(reward.xp_reward)}
                      onChange={(e) => {
                        const updated = [...editRewards];
                        updated[idx] = { ...updated[idx], xp_reward: Number(e.target.value) || 0 };
                        setEditRewards(updated);
                      }}
                      min="0"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-amber-400">{currencyName} Reward</Label>
                    <Input
                      type="number"
                      value={String(reward.currency_reward)}
                      onChange={(e) => {
                        const updated = [...editRewards];
                        updated[idx] = { ...updated[idx], currency_reward: Number(e.target.value) || 0 };
                        setEditRewards(updated);
                      }}
                      min="0"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Catalog Reward Name</Label>
                    <Input
                      value={reward.reward_name}
                      onChange={(e) => {
                        const updated = [...editRewards];
                        updated[idx] = { ...updated[idx], reward_name: e.target.value };
                        setEditRewards(updated);
                      }}
                      placeholder="e.g. VIP Pass"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
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
                      <SelectTrigger className="h-8 text-xs">
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
                </div>
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
                      xp_reward: 0,
                      currency_reward: 0,
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
              This will finalise the leaderboard standings and award XP + {currencyName} to the top
              reps. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {lockTarget?.position_rewards.map((pr) => {
              const parts: string[] = [];
              if (pr.xp_reward) parts.push(`+${pr.xp_reward} XP`);
              if (pr.currency_reward) parts.push(`+${pr.currency_reward} ${currencyName}`);
              if (pr.reward_name) parts.push(pr.reward_name);
              return (
                <div key={pr.position} className="flex items-center gap-3 text-sm">
                  <span className="w-12 font-bold text-primary">{ordinal(pr.position)}</span>
                  <span className="text-foreground">{parts.join(" · ") || "—"}</span>
                </div>
              );
            })}
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

      {/* ── Assign Reps Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={!!assignEvent}
        onOpenChange={(open) => !open && setAssignEvent(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Reps — {assignEvent?.event_name}</DialogTitle>
            <DialogDescription>
              Select reps to assign to this event. Already-assigned reps are checked.
            </DialogDescription>
          </DialogHeader>
          {loadingAssign ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-primary/60" />
            </div>
          ) : activeReps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No active reps found</p>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto space-y-1.5 py-2">
              {activeReps.map((rep) => {
                const alreadyAssigned = assignedRepIds.has(rep.id);
                const isSelected = selectedRepIds.has(rep.id);
                return (
                  <button
                    key={rep.id}
                    type="button"
                    disabled={alreadyAssigned}
                    onClick={() => {
                      const next = new Set(selectedRepIds);
                      if (isSelected) next.delete(rep.id);
                      else next.add(rep.id);
                      setSelectedRepIds(next);
                    }}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      alreadyAssigned
                        ? "bg-muted/30 opacity-60 cursor-default"
                        : isSelected
                          ? "bg-primary/10 border border-primary/30"
                          : "border border-border hover:border-primary/20 hover:bg-primary/5"
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-[10px] font-bold text-primary">
                      {rep.photo_url ? (
                        <img src={rep.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (rep.display_name || rep.first_name || "?").charAt(0)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {rep.display_name || `${rep.first_name} ${rep.last_name}`}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{rep.email}</p>
                    </div>
                    {alreadyAssigned && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">Assigned</Badge>
                    )}
                    {isSelected && (
                      <Check size={14} className="text-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignEvent(null)}>
              Cancel
            </Button>
            <Button onClick={handleAssignReps} disabled={assignSaving || selectedRepIds.size === 0}>
              {assignSaving && <Loader2 size={14} className="animate-spin" />}
              <UserPlus size={14} /> Assign {selectedRepIds.size > 0 ? `(${selectedRepIds.size})` : ""}
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
