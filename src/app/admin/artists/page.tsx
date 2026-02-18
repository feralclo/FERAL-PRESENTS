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
import { ImageUpload } from "@/components/admin/ImageUpload";
import type { Artist } from "@/types/artists";

/** Convert a stored video_url value to a playable URL */
function getVideoSrc(videoUrl: string): string {
  if (videoUrl.startsWith("http")) return videoUrl;
  return `https://stream.mux.com/${videoUrl}.m3u8`;
}

/** Get Mux thumbnail from a playback ID */
function getVideoThumbnail(videoUrl: string): string | undefined {
  if (videoUrl.startsWith("http")) return undefined;
  return `https://image.mux.com/${videoUrl}/thumbnail.jpg?time=1`;
}

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
  const videoInputRef = useRef<HTMLInputElement>(null);

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
      // Step 1: Get a Supabase signed upload URL
      const signedRes = await fetch("/api/upload-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      const signedData = await signedRes.json();
      if (!signedRes.ok) throw new Error(signedData.error || "Failed to prepare upload");

      const { signedUrl, token, publicUrl } = signedData;

      // Step 2: Upload directly to Supabase Storage (bypasses Vercel body limit)
      setVideoStatus("Uploading...");
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "x-upsert": "true",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload to storage failed");
      setVideoProgress(50);

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
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={getVideoSrc(formVideoUrl)}
                      className="w-full"
                      style={{ maxHeight: "160px", display: previewError ? "none" : undefined }}
                      muted
                      playsInline
                      controls
                      preload="metadata"
                      poster={getVideoThumbnail(formVideoUrl)}
                      onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.1; }}
                      onError={() => setPreviewError(true)}
                    />
                    {previewError && (
                      <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                        Video saved — preview loading
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setFormVideoUrl(""); setPreviewError(false); }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 border border-white/20 rounded-md flex items-center justify-center text-white/70 hover:bg-black/90 hover:text-white transition-colors cursor-pointer"
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={videoUploading}
                    className="w-full"
                  >
                    {videoUploading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        {videoStatus || "Uploading..."}{videoProgress > 0 && videoProgress < 100 ? ` ${videoProgress}%` : ""}
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        Upload Video
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Any video format, automatically converted for web. Max 200MB.
                  </p>
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
