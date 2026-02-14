"use client";

import { useBranding } from "@/hooks/useBranding";

interface AuroraCheckoutHeaderProps {
  slug: string;
}

export function AuroraCheckoutHeader({ slug }: AuroraCheckoutHeaderProps) {
  const branding = useBranding();

  return (
    <header className="border-b border-aurora-border/50 bg-aurora-bg/95 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between">
        <a
          href={`/event/${slug}/`}
          className="flex items-center gap-2 text-sm text-aurora-text-secondary hover:text-aurora-text transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </a>

        <a href={`/event/${slug}/`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logo_url || "/images/FERAL%20LOGO.svg"}
            alt={branding.org_name || "FERAL PRESENTS"}
            className="h-6"
            style={branding.logo_width ? { width: branding.logo_width, height: "auto" } : undefined}
          />
        </a>

        <div className="flex items-center gap-1.5 text-xs text-aurora-text-secondary">
          <svg className="h-3.5 w-3.5 text-aurora-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Secure
        </div>
      </div>
    </header>
  );
}
