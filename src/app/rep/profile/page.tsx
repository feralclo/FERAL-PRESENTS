"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Copy,
  Check,
  LogOut,
  Save,
  Loader2,
  Instagram,
  Flame,
  User,
  Zap,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface RepProfile {
  id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  email: string;
  phone?: string;
  photo_url?: string;
  instagram?: string;
  tiktok?: string;
  bio?: string;
  level: number;
  points_balance: number;
  total_sales: number;
}

function getTierFromLevel(level: number): { name: string; ring: string; color: string; profileRing: string } {
  if (level >= 9) return { name: "Mythic", ring: "rep-avatar-ring-mythic", color: "#F59E0B", profileRing: "rep-profile-ring rep-profile-ring-mythic" };
  if (level >= 7) return { name: "Elite", ring: "rep-avatar-ring-elite", color: "#8B5CF6", profileRing: "rep-profile-ring rep-profile-ring-elite" };
  if (level >= 4) return { name: "Pro", ring: "rep-avatar-ring-pro", color: "#38BDF8", profileRing: "rep-profile-ring rep-profile-ring-pro" };
  return { name: "Starter", ring: "rep-avatar-ring-starter", color: "#94A3B8", profileRing: "rep-profile-ring rep-profile-ring-starter" };
}

// TikTok icon (not in lucide)
function TikTokIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.8a8.19 8.19 0 0 0 3.76.96V6.32a4.85 4.85 0 0 1-.01.37Z" />
    </svg>
  );
}

/**
 * Crop and resize an image file to a square, returns base64 JPEG.
 */
function processProfileImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const x = (img.width - size) / 2;
        const y = (img.height - size) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));

        ctx.drawImage(img, x, y, size, size, 0, 0, 400, 400);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Open social profile in native app (iOS deep link) with web fallback.
 * Does not navigate away from the portal.
 */
function openSocialProfile(platform: "instagram" | "tiktok", username: string) {
  const schemes: Record<string, string> = {
    instagram: `instagram://user?username=${username}`,
    tiktok: `snssdk1233://user/profile/${username}`,
  };
  const webUrls: Record<string, string> = {
    instagram: `https://instagram.com/${username}`,
    tiktok: `https://tiktok.com/@${username}`,
  };

  // Try native app scheme
  window.location.href = schemes[platform];

  // If we're still here after 1.5s, the app didn't open — use web fallback
  const timer = setTimeout(() => {
    window.open(webUrls[platform], "_blank", "noopener");
  }, 1500);

  // If the native app opened, the page becomes hidden — cancel fallback
  const onVisibility = () => {
    if (document.hidden) {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  // Clean up listener after fallback fires
  setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibility);
  }, 2000);
}

export default function RepProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<RepProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Editable fields
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [bio, setBio] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Discount
  const [discountCode, setDiscountCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, discRes] = await Promise.all([
          fetch("/api/rep-portal/me"),
          fetch("/api/rep-portal/discount"),
        ]);
        if (!meRes.ok) {
          const errJson = await meRes.json().catch(() => null);
          setError(errJson?.error || "Failed to load profile (" + meRes.status + ")");
          setLoading(false);
          return;
        }
        const meJson = await meRes.json();
        const discJson = discRes.ok ? await discRes.json() : { data: [] };

        if (meJson.data) {
          const p = meJson.data;
          setProfile(p);
          setDisplayName(p.display_name || "");
          setPhone(p.phone || "");
          setInstagram(p.instagram || "");
          setTiktok(p.tiktok || "");
          setBio(p.bio || "");
          setPhotoPreview(null);
        }
        if (discJson.data?.[0]) {
          setDiscountCode(discJson.data[0].code);
        }
      } catch {
        setError("Failed to load profile — check your connection");
      }
      setLoading(false);
    })();
  }, [loadKey]);

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be selected again
    e.target.value = "";

    setUploading(true);
    setError("");

    try {
      const imageData = await processProfileImage(file);
      setPhotoPreview(imageData);

      // Upload to server
      const key = `rep-avatar-${profile?.id || "unknown"}-${Date.now()}`;
      const uploadRes = await fetch("/api/rep-portal/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData, key }),
      });

      if (!uploadRes.ok) {
        const errJson = await uploadRes.json().catch(() => null);
        throw new Error(errJson?.error || "Upload failed");
      }

      const { url } = await uploadRes.json();

      // Save photo URL to rep record
      const saveRes = await fetch("/api/rep-portal/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_url: url }),
      });

      if (saveRes.ok) {
        const json = await saveRes.json();
        if (json?.data) {
          setProfile(json.data);
          setPhotoPreview(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
      setPhotoPreview(null);
    }
    setUploading(false);
  }, [profile?.id]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/rep-portal/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          phone: phone.trim() || null,
          instagram: instagram.trim() || null,
          tiktok: tiktok.trim() || null,
          bio: bio.trim() || null,
        }),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.data) {
          setProfile(json.data);
          setDisplayName(json.data.display_name || "");
          setPhone(json.data.phone || "");
          setInstagram(json.data.instagram || "");
          setTiktok(json.data.tiktok || "");
          setBio(json.data.bio || "");
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const errJson = await res.json().catch(() => null);
        setError(errJson?.error || "Failed to save profile (" + res.status + ")");
      }
    } catch {
      setError("Failed to save profile — check your connection");
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    try {
      const supabase = getSupabaseClient();
      await Promise.all([
        fetch("/api/rep-portal/logout", { method: "POST" }),
        supabase?.auth.signOut(),
      ]);
    } catch { /* network */ }
    router.push("/rep/login");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(discountCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch { /* clipboard not available */ }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-6 md:py-8 space-y-6">
        <div className="flex flex-col items-center">
          <div className="h-24 w-24 rounded-full bg-muted/50 animate-pulse mb-4" />
          <div className="h-5 w-40 rounded bg-muted/50 animate-pulse mb-2" />
          <div className="h-4 w-28 rounded bg-muted/50 animate-pulse" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="max-w-md mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-destructive"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <p className="text-sm text-foreground font-medium mb-1">Failed to load profile</p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setError(""); setLoading(true); setLoadKey((k) => k + 1); }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const avatarSrc = photoPreview || profile.photo_url;

  return (
    <div className="max-w-md mx-auto px-4 py-6 md:py-8 space-y-6 rep-fade-in">
      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoSelect}
      />

      {/* ── Avatar + Identity — Player Card Hero ── */}
      <div className="rep-profile-hero rep-slide-up">
        <div className="text-center">
        {(() => {
          const tier = getTierFromLevel(profile.level);
          const MINI_CIRC = 2 * Math.PI * 22;
          return (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn("relative inline-block group", tier.profileRing)}
                aria-label="Change profile photo"
              >
                <div className={cn(
                  "h-28 w-28 rounded-full overflow-hidden mx-auto transition-all duration-300 rep-avatar-ring",
                  tier.ring,
                  "bg-primary/5",
                  uploading && "rep-photo-uploading"
                )}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <span className="text-4xl font-bold text-primary">
                        {profile.first_name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                {/* Camera overlay */}
                <div className={cn(
                  "absolute inset-0 rounded-full flex items-center justify-center bg-black/50 transition-opacity duration-200",
                  uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-active:opacity-100"
                )}>
                  {uploading ? (
                    <Loader2 size={20} className="text-white animate-spin" />
                  ) : (
                    <Camera size={20} className="text-white" />
                  )}
                </div>
              </button>

              <h1 className="mt-3 text-lg font-bold rep-gradient-text">
                {profile.display_name || profile.first_name}
              </h1>
              <p className="text-xs text-muted-foreground">{profile.email}</p>

              {/* Tier badge */}
              <div className="flex items-center justify-center mt-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold rep-badge-shimmer"
                  style={{ backgroundColor: `${tier.color}15`, color: tier.color, border: `1px solid ${tier.color}30` }}
                >
                  <Zap size={10} />
                  Level {profile.level} — {tier.name}
                </span>
              </div>

              {/* Mini stat gauges */}
              <div className="flex items-center justify-center gap-6 mt-5">
                <div className="rep-mini-gauge">
                  <div className="rep-mini-gauge-ring">
                    <svg viewBox="0 0 56 56">
                      <circle className="track" cx="28" cy="28" r="22" />
                      <circle
                        className="fill"
                        cx="28" cy="28" r="22"
                        stroke="#8B5CF6"
                        strokeDasharray={MINI_CIRC}
                        strokeDashoffset={MINI_CIRC * (1 - Math.min(profile.points_balance / Math.max(profile.points_balance, 100), 1))}
                        style={{ filter: "drop-shadow(0 0 3px rgba(139, 92, 246, 0.4))" }}
                      />
                    </svg>
                    <div className="rep-mini-gauge-center">
                      <Zap size={14} className="text-primary" />
                    </div>
                  </div>
                  <span className="rep-mini-gauge-value" style={{ color: "#8B5CF6" }}>{profile.points_balance}</span>
                  <span className="rep-mini-gauge-label">XP</span>
                </div>

                <div className="rep-mini-gauge">
                  <div className="rep-mini-gauge-ring">
                    <svg viewBox="0 0 56 56">
                      <circle className="track" cx="28" cy="28" r="22" />
                      <circle
                        className="fill"
                        cx="28" cy="28" r="22"
                        stroke="#34D399"
                        strokeDasharray={MINI_CIRC}
                        strokeDashoffset={MINI_CIRC * (1 - Math.min(profile.total_sales / Math.max(profile.total_sales, 20), 1))}
                        style={{ filter: "drop-shadow(0 0 3px rgba(52, 211, 153, 0.4))" }}
                      />
                    </svg>
                    <div className="rep-mini-gauge-center">
                      <TrendingUp size={14} className="text-success" />
                    </div>
                  </div>
                  <span className="rep-mini-gauge-value" style={{ color: "#34D399" }}>{profile.total_sales}</span>
                  <span className="rep-mini-gauge-label">Sales</span>
                </div>

                <div className="rep-mini-gauge">
                  <div className="rep-mini-gauge-ring">
                    <svg viewBox="0 0 56 56">
                      <circle className="track" cx="28" cy="28" r="22" />
                      <circle
                        className="fill"
                        cx="28" cy="28" r="22"
                        stroke={tier.color}
                        strokeDasharray={MINI_CIRC}
                        strokeDashoffset={MINI_CIRC * (1 - Math.min(profile.level / 10, 1))}
                        style={{ filter: `drop-shadow(0 0 3px ${tier.color}66)` }}
                      />
                    </svg>
                    <div className="rep-mini-gauge-center">
                      <Trophy size={14} style={{ color: tier.color }} />
                    </div>
                  </div>
                  <span className="rep-mini-gauge-value" style={{ color: tier.color }}>Lv.{profile.level}</span>
                  <span className="rep-mini-gauge-label">Tier</span>
                </div>
              </div>
            </>
          );
        })()}

        {/* Social links (view mode) */}
        {(instagram || tiktok) && (
          <div className="flex items-center justify-center gap-3 mt-4">
            {instagram && (
              <button
                type="button"
                onClick={() => openSocialProfile("instagram", instagram)}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                style={{ background: "linear-gradient(135deg, rgba(131, 58, 180, 0.1), rgba(253, 29, 29, 0.08), rgba(252, 176, 69, 0.08))", border: "1px solid rgba(131, 58, 180, 0.2)" }}
              >
                <Instagram size={13} />
                @{instagram}
              </button>
            )}
            {tiktok && (
              <button
                type="button"
                onClick={() => openSocialProfile("tiktok", tiktok)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-white/[0.15] transition-colors"
              >
                <TikTokIcon size={13} />
                @{tiktok}
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      {/* ── Discount Code ── */}
      {discountCode && (
        <Card className="py-0 gap-0 border-primary/20 bg-primary/5 rep-pulse-border rep-slide-up rep-scan-card" style={{ animationDelay: "50ms" }}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Flame size={14} className="text-primary" />
              <p className="text-[10px] uppercase tracking-[2px] text-primary font-bold">
                Your Code
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold font-mono tracking-[4px] text-foreground flex-1" style={{ textShadow: "0 0 20px rgba(139, 92, 246, 0.15)" }}>
                {discountCode}
              </p>
              <Button size="sm" onClick={copyCode}>
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                {copiedCode ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Share this code — every sale earns you points
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Edit Form ── */}
      <Card className="py-0 gap-0 rep-slide-up" style={{ animationDelay: "100ms" }}>
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <User size={14} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Edit Profile</h2>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Display Name
            </Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              placeholder="How you appear on the leaderboard"
            />
            <p className="text-[10px] text-muted-foreground/60">
              This is what other reps see. Leave blank to use your first name.
            </p>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Phone
            </Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              placeholder="+44..."
            />
          </div>

          <Separator />

          {/* Socials */}
          <div className="space-y-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Socials
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Instagram size={11} /> Instagram
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">@</span>
                  <Input
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value.replace("@", ""))}
                    maxLength={30}
                    placeholder="handle"
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <TikTokIcon size={11} /> TikTok
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">@</span>
                  <Input
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value.replace("@", ""))}
                    maxLength={30}
                    placeholder="handle"
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Bio */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Bio
            </Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              placeholder="Tell everyone about yourself..."
              rows={3}
              className="resize-none"
            />
            <p className="text-[10px] text-muted-foreground/60 text-right">
              {bio.length}/500
            </p>
          </div>

          {error && profile && (
            <Badge variant="destructive" className="w-full justify-center py-1.5">
              {error}
            </Badge>
          )}

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full"
            size="lg"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saved ? (
              <Check size={14} />
            ) : (
              <Save size={14} />
            )}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Sign Out ── */}
      <div className="rep-slide-up" style={{ animationDelay: "150ms" }}>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="w-full border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          <LogOut size={14} />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
