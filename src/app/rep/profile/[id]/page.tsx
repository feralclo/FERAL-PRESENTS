"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Trophy,
  TrendingUp,
  Zap,
  Instagram,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Separator } from "@/components/ui/separator";
import { TikTokIcon } from "@/components/rep";
import { openSocialProfile } from "@/lib/rep-social";

interface PublicProfile {
  id: string;
  display_name: string;
  photo_url?: string;
  instagram?: string;
  tiktok?: string;
  bio?: string;
  level: number;
  level_name: string;
  total_sales: number;
  total_revenue: number;
  leaderboard_position: number | null;
  joined_at: string;
  is_self: boolean;
}

export default function PublicRepProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const res = await fetch(`/api/rep-portal/profile/${id}`);
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          setError(errJson?.error || "Failed to load profile");
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (json.data) {
          // If viewing own profile, redirect to edit page
          if (json.data.is_self) {
            router.replace("/rep/profile");
            return;
          }
          setProfile(json.data);
        }
      } catch {
        setError("Failed to load profile — check your connection");
      }
      setLoading(false);
    })();
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button variant="link" size="sm" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  if (!profile) return null;

  const joinedDate = new Date(profile.joined_at).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="max-w-md mx-auto px-4 py-6 md:py-8 space-y-6 rep-fade-in">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="text-muted-foreground -ml-2"
      >
        <ArrowLeft size={14} />
        Back
      </Button>

      {/* ── Avatar + Identity ── */}
      <div className="text-center rep-slide-up">
        <div className="h-24 w-24 rounded-full border-2 border-primary/20 overflow-hidden mx-auto bg-primary/5 shadow-[0_0_12px_rgba(139,92,246,0.08)]">
          {profile.photo_url ? (
            <img src={profile.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <span className="text-3xl font-bold text-primary">
                {profile.display_name.charAt(0)}
              </span>
            </div>
          )}
        </div>

        <h1 className="mt-3 text-xl font-bold text-foreground">
          {profile.display_name}
        </h1>

        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge className="gap-1.5 px-3 py-1 rep-badge-shimmer">
            <Zap size={11} />
            Lv.{profile.level} — {profile.level_name}
          </Badge>
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {profile.bio}
          </p>
        )}

        {/* Social links */}
        {(profile.instagram || profile.tiktok) && (
          <div className="flex items-center justify-center gap-3 mt-4">
            {profile.instagram && (
              <button
                type="button"
                onClick={() => openSocialProfile("instagram", profile.instagram!)}
                className="inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                <Instagram size={14} />
                @{profile.instagram}
              </button>
            )}
            {profile.tiktok && (
              <button
                type="button"
                onClick={() => openSocialProfile("tiktok", profile.tiktok!)}
                className="inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                <TikTokIcon size={14} />
                @{profile.tiktok}
              </button>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3 rep-slide-up" style={{ animationDelay: "100ms" }}>
        <StatCard
          size="compact"
          label="Sales"
          value={String(profile.total_sales)}
          icon={TrendingUp}
        />
        <StatCard
          size="compact"
          label="Earned"
          value={`£${Number(profile.total_revenue).toFixed(0)}`}
          icon={TrendingUp}
        />
        <StatCard
          size="compact"
          label="Rank"
          value={profile.leaderboard_position ? `#${profile.leaderboard_position}` : "—"}
          icon={Trophy}
        />
      </div>

      {/* ── Meta ── */}
      <Card className="py-0 gap-0 rep-slide-up" style={{ animationDelay: "150ms" }}>
        <CardContent className="px-5 py-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Calendar size={14} />
          <span>Joined {joinedDate}</span>
        </CardContent>
      </Card>
    </div>
  );
}
