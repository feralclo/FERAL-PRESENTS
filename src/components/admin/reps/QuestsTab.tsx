"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Plus,
  Loader2,
  Check,
  X,
  Eye,
  Swords,
  Pencil,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Music,
  Camera,
  Link as LinkIcon,
  Image as ImageLucide,
  AlertCircle,
  Sparkles,
  Target,
  ZoomIn,
  Inbox,
  Clock,
  Filter,
  Copy,
  ChevronDown,
  ChevronRight,
  Archive,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useOrgId } from "@/components/OrgProvider";

import type {
  RepQuest,
  QuestType,
  QuestStatus,
  RepQuestSubmission,
} from "@/types/reps";
import { partitionQuestsByEventDate } from "@/lib/rep-quest-grouping";
import { QuestEditor } from "./quest-editor/QuestEditor";

const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  social_post: "Social Post",
  story_share: "Story Share",
  content_creation: "Content Creation",
  custom: "Custom",
  sales_milestone: "Sales Challenge",
};

const QUEST_STATUS_VARIANT: Record<QuestStatus, "success" | "warning" | "secondary" | "outline"> = {
  active: "success",
  paused: "warning",
  archived: "secondary",
  draft: "outline",
};

export function QuestsTab() {
  const orgId = useOrgId();
  const [quests, setQuests] = useState<RepQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | QuestStatus>("active");
  const [eventFilter, setEventFilter] = useState<"all" | "global" | string>("all");

  // Create/Edit
  // Editor mount state — the Phase-4 redesign self-contains its dialog,
  // form, and save/publish flow. This tab only opens it (with optional
  // editing/cloning context) and refreshes the list on save.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editingQuest, setEditingQuest] = useState<RepQuest | null>(null);
  // v2 fields that iOS actively renders.
  // Cut per iOS-session review: description (never rendered), image_url (merged
  // with cover_image_url server-side), banner_image_url (events-only, dead on
  // quests), accent_hex + accent_hex_secondary (iOS now derives gradient stops
  // from the promoter's accent — one brand colour cascades everywhere).
  // Pool-quest mode: when 'pool', the quest pulls shareables from a
  // campaign instead of using a single uploaded shareable. Reps see a
  // rotating slice (see LIBRARY-CAMPAIGNS-PLAN.md).

  // Events list for event picker + date awareness + cover cascade.
  // v2 has three image slots per event — we ONLY want cover_image_url here
  // (explicitly defined as "clean in-app" in the spec). Banner is 16:9 wrong
  // aspect for the quest card, and poster has text baked in which would
  // collide with the title overlay iOS renders on top. Legacy cover_image
  // is kept as a fallback for events that haven't been migrated to v2 yet.
  const [events, setEvents] = useState<
    Array<{
      id: string;
      name: string;
      date_start: string | null;
      cover_image_url: string | null;
      cover_image: string | null;
    }>
  >([]);

  // Past-events section is collapsed by default (the whole point of this view)
  const [showPast, setShowPast] = useState(false);

  // Submissions review — global view
  const [view, setView] = useState<"quests" | "submissions">("quests");
  const [allSubmissions, setAllSubmissions] = useState<RepQuestSubmission[]>([]);
  const [loadingAllSubs, setLoadingAllSubs] = useState(false);
  const [subFilter, setSubFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [questFilter, setQuestFilter] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const loadQuests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/reps/quests?${params}`);
      const json = await res.json();
      if (json.data) setQuests(json.data);
    } catch { /* network */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadQuests(); }, [loadQuests]);

  // Events list — drives the filter pills and event-grouping on the quest
  // list. The editor fetches its own copy when it opens.
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((json) => {
        if (json.data)
          setEvents(
            json.data.map(
              (e: {
                id: string;
                name: string;
                date_start?: string | null;
                cover_image_url?: string | null;
                cover_image?: string | null;
              }) => ({
                id: e.id,
                name: e.name,
                date_start: e.date_start ?? null,
                cover_image_url: e.cover_image_url ?? null,
                cover_image: e.cover_image ?? null,
              })
            )
          );
      })
      .catch(() => {});
  }, []);

  const loadAllSubmissions = useCallback(async () => {
    setLoadingAllSubs(true);
    try {
      const res = await fetch("/api/reps/submissions");
      const json = await res.json();
      if (json.data) setAllSubmissions(json.data);
    } catch { /* network */ }
    setLoadingAllSubs(false);
  }, []);

  // Auto-load submissions when switching to submissions view
  useEffect(() => {
    if (view === "submissions") loadAllSubmissions();
  }, [view, loadAllSubmissions]);

  const openCreate = () => {
    setEditId(null);
    // Pre-anchor the new quest to the currently filtered event so the
    // "first quest for this event" path lands without a manual pick.
    const anchor =
      eventFilter !== "all" && eventFilter !== "global"
        ? events.find((e) => e.id === eventFilter)
        : null;
    setEditingQuest(
      anchor
        ? ({
            id: "",
            org_id: orgId ?? "",
            title: "",
            quest_type: "story_share",
            platform: "any",
            points_reward: 0,
            currency_reward: 0,
            total_completed: 0,
            status: "draft",
            notify_reps: true,
            uses_sound: false,
            event_id: anchor.id,
            asset_mode: "single",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as unknown as RepQuest)
        : null
    );
    setEditorOpen(true);
  };

  const openEdit = (q: RepQuest) => {
    setEditId(q.id);
    setEditingQuest(q);
    setEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    try { await fetch(`/api/reps/quests/${id}`, { method: "DELETE" }); loadQuests(); } catch { /* network */ }
  };

  // Duplicate a quest — pre-fills the create form with the source quest's fields.
  // Clears event_id (user picks a new event) and strips the completions cap so
  // the clone can accept fresh submissions. Leaves editId null so save creates
  // a new record rather than overwriting the original.
  // Duplicate a quest — opens the editor with the source row's fields,
  // editId cleared so save creates a new record. event_id + completions
  // cap are reset so the clone is on its own footing.
  const openClone = (q: RepQuest) => {
    setEditId(null);
    setEditingQuest({
      ...q,
      title: q.title ? `${q.title} (copy)` : "",
      max_completions: null,
      expires_at: null,
      event_id: null,
    });
    setEditorOpen(true);
  };

  const handleReview = async (submissionId: string, newStatus: "approved" | "rejected", reason?: string) => {
    setReviewingId(submissionId);
    try {
      const res = await fetch(`/api/reps/quests/submissions/${submissionId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, rejection_reason: reason }),
      });
      if (res.ok) {
        // Optimistic local update — keeps the card visible with new status
        setAllSubmissions(prev => prev.map(s =>
          s.id === submissionId ? { ...s, status: newStatus, rejection_reason: reason || s.rejection_reason } as RepQuestSubmission : s
        ));
        // Refresh quest pending counts
        loadQuests();
      }
    } catch { /* network */ }
    setReviewingId(null);
  };

  // Apply both status and event filters
  const statusFiltered = filter === "all" ? quests : quests.filter((q) => q.status === filter);
  const filtered = eventFilter === "all"
    ? statusFiltered
    : eventFilter === "global"
      ? statusFiltered.filter((q) => !q.event_id)
      : statusFiltered.filter((q) => q.event_id === eventFilter);
  const counts = {
    all: quests.length,
    active: quests.filter((q) => q.status === "active").length,
    paused: quests.filter((q) => q.status === "paused").length,
    archived: quests.filter((q) => q.status === "archived").length,
  };
  // Events that have quests linked to them (for filter pills)
  const eventsWithQuests = events.filter((ev) => quests.some((q) => q.event_id === ev.id));
  const hasGlobalQuests = quests.some((q) => !q.event_id);
  const totalPending = quests.reduce((sum, q) => sum + (q.pending_count || 0), 0);

  // Section grouping — past = linked event.date_start before now; always-on
  // quests (no event_id) are never past. Sort rules live in the helper.
  const eventById = new Map(events.map((ev) => [ev.id, ev]));
  const { live: liveQuests, past: pastQuests } = partitionQuestsByEventDate(
    filtered,
    eventById
  );

  // Submissions view: filtered list
  const filteredSubs = allSubmissions.filter(s => {
    if (subFilter !== "all" && s.status !== subFilter) return false;
    if (questFilter && s.quest_id !== questFilter) return false;
    return true;
  });
  const subCounts = {
    all: allSubmissions.filter(s => !questFilter || s.quest_id === questFilter).length,
    pending: allSubmissions.filter(s => s.status === "pending" && (!questFilter || s.quest_id === questFilter)).length,
    approved: allSubmissions.filter(s => s.status === "approved" && (!questFilter || s.quest_id === questFilter)).length,
    rejected: allSubmissions.filter(s => s.status === "rejected" && (!questFilter || s.quest_id === questFilter)).length,
  };

  const timeAgo = (date: string): string => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            <button onClick={() => { setView("quests"); setQuestFilter(null); }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === "quests" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Quests
            </button>
            <button onClick={() => setView("submissions")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${view === "submissions" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Submissions
              {totalPending > 0 && (
                <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white tabular-nums">{totalPending}</span>
              )}
            </button>
          </div>

          {/* Context-specific filters */}
          {view === "quests" && (
            <div className="hidden sm:flex items-center gap-1 rounded-lg bg-muted/50 p-1">
              {(["active", "paused", "archived", "all"] as const).map((t) => (
                <button key={t} onClick={() => setFilter(t)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${filter === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  <span className="ml-1 text-[10px] tabular-nums text-muted-foreground/60">{counts[t]}</span>
                </button>
              ))}
            </div>
          )}
          {view === "submissions" && (
            <div className="hidden sm:flex items-center gap-1 rounded-lg bg-muted/50 p-1">
              {(["pending", "approved", "rejected", "all"] as const).map((t) => (
                <button key={t} onClick={() => setSubFilter(t)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${subFilter === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  <span className="ml-1 text-[10px] tabular-nums text-muted-foreground/60">{subCounts[t]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {view === "quests" && <Button size="sm" onClick={openCreate}><Plus size={14} /> Create Quest</Button>}
      </div>

      {/* Event filter pills — show when there are event-linked quests */}
      {view === "quests" && (eventsWithQuests.length > 0 || hasGlobalQuests) && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Filter size={13} className="text-muted-foreground/50 shrink-0" />
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setEventFilter("all")}
              className={`rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                eventFilter === "all"
                  ? "bg-primary text-white"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              All Events
            </button>
            {hasGlobalQuests && (
              <button
                onClick={() => setEventFilter("global")}
                className={`rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  eventFilter === "global"
                    ? "bg-success/20 text-success border border-success/30"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                Global
              </button>
            )}
            {(() => {
              // Only show events that either have a quest attached OR are still
              // upcoming. Past events with zero quests are noise — they'll never
              // gain quests (you can't create a quest against a past event) and
              // their visible quests have already been archived.
              const nowMs = Date.now();
              const eventsWithQuestsIds = new Set(eventsWithQuests.map((e) => e.id));
              const upcomingNoQuests = events.filter(
                (ev) =>
                  !eventsWithQuestsIds.has(ev.id) &&
                  (!ev.date_start || new Date(ev.date_start).getTime() >= nowMs)
              );
              return (
                <>
                  {eventsWithQuests.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => setEventFilter(ev.id)}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                        eventFilter === ev.id
                          ? "bg-info/20 text-info border border-info/30"
                          : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {ev.name}
                    </button>
                  ))}
                  {upcomingNoQuests.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => setEventFilter(ev.id)}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                        eventFilter === ev.id
                          ? "bg-info/20 text-info border border-info/30"
                          : "bg-muted/30 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {ev.name}
                    </button>
                  ))}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Pending submissions banner — only on quests view */}
      {view === "quests" && totalPending > 0 && !loading && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <AlertCircle size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{totalPending} submission{totalPending !== 1 ? "s" : ""} pending review</p>
              <p className="text-[11px] text-muted-foreground">Reps are waiting for approval on their quest proof</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-500 hover:bg-amber-500/10" onClick={() => {
            setView("submissions");
            setSubFilter("pending");
            setQuestFilter(null);
          }}>
            <Eye size={14} /> Review
          </Button>
        </div>
      )}

      {view === "quests" && (loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">Loading quests...</span>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <Swords size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {eventFilter !== "all" && eventFilter !== "global"
                ? `No quests for ${events.find((e) => e.id === eventFilter)?.name || "this event"}`
                : eventFilter === "global"
                  ? "No global quests"
                  : "No quests yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {eventFilter !== "all" && eventFilter !== "global"
                ? "Create a quest for this event to get reps engaged"
                : "Create quests to engage your reps"}
            </p>
            <Button size="sm" className="mt-4" onClick={openCreate}><Plus size={14} /> Create Quest</Button>
          </CardContent>
        </Card>
      ) : (
        (() => {
          const renderRow = (quest: RepQuest, opts: { past: boolean }) => {
            const linkedEvent = quest.event_id ? eventById.get(quest.event_id) : null;
            const eventDate = linkedEvent?.date_start
              ? new Date(linkedEvent.date_start).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year:
                    new Date(linkedEvent.date_start).getFullYear() !==
                    new Date().getFullYear()
                      ? "2-digit"
                      : undefined,
                })
              : null;
            return (
              <TableRow key={quest.id} className={opts.past ? "opacity-70" : ""}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{quest.title}</p>
                      {quest.description && <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-[250px]">{quest.description}</p>}
                    </div>
                    {(quest.pending_count || 0) > 0 && (
                      <Badge variant="warning" className="text-[10px] tabular-nums shrink-0">{quest.pending_count} pending</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {quest.event_id ? (
                    <div className="space-y-0.5">
                      <Badge variant="outline" className={`text-[10px] gap-1 ${opts.past ? "border-border text-muted-foreground" : "border-info/30 text-info"}`}>
                        {quest.event?.name || linkedEvent?.name || "Event"}
                      </Badge>
                      {eventDate && (
                        <p className="font-mono text-[10px] tabular-nums text-muted-foreground">{eventDate}</p>
                      )}
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-[10px] gap-1 border-success/30 text-success">All Reps</Badge>
                  )}
                </TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px]">{QUEST_TYPE_LABELS[quest.quest_type]}</Badge></TableCell>
                <TableCell className="font-mono text-xs text-primary font-bold tabular-nums">+{quest.points_reward}</TableCell>
                <TableCell className="hidden md:table-cell font-mono text-xs tabular-nums text-muted-foreground">
                  {quest.total_completed}{quest.max_total != null ? ` / ${quest.max_total}` : ""}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                  {quest.expires_at ? new Date(quest.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "\u2014"}
                </TableCell>
                <TableCell><Badge variant={QUEST_STATUS_VARIANT[quest.status]}>{quest.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {(quest.pending_count || 0) > 0 ? (
                      <Button size="sm" variant="outline" className="h-7 text-[11px] border-warning/30 text-warning hover:bg-warning/10" onClick={() => { setView("submissions"); setSubFilter("pending"); setQuestFilter(quest.id); }}>
                        <Eye size={12} /> Review {quest.pending_count}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon-xs" onClick={() => { setView("submissions"); setSubFilter("all"); setQuestFilter(quest.id); }} title="View submissions"><Eye size={13} /></Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-[11px]"
                      onClick={() => openClone(quest)}
                      title="Clone this quest for a new event"
                    >
                      <Copy size={12} /> Clone
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => openEdit(quest)} title="Edit"><Pencil size={13} /></Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(quest.id)} className="text-muted-foreground hover:text-destructive" title="Archive"><Trash2 size={13} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          };

          const tableHeader = (
            <TableHeader>
              <TableRow>
                <TableHead>Quest</TableHead>
                <TableHead>Visible To</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Points</TableHead>
                <TableHead className="hidden md:table-cell">Completions</TableHead>
                <TableHead className="hidden lg:table-cell">Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
          );

          return (
            <div className="space-y-6">
              {liveQuests.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-mono text-xs font-semibold uppercase tracking-[2px] text-muted-foreground">
                      Live &amp; upcoming
                      <span className="ml-2 font-mono tabular-nums text-foreground/70">{liveQuests.length}</span>
                    </h3>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">sorted by event date</p>
                  </div>
                  <Card className="py-0 gap-0">
                    <Table>
                      {tableHeader}
                      <TableBody>{liveQuests.map((q) => renderRow(q, { past: false }))}</TableBody>
                    </Table>
                  </Card>
                </section>
              )}

              {pastQuests.length > 0 && (
                <section className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowPast((v) => !v)}
                    className="group flex w-full items-center justify-between rounded-lg border border-dashed border-border px-4 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <span className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[2px] text-muted-foreground">
                      <Archive size={12} strokeWidth={1.75} />
                      Past events
                      <span className="font-mono tabular-nums text-foreground/70">{pastQuests.length}</span>
                    </span>
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 group-hover:text-primary">
                      {showPast ? "Hide" : "Show"}
                      {showPast ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                  </button>
                  {showPast && (
                    <Card className="py-0 gap-0">
                      <Table>
                        {tableHeader}
                        <TableBody>{pastQuests.map((q) => renderRow(q, { past: true }))}</TableBody>
                      </Table>
                      <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
                        Tap the <Copy size={11} className="mx-0.5 inline align-[-1px]" /> icon to duplicate a past quest for a new event without rebuilding from scratch.
                      </div>
                    </Card>
                  )}
                </section>
              )}

              {liveQuests.length === 0 && pastQuests.length === 0 && (
                <Card className="py-0 gap-0">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No quests in this view.
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })()
      ))}

      {/* ── Global Submissions Feed ── */}
      {view === "submissions" && (
        <>
          {/* Quest filter chip */}
          {questFilter && (() => {
            const fq = quests.find(q => q.id === questFilter);
            return (
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
                  <Filter size={12} className="text-muted-foreground" />
                  <span className="text-xs text-foreground font-medium">{fq?.title || "Quest"}</span>
                  <button onClick={() => setQuestFilter(null)} className="ml-1 rounded-full p-0.5 hover:bg-muted transition-colors">
                    <X size={12} className="text-muted-foreground" />
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Batch approve bar */}
          {subCounts.pending >= 2 && subFilter === "pending" && (
            <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-3">
              <span className="text-sm text-muted-foreground">{subCounts.pending} submission{subCounts.pending !== 1 ? "s" : ""} awaiting review</span>
              <Button
                size="sm"
                disabled={reviewingId !== null}
                onClick={async () => {
                  const pending = filteredSubs.filter(s => s.status === "pending");
                  for (const sub of pending) { await handleReview(sub.id, "approved"); }
                }}
              >
                <CheckCircle2 size={14} /> Approve All
              </Button>
            </div>
          )}

          {/* Mobile status filter */}
          <div className="flex sm:hidden items-center gap-1 rounded-lg bg-muted p-1">
            {(["pending", "approved", "rejected", "all"] as const).map((t) => (
              <button key={t} onClick={() => setSubFilter(t)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${subFilter === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {subCounts[t] > 0 && <span className="ml-1 text-[10px] tabular-nums text-muted-foreground/60">{subCounts[t]}</span>}
              </button>
            ))}
          </div>

          {loadingAllSubs ? (
            <Card className="py-0 gap-0">
              <CardContent className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-primary/60" />
                <span className="ml-3 text-sm text-muted-foreground">Loading submissions...</span>
              </CardContent>
            </Card>
          ) : filteredSubs.length === 0 ? (
            <Card className="py-0 gap-0">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
                  <Inbox size={20} className="text-primary/60" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">
                  {subFilter === "pending" ? "No pending submissions" : "No submissions found"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {subFilter === "pending" ? "You're all caught up!" : "Try a different filter"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredSubs.map((sub) => {
                const proofUrl = sub.proof_url || sub.proof_text || "";
                const isTikTok = sub.proof_type === "tiktok_link";
                const isInstagram = sub.proof_type === "instagram_link";
                const isPlatformLink = isTikTok || isInstagram;
                const proofLabel = isTikTok ? "TikTok" : isInstagram ? "Instagram" : sub.proof_type === "screenshot" ? "Screenshot" : sub.proof_type === "url" ? "URL" : "Text";
                const isPending = sub.status === "pending";
                const questTitle = (sub.quest as RepQuest | undefined)?.title || "Unknown Quest";
                const questType = (sub.quest as RepQuest | undefined)?.quest_type;
                const eventName = (sub.quest as RepQuest & { event?: { name: string } | null } | undefined)?.event?.name;

                return (
                  <Card key={sub.id} className={`overflow-hidden transition-all ${isPending ? "ring-1 ring-amber-500/20 hover:ring-amber-500/30" : "opacity-80 hover:opacity-100"}`}>
                    <CardContent className="p-0">
                      <div className="flex flex-col sm:flex-row">
                        {/* Proof column */}
                        <div className="sm:w-56 shrink-0 bg-muted/10 border-b sm:border-b-0 sm:border-r border-border">
                          {sub.proof_type === "screenshot" && sub.proof_url ? (
                            <button
                              type="button"
                              className="relative w-full group cursor-zoom-in"
                              onClick={() => setLightboxUrl(sub.proof_url!)}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={sub.proof_url} alt="Proof" className="w-full sm:h-48 object-contain bg-black/10" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 backdrop-blur-sm rounded-full p-2.5 border border-white/20">
                                  <ZoomIn size={16} className="text-white" />
                                </div>
                              </div>
                            </button>
                          ) : (isPlatformLink || sub.proof_type === "url") && proofUrl ? (
                            <div className="p-5 flex flex-col items-center justify-center h-full min-h-[80px]">
                              {isTikTok ? <Music size={24} className="text-[#25F4EE] mb-2" /> : isInstagram ? <Camera size={24} className="text-[#E1306C] mb-2" /> : <LinkIcon size={24} className="text-primary mb-2" />}
                              <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline break-all text-center">
                                <ExternalLink size={11} className="shrink-0" /> Open {proofLabel}
                              </a>
                            </div>
                          ) : sub.proof_type === "text" && sub.proof_text ? (
                            <div className="p-5 flex items-center justify-center h-full min-h-[80px]">
                              <p className="text-sm text-foreground/80 italic text-center line-clamp-3">&ldquo;{sub.proof_text}&rdquo;</p>
                            </div>
                          ) : (
                            <div className="p-5 flex items-center justify-center h-full min-h-[80px] text-muted-foreground/20">
                              <ImageLucide size={28} />
                            </div>
                          )}
                        </div>

                        {/* Details column */}
                        <div className="flex-1 p-4 flex flex-col gap-3">
                          {/* Top row: quest info + time */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="text-[10px] font-medium">
                                {questTitle}
                              </Badge>
                              {questType && (
                                <span className="text-[10px] text-muted-foreground">{QUEST_TYPE_LABELS[questType]}</span>
                              )}
                              {eventName && (
                                <span className="text-[10px] text-muted-foreground/60">{eventName}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Clock size={11} className="text-muted-foreground/50" />
                              <span className="text-[11px] text-muted-foreground tabular-nums">{timeAgo(sub.created_at)}</span>
                            </div>
                          </div>

                          {/* Rep info row */}
                          <div className="flex items-center gap-3">
                            {sub.rep?.photo_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={sub.rep.photo_url} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-border" />
                            ) : (
                              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary ring-2 ring-border">
                                {sub.rep?.first_name?.charAt(0) || "?"}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-foreground leading-tight">
                                {sub.rep?.display_name || `${sub.rep?.first_name || ""} ${sub.rep?.last_name || ""}`.trim() || "Unknown"}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-[9px] font-normal px-1.5 py-0">{proofLabel}</Badge>
                                <Badge variant={sub.status === "approved" ? "success" : sub.status === "rejected" ? "destructive" : "warning"} className="text-[9px] px-1.5 py-0">
                                  {sub.status}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          {isPending && (
                            <div className="mt-auto pt-1">
                              {rejectingId === sub.id ? (
                                <div className="space-y-2">
                                  <Textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Reason for rejection..."
                                    className="text-sm min-h-[50px]"
                                    autoFocus
                                  />
                                  <div className="flex items-center gap-2">
                                    <Button size="sm" variant="destructive" disabled={!rejectReason.trim() || reviewingId === sub.id}
                                      onClick={() => { handleReview(sub.id, "rejected", rejectReason.trim()); setRejectingId(null); setRejectReason(""); }}>
                                      {reviewingId === sub.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Reject
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(""); }}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Button size="sm" onClick={() => handleReview(sub.id, "approved")} disabled={reviewingId === sub.id}>
                                    {reviewingId === sub.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setRejectingId(sub.id)} disabled={reviewingId === sub.id}>
                                    <X size={14} /> Reject
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                          {sub.status === "approved" && (
                            <p className="text-xs text-success flex items-center gap-1.5"><CheckCircle2 size={12} /> Approved</p>
                          )}
                          {sub.status === "rejected" && (
                            <div>
                              <p className="text-xs text-destructive flex items-center gap-1.5"><X size={12} /> Rejected</p>
                              {sub.rejection_reason && <p className="text-[11px] text-muted-foreground mt-0.5">{sub.rejection_reason}</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}


      {/* Redesigned create/edit editor — self-contained dialog. */}
      <QuestEditor
        open={editorOpen}
        editId={editId}
        initialQuest={editingQuest}
        onClose={() => setEditorOpen(false)}
        onSaved={() => loadQuests()}
      />

      {/* ── Image Lightbox ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Proof" className="max-w-[90vw] max-h-[85vh] rounded-xl shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

    </div>
  );
}
