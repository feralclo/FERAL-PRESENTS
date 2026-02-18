"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Mic2, Plus, Loader2, Pencil, Trash2, Search } from "lucide-react";
import type { Artist } from "@/types/artists";

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
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((artist: Artist) => {
    setEditingArtist(artist);
    setFormName(artist.name);
    setFormDescription(artist.description || "");
    setFormInstagram(artist.instagram_handle || "");
    setFormImage(artist.image || "");
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
  }, [formName, formDescription, formInstagram, formImage, editingArtist, loadArtists]);

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
                  <TableHead className="hidden sm:table-cell">Description</TableHead>
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
                    <TableCell className="hidden sm:table-cell text-muted-foreground max-w-[200px] truncate">
                      {artist.description || "—"}
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
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input
                value={formImage}
                onChange={(e) => setFormImage(e.target.value)}
                placeholder="https://... or /api/media/..."
              />
              <p className="text-[10px] text-muted-foreground/60">
                Optional artist photo
              </p>
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
