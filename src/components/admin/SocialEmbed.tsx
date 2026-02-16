"use client";

import { useEffect, useState, useRef } from "react";
import { ExternalLink, Loader2, AlertCircle } from "lucide-react";

// ─── TikTok Embed ────────────────────────────────────────────────────────────

interface TikTokEmbedProps {
  url: string;
  compact?: boolean;
}

/**
 * Renders a TikTok video embed using TikTok's oEmbed API.
 * Falls back to a styled link if the embed fails.
 */
export function TikTokEmbed({ url, compact }: TikTokEmbedProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchEmbed() {
      try {
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
        const res = await fetch(oembedUrl);
        if (!res.ok) throw new Error("oEmbed failed");
        const data = await res.json();
        if (!cancelled && data.html) {
          setHtml(data.html);
        } else if (!cancelled) {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    }

    fetchEmbed();
    return () => { cancelled = true; };
  }, [url]);

  // After HTML is injected, load the TikTok embed script
  useEffect(() => {
    if (!html || !containerRef.current) return;

    // Check if script already loaded
    const existing = document.querySelector('script[src*="tiktok.com/embed.js"]');
    if (existing) {
      // Re-trigger embed processing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).tiktokEmbed?.lib?.render?.();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.tiktok.com/embed.js";
    script.async = true;
    document.body.appendChild(script);
  }, [html]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${compact ? "py-4" : "py-8"} rounded-lg bg-muted/30`}>
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">Loading TikTok...</span>
      </div>
    );
  }

  if (error || !html) {
    return <SocialLinkFallback url={url} platform="TikTok" />;
  }

  return (
    <div
      ref={containerRef}
      className={`tiktok-embed-container ${compact ? "max-h-[400px]" : ""} overflow-hidden rounded-lg`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Instagram Embed ─────────────────────────────────────────────────────────

interface InstagramEmbedProps {
  url: string;
  compact?: boolean;
}

/**
 * Renders an Instagram post/reel embed using the iframe approach.
 * No auth token required.
 */
export function InstagramEmbed({ url, compact }: InstagramEmbedProps) {
  // Extract the shortcode from Instagram URLs
  // Patterns: /p/SHORTCODE/, /reel/SHORTCODE/, /reels/SHORTCODE/, /tv/SHORTCODE/
  const match = url.match(/instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = match?.[2];
  const postType = match?.[1];

  if (!shortcode) {
    return <SocialLinkFallback url={url} platform="Instagram" />;
  }

  // Use /p/ for all types in the embed URL
  const embedType = postType === "reel" || postType === "reels" ? "reel" : "p";
  const embedUrl = `https://www.instagram.com/${embedType}/${shortcode}/embed/captioned/`;

  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <iframe
        src={embedUrl}
        className={`w-full border-0 bg-white ${compact ? "h-[400px]" : "h-[500px]"}`}
        allowTransparency
        allow="encrypted-media"
        title="Instagram embed"
      />
    </div>
  );
}

// ─── Fallback Link ───────────────────────────────────────────────────────────

function SocialLinkFallback({ url, platform }: { url: string; platform: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <AlertCircle size={14} className="text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">Could not load {platform} embed</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline break-all"
        >
          {url}
        </a>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20 transition-colors"
      >
        <ExternalLink size={14} />
      </a>
    </div>
  );
}

// ─── Proof Display (used in admin review) ────────────────────────────────────

interface ProofDisplayProps {
  proofType: string;
  proofUrl?: string | null;
  proofText?: string | null;
  compact?: boolean;
}

/**
 * Renders the appropriate proof display based on proof type.
 * Used in admin submission review to show embedded social content.
 */
export function ProofDisplay({ proofType, proofUrl, proofText, compact }: ProofDisplayProps) {
  if (proofType === "tiktok_link" && proofUrl) {
    return <TikTokEmbed url={proofUrl} compact={compact} />;
  }

  if (proofType === "instagram_link" && proofUrl) {
    return <InstagramEmbed url={proofUrl} compact={compact} />;
  }

  if (proofType === "screenshot" && proofUrl) {
    return <img src={proofUrl} alt="Proof" className="max-h-40 rounded-md" />;
  }

  if (proofType === "url" && (proofUrl || proofText)) {
    const linkUrl = proofUrl || proofText;
    // Auto-detect TikTok/Instagram URLs even when submitted as generic "url" type
    if (linkUrl && /tiktok\.com\//.test(linkUrl)) {
      return <TikTokEmbed url={linkUrl} compact={compact} />;
    }
    if (linkUrl && /instagram\.com\/(p|reel|reels|tv)\//.test(linkUrl)) {
      return <InstagramEmbed url={linkUrl} compact={compact} />;
    }
    return (
      <a href={linkUrl!} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
        {linkUrl}
      </a>
    );
  }

  if (proofType === "text" && proofText) {
    return <p className="text-sm text-foreground">{proofText}</p>;
  }

  return <p className="text-xs text-muted-foreground italic">No proof provided</p>;
}
