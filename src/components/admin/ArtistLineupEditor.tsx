"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  X,
  Plus,
  ChevronUp,
  ChevronDown,
  Search,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artist, EventArtist } from "@/types/artists";

interface ArtistLineupEditorProps {
  eventArtists: EventArtist[];
  onChange: (eventArtists: EventArtist[]) => void;
  className?: string;
}

export function ArtistLineupEditor({
  eventArtists,
  onChange,
  className,
}: ArtistLineupEditorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Artist[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick-create form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newInstagram, setNewInstagram] = useState("");

  // Search artists from catalog
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/artists?q=${encodeURIComponent(searchQuery.trim())}`
        );
        const json = await res.json();
        if (json.data) {
          // Filter out artists already in the lineup
          const existingIds = new Set(eventArtists.map((ea) => ea.artist_id));
          setSearchResults(
            json.data.filter((a: Artist) => !existingIds.has(a.id))
          );
        }
      } catch {
        // ignore
      }
      setSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, eventArtists]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  const addArtist = useCallback(
    (artist: Artist) => {
      const newEntry: EventArtist = {
        id: crypto.randomUUID(),
        event_id: "",
        artist_id: artist.id,
        sort_order: eventArtists.length,
        org_id: "",
        artist,
      };
      onChange([...eventArtists, newEntry]);
      setSearchQuery("");
      setShowDropdown(false);
    },
    [eventArtists, onChange]
  );

  const removeArtist = useCallback(
    (index: number) => {
      const updated = eventArtists
        .filter((_, i) => i !== index)
        .map((ea, i) => ({ ...ea, sort_order: i }));
      onChange(updated);
    },
    [eventArtists, onChange]
  );

  const moveArtist = useCallback(
    (index: number, direction: -1 | 1) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= eventArtists.length) return;
      const updated = [...eventArtists];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      onChange(updated.map((ea, i) => ({ ...ea, sort_order: i })));
    },
    [eventArtists, onChange]
  );

  const handleQuickCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          instagram_handle: newInstagram.trim().replace(/^@/, "") || null,
        }),
      });
      const json = await res.json();
      if (json.data) {
        addArtist(json.data);
        setQuickCreateOpen(false);
        setNewName("");
        setNewDescription("");
        setNewInstagram("");
      }
    } catch {
      // ignore
    }
    setSaving(false);
  }, [newName, newDescription, newInstagram, addArtist]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Search + Add */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => {
              if (searchQuery.trim()) setShowDropdown(true);
            }}
            placeholder="Search artist catalog..."
            className="pl-9 pr-24"
          />
          <Button
            variant="outline"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs"
            onClick={() => {
              setNewName(searchQuery.trim());
              setNewDescription("");
              setNewInstagram("");
              setQuickCreateOpen(true);
            }}
          >
            <Plus size={12} />
            New
          </Button>
        </div>

        {/* Search dropdown */}
        {showDropdown && searchQuery.trim() && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
            {searching ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Searching...
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((artist) => (
                <button
                  key={artist.id}
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-primary/5 transition-colors cursor-pointer"
                  onClick={() => addArtist(artist)}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                    {artist.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{artist.name}</span>
                  {artist.instagram_handle && (
                    <span className="text-xs text-muted-foreground">
                      @{artist.instagram_handle}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-2.5 text-xs text-muted-foreground">
                No matches — use &ldquo;New&rdquo; to create
              </div>
            )}
          </div>
        )}
      </div>

      {/* Artist list */}
      {eventArtists.length > 0 && (
        <div className="space-y-1">
          {eventArtists.map((ea, i) => (
            <div
              key={ea.artist_id}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                {(ea.artist?.name || "?").charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 text-sm font-medium text-foreground truncate">
                {ea.artist?.name || "Unknown"}
              </span>
              {ea.artist?.instagram_handle && (
                <span className="hidden sm:block text-xs text-muted-foreground">
                  @{ea.artist.instagram_handle}
                </span>
              )}
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => moveArtist(i, -1)}
                  disabled={i === 0}
                  className="text-muted-foreground"
                >
                  <ChevronUp size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => moveArtist(i, 1)}
                  disabled={i === eventArtists.length - 1}
                  className="text-muted-foreground"
                >
                  <ChevronDown size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeArtist(i)}
                  className="text-destructive hover:text-destructive"
                >
                  <X size={12} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Search to add from the catalog, or create new artists inline.
      </p>

      {/* Quick-create dialog */}
      <Dialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Artist</DialogTitle>
            <DialogDescription>
              Add a new artist to your catalog and the lineup
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Artist / DJ name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Short bio..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Instagram Handle</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  @
                </span>
                <Input
                  value={newInstagram}
                  onChange={(e) =>
                    setNewInstagram(e.target.value.replace(/^@/, ""))
                  }
                  placeholder="username"
                  className="pl-7"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setQuickCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleQuickCreate}
              disabled={!newName.trim() || saving}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Create & Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
