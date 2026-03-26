"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChevronLeft,
  ChevronDown,
  ClipboardCheck,
  Copy,
  CheckCircle2,
  Monitor,
  Smartphone,
  Loader2,
  Mail,
  Link2,
  ExternalLink,
  AlertCircle,
  Download,
  Users,
  ShoppingCart,
  Tag,
  Megaphone,
  ShoppingBag,
  ClipboardList,
  Send,
  Flame,
  Snowflake,
  RotateCcw,
  Search,
  CalendarDays,
  Check,
} from "lucide-react";

/* ── Types ── */
interface EventOption {
  id: string;
  name: string;
  date_start: string | null;
  status: string;
}

interface CampaignOption {
  id: string;
  title: string;
  url: string;
  active: boolean;
  default_price: number;
  currency: string;
  applied_count: number;
  capacity?: number;
}

type IncludeFilter = "popup_signups" | "abandoned_carts" | "interest_signups" | "all_customers";
type ExcludeFilter = "purchased" | "guest_list";

interface FilterDef {
  id: string;
  label: string;
  icon: typeof Users;
}

const INCLUDE_FILTERS: FilterDef[] = [
  { id: "popup_signups", label: "Popup signups for this event", icon: Tag },
  { id: "abandoned_carts", label: "Abandoned carts for this event", icon: ShoppingCart },
  { id: "interest_signups", label: "Announcement signups", icon: Megaphone },
  { id: "all_customers", label: "All customers (marketing consent)", icon: Users },
];

const EXCLUDE_FILTERS: FilterDef[] = [
  { id: "purchased", label: "Already purchased for this event", icon: ShoppingBag },
  { id: "guest_list", label: "Already on guest list", icon: ClipboardList },
];

interface Preset {
  id: string;
  label: string;
  description: string;
  icon: typeof Flame;
  include: IncludeFilter[];
  exclude: ExcludeFilter[];
}

const PRESETS: Preset[] = [
  {
    id: "warm_leads",
    label: "Warm leads",
    description: "Popup signups + abandoned carts, minus purchasers",
    icon: Flame,
    include: ["popup_signups", "abandoned_carts"],
    exclude: ["purchased"],
  },
  {
    id: "cold_audience",
    label: "Cold audience",
    description: "All customers who haven't bought for this event",
    icon: Snowflake,
    include: ["all_customers"],
    exclude: ["purchased"],
  },
  {
    id: "re_engage",
    label: "Re-engage",
    description: "Cart abandoners who never came back",
    icon: RotateCcw,
    include: ["abandoned_carts"],
    exclude: ["purchased"],
  },
];

/* ═══════════════════════════════════════════════════════════
   EMAIL PREVIEW
   ═══════════════════════════════════════════════════════════ */
function EmailPreview({ previewUrl, refreshKey }: { previewUrl: string | null; refreshKey: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(true);

  useEffect(() => { setLoading(true); }, [previewUrl, refreshKey]);

  if (!previewUrl) {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="py-16 text-center">
          <Mail size={28} className="mx-auto text-muted-foreground/20" />
          <p className="mt-3 text-sm text-muted-foreground">
            Select an event and campaign to preview the email
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="shrink-0 border-b border-border pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Mail size={15} className="text-primary" />
            Email Preview
          </CardTitle>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setPreviewMode("desktop")}
              className={`rounded-md px-2 py-1 transition-all ${
                previewMode === "desktop" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor size={13} />
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("mobile")}
              className={`rounded-md px-2 py-1 transition-all ${
                previewMode === "mobile" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone size={13} />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative flex-1 p-4" style={{ minHeight: "600px" }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Rendering preview...</span>
            </div>
          </div>
        )}
        <div
          className="mx-auto h-full overflow-hidden rounded-lg border border-border/50 bg-white transition-all duration-300"
          style={{ width: previewMode === "mobile" ? "375px" : "100%" }}
        >
          <iframe
            key={`${previewUrl}-${refreshKey}`}
            ref={iframeRef}
            src={previewUrl || undefined}
            title="Email Preview"
            className="h-full w-full border-0"
            sandbox="allow-same-origin"
            onLoad={() => setLoading(false)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   EVENT PICKER — searchable, grouped by upcoming/past
   ═══════════════════════════════════════════════════════════ */
function EventPicker({
  events,
  selectedId,
  onSelect,
}: {
  events: EventOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = events.find((e) => e.id === selectedId);
  const now = Date.now();

  // Filter + group
  const filtered = events.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );
  const upcoming = filtered.filter(
    (e) => e.date_start && new Date(e.date_start).getTime() > now
  );
  const past = filtered.filter(
    (e) => !e.date_start || new Date(e.date_start).getTime() <= now
  );

  function formatShortDate(d: string | null): string {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setTimeout(() => inputRef.current?.focus(), 50); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-2 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CalendarDays size={13} className="shrink-0 text-muted-foreground/50" />
            <span className="truncate">{selected?.name || "Select event..."}</span>
          </div>
          <ChevronDown size={14} className={`shrink-0 text-muted-foreground/50 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        style={{ maxHeight: "340px" }}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search size={13} className="shrink-0 text-muted-foreground/40" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          />
        </div>

        {/* Results */}
        <div className="overflow-y-auto" style={{ maxHeight: "280px" }}>
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">No events match your search.</p>
          )}

          {upcoming.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-[1.5px] text-primary/60">Upcoming</p>
              {upcoming.map((ev) => (
                <EventOption
                  key={ev.id}
                  event={ev}
                  isSelected={ev.id === selectedId}
                  dateLabel={formatShortDate(ev.date_start)}
                  onSelect={() => { onSelect(ev.id); setOpen(false); setSearch(""); }}
                />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-[1.5px] text-muted-foreground/40">
                Past
              </p>
              {past.map((ev) => (
                <EventOption
                  key={ev.id}
                  event={ev}
                  isSelected={ev.id === selectedId}
                  dateLabel={formatShortDate(ev.date_start)}
                  onSelect={() => { onSelect(ev.id); setOpen(false); setSearch(""); }}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EventOption({
  event,
  isSelected,
  dateLabel,
  onSelect,
}: {
  event: EventOption;
  isSelected: boolean;
  dateLabel: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
        isSelected ? "bg-primary/10" : "hover:bg-accent/40"
      }`}
    >
      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
        isSelected ? "border-primary bg-primary" : "border-transparent"
      }`}>
        {isSelected && <Check size={9} className="text-white" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13px] ${isSelected ? "font-medium text-foreground" : "text-foreground/80"}`}>
          {event.name}
        </p>
      </div>
      {dateLabel && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/40">{dateLabel}</span>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   GUEST LIST OUTREACH BUILDER
   ═══════════════════════════════════════════════════════════ */
export default function GuestListOutreachPage() {
  // Events + campaigns
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Audience filters
  const [includeFilters, setIncludeFilters] = useState<Set<IncludeFilter>>(new Set(["popup_signups"]));
  const [excludeFilters, setExcludeFilters] = useState<Set<ExcludeFilter>>(new Set(["purchased"]));
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>("warm_leads");
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});

  // Send + copy states
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [copyingHtml, setCopyingHtml] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);

  // Fetch events
  useEffect(() => {
    setLoadingEvents(true);
    fetch("/api/events")
      .then((r) => r.json())
      .then((json) => {
        const evts = (json.data || []) as EventOption[];
        const filtered = evts
          .filter((e) => e.status !== "draft")
          .sort((a, b) => {
            const da = a.date_start ? new Date(a.date_start).getTime() : 0;
            const db = b.date_start ? new Date(b.date_start).getTime() : 0;
            return db - da;
          });
        setEvents(filtered);
        if (filtered.length > 0) setSelectedEventId(filtered[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingEvents(false));
  }, []);

  // Fetch campaigns when event changes
  useEffect(() => {
    if (!selectedEventId) { setCampaigns([]); setSelectedCampaignId(""); return; }
    setLoadingCampaigns(true);
    fetch(`/api/guest-list/campaigns?event_id=${selectedEventId}`)
      .then((r) => r.json())
      .then((json) => {
        const camps = (json.campaigns || []) as CampaignOption[];
        const active = camps.filter((c) => c.active);
        setCampaigns(active);
        setSelectedCampaignId(active.length > 0 ? active[0].id : "");
      })
      .catch(() => { setCampaigns([]); setSelectedCampaignId(""); })
      .finally(() => setLoadingCampaigns(false));
  }, [selectedEventId]);

  // Update subject + refresh preview when event changes
  useEffect(() => {
    const ev = events.find((e) => e.id === selectedEventId);
    if (ev) {
      setSubjectLine(`Guest List — ${ev.name}`);
      setPreviewVersion((v) => v + 1);
      setSendResult(null);
    }
  }, [selectedEventId, events]);

  // Fetch individual filter counts when event changes
  useEffect(() => {
    if (!selectedEventId) return;
    const allFilters = [...INCLUDE_FILTERS, ...EXCLUDE_FILTERS];
    Promise.all(
      allFilters.map((f) =>
        fetch(`/api/campaigns/audience?include=${f.id}&event_id=${selectedEventId}`)
          .then((r) => r.json())
          .then((j) => ({ id: f.id, count: j.count ?? 0 }))
          .catch(() => ({ id: f.id, count: 0 }))
      )
    ).then((results) => {
      const counts: Record<string, number> = {};
      for (const r of results) counts[r.id] = r.count;
      setFilterCounts(counts);
    });
  }, [selectedEventId]);

  // Fetch combo audience count when filters change
  useEffect(() => {
    if (includeFilters.size === 0) { setAudienceCount(0); return; }
    setLoadingAudience(true);
    setAudienceCount(null);
    const params = new URLSearchParams({
      include: [...includeFilters].join(","),
      event_id: selectedEventId || "",
    });
    if (excludeFilters.size > 0) params.set("exclude", [...excludeFilters].join(","));

    fetch(`/api/campaigns/audience?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => setAudienceCount(j.count ?? 0))
      .catch(() => setAudienceCount(null))
      .finally(() => setLoadingAudience(false));
  }, [includeFilters, excludeFilters, selectedEventId]);

  // Toggle handlers
  const toggleInclude = useCallback((f: IncludeFilter) => {
    setActivePreset(null);
    setIncludeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  }, []);

  const toggleExclude = useCallback((f: ExcludeFilter) => {
    setActivePreset(null);
    setExcludeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    setActivePreset(preset.id);
    setIncludeFilters(new Set(preset.include));
    setExcludeFilters(new Set(preset.exclude));
  }, []);

  // Preview URL
  const previewUrl = useMemo(() => {
    if (!selectedEventId) return null;
    const params = new URLSearchParams();
    params.set("event_id", selectedEventId);
    if (selectedCampaignId) params.set("campaign_id", selectedCampaignId);
    if (subjectLine) params.set("subject", subjectLine);
    params.set("t", String(previewVersion));
    return `/api/campaigns/guest-list-outreach/preview?${params.toString()}`;
  }, [selectedEventId, selectedCampaignId, subjectLine, previewVersion]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  // Copy handlers
  const handleCopyHtml = useCallback(async () => {
    if (!previewUrl) return;
    setCopyingHtml(true);
    try {
      const html = await fetch(previewUrl).then((r) => r.text());
      await navigator.clipboard.writeText(html);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2500);
    } catch { /* clipboard may fail */ } finally { setCopyingHtml(false); }
  }, [previewUrl]);

  const handleCopyUrl = useCallback(async () => {
    if (!selectedCampaign?.url) return;
    await navigator.clipboard.writeText(selectedCampaign.url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  }, [selectedCampaign]);

  const handleCopySubject = useCallback(async () => {
    if (!subjectLine) return;
    await navigator.clipboard.writeText(subjectLine);
    setCopiedSubject(true);
    setTimeout(() => setCopiedSubject(false), 2500);
  }, [subjectLine]);

  const handleSendCampaign = useCallback(async () => {
    if (!audienceCount || !selectedEventId || sending) return;
    const confirmed = window.confirm(
      `Send this email to ${audienceCount.toLocaleString()} ${audienceCount === 1 ? "person" : "people"}?`
    );
    if (!confirmed) return;

    setSending(true);
    setSendResult(null);
    try {
      // Fetch the audience list
      const params = new URLSearchParams({
        include: [...includeFilters].join(","),
        event_id: selectedEventId,
      });
      if (excludeFilters.size > 0) params.set("exclude", [...excludeFilters].join(","));
      const audienceRes = await fetch(`/api/campaigns/audience?${params.toString()}`);
      const { audience } = await audienceRes.json();

      if (!audience || audience.length === 0) {
        setSendResult({ sent: 0, failed: 0 });
        return;
      }

      // Send via API
      const sendRes = await fetch("/api/campaigns/guest-list-outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEventId,
          campaign_id: selectedCampaignId || undefined,
          subject: subjectLine || undefined,
          recipients: audience,
        }),
      });
      const result = await sendRes.json();
      setSendResult({ sent: result.sent || 0, failed: result.failed || 0 });
      // Auto-clear success state after 5 seconds
      setTimeout(() => setSendResult(null), 5000);
    } catch {
      setSendResult({ sent: 0, failed: audienceCount });
      setTimeout(() => setSendResult(null), 5000);
    } finally {
      setSending(false);
    }
  }, [audienceCount, selectedEventId, selectedCampaignId, subjectLine, includeFilters, excludeFilters, sending]);

  const handleDownloadCsv = useCallback(async () => {
    setDownloadingCsv(true);
    try {
      const params = new URLSearchParams({
        include: [...includeFilters].join(","),
        event_id: selectedEventId || "",
        format: "csv",
      });
      if (excludeFilters.size > 0) params.set("exclude", [...excludeFilters].join(","));
      const res = await fetch(`/api/campaigns/audience?${params.toString()}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "campaign_audience.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* download failed */ } finally { setDownloadingCsv(false); }
  }, [includeFilters, excludeFilters, selectedEventId]);

  const refreshPreview = useCallback(() => setPreviewVersion((v) => v + 1), []);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/campaigns/email/"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors no-underline hover:text-foreground"
        >
          <ChevronLeft size={14} /> Email Campaigns
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardCheck size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="font-mono text-base font-semibold tracking-wider text-foreground uppercase">
              Guest List Outreach
            </h1>
            <p className="text-xs text-muted-foreground">Generate an email to drive guest list applications</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* ── LEFT PANEL ── */}
        <div className="xl:col-span-4 space-y-4">
          {/* Event — searchable picker */}
          <Card>
            <CardContent className="p-5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event</Label>
              {loadingEvents ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading events...</div>
              ) : events.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No events found.</p>
              ) : (
                <EventPicker
                  events={events}
                  selectedId={selectedEventId}
                  onSelect={setSelectedEventId}
                />
              )}
            </CardContent>
          </Card>

          {/* Campaign */}
          <Card>
            <CardContent className="p-5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guest List Campaign</Label>
              {loadingCampaigns ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading...</div>
              ) : campaigns.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-border p-4 text-center">
                  <AlertCircle size={20} className="mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No active campaigns for this event.</p>
                  <Link href="/admin/guest-list/" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                    Create one in Guest List <ExternalLink size={11} />
                  </Link>
                </div>
              ) : (
                <>
                  <select
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}{c.default_price > 0 ? ` (£${c.default_price})` : " (Free)"}</option>
                    ))}
                  </select>
                  {selectedCampaign && (
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{selectedCampaign.applied_count} applied{selectedCampaign.capacity ? ` / ${selectedCampaign.capacity} spots` : ""}</span>
                      {selectedCampaign.default_price > 0 && <Badge variant="secondary" className="text-[10px]">£{selectedCampaign.default_price}</Badge>}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ── AUDIENCE BUILDER ── */}
          <Card>
            <CardContent className="p-5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audience</Label>

              {/* Presets */}
              <div className="mt-3 space-y-1.5">
                {PRESETS.map((p) => {
                  const Icon = p.icon;
                  const isActive = activePreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                        isActive
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:border-primary/20 hover:bg-accent/30"
                      }`}
                    >
                      <Icon size={14} className={isActive ? "text-primary" : "text-muted-foreground/50"} />
                      <div className="min-w-0 flex-1">
                        <span className={`text-[12px] font-medium ${isActive ? "text-primary" : "text-foreground/80"}`}>
                          {p.label}
                        </span>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">{p.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Fine-tune toggle */}
              <details className="mt-3 group">
                <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors select-none">
                  Fine-tune filters
                </summary>
                <div className="mt-2 rounded-lg border border-border/50 bg-accent/10 p-3 space-y-3">

              {/* Include section */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-emerald-400/80 mb-2">Who to target</p>
                <div className="space-y-1">
                  {INCLUDE_FILTERS.map((f) => {
                    const Icon = f.icon;
                    const checked = includeFilters.has(f.id as IncludeFilter);
                    const count = filterCounts[f.id];
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleInclude(f.id as IncludeFilter)}
                        className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-all ${
                          checked
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-transparent hover:bg-accent/30"
                        }`}
                      >
                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
                          checked ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/30"
                        }`}>
                          {checked && <CheckCircle2 size={10} className="text-white" />}
                        </div>
                        <Icon size={13} className={checked ? "text-emerald-400" : "text-muted-foreground/50"} />
                        <span className={`flex-1 text-[12px] ${checked ? "text-foreground font-medium" : "text-foreground/70"}`}>
                          {f.label}
                        </span>
                        {count !== undefined && (
                          <span className="text-[10px] tabular-nums text-muted-foreground/50">{count.toLocaleString()}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Exclude section */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-red-400/80 mb-2">Who to skip</p>
                <div className="space-y-1">
                  {EXCLUDE_FILTERS.map((f) => {
                    const Icon = f.icon;
                    const checked = excludeFilters.has(f.id as ExcludeFilter);
                    const count = filterCounts[f.id];
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleExclude(f.id as ExcludeFilter)}
                        className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-all ${
                          checked
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-transparent hover:bg-accent/30"
                        }`}
                      >
                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
                          checked ? "border-red-500 bg-red-500" : "border-muted-foreground/30"
                        }`}>
                          {checked && <CheckCircle2 size={10} className="text-white" />}
                        </div>
                        <Icon size={13} className={checked ? "text-red-400" : "text-muted-foreground/50"} />
                        <span className={`flex-1 text-[12px] ${checked ? "text-foreground font-medium" : "text-foreground/70"}`}>
                          {f.label}
                        </span>
                        {count !== undefined && (
                          <span className="text-[10px] tabular-nums text-muted-foreground/50">{count.toLocaleString()}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

                </div>
              </details>

              {/* Result count + download */}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-accent/20 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <Users size={13} className="text-muted-foreground" />
                  {loadingAudience ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 size={11} className="animate-spin" /> Counting...
                    </span>
                  ) : audienceCount !== null ? (
                    <span className="text-xs font-medium text-foreground">
                      {audienceCount.toLocaleString()} {audienceCount === 1 ? "person" : "people"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Select filters above</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadCsv}
                  disabled={!audienceCount || downloadingCsv}
                  className="gap-1.5 text-xs h-7 px-2.5"
                >
                  {downloadingCsv ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                  Download CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Subject line */}
          <Card>
            <CardContent className="p-5">
              <Label htmlFor="subject" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subject Line</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  id="subject"
                  value={subjectLine}
                  onChange={(e) => setSubjectLine(e.target.value)}
                  onBlur={refreshPreview}
                  placeholder="Guest List — Event Name"
                  className="flex-1 text-sm"
                />
                <Button variant="outline" size="sm" onClick={handleCopySubject} className="shrink-0 gap-1.5 px-3">
                  {copiedSubject ? <CheckCircle2 size={13} className="text-success" /> : <Copy size={13} />}
                  <span className="text-xs">{copiedSubject ? "Copied" : "Copy"}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-2.5">
            <Button
              onClick={handleSendCampaign}
              disabled={!audienceCount || !selectedEventId || sending}
              className="w-full gap-2"
              size="lg"
            >
              {sending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : sendResult ? (
                <CheckCircle2 size={15} />
              ) : (
                <Send size={15} />
              )}
              {sending
                ? "Sending..."
                : sendResult
                  ? `Sent to ${sendResult.sent.toLocaleString()} ${sendResult.sent === 1 ? "person" : "people"}${sendResult.failed > 0 ? ` (${sendResult.failed} failed)` : ""}`
                  : audienceCount
                    ? `Send to ${audienceCount.toLocaleString()} ${audienceCount === 1 ? "person" : "people"}`
                    : "Select an audience above"}
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCopyHtml}
                disabled={!previewUrl || copyingHtml}
                className="flex-1 gap-1.5 text-xs"
                size="sm"
              >
                {copiedHtml ? <CheckCircle2 size={12} className="text-success" /> : <Copy size={12} />}
                {copiedHtml ? "Copied" : "Copy HTML"}
              </Button>
              <Button
                variant="outline"
                onClick={handleCopyUrl}
                disabled={!selectedCampaign?.url}
                className="flex-1 gap-1.5 text-xs"
                size="sm"
              >
                {copiedUrl ? <CheckCircle2 size={12} className="text-success" /> : <Link2 size={12} />}
                {copiedUrl ? "Copied" : "Copy URL"}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <Card className="border-dashed">
            <CardContent className="p-5">
              <p className="text-xs font-semibold text-muted-foreground mb-2">How to use</p>
              <ol className="space-y-1.5 text-xs text-muted-foreground/80 list-decimal list-inside">
                <li>Select your event and guest list campaign</li>
                <li>Build your audience with include/exclude filters</li>
                <li>Preview the email on the right</li>
                <li>Hit send — emails go out via your configured sender</li>
              </ol>
              <p className="mt-2 text-[10px] text-muted-foreground/40">
                Or use Copy HTML / Copy URL to paste into an external email tool.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="xl:col-span-8" style={{ minHeight: "700px" }}>
          <EmailPreview previewUrl={previewUrl} refreshKey={previewVersion} />
        </div>
      </div>
    </div>
  );
}
