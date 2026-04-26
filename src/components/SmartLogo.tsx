"use client";

import { useEffect, useState } from "react";
import { analyzeLogo, recommendLogoFilter, type LogoSurface } from "@/lib/logo-contrast";

interface SmartLogoProps {
  src: string;
  alt: string;
  /** Background context the logo is being placed on. */
  surface: LogoSurface;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a tenant logo with automatic contrast adjustment for the surface
 * it's on. A black wordmark on Entry's dark Midnight surface gets flipped to
 * white; a vivid coloured logo is left alone.
 *
 * Works for any browser-loadable image (data URI, http(s) URL, base64).
 * Falls back to a plain <img> if luminance can't be measured (cross-origin
 * blocked, decode failure, SSR).
 */
export function SmartLogo({ src, alt, surface, className, style }: SmartLogoProps) {
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFilter(null);
    if (!src) return;
    (async () => {
      const analysis = await analyzeLogo(src);
      if (cancelled || !analysis) return;
      setFilter(recommendLogoFilter(analysis, surface));
    })();
    return () => {
      cancelled = true;
    };
  }, [src, surface]);

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        ...style,
        filter: filter ?? style?.filter,
      }}
    />
  );
}
