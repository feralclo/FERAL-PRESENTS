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

      {/* Preview card */}
      <Card className="relative overflow-hidden border-border bg-card">
        <div
          className="h-32 bg-gradient-to-br from-primary/60 to-primary/20"
          style={{
            background: coverUrl
              ? `url(${coverUrl}) center/cover`
              : `linear-gradient(135deg, ${accentHex}aa, ${accentHex}44)`,
          }}
        />
        <div className="flex items-end gap-4 px-6 pb-6 pt-0 -mt-8">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white ring-4 ring-card"
            style={{
              background: avatarUrl
                ? `url(${avatarUrl}) center/cover`
                : accentHex,
            }}
          >
            {!avatarUrl && previewInitials}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="truncate text-base font-semibold text-foreground">
              {displayName || "Unnamed promoter"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              @{handle || promoter.handle}
              {location ? ` · ${location}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right pb-1">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Heart size={12} /> {promoter.follower_count}
              </span>
              <span className="flex items-center gap-1">
                <Users size={12} /> {promoter.team_size}
              </span>
            </div>
          </div>
        </div>
        {tagline && (
          <div className="px-6 pb-6 -mt-4">
            <p className="text-sm text-muted-foreground">{tagline}</p>
          </div>
        )}
      </Card>

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
            <p className="text-xs text-muted-foreground">
              3–32 characters. Lowercase letters, numbers, hyphens.
            </p>
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
