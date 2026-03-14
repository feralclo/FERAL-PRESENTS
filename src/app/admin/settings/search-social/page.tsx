"use client";

import { useState, useEffect, useCallback } from "react";
import { useOrgId } from "@/components/OrgProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { Search, Save, Loader2, RotateCcw, Share2 } from "lucide-react";
import { homepageKey, brandingKey } from "@/lib/constants";
import type { HomepageSettings, BrandingSettings } from "@/types/settings";

export default function SearchSocialSettings() {
  const orgId = useOrgId();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // Full homepage settings (we merge SEO fields back into this on save)
  const [fullHomepage, setFullHomepage] = useState<HomepageSettings | null>(null);
  const [orgName, setOrgName] = useState("Entry");
  const [domain, setDomain] = useState("yourdomain.com");

  // SEO fields
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");

  // Auto-generated defaults
  const autoTitle = `${orgName} — Events & Tickets`;
  const autoDesc = `Discover upcoming events and buy tickets from ${orgName}. Live music, experiences, and more.`;

  // Final resolved values (what Google/social actually sees)
  const finalTitle = seoTitle.trim() || autoTitle;
  const finalDesc = seoDescription.trim() || autoDesc;
  const shareImage = ogImageUrl || heroImageUrl;

  // Character counts
  const titleLen = finalTitle.length;
  const descLen = finalDesc.length;
  const titleColor =
    titleLen > 60 ? "text-destructive" : titleLen > 50 ? "text-warning" : "text-success";
  const descColor =
    descLen > 160 ? "text-destructive" : descLen > 140 ? "text-warning" : "text-success";

  // Load homepage settings + branding + domain on mount
  useEffect(() => {
    (async () => {
      try {
        const [homepageRes, brandingRes, domainsRes] = await Promise.all([
          fetch(`/api/settings?key=${homepageKey(orgId)}`),
          fetch(`/api/settings?key=${brandingKey(orgId)}`),
          fetch("/api/domains"),
        ]);
        if (homepageRes.ok) {
          const { data } = await homepageRes.json();
          if (data) {
            const hp = data as HomepageSettings;
            setFullHomepage(hp);
            setSeoTitle(hp.seo_title || "");
            setSeoDescription(hp.seo_description || "");
            setOgImageUrl(hp.og_image_url || "");
            setHeroImageUrl(hp.hero_image_url || "");
          }
        }
        if (brandingRes.ok) {
          const { data } = await brandingRes.json();
          if (data) {
            const branding = data as BrandingSettings;
            if (branding.org_name) setOrgName(branding.org_name);
          }
        }
        if (domainsRes.ok) {
          const { domains } = await domainsRes.json();
          const primary = domains?.find((d: { is_primary: boolean }) => d.is_primary);
          if (primary?.hostname) setDomain(primary.hostname);
        }
      } catch {
        // Use defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, [orgId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus("");
    try {
      // Merge SEO fields with existing homepage settings
      const merged = {
        ...(fullHomepage || {}),
        seo_title: seoTitle || undefined,
        seo_description: seoDescription || undefined,
        og_image_url: ogImageUrl || undefined,
      };

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: homepageKey(orgId),
          data: merged,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      setFullHomepage(merged as HomepageSettings);
      setStatus("Settings saved");
    } catch {
      setStatus("Error saving settings");
    } finally {
      setSaving(false);
    }
  }, [seoTitle, seoDescription, ogImageUrl, fullHomepage, orgId]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div className="flex items-center gap-3">
        <Search size={20} className="text-primary" />
        <div>
          <h1 className="font-mono text-sm font-bold uppercase tracking-[2px] text-foreground">
            Search & Social
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Control how your homepage appears on Google and when shared on social media
          </p>
        </div>
      </div>

      {/* Google Preview */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Google Search Preview
        </h2>
        <div className="rounded-lg border border-border/50 bg-white p-4 space-y-1">
          <p
            className="text-[15px] leading-tight truncate"
            style={{ color: "#1a0dab", fontFamily: "Arial, sans-serif" }}
          >
            {finalTitle}
          </p>
          <p
            className="text-[13px] truncate"
            style={{ color: "#006621", fontFamily: "Arial, sans-serif" }}
          >
            {domain}
          </p>
          <p
            className="text-[13px] leading-relaxed"
            style={{
              color: "#545454",
              fontFamily: "Arial, sans-serif",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }}
          >
            {finalDesc}
          </p>
        </div>

        {/* Character counts */}
        <div className="flex gap-6 text-xs mt-3">
          <span className={titleColor}>Title: {titleLen}/60</span>
          <span className={descColor}>Description: {descLen}/160</span>
        </div>

        <Separator className="my-5" />

        {/* Meta title */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="seo-title">Homepage Title</Label>
              {seoTitle && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSeoTitle("")}
                  className="h-6 px-2 text-xs text-muted-foreground"
                >
                  <RotateCcw size={11} className="mr-1" />
                  Reset to auto
                </Button>
              )}
            </div>
            <Input
              id="seo-title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder={autoTitle}
            />
            <p className="text-xs text-muted-foreground">
              The title shown in Google search results. Leave blank to auto-generate from your organisation name. Ideal: 50–60 characters.
            </p>
          </div>

          {/* Meta description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="seo-desc">Homepage Description</Label>
              {seoDescription && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSeoDescription("")}
                  className="h-6 px-2 text-xs text-muted-foreground"
                >
                  <RotateCcw size={11} className="mr-1" />
                  Reset to auto
                </Button>
              )}
            </div>
            <Textarea
              id="seo-desc"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              placeholder={autoDesc}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              The description shown below your title in search results. Leave blank to auto-generate. Ideal: 140–160 characters.
            </p>
          </div>
        </div>
      </Card>

      {/* Social Share Preview */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground flex items-center gap-2">
          <Share2 size={13} className="text-foreground/50" />
          Social Sharing Preview
        </h2>

        {/* OG Card mockup */}
        <div className="rounded-lg border border-border/50 overflow-hidden bg-zinc-900 mb-5">
          {shareImage ? (
            <div className="relative w-full aspect-[1200/630] bg-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shareImage}
                alt="Share preview"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-full aspect-[1200/630] bg-zinc-800 flex items-center justify-center">
              <p className="text-sm text-muted-foreground/40">No share image set</p>
            </div>
          )}
          <div className="p-3 space-y-0.5">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{domain}</p>
            <p className="text-sm text-foreground font-medium truncate">{finalTitle}</p>
            <p className="text-xs text-muted-foreground/70 line-clamp-2">{finalDesc}</p>
          </div>
        </div>

        {/* OG Image upload */}
        <div className="space-y-2">
          <Label>Share Image</Label>
          <ImageUpload
            value={ogImageUrl}
            onChange={setOgImageUrl}
            label=""
          />
          <p className="text-xs text-muted-foreground">
            Shown when your homepage is shared on Facebook, Twitter, WhatsApp, and other platforms. Recommended size: 1200 x 630 pixels.
            {!ogImageUrl && heroImageUrl && (
              <span className="block mt-1 text-muted-foreground/60">
                Currently using your hero banner image as a fallback.
              </span>
            )}
          </p>
        </div>
      </Card>

      <Separator />

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Save Settings
        </Button>
        {status && (
          <span
            className={`text-sm ${
              status.includes("Error") ? "text-destructive" : "text-success"
            }`}
          >
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
