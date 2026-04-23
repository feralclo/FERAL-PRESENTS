"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Store,
  Save,
  Loader2,
  Check,
  Upload,
  Eye,
  EyeOff,
  Users,
  Heart,
} from "lucide-react";

interface Promoter {
  id: string;
  org_id: string;
  handle: string;
  display_name: string;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  accent_hex: number;
  avatar_url: string | null;
  avatar_initials: string | null;
  avatar_bg_hex: number | null;
  cover_image_url: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  follower_count: number;
  team_size: number;
  visibility: "public" | "private";
}

function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function cssHexToInt(hex: string): number | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  return parseInt(m[1], 16);
}

export default function PromoterPage() {
  const [loading, setLoading] = useState(true);
  const [promoter, setPromoter] = useState<Promoter | null>(null);

  // Editable form state
  const [handle, setHandle] = useState("");
  // Debounced availability check so tenants don't discover taken handles only on save.
  const [handleStatus, setHandleStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "yours" | "invalid"
  >("idle");
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [accentHex, setAccentHex] = useState("#b845ff");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  // Upload state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // Debounced availability check against the public promoter endpoint.
  // If the handle matches the current promoter's, it's "yours" (safe to save).
  // Otherwise 200 = someone else has it, 404 = free.
  useEffect(() => {
    if (!promoter) return;
    const trimmed = handle.trim().toLowerCase();
    if (trimmed === promoter.handle) {
      setHandleStatus("yours");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(trimmed)) {
      setHandleStatus(trimmed.length === 0 ? "idle" : "invalid");
      return;
    }
    setHandleStatus("checking");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/promoters/${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.status === 404) {
          setHandleStatus("available");
        } else if (res.ok) {
          const { data } = await res.json();
          setHandleStatus(data?.id === promoter.id ? "yours" : "taken");
        } else {
          setHandleStatus("idle");
        }
      } catch {
        // Aborted or network — ignore
      }
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [handle, promoter]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/promoter");
        if (!res.ok) throw new Error("Failed to load");
        const { data }: { data: Promoter } = await res.json();
        setPromoter(data);
        setHandle(data.handle);
        setDisplayName(data.display_name);
        setTagline(data.tagline ?? "");
        setBio(data.bio ?? "");
        setLocation(data.location ?? "");
        setAccentHex(hexToCss(data.accent_hex));
        setWebsite(data.website ?? "");
        setInstagram(data.instagram ?? "");
        setTiktok(data.tiktok ?? "");
        setVisibility(data.visibility);
        setAvatarUrl(data.avatar_url);
        setCoverUrl(data.cover_image_url);
      } catch {
        setStatus("Failed to load promoter profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUpload = async (
    file: File,
    kind: "avatar" | "cover"
  ): Promise<string | null> => {
    if (!promoter) return null;
    if (!file.type.startsWith("image/")) {
      setStatus("Please select an image file");
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus("Image too large (max 5MB)");
      return null;
    }
    setUploading(kind);
    try {
      const reader = new FileReader();
      const dataUri: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const key = `promoter-${kind}-${Date.now()}`;
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: dataUri, key }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Upload failed");
      }
      const { url } = await res.json();
      return url as string;
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : "Upload failed"
      );
      return null;
    } finally {
      setUploading(null);
    }
  };

  const handleAvatarChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await handleUpload(file, "avatar");
    if (url) setAvatarUrl(url);
    e.target.value = "";
  };

  const handleCoverChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await handleUpload(file, "cover");
    if (url) setCoverUrl(url);
    e.target.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus("");
    try {
      const accentInt = cssHexToInt(accentHex);
      if (accentInt === null) {
        throw new Error("Accent colour must be a valid hex colour");
      }
      const body = {
        handle: handle.toLowerCase().trim(),
        display_name: displayName.trim(),
        tagline: tagline.trim() || null,
        bio: bio.trim() || null,
        location: location.trim() || null,
        accent_hex: accentInt,
        website: website.trim() || null,
        instagram: instagram.trim().replace(/^@+/, "") || null,
        tiktok: tiktok.trim().replace(/^@+/, "") || null,
        avatar_url: avatarUrl,
        cover_image_url: coverUrl,
        visibility,
      };
      const res = await fetch("/api/admin/promoter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Failed to save");
      }
      const { data }: { data: Promoter } = await res.json();
      setPromoter(data);
      setStatus("Saved");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error saving");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!promoter) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">
          Failed to load promoter profile
        </p>
      </div>
    );
  }

  const previewInitials =
    displayName.trim().charAt(0).toUpperCase() ||
    promoter.avatar_initials ||
    "?";

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Store size={20} className="text-primary" />
        <div>
          <h1 className="font-mono text-sm font-bold uppercase tracking-[2px] text-foreground">
            Promoter profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your public identity across the Entry rep app and any follower-facing surface
          </p>
        </div>
      </div>

      {/* iOS preview — mirrors how reps see the promoter profile in the native app.
          Shape matches RepProfileScreen.swift: full-bleed hero with accent tint,
          circle avatar, big display name, stats pills, mock Follow button. */}
      <div className="space-y-2">
        <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          Live preview — how reps see you in the app
        </p>
        <Card className="relative overflow-hidden border-border bg-background">
          {/* Hero */}
          <div className="relative h-40">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(135deg, ${accentHex} 0%, ${accentHex}40 60%, transparent 100%)`,
                }}
              />
            )}
            {/* Accent tint */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, ${accentHex}4D 0%, transparent 55%)`,
              }}
            />
            {/* Readability scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
          </div>

          <div className="relative -mt-14 flex items-end gap-4 px-6">
            {/* Circle avatar */}
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full text-2xl font-bold text-white ring-4 ring-background"
              style={{
                background: avatarUrl
                  ? undefined
                  : `linear-gradient(135deg, ${accentHex}, ${accentHex}80)`,
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-mono tracking-tight">{previewInitials}</span>
              )}
            </div>

            {/* Mock Follow CTA — always disabled, just a visual cue */}
            <div className="mb-1 ml-auto shrink-0 cursor-not-allowed rounded-full border border-border bg-background/60 px-4 py-1.5 text-xs font-semibold text-foreground backdrop-blur">
              Follow
            </div>
          </div>

          <div className="relative px-6 pb-5 pt-3">
            <p className="truncate text-xl font-bold tracking-tight text-foreground">
              {displayName || "Unnamed promoter"}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              @{(handle || promoter.handle).toLowerCase()}
              {location ? ` · ${location}` : ""}
            </p>
            {tagline && (
              <p className="mt-2 text-sm text-foreground/80">{tagline}</p>
            )}

            {/* Stats pills — iOS uses monospaced numbers with tracked labels */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-card px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Heart size={10} strokeWidth={1.75} />
                  Followers
                </div>
                <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-foreground">
                  {promoter.follower_count}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Users size={10} strokeWidth={1.75} />
                  Team
                </div>
                <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-foreground">
                  {promoter.team_size}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Identity */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Identity
        </h2>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="handle">Handle</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">@</span>
              <Input
                id="handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="feralpresents"
                maxLength={32}
                className="flex-1"
              />
            </div>
            {(() => {
              const base = "text-xs";
              if (handleStatus === "checking") {
                return <p className={`${base} text-muted-foreground`}>Checking availability...</p>;
              }
              if (handleStatus === "available") {
                return <p className={`${base} text-success`}>@{handle.trim().toLowerCase()} is available</p>;
              }
              if (handleStatus === "taken") {
                return <p className={`${base} text-destructive`}>@{handle.trim().toLowerCase()} is already taken</p>;
              }
              if (handleStatus === "yours") {
                return <p className={`${base} text-muted-foreground`}>This is your current handle.</p>;
              }
              if (handleStatus === "invalid") {
                return (
                  <p className={`${base} text-warning`}>
                    Must be 3–32 chars — lowercase letters, numbers, hyphens; no leading/trailing hyphen.
                  </p>
                );
              }
              return (
                <p className={`${base} text-muted-foreground`}>
                  3–32 characters. Lowercase letters, numbers, hyphens.
                </p>
              );
            })()}
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="FERAL Presents"
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Warehouse parties across the UK"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              One short line shown under your name on cards.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A longer description for your profile page."
              maxLength={500}
              rows={4}
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              {bio.length}/500
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="London · UK"
              maxLength={80}
            />
          </div>
        </div>
      </Card>

      {/* Branding */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Branding
        </h2>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="accent">Accent colour</Label>
            <div className="flex items-center gap-3">
              <input
                id="accent"
                type="color"
                value={accentHex}
                onChange={(e) => setAccentHex(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background"
              />
              <Input
                value={accentHex}
                onChange={(e) => setAccentHex(e.target.value)}
                placeholder="#b845ff"
                maxLength={7}
                className="font-mono flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Used for your profile accents in the rep app.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="flex items-center gap-3">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
                style={{
                  background: avatarUrl
                    ? `url(${avatarUrl}) center/cover`
                    : accentHex,
                }}
              >
                {!avatarUrl && previewInitials}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploading === "avatar"}
                  className="gap-2"
                >
                  {uploading === "avatar" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {avatarUrl ? "Replace" : "Upload"}
                </Button>
                {avatarUrl && (
                  <button
                    onClick={() => setAvatarUrl(null)}
                    className="text-xs text-muted-foreground hover:text-foreground text-left"
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cover image</Label>
            <div className="flex items-center gap-3">
              <div
                className="h-16 w-28 shrink-0 rounded-md border border-border bg-muted"
                style={{
                  background: coverUrl
                    ? `url(${coverUrl}) center/cover`
                    : `linear-gradient(135deg, ${accentHex}aa, ${accentHex}44)`,
                }}
              />
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploading === "cover"}
                  className="gap-2"
                >
                  {uploading === "cover" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {coverUrl ? "Replace" : "Upload"}
                </Button>
                {coverUrl && (
                  <button
                    onClick={() => setCoverUrl(null)}
                    className="text-xs text-muted-foreground hover:text-foreground text-left"
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverChange}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Wide banner shown on your profile page. 16:9 recommended.
            </p>
          </div>
        </div>
      </Card>

      {/* Links */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Links
        </h2>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://feral.events"
              maxLength={200}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">@</span>
                <Input
                  id="instagram"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="feralpresents"
                  maxLength={50}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiktok">TikTok</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">@</span>
                <Input
                  id="tiktok"
                  value={tiktok}
                  onChange={(e) => setTiktok(e.target.value)}
                  placeholder="feralpresents"
                  maxLength={50}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Visibility */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Visibility
        </h2>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40">
            <input
              type="radio"
              checked={visibility === "public"}
              onChange={() => setVisibility("public")}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Eye size={14} /> Public
              </div>
              <p className="text-xs text-muted-foreground">
                Discoverable by reps in the app. Anyone can follow.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40">
            <input
              type="radio"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <EyeOff size={14} /> Private
              </div>
              <p className="text-xs text-muted-foreground">
                Hidden from discovery. Reps can only find you by direct invite.
              </p>
            </div>
          </label>
        </div>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3 pb-8">
        <Button
          onClick={handleSave}
          disabled={saving || uploading !== null}
          className="gap-2"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Save changes
        </Button>
        {status && (
          <div className="flex items-center gap-2 text-sm">
            {status === "Saved" && (
              <Check size={14} className="text-[color:var(--success,_#34D399)]" />
            )}
            <span
              className={
                status === "Saved"
                  ? "text-muted-foreground"
                  : "text-[color:var(--destructive,_#F43F5E)]"
              }
            >
              {status}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
