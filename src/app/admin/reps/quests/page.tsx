"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Swords,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Eye,
  Check,
  X,
  Image as ImageIcon,
} from "lucide-react";
import type { RepQuest, QuestType, QuestStatus, RepQuestSubmission } from "@/types/reps";

const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  social_post: "Social Post",
  story_share: "Story Share",
  content_creation: "Content Creation",
  custom: "Custom",
};

const STATUS_VARIANT: Record<QuestStatus, "success" | "warning" | "secondary"> = {
  active: "success",
  paused: "warning",
  archived: "secondary",
};

export default function QuestsPage() {
  const [quests, setQuests] = useState<RepQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | QuestStatus>("active");

  // Create/Edit
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [questType, setQuestType] = useState<QuestType>("social_post");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pointsReward, setPointsReward] = useState("");
  const [maxCompletions, setMaxCompletions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notifyReps, setNotifyReps] = useState(true);

  // Submissions review
  const [showSubmissions, setShowSubmissions] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<RepQuestSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [saveError, setSaveError] = useState("");

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

  const loadSubmissions = useCallback(async (questId: string) => {
    setLoadingSubs(true);
    try {
      const res = await fetch(`/api/reps/quests/${questId}/submissions`);
      const json = await res.json();
      if (json.data) setSubmissions(json.data);
    } catch { /* network */ }
    setLoadingSubs(false);
  }, []);

  const openCreate = () => {
    setEditId(null);
    setTitle("");
    setDescription("");
    setInstructions("");
    setQuestType("social_post");
    setImageUrl("");
    setVideoUrl("");
    setPointsReward("50");
    setMaxCompletions("");
    setExpiresAt("");
    setNotifyReps(true);
    setShowDialog(true);
  };

  const openEdit = (q: RepQuest) => {
    setEditId(q.id);
    setTitle(q.title);
    setDescription(q.description || "");
    setInstructions(q.instructions || "");
    setQuestType(q.quest_type);
    setImageUrl(q.image_url || "");
    setVideoUrl(q.video_url || "");
    setPointsReward(String(q.points_reward));
    setMaxCompletions(q.max_completions != null ? String(q.max_completions) : "");
    setExpiresAt(q.expires_at ? q.expires_at.slice(0, 16) : "");
    setNotifyReps(q.notify_reps);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      instructions: instructions.trim() || null,
      quest_type: questType,
      image_url: imageUrl.trim() || null,
      video_url: videoUrl.trim() || null,
      points_reward: Number(pointsReward) || 0,
      max_completions: maxCompletions ? Number(maxCompletions) : null,
      expires_at: expiresAt || null,
      notify_reps: notifyReps,
    };
    setSaveError("");
    try {
      const url = editId ? `/api/reps/quests/${editId}` : "/api/reps/quests";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        setShowDialog(false);
        setSaveError("");
        loadQuests();
      } else {
        const json = await res.json().catch(() => ({ error: "Unknown error" }));
        setSaveError(json.error || `Failed (${res.status})`);
      }
    } catch { setSaveError("Network error — check connection"); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/reps/quests/${id}`, { method: "DELETE" });
      loadQuests();
    } catch { /* network */ }
  };

  const handleReview = async (submissionId: string, status: "approved" | "rejected", reason?: string) => {
    setReviewingId(submissionId);
    setReviewError("");
    try {
      const res = await fetch(`/api/reps/quests/submissions/${submissionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejection_reason: reason }),
      });
      if (res.ok) {
        setRejectingId(null);
        setRejectReason("");
        if (showSubmissions) loadSubmissions(showSubmissions);
      } else {
        const json = await res.json().catch(() => ({ error: "Unknown error" }));
        setReviewError(json.error || `Failed (${res.status})`);
      }
    } catch { setReviewError("Network error"); }
    setReviewingId(null);
  };

  const filtered = filter === "all" ? quests : quests.filter((q) => q.status === filter);
  const counts = {
    all: quests.length,
    active: quests.filter((q) => q.status === "active").length,
    paused: quests.filter((q) => q.status === "paused").length,
    archived: quests.filter((q) => q.status === "archived").length,
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">Quests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create tasks for your reps to complete and earn bonus points
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} /> Create Quest
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
        {(["active", "paused", "archived", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground/60">{counts[t]}</span>
          </button>
        ))}
      </div>

      {/* Quests List */}
      {loading ? (
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
            <p className="mt-4 text-sm font-medium text-foreground">No quests yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create quests to engage your reps</p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus size={14} /> Create Quest
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 gap-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quest</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Points</TableHead>
                <TableHead className="hidden md:table-cell">Completions</TableHead>
                <TableHead className="hidden lg:table-cell">Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((quest) => (
                <TableRow key={quest.id}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-foreground">{quest.title}</p>
                      {quest.description && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-[250px]">{quest.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">{QUEST_TYPE_LABELS[quest.quest_type]}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-primary font-bold tabular-nums">
                    +{quest.points_reward}
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs tabular-nums text-muted-foreground">
                    {quest.total_completed}{quest.max_total != null ? ` / ${quest.max_total}` : ""}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {quest.expires_at
                      ? new Date(quest.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[quest.status]}>{quest.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => {
                          setShowSubmissions(quest.id);
                          loadSubmissions(quest.id);
                        }}
                        title="View submissions"
                      >
                        <Eye size={13} />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(quest)} title="Edit">
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(quest.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Archive"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Quest" : "Create Quest"}</DialogTitle>
            <DialogDescription>
              {editId ? "Update this quest." : "Create a new quest for your reps to complete."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Share on Instagram Stories" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should reps do?" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Step-by-step instructions..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={questType} onValueChange={(v) => setQuestType(v as QuestType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="social_post">Social Post</SelectItem>
                    <SelectItem value="story_share">Story Share</SelectItem>
                    <SelectItem value="content_creation">Content Creation</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Points Reward</Label>
                <Input type="number" value={pointsReward} onChange={(e) => setPointsReward(e.target.value)} min="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Reference Image URL</Label>
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Show them what to create" />
              </div>
              <div className="space-y-2">
                <Label>Reference Video URL</Label>
                <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="TikTok / YouTube link" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Completions per Rep</Label>
                <Input type="number" value={maxCompletions} onChange={(e) => setMaxCompletions(e.target.value)} placeholder="Unlimited" min="1" />
              </div>
              <div className="space-y-2">
                <Label>Expires At</Label>
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Notify Reps</p>
                <p className="text-[11px] text-muted-foreground">Send email notification to all assigned reps</p>
              </div>
              <Switch checked={notifyReps} onCheckedChange={setNotifyReps} />
            </div>
          </div>
          {saveError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
              {saveError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Saving..." : editId ? "Save Changes" : "Create Quest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submissions Review Dialog */}
      <Dialog open={!!showSubmissions} onOpenChange={(open) => !open && setShowSubmissions(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quest Submissions</DialogTitle>
            <DialogDescription>Review proof submitted by reps.</DialogDescription>
          </DialogHeader>
          {loadingSubs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-primary/60" />
            </div>
          ) : submissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No submissions yet</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-3">
              {submissions.map((sub) => (
                <div key={sub.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {sub.rep?.display_name || `${sub.rep?.first_name || ""} ${sub.rep?.last_name || ""}`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(sub.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Badge variant={sub.status === "approved" ? "success" : sub.status === "rejected" ? "destructive" : "warning"}>
                      {sub.status}
                    </Badge>
                  </div>
                  {/* Proof */}
                  <div className="rounded-md bg-muted/30 p-3 mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Proof ({sub.proof_type})</p>
                    {sub.proof_type === "screenshot" && sub.proof_url && (
                      <img src={sub.proof_url} alt="Proof" className="max-h-40 rounded-md" />
                    )}
                    {sub.proof_type === "url" && sub.proof_text && (
                      <a href={sub.proof_text} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                        {sub.proof_text}
                      </a>
                    )}
                    {sub.proof_type === "text" && sub.proof_text && (
                      <p className="text-sm text-foreground">{sub.proof_text}</p>
                    )}
                  </div>
                  {/* Actions */}
                  {sub.status === "pending" && (
                    <div className="space-y-2">
                      {rejectingId === sub.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejection..."
                            rows={2}
                            className="text-xs"
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!rejectReason.trim() || reviewingId === sub.id}
                              onClick={() => handleReview(sub.id, "rejected", rejectReason.trim())}
                            >
                              {reviewingId === sub.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                              Confirm Reject
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleReview(sub.id, "approved")}
                            disabled={reviewingId === sub.id}
                          >
                            {reviewingId === sub.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setRejectingId(sub.id); setRejectReason(""); }}
                            disabled={reviewingId === sub.id}
                          >
                            <X size={12} />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {sub.rejection_reason && (
                    <p className="mt-2 text-xs text-destructive">Reason: {sub.rejection_reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {reviewError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
              {reviewError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSubmissions(null); setReviewError(""); setRejectingId(null); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
