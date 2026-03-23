"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Plus,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  Link2,
  Shield,
  XCircle,
  CheckCircle2,
  Pencil,
  X,
} from "lucide-react";
import type { SubmissionLinkWithUsage, SubmissionLinkQuotas } from "@/types/guest-list";
import type { GuestListEntry, AccessLevel } from "@/types/orders";

const ACCESS_LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "guest_list", label: "Guest List" },
  { value: "vip", label: "VIP" },
  { value: "backstage", label: "Backstage" },
  { value: "aaa", label: "AAA" },
  { value: "artist", label: "Artist" },
];

interface ArtistLinksTabProps {
  selectedEventId: string;
  orgId: string;
}

export function ArtistLinksTab({ selectedEventId, orgId }: ArtistLinksTabProps) {
  const [links, setLinks] = useState<SubmissionLinkWithUsage[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createQuotas, setCreateQuotas] = useState<SubmissionLinkQuotas>({});
  const [creating, setCreating] = useState(false);

  // Expand / edit
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<GuestListEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [editQuotas, setEditQuotas] = useState<SubmissionLinkQuotas>({});

  // Actions
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/guest-list/submission-link?event_id=${selectedEventId}`);
      if (res.ok) {
        const json = await res.json();
        setLinks(json.links || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [selectedEventId]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  // Load entries for expanded link
  const loadEntries = useCallback(async (token: string) => {
    setLoadingEntries(true);
    try {
      const res = await fetch(`/api/guest-list/${selectedEventId}`);
      if (res.ok) {
        const json = await res.json();
        const all = (json.data || []) as GuestListEntry[];
        setExpandedEntries(all.filter((e) => e.submission_token === token));
      }
    } catch { /* silent */ }
    setLoadingEntries(false);
  }, [selectedEventId]);

  const handleExpand = (token: string) => {
    if (expandedToken === token) {
      setExpandedToken(null);
      setExpandedEntries([]);
    } else {
      setExpandedToken(token);
      loadEntries(token);
    }
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      // Clean quotas — remove empty/zero values
      const cleanQuotas: SubmissionLinkQuotas = {};
      for (const [key, val] of Object.entries(createQuotas)) {
        if (val !== undefined && val !== null && val > 0) {
          cleanQuotas[key as keyof SubmissionLinkQuotas] = val;
        }
      }

      await fetch("/api/guest-list/submission-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEventId,
          artist_name: createName.trim(),
          artist_email: createEmail.trim() || undefined,
          quotas: Object.keys(cleanQuotas).length > 0 ? cleanQuotas : undefined,
        }),
      });
      setCreateName("");
      setCreateEmail("");
      setCreateQuotas({});
      setShowCreate(false);
      loadLinks();
    } catch { /* silent */ }
    setCreating(false);
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleDeactivate = async (token: string, active: boolean) => {
    await fetch("/api/guest-list/submission-link", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, active }),
    });
    loadLinks();
  };

  const handleSaveQuotas = async (token: string) => {
    const cleanQuotas: SubmissionLinkQuotas = {};
    for (const [key, val] of Object.entries(editQuotas)) {
      if (val !== undefined && val !== null && val > 0) {
        cleanQuotas[key as keyof SubmissionLinkQuotas] = val;
      }
    }

    await fetch("/api/guest-list/submission-link", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        quotas: Object.keys(cleanQuotas).length > 0 ? cleanQuotas : null,
      }),
    });
    setEditingToken(null);
    loadLinks();
  };

  const handleApproveEntry = async (guestId: string) => {
    setApprovingIds((prev) => new Set(prev).add(guestId));
    try {
      await fetch("/api/guest-list/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_ids: [guestId] }),
      });
      if (expandedToken) loadEntries(expandedToken);
      loadLinks();
    } catch { /* silent */ }
    setApprovingIds((prev) => { const s = new Set(prev); s.delete(guestId); return s; });
  };

  const handleBulkApprove = async (token: string) => {
    const ids = expandedEntries.filter((e) => (e.status === "pending" || e.status === "accepted") && e.email).map((e) => e.id);
    if (ids.length === 0) return;
    setApprovingIds((prev) => { const s = new Set(prev); ids.forEach((id) => s.add(id)); return s; });
    try {
      await fetch("/api/guest-list/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_ids: ids }),
      });
      loadEntries(token);
      loadLinks();
    } catch { /* silent */ }
    setApprovingIds(new Set());
  };

  // Quota input row
  const QuotaInputs = ({ quotas, onChange }: { quotas: SubmissionLinkQuotas; onChange: (q: SubmissionLinkQuotas) => void }) => (
    <div className="grid grid-cols-5 gap-2">
      {ACCESS_LEVELS.map((level) => (
        <div key={level.value} className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">{level.label}</Label>
          <Input
            type="number"
            min="0"
            placeholder="—"
            value={quotas[level.value as keyof SubmissionLinkQuotas] ?? ""}
            onChange={(e) => {
              const val = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
              onChange({ ...quotas, [level.value]: val });
            }}
            className="h-8 text-xs"
          />
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <Card className="py-0 gap-0">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-primary/60" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {links.length === 0 ? "No submission links yet" : `${links.filter((l) => l.active).length} active link${links.filter((l) => l.active).length !== 1 ? "s" : ""}`}
        </p>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? <X size={14} /> : <Plus size={14} />}
          {showCreate ? "Cancel" : "New Submission Link"}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="py-0 gap-0 border-primary/20">
          <CardHeader className="pb-0 pt-5 px-6">
            <CardTitle className="text-sm">New Submission Link</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Generate a link for an artist to submit their guest list</p>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Artist / DJ Name *</Label>
                <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. DJ Shadow" />
              </div>
              <div className="space-y-2">
                <Label>Email <span className="text-muted-foreground/50 font-normal">(sends link directly)</span></Label>
                <Input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="artist@email.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quotas per access level <span className="text-muted-foreground/50">(leave empty for unlimited)</span></Label>
              <QuotaInputs quotas={createQuotas} onChange={setCreateQuotas} />
            </div>
            <Button size="sm" onClick={handleCreate} disabled={creating || !createName.trim()}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              Generate Link
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Links list */}
      {links.length === 0 && !showCreate ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
              <Link2 size={20} className="text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No submission links</p>
            <p className="mt-1 text-xs text-muted-foreground">Create a link for artists to submit their guest list</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Submission Link
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const isExpanded = expandedToken === link.token;
            const isEditing = editingToken === link.token;
            const totalQuota = link.quotas
              ? Object.values(link.quotas).reduce((sum, v) => sum + (v || 0), 0)
              : null;
            const progressPercent = totalQuota && totalQuota > 0
              ? Math.min(100, (link.submission_count / totalQuota) * 100)
              : null;

            const pendingCount = isExpanded
              ? expandedEntries.filter((e) => e.status === "pending" || e.status === "accepted").length
              : 0;

            return (
              <Card key={link.token} className={`py-0 gap-0 ${!link.active ? "opacity-50" : ""}`}>
                <CardContent className="p-4">
                  {/* Link header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{link.artist_name}</p>
                        {!link.active && <Badge variant="outline" className="text-[10px]">Deactivated</Badge>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Created {new Date(link.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {link.quotas && Object.keys(link.quotas).length > 0 && (
                          <span className="ml-2">
                            {Object.entries(link.quotas).map(([level, quota]) => {
                              const used = link.quota_usage[level as AccessLevel] || 0;
                              const label = level === "guest_list" ? "GL" : level === "backstage" ? "BS" : level.toUpperCase();
                              return `${label}: ${used}/${quota}`;
                            }).join(", ")}
                          </span>
                        )}
                      </p>

                      {/* Progress bar */}
                      {progressPercent !== null && (
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={progressPercent} className="h-1.5 flex-1" />
                          <span className="text-[10px] font-mono text-muted-foreground">{link.submission_count}/{totalQuota}</span>
                        </div>
                      )}
                      {!totalQuota && link.submission_count > 0 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">{link.submission_count} submitted</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon-xs" onClick={() => handleCopy(link.url)} title="Copy link">
                        {copiedUrl === link.url ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                      </Button>
                      {link.active && (
                        <Button variant="ghost" size="icon-xs" onClick={() => {
                          if (isEditing) { setEditingToken(null); } else { setEditingToken(link.token); setEditQuotas(link.quotas || {}); }
                        }} title="Edit quotas" className="text-muted-foreground hover:text-primary">
                          {isEditing ? <X size={13} /> : <Pencil size={13} />}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-xs"
                        onClick={() => handleDeactivate(link.token, !link.active)}
                        title={link.active ? "Deactivate" : "Reactivate"}
                        className={link.active ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-success"}>
                        {link.active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                      </Button>
                    </div>
                  </div>

                  {/* Inline edit quotas */}
                  {isEditing && (
                    <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
                      <Label className="text-xs text-muted-foreground">Quotas <span className="text-muted-foreground/50">(empty = unlimited)</span></Label>
                      <QuotaInputs quotas={editQuotas} onChange={setEditQuotas} />
                      <div className="flex gap-2">
                        <Button size="xs" onClick={() => handleSaveQuotas(link.token)}>Save</Button>
                        <Button size="xs" variant="ghost" onClick={() => setEditingToken(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {/* Expand toggle */}
                  {link.submission_count > 0 && (
                    <button
                      type="button"
                      onClick={() => handleExpand(link.token)}
                      className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isExpanded ? "Hide" : "View"} submissions ({link.submission_count})
                    </button>
                  )}

                  {/* Expanded submissions */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      {loadingEntries ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 size={16} className="animate-spin text-primary/60" />
                        </div>
                      ) : expandedEntries.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No submissions found</p>
                      ) : (
                        <div className="space-y-2">
                          {/* Bulk approve */}
                          {pendingCount > 0 && (
                            <Button size="xs" variant="outline" onClick={() => handleBulkApprove(link.token)} className="mb-2">
                              <Shield size={12} /> Approve all pending ({pendingCount})
                            </Button>
                          )}

                          {expandedEntries.map((entry) => {
                            const isPending = entry.status === "pending" || entry.status === "accepted";
                            return (
                              <div key={entry.id} className="flex items-center gap-3 rounded-lg bg-card/30 border border-border/30 px-3 py-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{entry.name}</span>
                                    <Badge variant="outline" className="text-[9px] py-0">
                                      {entry.access_level === "aaa" ? "AAA" : (ACCESS_LEVELS.find((l) => l.value === entry.access_level)?.label || entry.access_level)}
                                    </Badge>
                                  </div>
                                  {entry.email && <p className="text-[11px] text-muted-foreground">{entry.email}</p>}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {entry.status === "approved" && (
                                    <Badge variant="success" className="text-[10px] gap-1"><CheckCircle2 size={10} />Approved</Badge>
                                  )}
                                  {isPending && entry.email && (
                                    <Button size="xs" variant="outline" onClick={() => handleApproveEntry(entry.id)}
                                      disabled={approvingIds.has(entry.id)} className="text-[10px] h-6">
                                      {approvingIds.has(entry.id) ? <Loader2 size={10} className="animate-spin" /> : <Shield size={10} />}
                                      Approve
                                    </Button>
                                  )}
                                  {isPending && !entry.email && (
                                    <Badge variant="secondary" className="text-[10px]">No email</Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
