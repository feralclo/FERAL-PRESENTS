"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Calendar,
  Clock,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Gift,
  Lock,
  Flame,
  ArrowUp,
  ArrowDown,
  Users,
  Zap,
  Plus,
  MapPin,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState, RepPageError } from "@/components/rep";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  id: string;
  display_name?: string | null;
  first_name: string | null;
  last_name?: string | null;
  photo_url?: string | null;
  total_sales: number;
  total_revenue: number;
  level: number;
  position: number;
}

interface PositionReward {
  position: number;
  reward_name: string;
  reward_id?: string | null;
  awarded_rep_id?: string | null;
  xp_reward?: number;
  currency_reward?: number;
}

interface EventSummary {
  event_id: string;
  event_name: string;
  event_date: string | null;
  event_status: string;
  cover_image?: string | null;
  reps_count: number;
  your_position: number | null;
  your_sales: number;
  your_revenue: number;
  locked: boolean;
  position_rewards: PositionReward[];
}

interface EventLeaderboardData {
  leaderboard: LeaderboardEntry[];
  current_position: number | null;
  current_rep_id: string;
  event_id: string;
  event: { name: string; date_start: string | null; status: string } | null;
  locked: boolean;
  position_rewards: PositionReward[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MEDAL_COLORS = ["#FBBF24", "#94A3B8", "#CD7F32"];
const REWARD_PILL_STYLES = [
  "rep-reward-pill-gold",
  "rep-reward-pill-silver",
  "rep-reward-pill-bronze",
];
const MEDAL_EMOJI = ["\uD83D\uDC51", "\uD83E\uDD48", "\uD83E\uDD49"];

const POSITION_STORAGE_KEY = "rep_leaderboard_positions";

// ─── Position tracking ───────────────────────────────────────────────────────

function getStoredPositions(): Record<string, number> {
  try {
    const stored = localStorage.getItem(POSITION_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

function storePositions(entries: LeaderboardEntry[], prefix: string = "all") {
  try {
    const existing = getStoredPositions();
    for (const entry of entries) {
      existing[`${prefix}_${entry.id}`] = entry.position;
    }
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(existing));
  } catch { /* silent */ }
}

function getPositionChange(entryId: string, currentPosition: number, prefix: string = "all"): number {
  const stored = getStoredPositions();
  const prevPosition = stored[`${prefix}_${entryId}`];
  if (prevPosition === undefined) return 0;
  return prevPosition - currentPosition; // positive = moved up
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function RepLeaderboardPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <div className="text-center mb-6 rep-slide-up">
        <h1 className="text-2xl font-black tracking-tight rep-gradient-text-gold">
          Leaderboard
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Compete. Climb. Conquer.</p>
      </div>

      {/* Tab Bar */}
      <Tabs defaultValue="events" className="gap-4">
        <TabsList className="w-full bg-secondary rounded-xl border border-border mb-2">
          <TabsTrigger value="events" className="flex-1 rounded-[10px] text-[13px] font-semibold data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <Zap size={13} className="mr-1.5" />
            Events
          </TabsTrigger>
          <TabsTrigger value="all-time" className="flex-1 rounded-[10px] text-[13px] font-semibold data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <Trophy size={13} className="mr-1.5" />
            All Time
          </TabsTrigger>
        </TabsList>
        <TabsContent value="events"><EventsLeaderboard /></TabsContent>
        <TabsContent value="all-time"><AllTimeLeaderboard /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Position Change Indicator ───────────────────────────────────────────────

function PositionIndicator({ change, size = "sm" }: { change: number; size?: "sm" | "md" }) {
  if (change === 0) return null;

  const isUp = change > 0;
  const iconSize = size === "md" ? 12 : 10;
  return (
    <span className={cn(
      "rep-position-indicator inline-flex items-center gap-0.5 rounded-full font-bold",
      size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]",
      isUp
        ? "text-success bg-success/10"
        : "text-destructive bg-destructive/10"
    )}>
      {isUp ? <ArrowUp size={iconSize} /> : <ArrowDown size={iconSize} />}
      {Math.abs(change)}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALL-TIME LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function AllTimeLeaderboard() {
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [myPosition, setMyPosition] = useState<number | null>(null);
  const [myRepId, setMyRepId] = useState<string | null>(null);
  const [positionChanges, setPositionChanges] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rep-portal/leaderboard");
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          setError(errJson?.error || `Failed to load (${res.status})`);
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (json.data) {
          const leaderboard = json.data.leaderboard || [];
          setEntries(leaderboard);
          setMyPosition(json.data.current_position);
          setMyRepId(json.data.current_rep_id || null);

          const changes: Record<string, number> = {};
          for (const entry of leaderboard) {
            changes[entry.id] = getPositionChange(entry.id, entry.position, "all");
          }
          setPositionChanges(changes);
          storePositions(leaderboard, "all");
        }
      } catch {
        setError("Failed to load leaderboard");
      }
      setLoading(false);
    })();
  }, [loadKey]);

  const handleEntryClick = (entry: LeaderboardEntry) => {
    if (entry.id === myRepId) {
      router.push("/rep/profile");
    } else {
      router.push(`/rep/profile/${entry.id}`);
    }
  };

  if (loading) return <LeaderboardSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => { setError(""); setLoading(true); setLoadKey((k) => k + 1); }} />;

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const myChange = myRepId ? (positionChanges[myRepId] || 0) : 0;

  return (
    <div className="rep-fade-in">
      {/* Your Position Banner */}
      {myPosition && (
        <div className="mb-6 rounded-2xl p-5 text-center rep-card-reveal rep-your-position-banner">
          <p className="text-[10px] uppercase tracking-[3px] text-muted-foreground font-bold mb-2">Your Rank</p>
          <div className="flex items-center justify-center gap-3">
            <p className="text-5xl font-black font-mono rep-gradient-text">
              #{myPosition}
            </p>
            {myChange !== 0 && <PositionIndicator change={myChange} size="md" />}
          </div>
        </div>
      )}

      {/* ── Podium — Top 3 ── */}
      {top3.length > 0 && (
        <div className="mb-6">
          <div className="rep-podium-v2">
            {/* Render in podium order: 2nd, 1st, 3rd */}
            {[1, 0, 2].map((idx) => {
              const entry = top3[idx];
              if (!entry) return <div key={idx} className="rep-podium-v2-col" />;
              const isFirst = idx === 0;
              const isMe = entry.id === myRepId;
              const name = entry.display_name || entry.first_name || "?";

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleEntryClick(entry)}
                  className={cn(
                    "rep-podium-v2-col rep-slide-up",
                    isFirst && "rep-podium-v2-first"
                  )}
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  {/* Medal */}
                  <div className={cn(
                    "rep-podium-v2-medal",
                    isFirst && "text-3xl"
                  )}>
                    {MEDAL_EMOJI[idx]}
                  </div>

                  {/* Avatar */}
                  <div
                    className={cn(
                      "rep-podium-v2-avatar",
                      isFirst ? "rep-podium-v2-avatar-lg" : "rep-podium-v2-avatar-sm",
                      isMe && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                    style={{
                      borderColor: MEDAL_COLORS[idx],
                      boxShadow: isFirst ? `0 0 24px ${MEDAL_COLORS[idx]}30` : undefined,
                    }}
                  >
                    {entry.photo_url ? (
                      <img src={entry.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-primary/10 font-bold text-primary"
                        style={{ fontSize: isFirst ? 20 : 16 }}
                      >
                        {name.charAt(0)}
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <p className={cn(
                    "font-bold truncate max-w-full mt-2",
                    isFirst ? "text-sm" : "text-xs",
                    isMe ? "text-primary" : "text-foreground"
                  )}>
                    {name}
                    {isMe && <span className="text-[9px] opacity-50 ml-1">(You)</span>}
                  </p>

                  {/* Stats */}
                  <p className={cn(
                    "font-mono tabular-nums font-bold mt-1",
                    isFirst ? "text-lg" : "text-sm",
                    "text-foreground"
                  )}>
                    {entry.total_sales} sales
                  </p>
                  <p className={cn(
                    "font-mono tabular-nums mt-0.5",
                    isFirst ? "text-sm text-muted-foreground" : "text-xs text-muted-foreground"
                  )}>
                    £{Number(entry.total_revenue).toFixed(0)}
                  </p>

                  {/* Position change */}
                  <div className="mt-1.5">
                    <PositionIndicator change={positionChanges[entry.id] || 0} />
                  </div>

                  {/* Podium bar */}
                  <div className={cn(
                    "rep-podium-v2-bar",
                    idx === 0 && "rep-podium-v2-bar-gold",
                    idx === 1 && "rep-podium-v2-bar-silver",
                    idx === 2 && "rep-podium-v2-bar-bronze"
                  )} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Remaining entries (4th onwards) ── */}
      {rest.length > 0 && (
        <div className="space-y-2">
          {rest.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleEntryClick(entry)}
              className={cn(
                "rep-leaderboard-item rep-lb-hover w-full text-left flex items-center gap-3 rounded-xl px-4 py-3.5 cursor-pointer transition-colors duration-200",
                entry.id === myRepId
                  ? "border-2 border-primary/30 bg-primary/5"
                  : "border border-border bg-card"
              )}
            >
              {/* Rank */}
              <div className="w-8 text-center shrink-0">
                <span className="text-sm font-bold font-mono text-muted-foreground">
                  {entry.position}
                </span>
              </div>

              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden border border-border">
                {entry.photo_url ? (
                  <img src={entry.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-primary/10 text-xs font-bold text-primary">
                    {(entry.display_name || entry.first_name || "?").charAt(0)}
                  </div>
                )}
              </div>

              {/* Name + Level */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-semibold truncate",
                  entry.id === myRepId ? "text-primary" : "text-foreground"
                )}>
                  {entry.display_name || entry.first_name}
                  {entry.id === myRepId && (
                    <span className="ml-1.5 text-[10px] text-primary/60">(YOU)</span>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    Lv.{entry.level}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {entry.total_sales} sales
                  </span>
                  <PositionIndicator change={positionChanges[entry.id] || 0} />
                </div>
              </div>

              {/* Revenue */}
              <p className="text-sm font-bold font-mono tabular-nums text-foreground">
                £{Number(entry.total_revenue).toFixed(0)}
              </p>
            </button>
          ))}
        </div>
      )}

      {entries.length === 0 && (
        <EmptyState
          icon={Trophy}
          title="No entries yet"
          subtitle="Be the first to make a sale!"
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════════

interface DiscoverableEvent {
  id: string;
  name: string;
  slug: string;
  date_start?: string;
  cover_image?: string;
  venue_name?: string;
}

function EventsLeaderboard() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [discoverableEvents, setDiscoverableEvents] = useState<DiscoverableEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [currencyName, setCurrencyName] = useState("FRL");
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    (async () => {
      try {
        const [eventsRes, settingsRes, dashRes] = await Promise.all([
          fetch("/api/rep-portal/leaderboard/events"),
          fetch("/api/rep-portal/settings"),
          fetch("/api/rep-portal/dashboard"),
        ]);
        if (!eventsRes.ok) {
          setError("Failed to load events");
          setLoading(false);
          return;
        }
        const eventsJson = await eventsRes.json();
        setEvents(eventsJson.data || []);
        const settingsJson = await settingsRes.json().catch(() => ({}));
        if (settingsJson.data?.currency_name) setCurrencyName(settingsJson.data.currency_name);
        // Get discoverable events for the empty / low-event state
        const dashJson = dashRes.ok ? await dashRes.json() : {};
        setDiscoverableEvents(dashJson.data?.discoverable_events || []);
      } catch {
        setError("Failed to load events");
      }
      setLoading(false);
    })();
  }, [loadKey]);

  const joinEvent = async (eventId: string) => {
    setJoiningEventId(eventId);
    try {
      const res = await fetch("/api/rep-portal/join-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (res.ok) {
        setLoadKey((k) => k + 1);
      }
    } catch { /* ignore */ }
    setJoiningEventId(null);
  };

  if (loading) return <LeaderboardSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => setLoadKey((k) => k + 1)} />;

  if (selectedEvent) {
    return (
      <EventLeaderboardView
        eventId={selectedEvent}
        onBack={() => setSelectedEvent(null)}
        currencyName={currencyName}
      />
    );
  }

  if (events.length === 0) {
    return (
      <div className="rep-fade-in space-y-6">
        <EmptyState
          icon={Calendar}
          title="No active events"
          subtitle={discoverableEvents.length > 0
            ? "Join an event below to start competing."
            : "You'll see events here once you're assigned."}
        />
        {discoverableEvents.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Plus size={14} className="text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-[2px] text-muted-foreground">
                Join Events
              </h3>
            </div>
            {discoverableEvents.map((event) => (
              <Card key={event.id} className="py-0 gap-0 overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center gap-3 p-3">
                    {event.cover_image ? (
                      <div className="h-14 w-14 rounded-xl overflow-hidden shrink-0 bg-muted/50">
                        <img src={event.cover_image} alt="" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-14 w-14 rounded-xl shrink-0 bg-primary/10 flex items-center justify-center">
                        <Calendar size={20} className="text-primary/50" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{event.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {event.date_start && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(event.date_start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </span>
                        )}
                        {event.venue_name && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <MapPin size={8} />
                            {event.venue_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => joinEvent(event.id)}
                      disabled={joiningEventId === event.id}
                      className="shrink-0 rounded-xl"
                    >
                      {joiningEventId === event.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Plus size={12} />
                      )}
                      Join
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Sort: live first, then upcoming, then ended
  const sortedEvents = [...events].sort((a, b) => {
    const aLive = !a.locked && isEventUpcoming(a.event_date);
    const bLive = !b.locked && isEventUpcoming(b.event_date);
    if (aLive && !bLive) return -1;
    if (!aLive && bLive) return 1;
    return 0;
  });

  return (
    <div className="space-y-3 rep-fade-in">
      {sortedEvents.map((event, i) => (
        <EventCard
          key={event.event_id}
          event={event}
          currencyName={currencyName}
          onClick={() => setSelectedEvent(event.event_id)}
          index={i}
        />
      ))}

      {/* Discoverable events — subtle section below active events */}
      {discoverableEvents.length > 0 && (
        <div className="pt-4 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Plus size={12} className="text-muted-foreground" />
            <h3 className="text-[10px] font-bold uppercase tracking-[2px] text-muted-foreground">
              More Events
            </h3>
          </div>
          {discoverableEvents.map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 p-3"
            >
              {event.cover_image ? (
                <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0 bg-muted/50">
                  <img src={event.cover_image} alt="" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded-lg shrink-0 bg-primary/5 flex items-center justify-center">
                  <Calendar size={14} className="text-primary/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{event.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {event.date_start && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(event.date_start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  {event.venue_name && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <MapPin size={8} />
                      {event.venue_name}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => joinEvent(event.id)}
                disabled={joiningEventId === event.id}
                className="shrink-0 rounded-xl text-xs"
              >
                {joiningEventId === event.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plus size={12} />
                )}
                Join
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Event Card ──────────────────────────────────────────────────────────────

function EventCard({ event, currencyName, onClick, index }: { event: EventSummary; currencyName: string; onClick: () => void; index: number }) {
  const isLive = !event.locked && isEventUpcoming(event.event_date);
  const isPast = !isEventUpcoming(event.event_date);
  const hasCover = !!event.cover_image;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rep-leaderboard-item rep-event-card-v2 w-full text-left",
        isLive && "rep-event-card-v2-live",
        event.locked && "rep-event-card-v2-locked"
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Cover image background */}
      {hasCover && (
        <div className="absolute inset-0 overflow-hidden rounded-[20px]">
          <img src={event.cover_image!} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/70 to-black/40" />
        </div>
      )}

      <div className="relative z-[1] p-5">
        {/* Top: status badge + chevron */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 border border-success/20 px-2.5 py-0.5 text-[10px] font-bold text-success uppercase tracking-wider">
                <span className="rep-live-dot" />
                Live
              </span>
            )}
            {event.locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/20 px-2.5 py-0.5 text-[10px] font-bold text-warning uppercase tracking-wider">
                <Lock size={9} /> Locked
              </span>
            )}
            {isPast && !event.locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] border border-white/[0.08] px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Ended
              </span>
            )}
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </div>

        {/* Event name + date */}
        <h3 className="text-lg font-bold text-foreground truncate">{event.event_name}</h3>
        {event.event_date && (
          <p className="text-xs text-muted-foreground/80 mt-0.5 flex items-center gap-1.5">
            <Calendar size={11} />
            {formatEventDate(event.event_date)}
          </p>
        )}

        {/* Compact stats row — rank + sales + reps, no earned/countdown */}
        <div className="flex items-center gap-3 mt-4">
          <div className={cn(
            "rounded-lg px-3 py-1.5 text-center",
            hasCover ? "bg-white/[0.08] border border-white/[0.08]" : "bg-white/[0.03] border border-white/[0.04]"
          )}>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Rank</p>
            <p className="text-base font-black font-mono text-primary">
              {event.your_position ? `#${event.your_position}` : "\u2014"}
            </p>
          </div>
          <div className={cn(
            "rounded-lg px-3 py-1.5 text-center",
            hasCover ? "bg-white/[0.08] border border-white/[0.08]" : "bg-white/[0.03] border border-white/[0.04]"
          )}>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Sales</p>
            <p className="text-base font-black font-mono text-foreground">{event.your_sales}</p>
          </div>
          <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground/60">
            <Users size={12} />
            {event.reps_count} rep{event.reps_count !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Position rewards preview */}
        {event.position_rewards.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/[0.06]">
            <Gift size={12} className="text-warning/70 mt-0.5" />
            {event.position_rewards.map((pr, i) => (
              <span
                key={pr.position}
                className={`rep-reward-pill ${REWARD_PILL_STYLES[i] || "rep-reward-pill-bronze"}`}
              >
                {ordinal(pr.position)}: {formatRewardPill(pr, currencyName)}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRIZE POOL — Expandable premium prize display
// ═══════════════════════════════════════════════════════════════════════════════

const POSITION_COLORS = [
  { bg: "from-yellow-500/15 to-yellow-600/5", border: "border-yellow-500/25", medal: "text-yellow-400", glow: "shadow-yellow-500/10", accent: "bg-yellow-500/15 text-yellow-300" },
  { bg: "from-slate-300/10 to-slate-400/5", border: "border-slate-400/20", medal: "text-slate-300", glow: "shadow-slate-400/10", accent: "bg-slate-400/12 text-slate-300" },
  { bg: "from-orange-500/12 to-orange-600/5", border: "border-orange-500/20", medal: "text-orange-400", glow: "shadow-orange-500/10", accent: "bg-orange-500/12 text-orange-300" },
];

const POSITION_LABELS = ["1st Place", "2nd Place", "3rd Place"];

function PrizePool({ rewards, currencyName }: { rewards: PositionReward[]; currencyName: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-5 rep-card-reveal">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full rounded-2xl border border-warning/15 rep-prize-pool-header active:scale-[0.98] transition-all"
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-warning/20 to-warning/5 border border-warning/20 flex items-center justify-center">
                <Trophy size={16} className="text-warning" />
              </div>
              <Sparkles size={10} className="absolute -top-1 -right-1 text-warning/60" />
            </div>
            <div className="text-left">
              <p className="text-[13px] font-bold text-foreground">Prize Pool</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {rewards.length} position{rewards.length !== 1 ? "s" : ""} rewarded
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Medal preview — collapsed hint */}
            {!expanded && (
              <div className="flex items-center -space-x-1">
                {rewards.slice(0, 3).map((_, i) => (
                  <span key={i} className="text-base">{MEDAL_EMOJI[i]}</span>
                ))}
              </div>
            )}
            <ChevronDown
              size={16}
              className={cn(
                "text-muted-foreground transition-transform duration-300",
                expanded && "rotate-180"
              )}
            />
          </div>
        </div>
      </button>

      {/* Expanded prize details */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          expanded ? "grid-rows-[1fr] opacity-100 mt-2.5" : "grid-rows-[0fr] opacity-0 mt-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2">
            {rewards.map((pr, i) => {
              const colors = POSITION_COLORS[i] || POSITION_COLORS[2];
              const hasPhysicalReward = !!pr.reward_name;

              return (
                <div
                  key={pr.position}
                  className={cn(
                    "rounded-xl border p-3.5 bg-gradient-to-r transition-all",
                    colors.bg, colors.border,
                    "shadow-sm", colors.glow
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Medal + position */}
                    <div className="shrink-0 text-center">
                      <span className="text-2xl leading-none block">{i < 3 ? MEDAL_EMOJI[i] : ""}</span>
                      {i >= 3 && (
                        <span className="text-sm font-black font-mono text-muted-foreground">{ordinal(pr.position)}</span>
                      )}
                      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mt-1">
                        {POSITION_LABELS[i] || `${ordinal(pr.position)} Place`}
                      </p>
                    </div>

                    {/* Rewards detail */}
                    <div className="flex-1 min-w-0">
                      {/* Digital rewards */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {pr.xp_reward ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2 py-1 text-[11px] font-bold text-primary border border-primary/10">
                            <Zap size={10} />
                            +{pr.xp_reward.toLocaleString()} XP
                          </span>
                        ) : null}
                        {pr.currency_reward ? (
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold border",
                            colors.accent, colors.border
                          )}>
                            <Sparkles size={10} />
                            +{pr.currency_reward.toLocaleString()} {currencyName}
                          </span>
                        ) : null}
                      </div>

                      {/* Physical reward */}
                      {hasPhysicalReward && (
                        <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-2.5 py-1.5">
                          <Gift size={13} className={colors.medal} />
                          <span className="text-[12px] font-semibold text-foreground">{pr.reward_name}</span>
                        </div>
                      )}

                      {/* Awarded indicator */}
                      {pr.awarded_rep_id && (
                        <p className="text-[10px] text-success/80 font-semibold mt-1.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-success/60 inline-block" />
                          Awarded
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LEADERBOARD VIEW
// ═══════════════════════════════════════════════════════════════════════════════

function EventLeaderboardView({
  eventId,
  onBack,
  currencyName,
}: {
  eventId: string;
  onBack: () => void;
  currencyName: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<EventLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [positionChanges, setPositionChanges] = useState<Record<string, number>>({});
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch(`/api/rep-portal/leaderboard?event_id=${eventId}`);
        if (!res.ok) {
          setError("Failed to load event leaderboard");
          setLoading(false);
          return;
        }
        const json = await res.json();
        const d = json.data || null;
        setData(d);

        if (d) {
          const changes: Record<string, number> = {};
          for (const entry of d.leaderboard) {
            changes[entry.id] = getPositionChange(entry.id, entry.position, `evt_${eventId}`);
          }
          setPositionChanges(changes);
          storePositions(d.leaderboard, `evt_${eventId}`);
        }
      } catch {
        setError("Failed to load");
      }
      setLoading(false);
    })();
  }, [eventId, loadKey]);

  if (loading) return <LeaderboardSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => setLoadKey((k) => k + 1)} />;
  if (!data) return null;

  const isLive = !data.locked && data.event?.date_start && isEventUpcoming(data.event.date_start);
  const rewardMap = new Map(data.position_rewards.map((pr) => [pr.position, pr]));
  const myChange = data.current_rep_id ? (positionChanges[data.current_rep_id] || 0) : 0;

  const handleEntryClick = (entry: LeaderboardEntry) => {
    if (entry.id === data.current_rep_id) router.push("/rep/profile");
    else router.push(`/rep/profile/${entry.id}`);
  };

  return (
    <div className="rep-fade-in">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5"
      >
        <ArrowLeft size={14} /> Back to Events
      </button>

      {/* Event header */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-foreground">{data.event?.name || "Event"}</h2>
        {data.event?.date_start && (
          <p className="text-xs text-muted-foreground mt-1.5 flex items-center justify-center gap-1.5">
            <Calendar size={11} />
            {formatEventDate(data.event.date_start)}
          </p>
        )}

        {/* Status badges */}
        <div className="flex items-center justify-center gap-2 mt-3">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 border border-success/20 px-3 py-1 text-[10px] font-bold text-success uppercase tracking-wider">
              <Flame size={10} />
              Positions Contested
            </span>
          )}
          {data.locked && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 border border-warning/20 px-3 py-1 text-[10px] font-bold text-warning uppercase tracking-wider">
              <Lock size={10} />
              Results Final
            </span>
          )}
        </div>

        {/* Countdown */}
        {isLive && data.event?.date_start && (
          <div className="mt-3">
            <CountdownTimer targetDate={data.event.date_start} />
          </div>
        )}
      </div>

      {/* Your position */}
      {data.current_position && (
        <div className="mb-5 rounded-2xl p-5 text-center rep-card-reveal rep-your-position-banner">
          <p className="text-[10px] uppercase tracking-[3px] text-muted-foreground font-bold mb-2">Your Position</p>
          <div className="flex items-center justify-center gap-3">
            <p className="text-5xl font-black font-mono rep-gradient-text drop-shadow-[0_0_20px_rgba(139,92,246,0.2)]">
              #{data.current_position}
            </p>
            {myChange !== 0 && <PositionIndicator change={myChange} size="md" />}
          </div>
        </div>
      )}

      {/* Prize pool */}
      {data.position_rewards.length > 0 && (
        <PrizePool rewards={data.position_rewards} currencyName={currencyName} />
      )}

      {/* Leaderboard entries */}
      <div className="space-y-2">
        {data.leaderboard.map((entry, i) => {
          const isPodium = i < 3;
          const reward = rewardMap.get(i + 1);
          const isMe = entry.id === data.current_rep_id;
          const change = positionChanges[entry.id] || 0;

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleEntryClick(entry)}
              className={cn(
                "rep-leaderboard-item w-full text-left rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-transform",
                isPodium
                  ? cn(
                      i === 0 && "rep-podium-gold border-2",
                      i === 1 && "rep-podium-silver border",
                      i === 2 && "rep-podium-bronze border",
                      isLive && !data.locked && "rep-contested-border"
                    )
                  : isMe
                    ? "border-2 border-primary/30 bg-primary/5"
                    : "border border-border bg-card rep-lb-hover",
                isMe && "ring-1 ring-primary/20"
              )}
            >
              <div className="flex items-center gap-3">
                {/* Position */}
                <div className="w-8 text-center shrink-0">
                  {isPodium ? (
                    <span className="text-xl">{MEDAL_EMOJI[i]}</span>
                  ) : (
                    <span className="text-sm font-bold font-mono text-muted-foreground">
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* Avatar */}
                <div
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full overflow-hidden",
                    isPodium ? "h-11 w-11 ring-2" : "h-10 w-10 border border-border"
                  )}
                  style={
                    isPodium
                      ? ({ "--tw-ring-color": MEDAL_COLORS[i] } as React.CSSProperties)
                      : undefined
                  }
                >
                  {entry.photo_url ? (
                    <img src={entry.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-primary/10 text-xs font-bold text-primary">
                      {(entry.display_name || entry.first_name || "?").charAt(0)}
                    </div>
                  )}
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-semibold truncate",
                    isMe ? "text-primary" : "text-foreground"
                  )}>
                    {entry.display_name || entry.first_name}
                    {isMe && (
                      <span className="ml-1.5 text-[10px] text-primary/60">(YOU)</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                      Lv.{entry.level}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {entry.total_sales} sales
                    </span>
                    {isLive && isPodium && !data.locked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success">
                        <Flame size={10} />
                      </span>
                    )}
                    <PositionIndicator change={change} />
                  </div>
                </div>

                {/* Revenue */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-mono tabular-nums text-foreground">
                    £{Number(entry.total_revenue).toFixed(0)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}

        {data.leaderboard.length === 0 && (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No sales yet for this event. Be the first!
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COUNTDOWN TIMER
// ═══════════════════════════════════════════════════════════════════════════════

function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(targetDate));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (timeLeft.total <= 0) {
    return (
      <p className="text-xs text-muted-foreground font-mono text-center">Event has started</p>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 rep-countdown">
      <Clock size={12} className="text-muted-foreground" />
      {timeLeft.days > 0 && (
        <div className="rep-countdown-block">
          <span className="rep-countdown-num">{timeLeft.days}</span>
          <span className="rep-countdown-label">d</span>
        </div>
      )}
      <span className="text-muted-foreground/50 text-xs font-mono">:</span>
      <div className="rep-countdown-block">
        <span className="rep-countdown-num">{String(timeLeft.hours).padStart(2, "0")}</span>
        <span className="rep-countdown-label">h</span>
      </div>
      <span className="text-muted-foreground/50 text-xs font-mono">:</span>
      <div className="rep-countdown-block">
        <span className="rep-countdown-num">{String(timeLeft.minutes).padStart(2, "0")}</span>
        <span className="rep-countdown-label">m</span>
      </div>
      <span className="text-muted-foreground/50 text-xs font-mono">:</span>
      <div className="rep-countdown-block">
        <span className="rep-countdown-num">{String(timeLeft.seconds).padStart(2, "0")}</span>
        <span className="rep-countdown-label">s</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3 py-2">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-16 rounded-xl" />
    </div>
  );
}


function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <RepPageError icon={Trophy} message={error} onRetry={onRetry} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════

function getTimeLeft(target: string) {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

  return {
    total: diff,
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function isEventUpcoming(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() > Date.now();
}

function formatEventDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

function formatRewardPill(pr: PositionReward, currencyName: string): string {
  const parts: string[] = [];
  if (pr.xp_reward) parts.push(`+${pr.xp_reward} XP`);
  if (pr.currency_reward) parts.push(`+${pr.currency_reward} ${currencyName}`);
  if (pr.reward_name) parts.push(pr.reward_name);
  return parts.length > 0 ? parts.join(" ") : "\u2014";
}
