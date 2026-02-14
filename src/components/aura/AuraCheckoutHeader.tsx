"use client";

import { Badge } from "@/components/ui/badge";
import { useBranding } from "@/hooks/useBranding";
import { ArrowLeft, Lock } from "lucide-react";

interface AuraCheckoutHeaderProps {
  slug: string;
}

export function AuraCheckoutHeader({ slug }: AuraCheckoutHeaderProps) {
  const branding = useBranding();

  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between">
        <a
          href={`/event/${slug}/`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </a>

        <a href={`/event/${slug}/`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logo_url || "/images/FERAL%20LOGO.svg"}
            alt={branding.org_name || "FERAL PRESENTS"}
            className="h-6"
            data-branding="logo"
            style={branding.logo_width ? { width: branding.logo_width, height: "auto" } : undefined}
          />
        </a>

        <Badge variant="outline" className="gap-1 text-[10px] text-aura-success border-aura-success/30">
          <Lock size={10} />
          Secure
        </Badge>
      </div>
    </header>
  );
}
