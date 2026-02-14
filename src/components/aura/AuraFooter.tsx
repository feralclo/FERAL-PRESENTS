"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useBranding } from "@/hooks/useBranding";
import { Instagram, Twitter, Globe, Mail } from "lucide-react";

export function AuraFooter() {
  const branding = useBranding();

  const socialLinks = branding?.social_links;
  const hasSocials =
    socialLinks?.instagram || socialLinks?.twitter || socialLinks?.tiktok || socialLinks?.website;

  return (
    <footer className="mt-12">
      <Separator />
      <div className="mx-auto max-w-2xl px-5 sm:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Left: Copyright + Support */}
          <div className="flex flex-col items-center sm:items-start gap-1.5">
            <p className="text-xs text-muted-foreground">
              {branding?.copyright_text ||
                `\u00A9 ${new Date().getFullYear()} ${branding?.org_name || "FERAL PRESENTS"}. All Rights Reserved.`}
            </p>
            {branding?.support_email && (
              <a
                href={`mailto:${branding.support_email}`}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Mail size={10} />
                {branding.support_email}
              </a>
            )}
          </div>

          {/* Right: Social + Status */}
          <div className="flex items-center gap-2">
            {hasSocials && (
              <>
                {socialLinks?.instagram && (
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={socialLinks.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Instagram"
                    >
                      <Instagram size={16} />
                    </a>
                  </Button>
                )}
                {socialLinks?.twitter && (
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={socialLinks.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Twitter"
                    >
                      <Twitter size={16} />
                    </a>
                  </Button>
                )}
                {socialLinks?.tiktok && (
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={socialLinks.tiktok}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="TikTok"
                    >
                      <Globe size={16} />
                    </a>
                  </Button>
                )}
                {socialLinks?.website && (
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={socialLinks.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Website"
                    >
                      <Globe size={16} />
                    </a>
                  </Button>
                )}
                <Separator orientation="vertical" className="h-4 mx-1" />
              </>
            )}
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              Online
            </Badge>
          </div>
        </div>
      </div>
    </footer>
  );
}
