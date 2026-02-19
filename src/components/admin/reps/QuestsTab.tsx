"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Plus,
  Loader2,
  Check,
  X,
  Eye,
  Swords,
  Pencil,
  Trash2,
  FileText,
  ImageIcon,
  Settings2,
  Upload,
  CheckCircle2,
} from "lucide-react";
import dynamic from "next/dynamic";
import * as tus from "tus-js-client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY, ORG_ID } from "@/lib/constants";
import { isMuxPlaybackId } from "@/lib/mux";
import { ImageUpload } from "@/components/admin/ImageUpload";

const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), { ssr: false });
import type {
  RepQuest,
  QuestType,
  QuestStatus,
  RepQuestSubmission,
} from "@/types/reps";

const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  social_post: "Social Post",
  story_share: "Story Share",
  content_creation: "Content Creation",
  custom: "Custom",
};

const QUEST_STATUS_VARIANT: Record<QuestStatus, "success" | "warning" | "secondary" | "outline"> = {
  active: "success",
  paused: "warning",
  archived: "secondary",
  draft: "outline",
};

export function QuestsTab() {
  const [quests, setQuests] = useState<RepQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | QuestStatus>("active");

  // Create/Edit
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questType, setQuestType] = useState<QuestType>("social_post");
  const [platform, setPlatform] = useState<"tiktok" | "instagram" | "any">("any");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pointsReward, setPointsReward] = useState("");
  const [maxCompletions, setMaxCompletions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [notifyReps, setNotifyReps] = useState(true);

  // Video upload state
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoStatus, setVideoStatus] = useState("");
  const [videoError, setVideoError] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [videoDragging, setVideoDragging] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Submissions review
  const [showSubmissions, setShowSubmissions] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<RepQuestSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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

  // ── Video upload handlers ──

  /** Poll Mux status every 3s until asset is ready */
  const pollMuxStatus = useCallback(async (assetId: string): Promise<string> => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/mux/status?assetId=${assetId}`);
      const data = await res.json();
      if (data.status === "ready" && data.playbackId) return data.playbackId;
      if (data.status === "errored") throw new Error("Mux processing failed");
      setVideoStatus("Processing video...");
    }
    throw new Error("Processing timed out");
  }, []);

  const handleVideoUpload = useCallback(async (file: File) => {
    setVideoError("");
    if (!file.type.startsWith("video/")) {
      setVideoError("Please upload a video file (MP4, MOV, or WebM).");
      return;
    }
    const MAX_SIZE = 200 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setVideoError(`Video is ${Math.round(file.size / 1024 / 1024)}MB — max is 200MB.`);
      return;
    }
    setVideoUploading(true);
    setVideoProgress(0);
    setVideoStatus("Preparing upload...");
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase not configured");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
      const storagePath = `${ORG_ID}/quests/${Date.now()}_${safeName}`;
      const tusEndpoint = `${SUPABASE_URL}/storage/v1/upload/resumable`;

      setVideoStatus("Uploading...");
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: tusEndpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_ANON_KEY,
            "x-upsert": "true",
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          chunkSize: 6 * 1024 * 1024,
          metadata: {
            bucketName: "artist-media",
            objectName: storagePath,
            contentType: file.type,
            cacheControl: "3600",
          },
          onError: (error) => reject(new Error(error.message || "Upload failed")),
          onProgress: (bytesUploaded, bytesTotal) => {
            const pct = Math.round((bytesUploaded / bytesTotal) * 70);
            setVideoProgress(pct);
            const mbUp = (bytesUploaded / 1024 / 1024).toFixed(0);
            const mbTotal = (bytesTotal / 1024 / 1024).toFixed(0);
            setVideoStatus(`Uploading... ${mbUp}/${mbTotal} MB`);
          },
          onSuccess: () => resolve(),
          onShouldRetry: (err) => {
            const status = err.originalResponse?.getStatus();
            if (status === 403 || status === 401) return false;
            return true;
          },
        });
        upload.findPreviousUploads().then((prev) => {
          if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
          upload.start();
        });
      });

      setVideoProgress(70);
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/artist-media/${storagePath}`;

      setVideoStatus("Processing video...");
      const muxRes = await fetch("/api/mux/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: publicUrl }),
      });
      const muxData = await muxRes.json();
      if (!muxRes.ok) throw new Error(muxData.error || "Failed to start processing");

      const playbackId = await pollMuxStatus(muxData.assetId);
      setVideoUrl(playbackId);
      setPreviewError(false);
      setVideoProgress(100);
      setVideoStatus("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setVideoError(`Upload failed — ${msg}`);
      setVideoStatus("");
    }
    setVideoUploading(false);
    setVideoProgress(0);
  }, [pollMuxStatus]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setVideoDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setVideoDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleVideoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current = 0;
    setVideoDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("video/")) handleVideoUpload(file);
  }, [handleVideoUpload]);

  const handleVideoFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleVideoUpload(file);
    e.target.value = "";
  }, [handleVideoUpload]);

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
    setEditId(null); setTitle(""); setDescription(""); setInstructions("");
    setQuestType("social_post"); setPlatform("any"); setImageUrl(""); setVideoUrl("");
    setPointsReward("50"); setMaxCompletions(""); setExpiresAt(""); setNotifyReps(true);
    setVideoError(""); setPreviewError(false);
    setShowDialog(true);
  };

  const openEdit = (q: RepQuest) => {
    setEditId(q.id); setTitle(q.title); setDescription(q.description || "");
    setInstructions(q.instructions || ""); setQuestType(q.quest_type);
    setPlatform(q.platform || "any");
    setImageUrl(q.image_url || ""); setVideoUrl(q.video_url || "");
    setPointsReward(String(q.points_reward));
    setMaxCompletions(q.max_completions != null ? String(q.max_completions) : "");
    setExpiresAt(q.expires_at ? q.expires_at.slice(0, 16) : ""); setNotifyReps(q.notify_reps);
    setVideoError(""); setPreviewError(false);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const body = {
      title: title.trim(), description: description.trim() || null,
      instructions: instructions.trim() || null, quest_type: questType, platform,
      image_url: imageUrl.trim() || null, video_url: videoUrl.trim() || null,
      points_reward: Number(pointsReward) || 0,
      max_completions: maxCompletions ? Number(maxCompletions) : null,
      expires_at: expiresAt || null, notify_reps: notifyReps,
    };
    try {
      const url = editId ? `/api/reps/quests/${editId}` : "/api/reps/quests";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setShowDialog(false); loadQuests(); }
    } catch { /* network */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try { await fetch(`/api/reps/quests/${id}`, { method: "DELETE" }); loadQuests(); } catch { /* network */ }
  };

  const handleReview = async (submissionId: string, status: "approved" | "rejected", reason?: string) => {
    setReviewingId(submissionId);
    try {
      await fetch(`/api/reps/quests/submissions/${submissionId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejection_reason: reason }),
      });
      if (showSubmissions) loadSubmissions(showSubmissions);
    } catch { /* network */ }
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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
          {(["active", "paused", "archived", "all"] as const).map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground/60">{counts[t]}</span>
            </button>
          ))}
        </div>
        <Button size="sm" onClick={openCreate}><Plus size={14} /> Create Quest</Button>
      </div>

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
            <Button size="sm" className="mt-4" onClick={openCreate}><Plus size={14} /> Create Quest</Button>
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
                      {quest.description && <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-[250px]">{quest.description}</p>}
                    </div>
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
                      <Button variant="ghost" size="icon-xs" onClick={() => { setShowSubmissions(quest.id); loadSubmissions(quest.id); }} title="View submissions"><Eye size={13} /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(quest)} title="Edit"><Pencil size={13} /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(quest.id)} className="text-muted-foreground hover:text-destructive" title="Archive"><Trash2 size={13} /></Button>
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
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Quest" : "Create Quest"}</DialogTitle>
            <DialogDescription>{editId ? "Update this quest." : "Create a new quest for your reps."}</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="content" className="w-full min-h-0 flex-1 flex flex-col [&>[role=tabpanel]]:flex-1 [&>[role=tabpanel]]:overflow-y-auto">
            <TabsList className="w-full">
              <TabsTrigger value="content"><FileText size={14} /> Content</TabsTrigger>
              <TabsTrigger value="media"><ImageIcon size={14} /> Media</TabsTrigger>
              <TabsTrigger value="settings"><Settings2 size={14} /> Settings</TabsTrigger>
            </TabsList>

            {/* ── Content Tab ── */}
            <TabsContent value="content" className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Share on Instagram Stories" autoFocus />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief summary shown on quest cards" rows={2} />
              </div>
              <div className="space-y-2">
                <Label>How to Complete</Label>
                <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Step-by-step instructions shown to reps in the quest detail view" rows={3} />
              </div>
              <div className="grid grid-cols-3 gap-4">
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
                  <Label>Platform</Label>
                  <Select value={platform} onValueChange={(v) => setPlatform(v as "tiktok" | "instagram" | "any")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any Platform</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Points Reward</Label>
                  <Input type="number" value={pointsReward} onChange={(e) => setPointsReward(e.target.value)} min="0" />
                </div>
              </div>
            </TabsContent>

            {/* ── Media Tab ── */}
            <TabsContent value="media" className="space-y-4 pt-2">
              <ImageUpload
                label="Quest Image"
                value={imageUrl}
                onChange={setImageUrl}
                uploadKey={editId ? `quest_${editId}_image` : undefined}
              />

              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quest Video</span>
                <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoFileChange} className="hidden" />

                {videoUrl && isMuxPlaybackId(videoUrl) ? (
                  /* Video is set — show preview */
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-primary">
                      <CheckCircle2 size={12} />
                      Video ready
                    </div>
                    <div className="relative rounded-lg overflow-hidden bg-black border border-border">
                      <div style={{ display: previewError ? "none" : undefined }}>
                        <MuxPlayer
                          playbackId={videoUrl}
                          streamType="on-demand"
                          muted
                          preload="metadata"
                          onError={() => setPreviewError(true)}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          {...{ style: { width: "100%", maxHeight: "220px", "--controls": "none", "--media-object-fit": "contain" } } as any}
                        />
                      </div>
                      {previewError && (
                        <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                          Video saved — preview may take a moment
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => { setVideoUrl(""); setPreviewError(false); }}
                        className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 border border-white/20 rounded-md flex items-center justify-center text-white/70 hover:bg-black/90 hover:text-white transition-colors cursor-pointer z-10"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : videoUploading ? (
                  /* Upload in progress */
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-secondary/30 px-4 py-6">
                    <Loader2 size={20} className="animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">
                      {videoStatus || "Uploading..."}{videoProgress > 0 && videoProgress < 100 ? ` ${videoProgress}%` : ""}
                    </span>
                    {videoProgress > 0 && (
                      <div className="w-full max-w-[200px] h-1 rounded-full bg-border overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${videoProgress}%` }} />
                      </div>
                    )}
                  </div>
                ) : (
                  /* Drag & drop zone */
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => videoInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") videoInputRef.current?.click(); }}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleVideoDrop}
                    className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 cursor-pointer transition-all duration-150 ${
                      videoDragging
                        ? "border-primary bg-primary/[0.06] scale-[1.01]"
                        : "border-border/60 bg-secondary/20 hover:border-border hover:bg-secondary/40"
                    }`}
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                      videoDragging ? "bg-primary/15 text-primary" : "bg-muted/30 text-muted-foreground"
                    }`}>
                      <Upload size={16} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-foreground/80">
                        {videoDragging ? "Drop video here" : "Drag & drop or click to upload"}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Max 200MB</p>
                    </div>
                  </div>
                )}
                {videoError && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.06] px-3 py-2.5">
                    <X size={10} className="text-destructive mt-0.5 shrink-0" />
                    <p className="text-[11px] text-destructive">{videoError}</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Settings Tab ── */}
            <TabsContent value="settings" className="space-y-4 pt-2">
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
            </TabsContent>
          </Tabs>
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
            <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-primary/60" /></div>
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
                        {new Date(sub.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Badge variant={sub.status === "approved" ? "success" : sub.status === "rejected" ? "destructive" : "warning"}>
                      {sub.status}
                    </Badge>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3 mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Proof ({sub.proof_type})</p>
                    {sub.proof_type === "screenshot" && sub.proof_url && <img src={sub.proof_url} alt="Proof" className="max-h-40 rounded-md" />}
                    {sub.proof_type === "url" && sub.proof_text && (
                      <a href={sub.proof_text} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">{sub.proof_text}</a>
                    )}
                    {sub.proof_type === "text" && sub.proof_text && <p className="text-sm text-foreground">{sub.proof_text}</p>}
                  </div>
                  {sub.status === "pending" && (
                    <div className="space-y-2">
                      {rejectingId === sub.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejection..."
                            className="text-sm min-h-[60px]"
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="destructive" disabled={!rejectReason.trim() || reviewingId === sub.id}
                              onClick={() => { handleReview(sub.id, "rejected", rejectReason.trim()); setRejectingId(null); setRejectReason(""); }}>
                              {reviewingId === sub.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Confirm Reject
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setRejectReason(""); }}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => handleReview(sub.id, "approved")} disabled={reviewingId === sub.id}>
                            {reviewingId === sub.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRejectingId(sub.id)} disabled={reviewingId === sub.id}>
                            <X size={12} /> Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {sub.rejection_reason && <p className="mt-2 text-xs text-destructive">Reason: {sub.rejection_reason}</p>}
                </div>
              ))}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowSubmissions(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
