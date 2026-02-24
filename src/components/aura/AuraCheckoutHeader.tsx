"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBranding } from "@/hooks/useBranding";
import { ArrowLeft, Lock } from "lucide-react";

interface AuraCheckoutHeaderProps {
  slug: string;
}

export function AuraCheckoutHeader({ slug }: AuraCheckoutHeaderProps) {
  const branding = useBranding();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <a href={`/event/${slug}/`} className="gap-2">
            <ArrowLeft size={16} />
            Back
          </a>
        </Button>

        <a href={`/event/${slug}/`}>
          {branding.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={branding.logo_url}
              alt={branding.org_name || "Entry"}
              data-branding="logo"
              style={{ height: Math.min(branding.logo_height || 24, 32), width: "auto", maxWidth: 160, objectFit: "contain" }}
            />
          ) : (
            <span className="text-sm font-semibold tracking-wide text-foreground">
              {branding.org_name || "Entry"}
            </span>
          )}
        </a>

        <Badge variant="outline" className="gap-1 text-xs">
          <Lock size={10} />
          Secure
        </Badge>
      </div>
    </header>
  );
}
