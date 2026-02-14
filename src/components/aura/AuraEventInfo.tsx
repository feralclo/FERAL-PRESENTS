"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Info, FileText, MapPin } from "lucide-react";

interface AuraEventInfoProps {
  aboutText?: string;
  detailsText?: string;
  description?: string;
  venue?: string;
  venueAddress?: string;
}

export function AuraEventInfo({
  aboutText,
  detailsText,
  description,
  venue,
  venueAddress,
}: AuraEventInfoProps) {
  const showAbout = aboutText || (!aboutText && !detailsText && description);
  const aboutContent = aboutText || description;

  if (!showAbout && !detailsText && !venue) return null;

  return (
    <div className="space-y-6">
      {/* About */}
      {showAbout && aboutContent && (
        <InfoSection icon={<Info size={16} />} title="About">
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {aboutContent}
          </div>
        </InfoSection>
      )}

      {/* Details */}
      {detailsText && (
        <InfoSection icon={<FileText size={16} />} title="Details">
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {detailsText}
          </div>
        </InfoSection>
      )}

      {/* Venue */}
      {venue && (
        <InfoSection icon={<MapPin size={16} />} title="Venue">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{venue}</p>
            {venueAddress && (
              <p className="text-sm text-muted-foreground">{venueAddress}</p>
            )}
          </div>
        </InfoSection>
      )}
    </div>
  );
}

function InfoSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/30 bg-card/50 py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-primary/60">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <Separator className="opacity-30" />
      <CardContent className="px-5 py-4">
        {children}
      </CardContent>
    </Card>
  );
}
