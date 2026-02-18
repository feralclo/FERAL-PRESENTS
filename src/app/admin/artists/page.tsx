"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Mic2, Plus, Loader2, Pencil, Trash2, Search, Upload, X, Video, CheckCircle2 } from "lucide-react";
import dynamic from "next/dynamic";
import * as tus from "tus-js-client";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { isMuxPlaybackId, getMuxThumbnailUrl } from "@/lib/mux";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY, ORG_ID } from "@/lib/constants";
import type { Artist } from "@/types/artists";

// Mux Player — dynamic import to avoid SSR issues (Web Component)
const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), {
  ssr: false,
});

export default function ArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArtist, setEditingArtist] = useState<Artist | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formInstagram, setFormInstagram] = useState("");
  const [formImage, setFormImage] = useState("");
  const [formVideoUrl, setFormVideoUrl] = useState("");

  // Video upload state
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoStatus, setVideoStatus] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [videoDragging, setVideoDragging] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Artist | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadArtists = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/artists");
      const json = await res.json();
      if (json.data) setArtists(json.data);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadArtists();
  }, [loadArtists]);

  const openCreate = useCallback(() => {
    setEditingArtist(null);
    setFormName("");
    setFormDescription("");
    setFormInstagram("");
    setFormImage("");
    setFormVideoUrl("");
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((artist: Artist) => {
    setEditingArtist(artist);
    setFormName(artist.name);
    setFormDescription(artist.description || "");
    setFormInstagram(artist.instagram_handle || "");
    setFormImage(artist.image || "");
    setFormVideoUrl(artist.video_url || "");
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formName.trim()) return;
    setSaving(true);

    const payload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      instagram_handle: formInstagram.trim().replace(/^@/, "") || null,
      image: formImage.trim() || null,
      video_url: formVideoUrl.trim() || null,
    };

    try {
      if (editingArtist) {
        await fetch(`/api/artists/${editingArtist.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/artists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setDialogOpen(false);
      loadArtists();
    } catch {
      // ignore
    }
    setSaving(false);
  }, [formName, formDescription, formInstagram, formImage, formVideoUrl, editingArtist, loadArtists]);

  const handleVideoUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("video/")) {
      alert("Please select a video file.");
      return;
    }

    const MAX_FILE_SIZE = 200 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      alert(`File is ${Math.round(file.size / 1024 / 1024)}MB — maximum is 200MB.`);
      return;
    }

    setVideoUploading(true);
    setVideoProgress(0);
    setVideoStatus("Preparing upload...");

    try {
      // Step 1: Get the user's session token for authenticated upload
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase not configured");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated — please refresh and try again");

      // Generate a unique storage path scoped by org_id for multi-tenant isolation
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
      const storagePath = `${ORG_ID}/artists/${Date.now()}_${safeName}`;

      // Step 2: Upload via TUS resumable protocol (6MB chunks, auto-retry)
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
          chunkSize: 6 * 1024 * 1024, // 6MB chunks (Supabase requirement)
          metadata: {
            bucketName: "artist-media",
            objectName: storagePath,
            contentType: file.type,
            cacheControl: "3600",
          },
          onError: (error) => {
            console.error("TUS upload error:", error);
            reject(new Error(error.message || "Upload failed"));
          },
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

        // Check for previous uploads to resume
        upload.findPreviousUploads().then((previousUploads) => {
          if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
          upload.start();
        });
      });

      setVideoProgress(70);

      // Build the public URL for Mux to ingest from
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/artist-media/${storagePath}`;

      // Step 3: Tell Mux to ingest the video from the Supabase URL
      setVideoStatus("Processing video...");
      const muxRes = await fetch("/api/mux/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: publicUrl }),
      });
      const muxData = await muxRes.json();
      if (!muxRes.ok) throw new Error(muxData.error || "Failed to start processing");

      // Step 4: Poll until Mux finishes transcoding
      const playbackId = await pollMuxStatus(muxData.assetId);

      setFormVideoUrl(playbackId);
      setPreviewError(false);
      setVideoProgress(100);
      setVideoStatus("");
    } catch (e) {
      console.error("Video upload failed:", e);
      const msg = e instanceof Error ? e.message : "Unknown error";
      alert(`Video upload failed: ${msg}`);
      setVideoStatus("");
    }

    setVideoUploading(false);
    setVideoProgress(0);
  }, []);

  /** Poll Mux status every 3s until asset is ready */
  const pollMuxStatus = useCallback(async (assetId: string): Promise<string> => {
    for (let i = 0; i < 60; i++) { // Max 3 minutes
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/mux/status?assetId=${assetId}`);
      const data = await res.json();

      if (data.status === "ready" && data.playbackId) {
        return data.playbackId;
      }
      if (data.status === "errored") {
        throw new Error("Mux processing failed");
      }
      setVideoStatus("Processing video...");
    }
    throw new Error("Processing timed out");
  }, []);

  const handleVideoFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleVideoUpload(file);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [handleVideoUpload]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setVideoDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setVideoDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setVideoDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("video/")) {
        handleVideoUpload(file);
      }
    },
    [handleVideoUpload]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/artists/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      loadArtists();
    } catch {
      // ignore
    }
    setDeleting(false);
  }, [deleteTarget, loadArtists]);

  const filtered = searchQuery
    ? artists.filter((a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : artists;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Mic2 size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Artists</h1>
            <p className="text-xs text-muted-foreground">
              Manage your artist catalog
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          Add Artist
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search artists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">
            {filtered.length} artist{filtered.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={18} className="animate-spin text-primary/60" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading...
              </span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {searchQuery ? "No artists match your search" : "No artists yet"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Instagram</TableHead>
                  <TableHead className="hidden sm:table-cell">Video</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((artist) => (
                  <TableRow key={artist.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        {artist.image ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={artist.image}
                            alt={artist.name}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            {artist.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {artist.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {artist.instagram_handle
                        ? `@${artist.instagram_handle}`
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {artist.video_url ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <Video size={12} />
                          Uploaded
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEdit(artist)}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(artist)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingArtist ? "Edit Artist" : "Add Artist"}
            </DialogTitle>
            <DialogDescription>
              {editingArtist
                ? "Update the artist profile"
                : "Add a new artist to your catalog"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Artist / DJ name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Short bio..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Instagram Handle</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  @
                </span>
                <Input
                  value={formInstagram}
                  onChange={(e) =>
                    setFormInstagram(e.target.value.replace(/^@/, ""))
                  }
                  placeholder="username"
                  className="pl-7"
                />
              </div>
            </div>
            <ImageUpload
              label="Artist Profile Pic"
              value={formImage}
              onChange={setFormImage}
              uploadKey={editingArtist ? `artist_${editingArtist.id}_photo` : `artist_new_${Date.now()}_photo`}
            />
            <div className="space-y-2">
              <Label>Video</Label>
              {formVideoUrl ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-primary mb-1">
                    <CheckCircle2 size={12} />
                    Video ready
                  </div>
                  <div className="relative rounded-lg overflow-hidden bg-black border border-border">
                    {isMuxPlaybackId(formVideoUrl) ? (
                      /* Mux video — MuxPlayer renders at native aspect ratio */
                      <div style={{ display: previewError ? "none" : undefined }}>
                        <MuxPlayer
                          playbackId={formVideoUrl}
                          streamType="on-demand"
                          muted
                          preload="metadata"
                          onError={() => setPreviewError(true)}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          {...{ style: {
                            width: "100%",
                            maxHeight: "280px",
                            "--controls": "none",
                            "--media-object-fit": "contain",
                          } } as any}
                        />
                      </div>
                    ) : (
                      /* Legacy direct URL — native <video> works fine */
                      /* eslint-disable-next-line jsx-a11y/media-has-caption */
                      <video
                        src={formVideoUrl}
                        className="w-full"
                        style={{ maxHeight: "280px", objectFit: "contain", display: previewError ? "none" : undefined }}
                        muted
                        playsInline
                        controls
                        preload="metadata"
                        onError={() => setPreviewError(true)}
                      />
                    )}
                    {previewError && (
                      <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                        Video saved — preview may take a moment
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setFormVideoUrl(""); setPreviewError(false); }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 border border-white/20 rounded-md flex items-center justify-center text-white/70 hover:bg-black/90 hover:text-white transition-colors cursor-pointer z-10"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleVideoFileChange}
                    className="hidden"
                  />
                  {videoUploading ? (
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
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => videoInputRef.current?.click()}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") videoInputRef.current?.click(); }}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
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
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          Max 200MB &middot; Auto-converted for web
                        </p>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          4:5 portrait
                          <span className="text-[8px] opacity-60">best</span>
                        </span>
                        <span className="inline-flex items-center rounded-md bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
                          16:9 landscape
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formName.trim() || saving}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editingArtist ? "Save Changes" : "Add Artist"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Artist</DialogTitle>
            <DialogDescription>
              Permanently delete &ldquo;{deleteTarget?.name}&rdquo;? This will
              also remove them from any event lineups.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 size={14} className="animate-spin" />}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
