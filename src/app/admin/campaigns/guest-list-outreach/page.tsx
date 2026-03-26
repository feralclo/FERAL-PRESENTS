"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useOrgId } from "@/components/OrgProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
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

/* ═══════════════════════════════════════════════════════════
   EMAIL PREVIEW — live rendered iframe
   ═══════════════════════════════════════════════════════════ */
function EmailPreview({
  previewUrl,
}: {
  previewUrl: string | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
  }, [previewUrl]);

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
                previewMode === "desktop"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor size={13} />
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("mobile")}
              className={`rounded-md px-2 py-1 transition-all ${
                previewMode === "mobile"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
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
            ref={iframeRef}
            src={previewUrl}
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
   GUEST LIST OUTREACH BUILDER
   ═══════════════════════════════════════════════════════════ */
export default function GuestListOutreachPage() {
  const orgId = useOrgId();

  // State
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Copy states
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [copyingHtml, setCopyingHtml] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);

  // Fetch events on mount
  useEffect(() => {
    setLoadingEvents(true);
    fetch("/api/events")
      .then((r) => r.json())
      .then((json) => {
        const evts = (json.events || json.data || []) as EventOption[];
        // Filter to published/active events, sort by date descending
        const filtered = evts
          .filter((e) => ["published", "active"].includes(e.status))
          .sort((a, b) => {
            const da = a.date_start ? new Date(a.date_start).getTime() : 0;
            const db = b.date_start ? new Date(b.date_start).getTime() : 0;
            return db - da;
          });
        setEvents(filtered);
        if (filtered.length > 0) {
          setSelectedEventId(filtered[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEvents(false));
  }, []);

  // Fetch campaigns when event changes
  useEffect(() => {
    if (!selectedEventId) {
      setCampaigns([]);
      setSelectedCampaignId("");
      return;
    }
    setLoadingCampaigns(true);
    fetch(`/api/guest-list/campaigns?event_id=${selectedEventId}`)
      .then((r) => r.json())
      .then((json) => {
        const camps = (json.campaigns || []) as CampaignOption[];
        const activeCamps = camps.filter((c) => c.active);
        setCampaigns(activeCamps);
        if (activeCamps.length > 0) {
          setSelectedCampaignId(activeCamps[0].id);
        } else {
          setSelectedCampaignId("");
        }
      })
      .catch(() => {
        setCampaigns([]);
        setSelectedCampaignId("");
      })
      .finally(() => setLoadingCampaigns(false));
  }, [selectedEventId]);

  // Update subject line when event changes
  useEffect(() => {
    const event = events.find((e) => e.id === selectedEventId);
    if (event) {
      setSubjectLine(`Guest List — ${event.name}`);
    }
  }, [selectedEventId, events]);

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

  // Selected campaign data
  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  // Copy handlers
  const handleCopyHtml = useCallback(async () => {
    if (!previewUrl) return;
    setCopyingHtml(true);
    try {
      const res = await fetch(previewUrl);
      const html = await res.text();
      await navigator.clipboard.writeText(html);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2500);
    } catch {
      // Clipboard API may fail in some contexts
    } finally {
      setCopyingHtml(false);
    }
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

  const refreshPreview = useCallback(() => {
    setPreviewVersion((v) => v + 1);
  }, []);

  return (
    <div>
      {/* Breadcrumb + Header */}
      <div className="mb-6">
        <Link
          href="/admin/campaigns/"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors no-underline hover:text-foreground"
        >
          <ChevronLeft size={14} />
          Campaigns
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardCheck size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="font-mono text-base font-semibold tracking-wider text-foreground uppercase">
              Guest List Outreach
            </h1>
            <p className="text-xs text-muted-foreground">
              Generate an email to drive guest list applications
            </p>
          </div>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* ── LEFT PANEL: Config ── */}
        <div className="xl:col-span-4 space-y-4">
          {/* Event selector */}
          <Card>
            <CardContent className="p-5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Event
              </Label>
              {loadingEvents ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" /> Loading events...
                </div>
              ) : events.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No published events found.
                </p>
              ) : (
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              )}
            </CardContent>
          </Card>

          {/* Campaign selector */}
          <Card>
            <CardContent className="p-5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Guest List Campaign
              </Label>
              {loadingCampaigns ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" /> Loading campaigns...
                </div>
              ) : campaigns.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-border p-4 text-center">
                  <AlertCircle size={20} className="mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No active guest list campaigns for this event.
                  </p>
                  <Link
                    href="/admin/guest-list/"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    Create one in Guest List
                    <ExternalLink size={11} />
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
                      <option key={c.id} value={c.id}>
                        {c.title}
                        {c.default_price > 0 ? ` (£${c.default_price})` : " (Free)"}
                      </option>
                    ))}
                  </select>
                  {selectedCampaign && (
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {selectedCampaign.applied_count} applied
                        {selectedCampaign.capacity
                          ? ` / ${selectedCampaign.capacity} spots`
                          : ""}
                      </span>
                      {selectedCampaign.default_price > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          £{selectedCampaign.default_price}
                        </Badge>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Subject line */}
          <Card>
            <CardContent className="p-5">
              <Label
                htmlFor="subject"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Subject Line
              </Label>
              <div className="mt-2 flex gap-2">
                <Input
                  id="subject"
                  value={subjectLine}
                  onChange={(e) => setSubjectLine(e.target.value)}
                  onBlur={refreshPreview}
                  placeholder="Guest List — Event Name"
                  className="flex-1 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopySubject}
                  className="shrink-0 gap-1.5 px-3"
                >
                  {copiedSubject ? (
                    <CheckCircle2 size={13} className="text-success" />
                  ) : (
                    <Copy size={13} />
                  )}
                  <span className="text-xs">
                    {copiedSubject ? "Copied" : "Copy"}
                  </span>
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground/60">
                Used as the email subject when pasting into your email tool.
              </p>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="space-y-2.5">
            <Button
              onClick={handleCopyHtml}
              disabled={!previewUrl || copyingHtml}
              className="w-full gap-2"
              size="lg"
            >
              {copyingHtml ? (
                <Loader2 size={15} className="animate-spin" />
              ) : copiedHtml ? (
                <CheckCircle2 size={15} />
              ) : (
                <Copy size={15} />
              )}
              {copiedHtml ? "Email HTML Copied" : "Copy Email HTML"}
            </Button>

            <Button
              variant="outline"
              onClick={handleCopyUrl}
              disabled={!selectedCampaign?.url}
              className="w-full gap-2"
              size="lg"
            >
              {copiedUrl ? (
                <CheckCircle2 size={15} className="text-success" />
              ) : (
                <Link2 size={15} />
              )}
              {copiedUrl ? "Campaign URL Copied" : "Copy Campaign URL"}
            </Button>
          </div>

          {/* Usage instructions */}
          <Card className="border-dashed">
            <CardContent className="p-5">
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                How to use
              </p>
              <ol className="space-y-1.5 text-xs text-muted-foreground/80 list-decimal list-inside">
                <li>Select your event and guest list campaign above</li>
                <li>Copy the subject line for your email</li>
                <li>Copy the email HTML</li>
                <li>Paste both into your email tool (ActiveCampaign, Mailchimp, etc.)</li>
                <li>Send to your chosen audience segment</li>
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT PANEL: Preview ── */}
        <div className="xl:col-span-8" style={{ minHeight: "700px" }}>
          <EmailPreview previewUrl={previewUrl} />
        </div>
      </div>
    </div>
  );
}
