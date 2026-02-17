"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Calendar,
  Clock,
  ChevronRight,
  ArrowLeft,
  Gift,
  Lock,
  Flame,
  ArrowUp,
  ArrowDown,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

const MEDAL_COLORS = ["var(--rep-gold)", "var(--rep-silver)", "var(--rep-bronze)"];
const PODIUM_BG = [
  "rep-podium-gold border-2",
  "rep-podium-silver border",
  "rep-podium-bronze border",
];
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
  const [tab, setTab] = useState<"all-time" | "events">("all-time");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <div className="text-center mb-5 rep-slide-up">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--rep-gold)]/10 mb-3" style={{ filter: "drop-shadow(0 0 12px rgba(245, 158, 11, 0.15))" }}>
          <Trophy size={24} className="text-[var(--rep-gold)]" />
        </div>
        <h1 className="text-xl font-bold text-white">Leaderboard</h1>
      </div>

      {/* Tab Bar */}
      <div className="rep-tab-bar mb-5">
        <button
          type="button"
          className={`rep-tab ${tab === "all-time" ? "active" : ""}`}
          onClick={() => setTab("all-time")}
        >
          All Time
        </button>
        <button
          type="button"
          className={`rep-tab ${tab === "events" ? "active" : ""}`}
          onClick={() => setTab("events")}
        >
          Events
        </button>
      </div>

      {tab === "all-time" ? <AllTimeLeaderboard /> : <EventsLeaderboard />}
    </div>
  );
}

// ─── Position Change Indicator ───────────────────────────────────────────────

function PositionIndicator({ change }: { change: number }) {
  if (change === 0) return null;

  const isUp = change > 0;
  return (
    <span className={cn(
      "rep-position-indicator inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
      isUp
        ? "text-[var(--rep-success)] bg-[var(--rep-success)]/10"
        : "text-[var(--rep-destructive)] bg-[var(--rep-destructive)]/10"
    )}>
      {isUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
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

          // Calculate position changes before storing new ones
          const changes: Record<string, number> = {};
          for (const entry of leaderboard) {
            changes[entry.id] = getPositionChange(entry.id, entry.position, "all");
          }
          setPositionChanges(changes);

          // Store new positions for next visit
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

  // Your position change
  const myChange = myRepId ? (positionChanges[myRepId] || 0) : 0;

  return (
    <div className="rep-fade-in">
      {/* Your Position Card — animated gradient border */}
      {myPosition && (
        <div className="mb-5 rounded-2xl p-5 text-center rep-card-reveal rep-position-card">
          <p className="text-[10px] uppercase tracking-[2px] text-[var(--rep-text-muted)] font-semibold mb-1.5">Your Position</p>
          <div className="flex items-center justify-center gap-3">
            <p className="text-4xl font-bold font-mono text-[var(--rep-accent)]" style={{ textShadow: "0 0 24px rgba(139, 92, 246, 0.2)" }}>
              #{myPosition}
            </p>
            {myChange !== 0 && <PositionIndicator change={myChange} />}
          </div>
        </div>
      )}

      {/* Podium — Top 3 */}
      {top3.length > 0 && (
        <div className="mb-4 space-y-2">
          {top3.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleEntryClick(entry)}
              className={cn(
                "rep-leaderboard-item rep-card-lift w-full text-left flex items-center gap-3 rounded-2xl p-4 cursor-pointer active:scale-[0.98]",
                PODIUM_BG[i],
                i === 0 && "rep-gradient-border-gold overflow-hidden",
                entry.id === myRepId && "ring-2 ring-[var(--rep-accent)]/40"
              )}
            >
              {/* Inner bg for gradient border */}
              {i === 0 && <div className="absolute inset-[1px] rounded-[inherit] bg-gradient-to-br from-[rgba(245,158,11,0.12)] to-[rgba(245,158,11,0.03)] z-[-1]" />}

              {/* Medal */}
              <div
                className="rep-medal rep-medal-lg shrink-0"
                style={{ color: MEDAL_COLORS[i], filter: `drop-shadow(0 0 6px ${MEDAL_COLORS[i]})` }}
              >
                {MEDAL_EMOJI[i]}
              </div>

              {/* Avatar */}
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full overflow-hidden ring-2"
                style={{ "--tw-ring-color": MEDAL_COLORS[i] } as React.CSSProperties}
              >
                {entry.photo_url ? (
                  <img src={entry.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-[var(--rep-accent)]/10 text-xs font-bold text-[var(--rep-accent)]">
                    {(entry.display_name || entry.first_name || "?").charAt(0)}
                  </div>
                )}
              </div>

              {/* Name + Level */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${
                  entry.id === myRepId ? "text-[var(--rep-accent)]" : "text-white"
                }`}>
                  {entry.display_name || entry.first_name}
                  {entry.id === myRepId && (
                    <span className="ml-1.5 text-[10px] text-[var(--rep-accent)]/60">(YOU)</span>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--rep-accent)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--rep-accent)]">
                    Lv.{entry.level}
                  </span>
                  <span className="text-[10px] text-[var(--rep-text-muted)]">
                    {entry.total_sales} sales
                  </span>
                  <PositionIndicator change={positionChanges[entry.id] || 0} />
                </div>
              </div>

              {/* Earned */}
              <div className="text-right">
                <p className="text-sm font-bold font-mono tabular-nums text-white">
                  £{Number(entry.total_revenue).toFixed(0)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Rest of leaderboard (4th onwards) */}
      {rest.length > 0 && (
        <div className="space-y-1.5">
          {rest.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleEntryClick(entry)}
              className={cn(
                "rep-leaderboard-item rep-card-lift w-full text-left flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer active:scale-[0.98]",
                entry.id === myRepId
                  ? "border-2 border-[var(--rep-accent)]/30 bg-[var(--rep-accent)]/5"
                  : "border border-[var(--rep-border)] bg-[var(--rep-card)]"
              )}
            >
              {/* Rank */}
              <div className="w-7 text-center">
                <span className="text-xs font-mono text-[var(--rep-text-muted)]">
                  {entry.position}
                </span>
              </div>

              {/* Avatar */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full overflow-hidden">
                {entry.photo_url ? (
                  <img src={entry.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-[var(--rep-accent)]/10 text-[10px] font-bold text-[var(--rep-accent)]">
                    {(entry.display_name || entry.first_name || "?").charAt(0)}
                  </div>
                )}
              </div>

              {/* Name + Level */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${
                  entry.id === myRepId ? "text-[var(--rep-accent)]" : "text-white"
                }`}>
                  {entry.display_name || entry.first_name}
                  {entry.id === myRepId && (
                    <span className="ml-1.5 text-[10px] text-[var(--rep-accent)]/60">(YOU)</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-[var(--rep-text-muted)]">
                    Lv.{entry.level} · {entry.total_sales} sales
                  </p>
                  <PositionIndicator change={positionChanges[entry.id] || 0} />
                </div>
              </div>

              {/* Earned */}
              <p className="text-sm font-bold font-mono tabular-nums text-white">
                £{Number(entry.total_revenue).toFixed(0)}
              </p>
            </button>
          ))}
        </div>
      )}

      {entries.length === 0 && (
        <EmptyLeaderboard />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function EventsLeaderboard() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rep-portal/leaderboard/events");
        if (!res.ok) {
          setError("Failed to load events");
          setLoading(false);
          return;
        }
        const json = await res.json();
        setEvents(json.data || []);
      } catch {
        setError("Failed to load events");
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <LeaderboardSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;

  if (selectedEvent) {
    return (
      <EventLeaderboardView
        eventId={selectedEvent}
        onBack={() => setSelectedEvent(null)}
      />
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-16 rep-fade-in">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--rep-accent)]/10 mb-3">
          <Calendar size={22} className="text-[var(--rep-accent)]" />
        </div>
        <p className="text-sm text-foreground font-medium mb-1">No active events</p>
        <p className="text-xs text-[var(--rep-text-muted)]">
          You&apos;ll see events here once you&apos;re assigned.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rep-fade-in">
      {events.map((event) => (
        <EventCard
          key={event.event_id}
          event={event}
          onClick={() => setSelectedEvent(event.event_id)}
        />
      ))}
    </div>
  );
}

// ─── Event Card ──────────────────────────────────────────────────────────────

function EventCard({ event, onClick }: { event: EventSummary; onClick: () => void }) {
  const isLive = !event.locked && isEventUpcoming(event.event_date);
  const isPast = !isEventUpcoming(event.event_date);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rep-event-card w-full text-left ${
        isLive ? "rep-event-live" : event.locked ? "rep-event-locked" : ""
      }`}
    >
      {/* Ambient cover image */}
      {event.cover_image && (
        <div className="rep-event-ambient">
          <img src={event.cover_image} alt="" />
        </div>
      )}
      <div className="p-4 relative z-[1]">
        {/* Event header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isLive && <span className="rep-live-dot" />}
              {isLive && (
                <span className="text-[10px] font-bold text-[var(--rep-success)] uppercase tracking-wider">
                  Live
                </span>
              )}
              {event.locked && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--rep-gold)] uppercase tracking-wider">
                  <Lock size={10} /> Locked
                </span>
              )}
              {isPast && !event.locked && (
                <span className="text-[10px] font-bold text-[var(--rep-text-muted)] uppercase tracking-wider">
                  Ended
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-white truncate">{event.event_name}</h3>
            {event.event_date && (
              <p className="text-[11px] text-[var(--rep-text-muted)] mt-0.5">
                {formatEventDate(event.event_date)}
              </p>
            )}
          </div>
          <ChevronRight size={16} className="text-[var(--rep-text-muted)] shrink-0 mt-1" />
        </div>

        {/* Countdown (if upcoming) */}
        {isLive && event.event_date && (
          <CountdownTimer targetDate={event.event_date} />
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3">
          <div>
            <p className="text-[10px] text-[var(--rep-text-muted)]">Your Rank</p>
            <p className="text-sm font-bold font-mono text-[var(--rep-accent)]">
              {event.your_position ? `#${event.your_position}` : "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--rep-text-muted)]">Sales</p>
            <p className="text-sm font-bold font-mono text-white">{event.your_sales}</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--rep-text-muted)]">Earned</p>
            <p className="text-sm font-bold font-mono text-white">
              £{Number(event.your_revenue).toFixed(0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--rep-text-muted)]">Reps</p>
            <p className="text-sm font-bold font-mono text-[var(--rep-text-muted)]">
              {event.reps_count}
            </p>
          </div>
        </div>

        {/* Position rewards preview */}
        {event.position_rewards.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--rep-border)]">
            {event.position_rewards.map((pr, i) => (
              <span
                key={pr.position}
                className={`rep-reward-pill ${REWARD_PILL_STYLES[i] || "rep-reward-pill-bronze"}`}
                style={i === 0 ? { boxShadow: "0 0 8px rgba(245, 158, 11, 0.15)" } : undefined}
              >
                <Gift size={10} />
                {ordinal(pr.position)}: {pr.reward_name}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LEADERBOARD VIEW
// ═══════════════════════════════════════════════════════════════════════════════

function EventLeaderboardView({
  eventId,
  onBack,
}: {
  eventId: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<EventLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [positionChanges, setPositionChanges] = useState<Record<string, number>>({});

  useEffect(() => {
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
          // Calculate position changes
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
  }, [eventId]);

  if (loading) return <LeaderboardSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  if (!data) return null;

  const isLive = !data.locked && data.event?.date_start && isEventUpcoming(data.event.date_start);
  const rewardMap = new Map(data.position_rewards.map((pr) => [pr.position, pr]));
  const myChange = data.current_rep_id ? (positionChanges[data.current_rep_id] || 0) : 0;

  return (
    <div className="rep-fade-in">
      {/* Back button + Event header */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--rep-text-muted)] hover:text-white transition-colors mb-4"
      >
        <ArrowLeft size={12} /> Back to Events
      </button>

      <div className="text-center mb-5">
        <h2 className="text-lg font-bold text-white">{data.event?.name || "Event"}</h2>
        {data.event?.date_start && (
          <p className="text-xs text-[var(--rep-text-muted)] mt-1">
            {formatEventDate(data.event.date_start)}
          </p>
        )}

        {/* Status badges */}
        <div className="flex items-center justify-center gap-2 mt-2">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rep-success)]/10 border border-[var(--rep-success)]/20 px-3 py-1 text-[10px] font-bold text-[var(--rep-success)] uppercase tracking-wider">
              <span className="rep-live-dot" />
              Positions Contested
            </span>
          )}
          {data.locked && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rep-gold)]/10 border border-[var(--rep-gold)]/20 px-3 py-1 text-[10px] font-bold text-[var(--rep-gold)] uppercase tracking-wider">
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

      {/* Your position — animated gradient border */}
      {data.current_position && (
        <div className="mb-4 rounded-2xl p-4 text-center rep-card-reveal rep-position-card">
          <p className="text-[10px] uppercase tracking-[2px] text-[var(--rep-text-muted)] font-semibold mb-1">Your Position</p>
          <div className="flex items-center justify-center gap-2">
            <p className="text-3xl font-bold font-mono text-[var(--rep-accent)]" style={{ textShadow: "0 0 20px rgba(139, 92, 246, 0.2)" }}>
              #{data.current_position}
            </p>
            {myChange !== 0 && <PositionIndicator change={myChange} />}
          </div>
        </div>
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
              onClick={() => {
                if (isMe) router.push("/rep/profile");
                else router.push(`/rep/profile/${entry.id}`);
              }}
              className={`rep-leaderboard-item w-full text-left rounded-2xl p-4 transition-colors cursor-pointer active:scale-[0.98] ${
                isPodium
                  ? `${PODIUM_BG[i]} ${isLive && !data.locked ? "rep-contested-border" : ""}`
                  : isMe
                    ? "border-2 border-[var(--rep-accent)]/30 bg-[var(--rep-accent)]/5"
                    : "border border-[var(--rep-border)] bg-[var(--rep-card)] hover:border-[var(--rep-accent)]/20"
              } ${isMe ? "ring-1 ring-[var(--rep-accent)]/30" : ""}`}
            >
              <div className="flex items-center gap-3">
                {/* Position */}
                <div className="w-8 text-center shrink-0">
                  {isPodium ? (
                    <span
                      className="rep-medal text-lg"
                      style={{ color: MEDAL_COLORS[i] }}
                    >
                      {MEDAL_EMOJI[i]}
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-[var(--rep-text-muted)]">
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* Avatar */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden ${
                    isPodium ? "ring-2" : ""
                  }`}
                  style={
                    isPodium
                      ? ({ "--tw-ring-color": MEDAL_COLORS[i] } as React.CSSProperties)
                      : undefined
                  }
                >
                  {entry.photo_url ? (
                    <img
                      src={entry.photo_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-[var(--rep-accent)]/10 text-xs font-bold text-[var(--rep-accent)]">
                      {(entry.display_name || entry.first_name || "?").charAt(0)}
                    </div>
                  )}
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${
                      isMe ? "text-[var(--rep-accent)]" : "text-white"
                    }`}
                  >
                    {entry.display_name || entry.first_name}
                    {isMe && (
                      <span className="ml-1.5 text-[10px] text-[var(--rep-accent)]/60">
                        (YOU)
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--rep-accent)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--rep-accent)]">
                      Lv.{entry.level}
                    </span>
                    <span className="text-[10px] text-[var(--rep-text-muted)]">
                      {entry.total_sales} sales
                    </span>
                    {isLive && isPodium && !data.locked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--rep-success)]">
                        <Flame size={10} /> Contested
                      </span>
                    )}
                    <PositionIndicator change={change} />
                  </div>
                </div>

                {/* Earned */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-mono tabular-nums text-white">
                    £{Number(entry.total_revenue).toFixed(0)}
                  </p>
                </div>
              </div>

              {/* Reward pill for podium positions */}
              {reward && reward.reward_name && (
                <div className="mt-2 ml-11">
                  <span
                    className={`rep-reward-pill ${
                      REWARD_PILL_STYLES[i] || "rep-reward-pill-bronze"
                    }`}
                  >
                    <Gift size={10} />
                    {ordinal(i + 1)} Prize: {reward.reward_name}
                    {reward.awarded_rep_id && entry.id === reward.awarded_rep_id && (
                      <span className="ml-1 opacity-70">✓ Awarded</span>
                    )}
                  </span>
                </div>
              )}
            </button>
          );
        })}

        {data.leaderboard.length === 0 && (
          <div className="text-center py-16 text-sm text-[var(--rep-text-muted)]">
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
      <p className="text-xs text-[var(--rep-text-muted)] font-mono">Event has started</p>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1 rep-countdown">
      <Clock size={12} className="text-[var(--rep-text-muted)] mr-1" />
      {timeLeft.days > 0 && (
        <>
          <span className="rep-countdown-segment">
            <span className="text-sm font-bold font-mono text-white">{timeLeft.days}</span>
            <span className="text-[9px] text-[var(--rep-text-muted)]">d</span>
          </span>
          <span className="text-[var(--rep-text-muted)] text-xs">:</span>
        </>
      )}
      <span className="rep-countdown-segment">
        <span className="text-sm font-bold font-mono text-white">
          {String(timeLeft.hours).padStart(2, "0")}
        </span>
        <span className="text-[9px] text-[var(--rep-text-muted)]">h</span>
      </span>
      <span className="text-[var(--rep-text-muted)] text-xs">:</span>
      <span className="rep-countdown-segment">
        <span className="text-sm font-bold font-mono text-white">
          {String(timeLeft.minutes).padStart(2, "0")}
        </span>
        <span className="text-[9px] text-[var(--rep-text-muted)]">m</span>
      </span>
      <span className="text-[var(--rep-text-muted)] text-xs">:</span>
      <span className="rep-countdown-segment">
        <span className="text-sm font-bold font-mono text-white">
          {String(timeLeft.seconds).padStart(2, "0")}
        </span>
        <span className="text-[9px] text-[var(--rep-text-muted)]">s</span>
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3 py-2">
      <Skeleton className="h-[72px] rounded-2xl" />
      <Skeleton className="h-[72px] rounded-2xl" />
      <Skeleton className="h-[72px] rounded-2xl" />
      <Skeleton className="h-[60px] rounded-xl" />
      <Skeleton className="h-[60px] rounded-xl" />
      <Skeleton className="h-[60px] rounded-xl" />
    </div>
  );
}

function EmptyLeaderboard() {
  return (
    <div className="text-center py-16">
      <div className="rep-empty-icon h-14 w-14 mx-auto mb-4">
        <div className="rep-empty-ring" />
        <div className="rep-empty-ring" />
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--rep-gold)]/10">
          <Trophy size={22} className="text-[var(--rep-gold)]/50" />
        </div>
      </div>
      <p className="text-sm text-foreground font-medium mb-1">No entries yet</p>
      <p className="text-xs text-[var(--rep-text-muted)]">Be the first to make a sale!</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
        <Trophy size={22} className="text-destructive" />
      </div>
      <p className="text-sm text-foreground font-medium mb-1">Something went wrong</p>
      <p className="text-xs text-muted-foreground mb-4">{error}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw size={12} />
        Try again
      </Button>
    </div>
  );
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
